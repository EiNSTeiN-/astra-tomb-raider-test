import { waterAt } from "./hydrology.js";
import {
  galleryAt,
  galleryBellAt,
  galleryFloor,
} from "./sunken-gallery-layout.js";

// The prone stroke extends beyond the standing body's centre. Query the
// existing solid/terrain kernel along the torso, boots and both hand reaches.
// These points rotate with the swimmer; the camera can still orbit freely.
export const SWIM_PROBES = [
  [0, 0],
  [0, 0.88],
  [0, -0.34],
  [0, 0.4],
  [-0.35, 0.25],
  [0.35, 0.25],
  [-0.35, 0.65],
  [0.35, 0.65],
  [-0.35, 0.95],
  [0.35, 0.95],
];

export function swimCompactLimit(game, x, y, z) {
  return Math.max(
    0,
    Math.min(1, (y - galleryFloor(game, x, z, y) - 0.38) / 0.57),
  );
}

export function swimCompactAmount(
  game,
  x,
  y,
  z,
  facing = game.avatar.rotation.y,
) {
  const sin = Math.sin(facing),
    cos = Math.cos(facing);
  if (!game.canMove(x, z, y - game.groundHeight(x, z), 0.8)) return Infinity;
  // These authored interactions already use an upright stance and their own
  // approach/ceiling checks. A prone stroke is not their physical footprint.
  if (
    game.sunkenGallery?.operation ||
    (!game.diving && galleryAt(game, x, y, z) && galleryBellAt(game, x, z))
  )
    return 0;
  const limit = swimCompactLimit(game, x, y, z);
  const clear = (compact) =>
    SWIM_PROBES.every(([side, forward]) => {
      side += (Math.sign(side) * 0.15 - side) * compact;
      forward += (Math.max(-0.1, Math.min(0.24, forward)) - forward) * compact;
      const px = x + side * cos + forward * sin;
      const pz = z - side * sin + forward * cos;
      return game.canMove(px, pz, y - game.groundHeight(px, pz), 0.8);
    });
  if (clear(0)) return 0;
  for (let step = 1; step <= 4; step++) {
    let hi = Math.min(limit, step * 0.25),
      lo = Math.min(limit, (step - 1) * 0.25);
    if (hi <= lo) break;
    if (!clear(hi)) continue;
    // Refine the first safe fold so approaching a wall does not snap the
    // torso through quarter-pose steps. Outward recovery is eased by the rig.
    for (let i = 0; i < 4; i++) {
      const middle = (lo + hi) / 2;
      if (clear(middle)) hi = middle;
      else lo = middle;
    }
    return hi;
  }
  return Infinity;
}

export function canSwimAt(game, x, y, z, facing = game.avatar.rotation.y) {
  return Number.isFinite(swimCompactAmount(game, x, y, z, facing));
}

export function turnSwimmer(game, input, dt) {
  if (Math.hypot(input.x, input.z) < 0.05) return;
  const p = game.player.position,
    facing = game.avatar.rotation.y;
  const delta = Math.atan2(input.x, input.z) - facing;
  const turn =
    Math.atan2(Math.sin(delta), Math.cos(delta)) * Math.min(1, dt * 14);
  if (Math.abs(turn) < 1e-6) return;
  const steps = Math.max(1, Math.ceil(Math.abs(turn) / 0.12));
  for (let i = 1; i <= steps; i++) {
    const next = facing + (turn * i) / steps;
    if (!canSwimAt(game, p.x, p.y, p.z, next)) break;
    game.avatar.rotation.y = next;
  }
}

export function recoverSwimmer(game, preservePosition = false) {
  if (!game.swimming) return false;
  const p = game.player.position;
  if (canSwimAt(game, p.x, p.y, p.z)) return false;
  const facing = game.avatar.rotation.y;
  // A saved camera orbit does not encode the swimmer's heading. On arrival,
  // choose a fitting heading before moving an otherwise valid saved position.
  // The return value reports translation; rotating does not move the camera.
  if (preservePosition)
    for (let step = 1; step <= 32; step++)
      for (const sign of [1, -1]) {
        const next = facing + (sign * step * Math.PI) / 32;
        if (!canSwimAt(game, p.x, p.y, p.z, next)) continue;
        game.avatar.rotation.y = next;
        return false;
      }
  // Older saves can be valid for the former centre-only check while their
  // head already occupies masonry. Search nearby water, retaining depth and
  // rejecting paths that would cross a solid with the physical player root.
  for (let ring = 1; ring <= 15; ring++)
    for (const angle of [
      Math.PI,
      0,
      Math.PI / 2,
      -Math.PI / 2,
      Math.PI / 4,
      -Math.PI / 4,
      Math.PI * 0.75,
      -Math.PI * 0.75,
    ]) {
      const dx = Math.sin(facing + angle) * ring * 0.1;
      const dz = Math.cos(facing + angle) * ring * 0.1;
      const x = p.x + dx,
        z = p.z + dz;
      if (
        (waterAt(game, x, z, p.y)?.depth || 0) < 1.1 ||
        !canSwimAt(game, x, p.y, z)
      )
        continue;
      let clear = true;
      for (let step = 1; step <= ring; step++) {
        const px = p.x + (dx * step) / ring,
          pz = p.z + (dz * step) / ring;
        if (!game.canMove(px, pz, p.y - game.groundHeight(px, pz), 0.8)) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      p.x = x;
      p.z = z;
      game.jumpY = Math.max(0, p.y - game.groundHeight(x, z));
      return true;
    }
  return false;
}
