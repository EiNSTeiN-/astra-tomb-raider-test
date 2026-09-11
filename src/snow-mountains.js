import * as THREE from "three";

import { desertNoise as rockNoise } from "./desert-geology.js";
import { alpineMaterial } from "./alpine-material.js";

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Cartesian noise stays continuous around the ring and breaks up the former
// repeated radial peaks. Two warped ridge scales carve branching rock faces;
// a smooth inner apron keeps the range rooted below the playable terrain.
export function mountainHeight(angle, across, layer = 0, extent = 420) {
  const radius = extent * (0.73 + layer * 0.53) + across * 400,
    x = Math.cos(angle) * radius,
    z = Math.sin(angle) * radius,
    seed = 713 + layer * 193;
  const cx = Math.cos(angle) * 420,
    cz = Math.sin(angle) * 420;
  const crest = 0.31 + rockNoise(cx * 0.008, cz * 0.008, seed) * 0.2;
  const peaks =
    180 +
    layer * 36 +
    rockNoise(cx * 0.012, cz * 0.012, seed + 31) * 150 +
    rockNoise(cx * 0.033, cz * 0.033, seed + 79) * 42;
  const u = Math.min(1, across / crest),
    flank =
      Math.pow(Math.sin(u * Math.PI * 0.5), 1.65) *
      (1 - smooth(crest, 1, across));
  const wx = x + (rockNoise(x * 0.012, z * 0.012, seed + 137) - 0.5) * 42,
    wz = z + (rockNoise(x * 0.012, z * 0.012, seed + 211) - 0.5) * 42;
  const cut = Math.abs(rockNoise(wx * 0.028, wz * 0.028, seed + 317) * 2 - 1),
    smallCut = Math.abs(rockNoise(wx * 0.071, wz * 0.071, seed + 419) * 2 - 1);
  return -18 + flank * (peaks - cut * cut * 115 - smallCut * smallCut * 25);
}

export function snowMountainGeometry(extent, layer = 0) {
  const segments = 512,
    rings = 64,
    radius = extent * (0.73 + layer * 0.53);
  const positions = [],
    indices = [],
    uv = [];
  for (let r = 0; r <= rings; r++)
    for (let i = 0; i <= segments; i++) {
      const angle = ((i % segments) / segments) * Math.PI * 2,
        across = r / rings,
        distance = radius + across * 400;
      positions.push(
        extent / 2 + Math.cos(angle) * distance,
        mountainHeight(angle, across, layer, extent),
        extent / 2 + Math.sin(angle) * distance,
      );
      uv.push(i / segments, across);
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
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
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
  geometry.computeBoundingSphere();
  geometry.userData = { segments, rings, radius, depth: 400, layer };
  return geometry;
}

export function buildSnowMountains(game) {
  const material = alpineMaterial(game.darkMat, game.scene.fog.color);
  for (let layer = 0; layer < 2; layer++) {
    const mountain = new THREE.Mesh(
      snowMountainGeometry(game.map.size * 7, layer),
      material,
    );
    mountain.name = `Alpine range ${layer}`;
    // Both shells share the same full-precision background depth interval.
    // Clear it only after the second shell, before the playable world renders.
    mountain.renderOrder = -10 + layer;
    mountain.frustumCulled = false;
    mountain.userData.excludeContact = true;
    if (layer === 1)
      mountain.onAfterRender = (renderer) => renderer.clearDepth();
    game.world.add(mountain);
  }
}
