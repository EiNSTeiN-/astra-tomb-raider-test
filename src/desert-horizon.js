import * as THREE from "three";

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Integer angular frequencies make the two ends of each circular range meet.
export function desertHorizonHeight(angle, t, layer = 0) {
  const a = angle + layer * 0.7;
  if (!layer) {
    const crest = 0.57 + 0.08 * Math.sin(a * 7) + 0.025 * Math.sin(a * 19);
    const peak =
      39 +
      24 * (0.5 + 0.5 * Math.sin(a * 5 + 0.8)) +
      15 * Math.pow(0.5 + 0.5 * Math.sin(a * 13), 3);
    const flank =
      t < crest
        ? Math.pow(t / crest, 1.7)
        : Math.pow((1 - t) / (1 - crest), 0.92);
    const subsidiary = Math.sin(Math.PI * t) * Math.sin(a * 31 + t * 9) * 1.5;
    return -14 + Math.max(0, flank) * peak + subsidiary;
  }
  const rise = smooth(0.025, 0.26, t),
    fall = 1 - smooth(0.53, 0.95, t);
  const mesas =
    58 +
    36 * smooth(0.25, 0.7, 0.5 + 0.5 * Math.sin(a * 4 + 0.4)) +
    23 * smooth(0.3, 0.65, 0.5 + 0.5 * Math.sin(a * 11));
  const channels =
    Math.pow(Math.abs(Math.sin(a * 37 + t * 4)), 9) * 12 +
    Math.pow(Math.abs(Math.sin(a * 71 - t * 3)), 11) * 4;
  const bedding = Math.tanh(Math.sin(t * 48 + Math.sin(a * 7) * 0.4) * 3) * 1.4;
  return -18 + rise * fall * (mesas - channels + bedding);
}

export function desertHorizonGeometry(extent, layer = 0) {
  const segments = 384,
    rings = 64,
    radius = extent * (layer ? 0.9 : 0.73),
    depth = layer ? 270 : 235;
  const p = [],
    uv = [],
    index = [];
  for (let ring = 0; ring <= rings; ring++)
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2,
        t = ring / rings,
        r = radius + t * depth;
      p.push(
        extent / 2 + Math.cos(a) * r,
        desertHorizonHeight(a, t, layer),
        extent / 2 + Math.sin(a) * r,
      );
      uv.push(i / segments, t);
      if (ring < rings && i < segments) {
        const n = ring * (segments + 1) + i;
        index.push(
          n,
          n + 1,
          n + segments + 1,
          n + 1,
          n + segments + 2,
          n + segments + 1,
        );
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  for (let ring = 0; ring <= rings; ring++) {
    const a = ring * (segments + 1),
      b = a + segments;
    const n = new THREE.Vector3()
      .fromBufferAttribute(normals, a)
      .add(new THREE.Vector3().fromBufferAttribute(normals, b))
      .normalize();
    normals.setXYZ(a, ...n.toArray());
    normals.setXYZ(b, ...n.toArray());
  }
  geometry.computeBoundingSphere();
  geometry.userData = { segments, rings, radius, depth, layer };
  return geometry;
}

export function buildDesertHorizon(game) {
  game.desertHorizon = [];
  const terrain = game.terrainMeshes[0].material.userData.terrainUniforms;
  for (let layer = 0; layer < 2; layer++) {
    const material = new THREE.MeshStandardMaterial({
      name: layer
        ? "Stratified desert escarpment"
        : "Windward dunes and slip faces",
      color: 0xffffff,
      roughness: 0.94,
      fog: false,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.desertRock = { value: terrain.cliffMap.value };
      shader.uniforms.desertHaze = { value: new THREE.Color(game.level.fog) };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vDesertHorizon, vDesertHorizonNormal;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvDesertHorizon=(modelMatrix*vec4(position,1.)).xyz; vDesertHorizonNormal=normalize(mat3(modelMatrix)*normal);",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
        uniform sampler2D desertRock;
        uniform vec3 desertHaze;
        varying vec3 vDesertHorizon, vDesertHorizonNormal;
      `,
        )
        .replace(
          "#include <map_fragment>",
          `
        vec3 p=vDesertHorizon,n=normalize(vDesertHorizonNormal);
        ${
          layer
            ? `
        vec3 weights=pow(abs(n),vec3(4.));weights/=max(.001,weights.x+weights.y+weights.z);
        vec3 rock=texture2D(desertRock,p.zy*.055).rgb*weights.x+texture2D(desertRock,p.xz*.055).rgb*weights.y+texture2D(desertRock,p.xy*.055).rgb*weights.z;
        float band=pow(.5+.5*sin(p.y*.83+p.x*.007-p.z*.009+sin(p.x*.023+p.z*.034)*.8),5.);
        float dust=smoothstep(.65,.96,n.y);
        diffuseColor.rgb*=mix(rock*vec3(.94,.86,.74)*(1.-band*.13),vec3(.58,.4,.23),dust*.43);
        `
            : `
        float broad=.5+.5*sin(p.x*.015+sin(p.z*.023)*1.4);
        float face=smoothstep(-.4,.65,dot(n,normalize(vec3(.8,0.,.6))));
        diffuseColor.rgb*=mix(vec3(.49,.315,.16),vec3(.74,.53,.29),broad*.45+face*.24);
        `
        }
      `,
        )
        .replace(
          "#include <opaque_fragment>",
          `
        float desertDistance=length(cameraPosition-vDesertHorizon);
        float desertAir=1.-exp(-desertDistance*.00165);
        outgoingLight=mix(outgoingLight,desertHaze,clamp(desertAir,.0,.86));
        #include <opaque_fragment>
      `,
        );
    };
    material.customProgramCacheKey = () => `vesper-desert-horizon-${layer}-1`;
    const mesh = new THREE.Mesh(
      desertHorizonGeometry(game.map.size * 7, layer),
      material,
    );
    mesh.name = material.name;
    game.world.add(mesh);
    game.desertHorizon.push(mesh);
  }
}
