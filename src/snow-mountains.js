import * as THREE from "three";

import { desertNoise as rockNoise } from "./desert-geology.js";
import { alpineMaterial } from "./alpine-material.js";

const depth = 640;

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Wider shoulders separate the monastery from the enclosing ranges. Long-wave
// summits and smaller incisions vary the horizon without narrow repeated snow
// gullies. Cartesian erosion joins the seam; both aprons stay below the world.
export function mountainHeight(angle, across, layer = 0, extent = 420) {
  across = Math.max(0, Math.min(1, across));
  const radius = extent * (0.94 + layer * 0.64) + across * depth,
    x = Math.cos(angle) * radius,
    z = Math.sin(angle) * radius,
    seed = 713 + layer * 193;
  const cx = Math.cos(angle) * 420,
    cz = Math.sin(angle) * 420;
  const crest = 0.32 + rockNoise(cx * 0.007, cz * 0.007, seed) * 0.19;
  const peaks =
    85 +
    layer * 50 +
    Math.pow(rockNoise(cx * 0.006, cz * 0.006, seed + 31), 1.7) * 220 +
    rockNoise(cx * 0.017, cz * 0.017, seed + 79) * 45;
  const u = Math.min(1, across / crest),
    flank =
      Math.pow(Math.sin(u * Math.PI * 0.5), 1.65) *
      (1 - smooth(crest, 1, across));
  const wx = x + (rockNoise(x * 0.009, z * 0.009, seed + 137) - 0.5) * 64,
    wz = z + (rockNoise(x * 0.009, z * 0.009, seed + 211) - 0.5) * 64;
  const cut = Math.abs(rockNoise(wx * 0.019, wz * 0.019, seed + 317) * 2 - 1),
    smallCut = Math.abs(rockNoise(wx * 0.041, wz * 0.041, seed + 419) * 2 - 1);
  return -18 + flank * (peaks - cut * cut * 48 - smallCut * smallCut * 5);
}

// Sample the continuous height field in polar coordinates rather than using
// triangle averages. This keeps lighting and snow coverage independent of the
// diagonal used to tessellate each ring, including the duplicated angular seam.
export function mountainNormal(angle, across, layer = 0, extent = 420) {
  const radius = extent * (0.94 + layer * 0.64) + across * depth,
    da = 0.75 / radius,
    dr = 0.75 / depth,
    radial =
      (mountainHeight(angle, across + dr, layer, extent) -
        mountainHeight(angle, across - dr, layer, extent)) /
      1.5,
    tangent =
      (mountainHeight(angle + da, across, layer, extent) -
        mountainHeight(angle - da, across, layer, extent)) /
      1.5,
    x = radial * Math.cos(angle) - tangent * Math.sin(angle),
    z = radial * Math.sin(angle) + tangent * Math.cos(angle),
    length = Math.hypot(x, 1, z);
  return [-x / length, 1 / length, -z / length];
}

export function snowMountainGeometry(extent, layer = 0) {
  const segments = 768,
    rings = 96,
    radius = extent * (0.94 + layer * 0.64);
  const positions = [],
    indices = [],
    uv = [],
    normals = [];
  for (let r = 0; r <= rings; r++)
    for (let i = 0; i <= segments; i++) {
      const angle = ((i % segments) / segments) * Math.PI * 2,
        across = r / rings,
        distance = radius + across * depth;
      positions.push(
        extent / 2 + Math.cos(angle) * distance,
        mountainHeight(angle, across, layer, extent),
        extent / 2 + Math.sin(angle) * distance,
      );
      uv.push(i / segments, across);
      normals.push(...mountainNormal(angle, across, layer, extent));
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
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.userData = { segments, rings, radius, depth, layer };
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
