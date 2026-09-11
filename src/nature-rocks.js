import { craneFoundationDistance } from "./astral-crane-rules.js";
import { temperingFoundationDistance } from "./tempering-cart-rules.js";
import { seatStone } from "./stone-grounding.js";
import { inEchoGallery } from "./echo-gallery-rules.js";
import { inOrbitVault } from "./orbit-rules.js";

// Movement samples a bilinear height field; the visible ground uses two planar
// triangles per cell. Fit below both surfaces near non-planar bank corners.
export function rockGroundHeight(profile, x, z) {
  const sampled = profile.height(x, z),
    step = profile.step;
  if (!step) return sampled;
  const ix = Math.floor(x / step),
    iz = Math.floor(z / step),
    tx = x / step - ix,
    tz = z / step - iz,
    left = ix * step,
    top = iz * step,
    a = profile.height(left, top),
    b = profile.height(left, top + step),
    c = profile.height(left + step, top + step),
    d = profile.height(left + step, top);
  const surface =
    tx + tz <= 1
      ? a + (d - a) * tx + (b - a) * tz
      : c + (b - c) * (1 - tx) + (d - c) * (1 - tz);
  return Math.min(sampled, surface);
}

// Decorative scans must leave working space around the authored game geometry.
// Bounds include the actual rotated footprint, not only the instance's origin.
export function natureRockAllowed(game, x, z, radius) {
  const { map, terrainProfile } = game;
  if (map.astralCrane && craneFoundationDistance(x, z) < radius + 0.5)
    return false;
  if (map.temperingCart && temperingFoundationDistance(x, z) < radius + 0.5)
    return false;
  if (inEchoGallery(map, x, z, radius + 1)) return false;
  if (inOrbitVault(map, x, z, radius + 1)) return false;
  const extent = map.size * 7;
  if (x < radius || z < radius || x > extent - radius || z > extent - radius)
    return false;
  if (
    map.features.some(
      (f) => Math.hypot(f.x * 7 - x, f.z * 7 - z) < 2.8 + radius,
    )
  )
    return false;
  if (
    map.enemies.some((e) => Math.hypot(e.x * 7 - x, e.z * 7 - z) < 2 + radius)
  )
    return false;
  if (Math.hypot(map.spawn.x * 7 - x, map.spawn.z * 7 - z) < 2.8 + radius)
    return false;
  if (
    game.obstacles.some(
      (o) =>
        Math.abs(x - o.x) < o.w + radius + 0.2 &&
        Math.abs(z - o.z) < o.d + radius + 0.2,
    )
  )
    return false;
  if (
    terrainProfile.waters.some(
      (w) =>
        Math.abs(x - w.x) < w.width / 2 + radius &&
        Math.abs(z - w.z) < w.length / 2 + radius,
    )
  )
    return false;
  return true;
}

export function placeNatureRock(game, shape, { x, z, size, yaw }) {
  const b = shape.bounds;
  const radius =
    Math.hypot(
      Math.max(Math.abs(b.min.x), Math.abs(b.max.x)),
      Math.max(Math.abs(b.min.z), Math.abs(b.max.z)),
    ) * size;
  if (!natureRockAllowed(game, x, z, radius)) return { reason: "reserved" };
  const seated = seatStone(
    { height: (px, pz) => rockGroundHeight(game.terrainProfile, px, pz) },
    shape,
    { x, z, size, yaw },
  );
  return seated ? { ...seated, radius } : { reason: "unsupported" };
}
