import * as THREE from "three";

export function calderaGeometry(extent) {
  const segments = 288,
    rings = 28,
    vertices = [],
    uv = [],
    indices = [];
  for (let ring = 0; ring <= rings; ring++)
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2,
        t = ring / rings;
      const crest = 0.32 + Math.sin(a * 9) * 0.035;
      const flank = t < crest ? t / crest : (1 - t) / (1 - crest);
      const height =
        82 +
        34 * Math.sin(a * 3 + 1) +
        23 * Math.cos(a * 7) +
        18 * Math.abs(Math.sin(a * 19)) +
        9 * Math.sin(a * 43);
      const erosion =
        (Math.abs(Math.sin(a * 57 + t * 3)) * 0.1 +
          Math.abs(Math.sin(a * 97 - t * 5)) * 0.06) *
        Math.sin(Math.PI * flank);
      const radius = extent * 0.745 + 165 * t;
      vertices.push(
        extent / 2 + Math.cos(a) * radius,
        -16 +
          Math.max(0, Math.pow(Math.max(0, flank), 0.88) - erosion) * height,
        extent / 2 + Math.sin(a) * radius,
      );
      uv.push(i / 9, t * 10);
      if (ring < rings && i < segments) {
        const n = ring * (segments + 1) + i;
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
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
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
  geometry.userData = { segments, rings, radius: extent * 0.745 };
  return geometry;
}

export function buildForgeCaldera(game) {
  const material = game.darkMat.clone();
  material.name = "Eroded caldera rock";
  material.color.set(0xa0a8b0);
  material.normalScale.set(0.55, 0.55);
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>\nfloat ash=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(ash),.85)*.52;`,
    );
  };
  material.customProgramCacheKey = () => "vesper-caldera-rock-1";
  const mesh = new THREE.Mesh(calderaGeometry(game.map.size * 7), material);
  mesh.name = "Eroded caldera rim";
  game.world.add(mesh);
}
