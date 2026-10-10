import { boxEntry } from "./camera-collision.js";
import { mantlePoint } from "./mantle-motion.js";
import { TriangleSolids } from "./triangle-solids.js";

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
  const frame =
    options.angle === undefined
      ? null
      : {
          cos: Math.cos(options.angle),
          sin: Math.sin(options.angle),
          w: w / 2,
          d: d / 2,
        };
  const halfW = frame
      ? (Math.abs(frame.cos) * w + Math.abs(frame.sin) * d) / 2
      : w / 2,
    halfD = frame
      ? (Math.abs(frame.sin) * w + Math.abs(frame.cos) * d) / 2
      : d / 2;
  const solid = {
    x: cx,
    z: cz,
    w: halfW,
    d: halfD,
    h: cy + h / 2 - game.groundHeight(cx, cz),
    fieldStation: feature.id,
    radius: options.radius,
    bodyPadding: options.bodyPadding,
    supportable: options.support !== false,
    surfaceHeight: options.surfaceHeight,
    node: options.node,
    bounds: {
      min: { x: cx - halfW, y: cy - h / 2, z: cz - halfD },
      max: { x: cx + halfW, y: cy + h / 2, z: cz + halfD },
    },
  };
  if (frame) solid.frame = frame;
  game.obstacles.push(solid);
  (feature.stationSolids ||= []).push(solid);
  return solid;
}

// Static masonry keeps a CPU triangle kernel after material batching releases
// its render geometry. A broad bound only selects candidates; it is never the
// physical surface used by movement, sight, sound or projectile queries.
export function stationMeshSolid(game, feature, mesh, options = {}) {
  mesh.updateWorldMatrix(true, false);
  const triangles = new TriangleSolids([
      { geometry: mesh.geometry, matrices: [mesh.matrixWorld] },
    ]),
    bounds = triangles.solids[0].bounds,
    x = (bounds.min.x + bounds.max.x) / 2,
    z = (bounds.min.z + bounds.max.z) / 2;
  const solid = {
    x,
    z,
    w: (bounds.max.x - bounds.min.x) / 2,
    d: (bounds.max.z - bounds.min.z) / 2,
    h: bounds.max.y - game.groundHeight(x, z),
    fieldStation: feature.id,
    bodyPadding: options.bodyPadding ?? 0.4,
    supportable: options.support !== false,
    bounds,
    triangles,
  };
  game.obstacles.push(solid);
  (feature.stationSolids ||= []).push(solid);
  return solid;
}

export function stationContains(solid, x, z, padding = 0) {
  if (solid.node && !solid.node.visible) return false;
  if (solid.triangles)
    return solid.triangles.support(x, z, Infinity, padding) !== null;
  if (solid.frame && solid.radius === undefined) {
    const dx = x - solid.x,
      dz = z - solid.z,
      f = solid.frame;
    return (
      Math.abs(dx * f.cos - dz * f.sin) < f.w + padding &&
      Math.abs(dx * f.sin + dz * f.cos) < f.d + padding
    );
  }
  return solid.radius !== undefined
    ? Math.hypot(x - solid.x, z - solid.z) < solid.radius + padding
    : Math.abs(x - solid.x) < solid.w + padding &&
        Math.abs(z - solid.z) < solid.d + padding;
}

// The movement disk can land on a real cap while boot/contact probes retain
// their point footprint. A triangle station's highest bounding corner is not
// a floor beneath every point of its tapered or chipped surface.
export function stationSupport(solid, x, z, maxY = Infinity, radius = 0) {
  if (!solid.supportable || (solid.node && !solid.node.visible)) return null;
  if (solid.triangles) {
    // Keep a descending body on the cap until its collision disk clears the
    // edge. A smaller support disk would lower it into the bevel and then
    // reject the outward step. Point probes still query the exact surface.
    const footprint = radius ? Math.max(radius, solid.bodyPadding ?? 0) : 0,
      b = solid.bounds;
    if (
      x + footprint < b.min.x ||
      x - footprint > b.max.x ||
      z + footprint < b.min.z ||
      z - footprint > b.max.z ||
      b.min.y > maxY + 0.2
    )
      return null;
    // A collision disk can touch a tapered shaft well above the visible boots.
    // Only upward, walkable faces can hold a body; exact point probes still
    // report the physical bevel or side underneath their coordinates.
    return (
      solid.triangles.support(x, z, maxY, footprint, radius ? 0.65 : 0)
        ?.height ?? null
    );
  }
  if (!stationContains(solid, x, z, 0.4)) return null;
  const top = solid.surfaceHeight?.(x, z) ?? solid.bounds.max.y;
  return top <= maxY + 0.2 ? top : null;
}

export function stationBlocked(
  solid,
  x,
  y,
  z,
  clearance = 1.8,
  padding = solid.bodyPadding ?? 0.4,
) {
  if (solid.triangles) {
    const radius = clearance ? padding : 0,
      b = solid.bounds;
    if (
      x + radius < b.min.x ||
      x - radius > b.max.x ||
      z + radius < b.min.z ||
      z - radius > b.max.z ||
      y >= b.max.y - 0.015 ||
      y + clearance < b.min.y + 0.015
    )
      return false;
    return solid.triangles.blocked(x, y, z, clearance, clearance ? padding : 0);
  }
  return (
    stationContains(solid, x, z, padding) &&
    y < (solid.surfaceHeight?.(x, z) ?? solid.bounds.max.y) - 0.015 &&
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
      const p = mantlePoint(start, end, i / 100);
      // A held Forward input can reach the normal movement margin before
      // Jump. Use that same margin rather than rejecting a legal approach.
      if (solids.some((o) => stationBlocked(o, p.x, p.y, p.z, 1.9)))
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
  if (solid.triangles)
    return boxEntry(from, to, solid.bounds, 0, true) === null
      ? null
      : solid.triangles.entry(from, to);
  let entry;
  if (solid.frame && solid.radius === undefined) {
    const f = solid.frame,
      local = (p) => ({
        x: (p.x - solid.x) * f.cos - (p.z - solid.z) * f.sin,
        y: p.y,
        z: (p.x - solid.x) * f.sin + (p.z - solid.z) * f.cos,
      });
    entry = boxEntry(
      local(from),
      local(to),
      {
        min: { x: -f.w, y: solid.bounds.min.y, z: -f.d },
        max: { x: f.w, y: solid.bounds.max.y, z: f.d },
      },
      0,
      true,
    );
  } else entry = boxEntry(from, to, solid.bounds, 0, true);
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
