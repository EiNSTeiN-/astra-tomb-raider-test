import * as THREE from "three";

import { desertNoise as rockNoise } from "./desert-geology.js";
import { alpineMaterial } from "./alpine-material.js";
import {
  alpineForelandGeometry,
  alpineForelandMaterial,
} from "./alpine-foreland.js";

const depth = 640;

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const crestAcross = (x, z, seed) =>
  0.32 + rockNoise(x * 0.007, z * 0.007, seed) * 0.19;

function gullyDeposit(x, z, across, crest, seed) {
  const gully = rockNoise(
      x * 0.04 + across * 0.4,
      z * 0.04 + across * 0.2,
      seed + 631,
    ),
    run =
      smooth(0.04, 0.2, across) *
      (1 - smooth(crest - 0.03, crest + 0.22, across));
  return gully * gully * run;
}

// Asymmetric ridges rise from broad aprons. A rounded ridge cap avoids a knife
// edge while retaining steep shoulders; world-space ribs run down the flanks.
// Cartesian fields join the angular seam and both aprons stay below the world.
export function mountainHeight(angle, across, layer = 0, extent = 420) {
  across = Math.max(0, Math.min(1, across));
  const radius = extent * (0.94 + layer * 0.64) + across * depth,
    x = Math.cos(angle) * radius,
    z = Math.sin(angle) * radius,
    seed = 713 + layer * 193;
  const cx = Math.cos(angle) * 420,
    cz = Math.sin(angle) * 420;
  const crest = crestAcross(cx, cz, seed);
  const peaks =
    85 +
    layer * 50 +
    Math.pow(rockNoise(cx * 0.006, cz * 0.006, seed + 31), 1.7) * 220 +
    rockNoise(cx * 0.017, cz * 0.017, seed + 79) * 45;
  const side = (across - crest) / (across < crest ? crest : 1 - crest),
    cap = 0.025,
    roundedDistance =
      (Math.sqrt(side * side + cap * cap) - cap) /
      (Math.sqrt(1 + cap * cap) - cap),
    flank = Math.pow(Math.max(0, 1 - roundedDistance), 1.65);
  // Keep erosion wavelengths resolvable by both shells. Tightly warped cuts
  // can bend between adjacent vertices and oppose their lighting normals.
  const wx = x + (rockNoise(x * 0.009, z * 0.009, seed + 137) - 0.5) * 24,
    wz = z + (rockNoise(x * 0.009, z * 0.009, seed + 211) - 0.5) * 24;
  const cut = Math.abs(rockNoise(wx * 0.013, wz * 0.013, seed + 317) * 2 - 1),
    smallCut = Math.abs(rockNoise(wx * 0.024, wz * 0.024, seed + 419) * 2 - 1),
    rib = rockNoise(cx * 0.027 + across * 0.3, cz * 0.027, seed + 557),
    ribHeight = (rib - 0.5) * 52 * smooth(0.04, 0.22, across);
  // Long cuts descend from the crest towards the valley, leaving intervening
  // spurs. Vary them along the slope, rather than repeating identical radial
  // flutes. The angular field is Cartesian and periodic at the range seam;
  // its wavelengths remain resolved by the existing mesh. Both apron joints
  // retain their heights and derivatives.
  const incision = 78 * gullyDeposit(cx, cz, across, crest, seed);
  return (
    -18 +
    flank *
      (peaks + ribHeight - cut * cut * 48 - smallCut * smallCut * 2 - incision)
  );
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
    normals = [],
    deposits = [];
  for (let r = 0; r <= rings; r++)
    for (let i = 0; i <= segments; i++) {
      const angle = ((i % segments) / segments) * Math.PI * 2,
        crest = crestAcross(
          Math.cos(angle) * 420,
          Math.sin(angle) * 420,
          713 + layer * 193,
        ),
        // Spend the existing rings at the narrow summit, where uniform radial
        // spacing left sharp bends between vertices. Each column remains
        // ordered from inner to outer apron and includes the crest itself.
        t = r / rings,
        across =
          t <= 0.5
            ? crest * (1 - Math.pow(1 - t * 2, 1.4))
            : crest + (1 - crest) * Math.pow(t * 2 - 1, 1.4),
        distance = radius + across * depth;
      positions.push(
        extent / 2 + Math.cos(angle) * distance,
        mountainHeight(angle, across, layer, extent),
        extent / 2 + Math.sin(angle) * distance,
      );
      uv.push(i / segments, across);
      normals.push(...mountainNormal(angle, across, layer, extent));
      deposits.push(
        gullyDeposit(
          Math.cos(angle) * 420,
          Math.sin(angle) * 420,
          across,
          crest,
          713 + layer * 193,
        ),
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
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute(
    "snowDeposit",
    new THREE.Float32BufferAttribute(deposits, 1),
  );
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
    if (layer === 0) {
      const foreland = new THREE.Mesh(
        alpineForelandGeometry(
          game.terrainProfile,
          game.terrainMeshes,
          mountain.geometry,
        ),
        alpineForelandMaterial(
          game.terrainMeshes[0].material,
          game.darkMat,
          game.scene.fog.color,
          game.terrainProfile.extent,
        ),
      );
      foreland.name = "Alpine foreland";
      foreland.renderOrder = -11;
      foreland.frustumCulled = false;
      foreland.receiveShadow = true;
      foreland.userData.excludeContact = true;
      foreland.userData.animated = true;
      game.world.add(foreland);
    }
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
