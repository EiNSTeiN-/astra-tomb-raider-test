import { footprintMinimum } from "./masonry-foundations.js";
import { yardTraversalClear } from "./station-yard-plan.js";

export const DISCOVERY_FOOTPRINT = Object.freeze({ w: 1.9, d: 1.9 });

// Placement uses the complete, built world, including special chapter floors.
// Reserve even hidden gate solids so opening a gate cannot move a discovery.
export function discoverySiteClear(game, x, z) {
  const { w, d } = DISCOVERY_FOOTPRINT,
    y = game.groundHeight(x, z);
  if (!yardTraversalClear(game.traversalCourses || [], { x, z, w, d }))
    return false;
  // Hinged leaves sweep beyond their closed collision box. Reserve the
  // chamber and its entire swing area in every progress state.
  if (
    (game.fieldGates || []).some(
      (gate) =>
        Math.abs(x - gate.root.position.x) < 12.5 &&
        Math.abs(z - gate.root.position.z) < 12.5,
    )
  )
    return false;
  if (
    game.terrainProfile.waters.some(
      (water) =>
        Math.abs(x - water.x) < w / 2 + water.width / 2 + 1 &&
        Math.abs(z - water.z) < d / 2 + water.length / 2 + 1,
    )
  )
    return false;
  if (
    game.items.some(
      (f) =>
        !["note", "treasure"].includes(f.type) &&
        Math.hypot(x - f.x * 7, z - f.z * 7) < 6,
    )
  )
    return false;
  if (
    game.obstacles.some(
      (o) =>
        Math.abs(x - o.x) < w / 2 + o.w + 0.45 &&
        Math.abs(z - o.z) < d / 2 + o.d + 0.45 &&
        (o.bounds?.max.y ?? game.groundHeight(o.x, o.z) + o.h) > y + 0.04 &&
        (o.bounds?.min.y ?? -Infinity) < y + 2.3,
    )
  )
    return false;
  let low = Infinity,
    high = -Infinity;
  for (const dx of [-w / 2, 0, w / 2])
    for (const dz of [-d / 2, 0, d / 2]) {
      if (!game.canMove(x + dx, z + dz, 0)) return false;
      const h = game.groundHeight(x + dx, z + dz);
      low = Math.min(low, h);
      high = Math.max(high, h);
    }
  return high - low <= 0.3;
}

function approach(game, x, z) {
  // Face the best clear collection stance. The prop occupies the center, so
  // access must be established beside it rather than at its occupied origin.
  for (const [dx, dz] of [
    [0, 2.4],
    [2.4, 0],
    [0, -2.4],
    [-2.4, 0],
  ]) {
    const px = x + dx,
      pz = z + dz,
      y = game.groundHeight(px, pz);
    if (Math.abs(y - game.groundHeight(x, z)) > 0.6) continue;
    let clear = true;
    for (const t of [1, 1.25, 1.5]) {
      const sx = x + dx * t,
        sz = z + dz * t;
      clear &&= game.canMove(sx, sz, 0);
      clear &&= Math.abs(game.groundHeight(sx, sz) - y) < 0.65;
    }
    if (clear) return { x: px, y, z: pz, yaw: Math.atan2(dx, dz) };
  }
  return null;
}

export function discoveryPlacement(game, feature) {
  const origin = { x: feature.x * 7, z: feature.z * 7 },
    candidates = [{ ...origin, distance: 0 }];
  for (let dx = -16; dx <= 16; dx++)
    for (let dz = -16; dz <= 16; dz++) {
      const distance = Math.hypot(dx, dz) * 1.75;
      if (!distance || distance > 28) continue;
      candidates.push({
        x: origin.x + dx * 1.75,
        z: origin.z + dz * 1.75,
        distance,
      });
    }
  candidates.sort((a, b) => a.distance - b.distance || a.z - b.z || a.x - b.x);
  for (const p of candidates) {
    if (!discoverySiteClear(game, p.x, p.z)) continue;
    const stance = approach(game, p.x, p.z);
    if (!stance) continue;
    const { w, d } = DISCOVERY_FOOTPRINT;
    return {
      ...p,
      origin,
      stance,
      y: game.groundHeight(p.x, p.z),
      bottom:
        footprintMinimum(
          (x, z) => game.groundHeight(x, z),
          p.x,
          p.z,
          w,
          d,
          game.terrainProfile.step,
        ) - 0.15,
    };
  }
  return null;
}
