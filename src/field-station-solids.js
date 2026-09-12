import { boxEntry } from "./camera-collision.js";

// Generic field furniture has finite vertical bounds. In particular, an
// elevated station must not create an invisible column down to the ground.
export function stationSolid(
  game,
  feature,
  group,
  size,
  position,
  options = {},
) {
  const [w, h, d] = size,
    [x, y, z] = position;
  const cx = group.position.x + x,
    cy = group.position.y + y,
    cz = group.position.z + z;
  const solid = {
    x: cx,
    z: cz,
    w: w / 2,
    d: d / 2,
    h: cy + h / 2 - game.groundHeight(cx, cz),
    fieldStation: feature.id,
    radius: options.radius,
    supportable: options.support !== false,
    node: options.node,
    bounds: {
      min: { x: cx - w / 2, y: cy - h / 2, z: cz - d / 2 },
      max: { x: cx + w / 2, y: cy + h / 2, z: cz + d / 2 },
    },
  };
  game.obstacles.push(solid);
  (feature.stationSolids ||= []).push(solid);
  return solid;
}

export function stationContains(solid, x, z, padding = 0) {
  if (solid.node && !solid.node.visible) return false;
  return solid.radius !== undefined
    ? Math.hypot(x - solid.x, z - solid.z) < solid.radius + padding
    : Math.abs(x - solid.x) < solid.w + padding &&
        Math.abs(z - solid.z) < solid.d + padding;
}

export function stationBlocked(solid, x, y, z, clearance = 1.8, padding = 0.4) {
  return (
    stationContains(solid, x, z, padding) &&
    y < solid.bounds.max.y - 0.015 &&
    y + clearance > solid.bounds.min.y + 0.015
  );
}

// A mantle can finish on the edge of a furnished landing, but its entire
// body arc must clear the station. Keep the existing target whenever possible.
export function stationMantleEnd(game, platform, start, requested) {
  const solids = game.obstacles.filter(
    (o) =>
      o.fieldStation &&
      o.bounds.max.y > start.y &&
      o.bounds.min.y < requested.y + 2.5 &&
      Math.abs(o.x - platform.x) < platform.w + o.w &&
      Math.abs(o.z - platform.z) < platform.d + o.d,
  );
  if (!solids.length) return requested;
  const clear = (end) => {
    if (!game.canMove(end.x, end.z, end.y - game.groundHeight(end.x, end.z)))
      return false;
    for (let i = 0; i <= 100; i++) {
      const t = i / 100,
        ease = t * t * (3 - 2 * t),
        p = start.clone().lerp(end, ease);
      p.y += Math.sin(t * Math.PI) * 0.65;
      if (solids.some((o) => stationBlocked(o, p.x, p.y, p.z, 1.9, 0.45)))
        return false;
    }
    return true;
  };
  if (clear(requested)) return requested;
  const candidates = [];
  for (let ix = -8; ix <= 8; ix++)
    for (let iz = -8; iz <= 8; iz++) {
      const p = requested
        .clone()
        .set(
          platform.x + (ix / 8) * (platform.w - 0.4),
          requested.y,
          platform.z + (iz / 8) * (platform.d - 0.4),
        );
      if (Math.hypot(p.x - start.x, p.z - start.z) <= 3.8) candidates.push(p);
    }
  candidates.sort(
    (a, b) => a.distanceToSquared(requested) - b.distanceToSquared(requested),
  );
  return candidates.find(clear) || null;
}

// Use the same raw solids for sight, sound occlusion and projectile impacts;
// movement's body margin is not part of a ray's physical surface.
export function stationEntry(solid, from, to) {
  if (solid.node && !solid.node.visible) return null;
  const entry = boxEntry(from, to, solid.bounds, 0, true);
  if (entry === null || solid.radius === undefined) return entry;
  const dx = to.x - from.x,
    dz = to.z - from.z,
    ox = from.x - solid.x,
    oz = from.z - solid.z;
  const a = dx * dx + dz * dz,
    b = 2 * (ox * dx + oz * dz),
    c = ox * ox + oz * oz - solid.radius * solid.radius;
  if (a < 1e-10) return c <= 0 ? entry : null;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const lo = Math.max(entry, (-b - Math.sqrt(discriminant)) / (2 * a), 0);
  const hi = Math.min(1, (-b + Math.sqrt(discriminant)) / (2 * a));
  if (lo > hi) return null;
  const y = from.y + (to.y - from.y) * lo;
  return y >= solid.bounds.min.y - 1e-6 && y <= solid.bounds.max.y + 1e-6
    ? lo
    : null;
}
