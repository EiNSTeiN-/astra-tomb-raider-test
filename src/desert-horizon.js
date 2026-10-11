import * as THREE from "three";
import { desertNoise } from "./desert-geology.js";

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Cartesian noise varies the crests around the range without repeating angular
// waves. The apron stays below the world edge; both circular ends sample the
// same field, including the branching erosion across the distant escarpment.
export function desertHorizonHeight(angle, t, layer = 0, extent = 420) {
  t = Math.max(0, Math.min(1, t));
  const radius = extent * (layer ? 0.9 : 0.73) + t * (layer ? 270 : 235),
    x = Math.cos(angle) * radius,
    z = Math.sin(angle) * radius,
    cx = Math.cos(angle) * extent,
    cz = Math.sin(angle) * extent;
  if (!layer) {
    const crest = 0.39 + desertNoise(cx * 0.009, cz * 0.009, 813) * 0.28;
    const peak =
      38 +
      desertNoise(cx * 0.007, cz * 0.007, 927) * 45 +
      desertNoise(cx * 0.023, cz * 0.023, 1073) * 12;
    const flank = smooth(0, crest, t) * (1 - smooth(crest, 1, t)),
      ripple = (desertNoise(x * 0.024, z * 0.019, 1291) - 0.5) * 3;
    return -14 + flank * (peak + ripple);
  }
  const front = 0.24 + desertNoise(cx * 0.011, cz * 0.011, 1777) * 0.13,
    back = 0.59 + desertNoise(cx * 0.007, cz * 0.007, 1861) * 0.18,
    rise = smooth(0.025, front, t),
    fall = 1 - smooth(back, 1, t);
  const mesas =
    63 +
    desertNoise(cx * 0.004, cz * 0.004, 1979) * 55 +
    desertNoise(cx * 0.019, cz * 0.019, 2053) * 18;
  const wx = x + (desertNoise(x * 0.014, z * 0.014, 2179) - 0.5) * 32,
    wz = z + (desertNoise(x * 0.014, z * 0.014, 2309) - 0.5) * 32,
    broadCut = Math.abs(desertNoise(wx * 0.021, wz * 0.021, 2411) * 2 - 1),
    fineCut = Math.abs(desertNoise(wx * 0.049, wz * 0.049, 2593) * 2 - 1);
  const channels = broadCut * broadCut * 23 + fineCut * fineCut * 4;
  return -18 + rise * fall * (mesas - channels);
}

// Differentiate the continuous field rather than averaging triangle faces.
// Lighting is stable across tessellation diagonals and the duplicate ring seam.
export function desertHorizonNormal(angle, t, layer = 0, extent = 420) {
  const depth = layer ? 270 : 235,
    radius = extent * (layer ? 0.9 : 0.73) + t * depth,
    da = 0.6 / radius,
    dr = 0.6 / depth,
    radial =
      (desertHorizonHeight(angle, t + dr, layer, extent) -
        desertHorizonHeight(angle, t - dr, layer, extent)) /
      1.2,
    tangent =
      (desertHorizonHeight(angle + da, t, layer, extent) -
        desertHorizonHeight(angle - da, t, layer, extent)) /
      1.2,
    x = radial * Math.cos(angle) - tangent * Math.sin(angle),
    z = radial * Math.sin(angle) + tangent * Math.cos(angle),
    length = Math.hypot(x, 1, z);
  return [-x / length, 1 / length, -z / length];
}

export function desertHorizonGeometry(extent, layer = 0) {
  const segments = 512,
    rings = 80,
    radius = extent * (layer ? 0.9 : 0.73),
    depth = layer ? 270 : 235;
  const p = [],
    uv = [],
    normals = [],
    index = [];
  for (let ring = 0; ring <= rings; ring++)
    for (let i = 0; i <= segments; i++) {
      const a = ((i % segments) / segments) * Math.PI * 2,
        t = ring / rings,
        r = radius + t * depth;
      p.push(
        extent / 2 + Math.cos(a) * r,
        desertHorizonHeight(a, t, layer, extent),
        extent / 2 + Math.sin(a) * r,
      );
      uv.push(i / segments, t);
      normals.push(...desertHorizonNormal(a, t, layer, extent));
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
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(index);
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
