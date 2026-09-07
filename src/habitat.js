import { random } from "./campaign.js";

// Placement is computed independently of asset loading so detail tiers and
// reloads share the same silhouettes. Trunks stay off the navigable grid.
export function woodlandLayout(map, level, height) {
  // Exposed coastal islands and cloud-city terraces carry low scrub. Random
  // off-grid trees would otherwise be rooted in the sea or sheer ravine walls.
  if (["water", "sky"].includes(level.biome)) return [];
  const rng = random(level.seed + 1961),
    trees = [];
  if (level.biome !== "jungle") {
    for (
      let attempt = 0;
      attempt < 6000 && trees.length < (level.biome === "snow" ? 115 : 430);
      attempt++
    ) {
      const gx = 1 + Math.floor(rng() * (map.size - 2)),
        gz = 1 + Math.floor(rng() * (map.size - 2));
      if (map.grid[gz][gx]) continue;
      const x = gx * 7 + (rng() - 0.5) * 2,
        z = gz * 7 + (rng() - 0.5) * 2;
      trees.push({
        x,
        z,
        y: height(x, z) - 0.15,
        rotation: rng() * Math.PI * 2,
        scale: 0.8 + rng() * 0.7,
        variant: 0,
      });
    }
    return trees;
  }
  const occupied = new Map(),
    spacing = 8.5;
  for (let z = 8; z < map.size * 7 - 8; z += spacing)
    for (let x = 8; x < map.size * 7 - 8; x += spacing) {
      const px = x + (rng() - 0.5) * 4,
        pz = z + (rng() - 0.5) * 4,
        gx = Math.round(px / 7),
        gz = Math.round(pz / 7);
      if (map.grid[gz]?.[gx]) continue;
      // Tree bases cannot intrude into a path even when a canopy overhangs it.
      if (
        [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ].some(
          ([dx, dz]) =>
            !!map.grid[Math.round((pz + dz * 1.1) / 7)]?.[
              Math.round((px + dx * 1.1) / 7)
            ],
        )
      )
        continue;
      if (map.features.some((f) => Math.hypot(f.x * 7 - px, f.z * 7 - pz) < 6))
        continue;
      let distance = Infinity;
      for (let dz = -4; dz <= 4; dz++)
        for (let dx = -4; dx <= 4; dx++)
          if (map.grid[gz + dz]?.[gx + dx])
            distance = Math.min(distance, Math.hypot(dx, dz) * 7);
      // Thick banks along routes, then a looser layer of taller background trees.
      if (rng() > (distance < 22 ? 0.97 : 0.58)) continue;
      const key = `${Math.floor(px / 6)},${Math.floor(pz / 6)}`;
      if (occupied.has(key)) continue;
      occupied.set(key, true);
      trees.push({
        x: px,
        z: pz,
        y: height(px, pz) - 0.18,
        rotation: rng() * Math.PI * 2,
        scale: (distance < 22 ? 0.82 : 1.15) + rng() * 0.6,
        variant: rng() < 0.42 ? 1 : 0,
      });
    }
  return trees;
}

export function coastalPlantAllowed(map, profile, x, z, rock = false) {
  if (profile.height(x, z) < (rock ? -1.8 : -0.9) || profile.court(x, z) > 0.7)
    return false;
  if (
    map.features.some(
      (f) => Math.hypot(f.x * 7 - x, f.z * 7 - z) < (rock ? 4.8 : 6.8),
    )
  )
    return false;
  if (
    (map.fieldSites || []).some(
      (f) => Math.max(Math.abs(f.x * 7 - x), Math.abs(f.z * 7 - z)) < 13,
    )
  )
    return false;
  if (
    profile.waters.some(
      (w) =>
        Math.abs(w.x - x) < w.width / 2 + 1 &&
        Math.abs(w.z - z) < w.length / 2 + 1,
    )
  )
    return false;
  // Keep dressed planting away from the supported arcades and their footings.
  for (const r of map.rooms) {
    const dx = Math.abs(x - r.x * 7),
      dz = z - r.z * 7;
    if (dx < 22 && dz > -27 && dz < -9) return false;
    if (dx > 16 && dx < 22 && dz >= -12 && dz < 25) return false;
  }
  return true;
}

// A nearby segment index preserves a narrow worn trail through the forest floor.
export function trailSampler(map) {
  const cells = new Map(),
    seen = new Set();
  for (const path of map.paths)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        key = [`${a.x},${a.z}`, `${b.x},${b.z}`].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      const segment = {
        x: a.x * 7,
        z: a.z * 7,
        dx: (b.x - a.x) * 7,
        dz: (b.z - a.z) * 7,
      };
      for (let z = Math.min(a.z, b.z) - 1; z <= Math.max(a.z, b.z) + 1; z++)
        for (let x = Math.min(a.x, b.x) - 1; x <= Math.max(a.x, b.x) + 1; x++) {
          const cell = `${x},${z}`;
          if (!cells.has(cell)) cells.set(cell, []);
          cells.get(cell).push(segment);
        }
    }
  return (x, z) => {
    let distance = 8;
    for (const s of cells.get(`${Math.round(x / 7)},${Math.round(z / 7)}`) ||
      []) {
      const t = Math.max(
        0,
        Math.min(
          1,
          ((x - s.x) * s.dx + (z - s.z) * s.dz) / (s.dx * s.dx + s.dz * s.dz),
        ),
      );
      distance = Math.min(
        distance,
        Math.hypot(x - s.x - s.dx * t, z - s.z - s.dz * t),
      );
    }
    const t = Math.max(0, Math.min(1, (distance - 1.1) / 2.3));
    return 1 - t * t * (3 - 2 * t);
  };
}

export function understoryLayout(map, level, profile, trees) {
  if (level.biome !== "jungle") return [];
  const rng = random(level.seed + 5137),
    plants = [];
  const add = (x, z, kind) => {
    if (profile.trail(x, z) > 0.48 || profile.court(x, z) > 0.6) return;
    if (map.features.some((f) => Math.hypot(f.x * 7 - x, f.z * 7 - z) < 4.5))
      return;
    if (
      Math.hypot(
        profile.height(x + 0.5, z) - profile.height(x - 0.5, z),
        profile.height(x, z + 0.5) - profile.height(x, z - 0.5),
      ) > 1.7
    )
      return;
    plants.push({ x, z, kind, scale: 0.7 + rng() * 0.65 });
  };
  for (const tree of trees) {
    for (let i = 0; i < 5; i++) {
      const a = rng() * Math.PI * 2,
        r = 1.8 + rng() * 3.5;
      add(
        tree.x + Math.cos(a) * r,
        tree.z + Math.sin(a) * r,
        i === 0 ? "shrub" : "fern",
      );
    }
  }
  for (const room of [...map.rooms, ...map.sideRooms, ...map.fieldSites]) {
    for (let cluster = 0; cluster < 6; cluster++) {
      const a = rng() * Math.PI * 2,
        r = room.r * 7 - 2 + rng() * 3;
      const x = room.x * 7 + Math.cos(a) * r,
        z = room.z * 7 + Math.sin(a) * r;
      for (let i = 0; i < 9; i++)
        add(
          x + (rng() - 0.5) * 5,
          z + (rng() - 0.5) * 5,
          i < 2 ? "shrub" : "fern",
        );
    }
  }
  return plants;
}
