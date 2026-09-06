import * as THREE from "three";

// Closed angular frequencies keep the circular range seamless. Each ridge has
// an asymmetric approach, narrow crest, and eroded ribs down its rock faces.
export function mountainHeight(angle, across, layer = 0) {
  const a = angle + layer * 0.47;
  const ridge = 0.37 + 0.065 * Math.sin(a * 7) + 0.035 * Math.cos(a * 13);
  const flank = across < ridge ? across / ridge : (1 - across) / (1 - ridge);
  const peak =
    105 +
    125 * Math.pow(Math.abs(Math.sin(a * 5 + 0.3)), 3) +
    45 * Math.pow(Math.abs(Math.cos(a * 11)), 5);
  const ribs =
    Math.abs(Math.sin(a * 43 + across * 3)) * 0.14 +
    Math.abs(Math.sin(a * 79 - across * 9)) * 0.055;
  const erosion = ribs * Math.sin(Math.PI * Math.max(0, flank));
  return (
    -18 +
    Math.max(0, Math.pow(Math.max(0, flank), 1.18) - erosion) *
      (peak + layer * 35)
  );
}

export function snowMountainGeometry(extent, layer = 0) {
  const segments = 320,
    rings = 36,
    radius = extent * (0.73 + layer * 0.23);
  const positions = [],
    indices = [];
  for (let r = 0; r <= rings; r++)
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2,
        across = r / rings,
        distance = radius + across * 230;
      positions.push(
        extent / 2 + Math.cos(angle) * distance,
        mountainHeight(angle, across, layer),
        extent / 2 + Math.sin(angle) * distance,
      );
      if (r < rings && i < segments) {
        const n = r * (segments + 1) + i;
        indices.push(
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
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Average seam normals so lighting joins just as the vertex positions do.
  const normals = geometry.attributes.normal;
  for (let r = 0; r <= rings; r++) {
    const a = r * (segments + 1),
      b = a + segments;
    const normal = new THREE.Vector3()
      .fromBufferAttribute(normals, a)
      .add(new THREE.Vector3().fromBufferAttribute(normals, b))
      .normalize();
    normals.setXYZ(a, ...normal.toArray());
    normals.setXYZ(b, ...normal.toArray());
  }
  geometry.userData = { segments, rings, radius, layer };
  return geometry;
}

export function buildSnowMountains(game) {
  const material = new THREE.MeshStandardMaterial({
    name: "Alpine rock and wind-deposited snow",
    color: 0xffffff,
    roughness: 0.94,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.alpineRock = { value: game.darkMat.map };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vAlpinePosition, vAlpineNormal;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvAlpinePosition=position; vAlpineNormal=normal;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D alpineRock; varying vec3 vAlpinePosition, vAlpineNormal;",
      )
      .replace(
        "#include <map_fragment>",
        `
      vec3 n=normalize(vAlpineNormal);
      vec3 weights=pow(abs(n),vec3(4.0));
      weights/=max(.001,weights.x+weights.y+weights.z);
      vec3 p=vAlpinePosition*.045;
      vec3 rock=texture2D(alpineRock,p.zy).rgb*weights.x
        +texture2D(alpineRock,p.xz).rgb*weights.y
        +texture2D(alpineRock,p.xy).rgb*weights.z;
      float striation=sin(p.x*4.0+p.y*2.0+sin(p.z*3.0));
      float snowline=34.0+12.0*sin(p.x*.6)*cos(p.z*.7);
      float snow=smoothstep(.49,.85,n.y+striation*.055)
        *smoothstep(snowline,snowline+40.0,vAlpinePosition.y);
      vec3 coldRock=rock*vec3(.44,.49,.56)*(.9+.1*striation);
      diffuseColor.rgb*=mix(coldRock,vec3(.78,.84,.89),snow);
      `,
      );
  };
  material.customProgramCacheKey = () => "vesper-alpine-range-1";
  for (let layer = 0; layer < 2; layer++) {
    const mountain = new THREE.Mesh(
      snowMountainGeometry(game.map.size * 7, layer),
      material,
    );
    mountain.name = `Alpine range ${layer}`;
    game.world.add(mountain);
  }
}
