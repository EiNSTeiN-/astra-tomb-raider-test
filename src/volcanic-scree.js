import * as THREE from "three";
import { random } from "./campaign.js";
import { inThermalCourt } from "./thermal-rules.js";
import { natureRockAllowed, placeNatureRock } from "./nature-rocks.js";
import { stoneFootprint } from "./stone-grounding.js";
import { createLodPatch } from "./instance-lod.js";
import { volcanicBoulderMaterial } from "./volcanic-material.js";

export function volcanicShardGeometry(variant = 0) {
  const geometry = new THREE.IcosahedronGeometry(1, 0),
    p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const rough =
      0.88 + Math.sin(x * 13.1 + y * 7.9 + z * 17.7 + variant * 9.3) * 0.12;
    p.setXYZ(
      i,
      x * rough,
      y * (0.16 + variant * 0.02) * rough,
      z * (0.68 + variant * 0.06) * rough,
    );
  }
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox.min.y, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// Narrow fans lie at the toes of banks. The clear centre of a passage, water,
// machinery and discoveries are reserved before an underside is fitted to soil.
export function volcanicScreeLayout(game) {
  if (game.level.biome !== "volcano") return [];
  const rng = random(game.level.seed + 47011),
    map = game.map,
    out = [];
  for (let z = 1; z < map.size - 1; z++)
    for (let x = 1; x < map.size - 1; x++) {
      if (!map.grid[z][x]) continue;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (map.grid[z + dz][x + dx]) continue;
        for (let i = 0; i < 14; i++) {
          const lateral = ((i + 0.15 + rng() * 0.7) / 14) * 7 - 3.5,
            inset = 0.28 + Math.pow(rng(), 2) * 2.1;
          const px = x * 7 + dx * (3.5 - inset) + dz * lateral,
            pz = z * 7 + dz * (3.5 - inset) + dx * lateral;
          const size = 0.13 + Math.pow(rng(), 2) * 0.35,
            yaw = rng() * Math.PI * 2,
            variant = Math.floor(rng() * 3),
            tint = 0.7 + rng() * 0.3;
          if (
            game.terrainProfile.court(px, pz) > 0.46 ||
            inThermalCourt(map, px, pz) ||
            !natureRockAllowed(game, px, pz, size)
          )
            continue;
          if (
            map.pressureRelay &&
            Math.abs(px - map.pressureRelay.x * 7) < 29 &&
            Math.abs(pz - map.pressureRelay.z * 7) < 29
          )
            continue;
          out.push({ x: px, z: pz, size, yaw, variant, tint });
        }
      }
    }
  return out;
}

export function buildVolcanicScree(game) {
  game.volcanicScree = null;
  if (game.level.biome !== "volcano") return;
  const shapes = [0, 1, 2].map((v) => stoneFootprint(volcanicShardGeometry(v)));
  const material = volcanicBoulderMaterial(game.darkMat);
  material.name = "Volcanic bank fragments";
  const chunks = new Map(),
    stats = { candidates: 0, placed: 0, rejected: 0, patches: 0 };
  for (const p of volcanicScreeLayout(game)) {
    stats.candidates++;
    const placed = placeNatureRock(game, shapes[p.variant], p);
    if (placed.reason) {
      stats.rejected++;
      continue;
    }
    // Per-instance range compaction bounds the visible debris. One submission
    // per shape avoids hundreds of tiny terrain-edge mesh groups.
    const key = p.variant;
    if (!chunks.has(key))
      chunks.set(key, {
        variant: p.variant,
        matrices: [],
        positions: [],
        colors: [],
      });
    const c = chunks.get(key);
    c.matrices.push(placed.matrix);
    c.positions.push(placed.position);
    c.colors.push(new THREE.Color().setScalar(p.tint));
    stats.placed++;
  }
  for (const c of chunks.values()) {
    const patch = createLodPatch(
      game.world,
      [[{ geometry: shapes[c.variant].geometry, material }]],
      c.matrices,
      c.positions,
      { colors: c.colors, castShadow: true, planar: true },
    );
    patch.kind = "gravel";
    patch.volcanic = true;
    game.naturePatches.push(patch);
    stats.patches++;
  }
  for (const s of shapes) s.geometry.dispose();
  if (!chunks.size) material.dispose();
  game.volcanicScree = stats;
}
