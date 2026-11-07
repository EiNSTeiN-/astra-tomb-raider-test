import { supportAt } from "./character-motion.js";
import { NATURE_BODY_RADIUS } from "./nature-rock-solids.js";

const REACH = 2;

function overlapsSupport(o, minX, maxX, minZ, maxZ) {
  let loX, hiX, loZ, hiZ;
  const station = o.fieldStation;
  if (station && o.triangles) {
    if (!o.supportable) return false;
    const b = o.bounds,
      padding = Math.max(
        0,
        o.supportRadius ?? Math.max(NATURE_BODY_RADIUS, o.bodyPadding ?? 0),
      );
    loX = b?.min.x - padding;
    hiX = b?.max.x + padding;
    loZ = b?.min.z - padding;
    hiZ = b?.max.z + padding;
  } else {
    let w, d;
    if (station) {
      if (!o.supportable) return false;
      const padding =
        o.supportRadius === undefined ? 0.4 : Math.max(1e-8, o.supportRadius);
      if (o.radius !== undefined) w = d = o.radius + padding;
      else if (o.frame) {
        const f = o.frame,
          c = Math.abs(f.cos),
          s = Math.abs(f.sin),
          scale = f.cos * f.cos + f.sin * f.sin;
        w = (c * (f.w + padding) + s * (f.d + padding)) / scale;
        d = (s * (f.w + padding) + c * (f.d + padding)) / scale;
      } else {
        w = o.w + padding;
        d = o.d + padding;
      }
    } else {
      if (!o.climbable && !o.stepSupport) return false;
      w = o.w;
      d = o.d;
    }
    if (w < 0 || d < 0) return true;
    loX = o.x - w;
    hiX = o.x + w;
    loZ = o.z - d;
    hiZ = o.z + d;
  }
  if (![loX, hiX, loZ, hiZ].every(Number.isFinite) || loX > hiX || loZ > hiZ)
    return true;
  // Keep boundary candidates despite roundoff in a rotated footprint.
  return (
    hiX + 1e-7 >= minX &&
    loX - 1e-7 <= maxX &&
    hiZ + 1e-7 >= minZ &&
    loZ - 1e-7 <= maxZ
  );
}

// Candidate membership lasts for one synchronous grounding update. Rebuild it
// after world/movement updates; heights, visibility and triangle rules are read
// from the original objects. Other support systems keep the complete game.
export function createGroundingSupport(game) {
  const source = game.obstacles,
    count = source.length,
    x = game.player.position.x,
    z = game.player.position.z,
    candidates = [];
  for (const o of source)
    if (overlapsSupport(o, x - REACH, x + REACH, z - REACH, z + REACH))
      candidates.push(o);
  return (px, pz, maxY = Infinity, radius = 0, minUp = radius ? 0.65 : 0) => {
    const local =
      Number.isFinite(px) &&
      Number.isFinite(pz) &&
      Number.isFinite(radius) &&
      Math.abs(px - x) <= REACH &&
      Math.abs(pz - z) <= REACH &&
      radius >= 0 &&
      radius <= NATURE_BODY_RADIUS &&
      game.obstacles === source &&
      source.length === count;
    return supportAt(
      game,
      px,
      pz,
      maxY,
      radius,
      minUp,
      local ? candidates : game.obstacles,
    );
  };
}
