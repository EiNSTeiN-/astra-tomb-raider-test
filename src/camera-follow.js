import { MathUtils, Vector3 } from "three";
import { constrainCamera, followCamera } from "./camera-collision.js";

// Pillars, shafts and overhead parts can close the interpolated follow path
// even when its destination is clear. Prefer .3 yaw / .4 pitch offsets, widening
// yaw to 2.1 only when that neighborhood cannot fit a comfortable view. Keep
// the player's chosen look in save data throughout collision response.
export function followClearCamera(
  game,
  target,
  desired,
  dt,
  canOccupy,
  viewPitch = game.pitch,
) {
  const follow = (end) =>
      followCamera(
        game.camera.position,
        target,
        end,
        dt,
        game.cameraSurfaces,
        canOccupy,
        game.cameraFollowTarget,
      ),
    ordinary = follow(desired),
    ordinaryLength = ordinary.distanceTo(target);
  if (
    ordinaryLength >= 3.2 ||
    game.swimming ||
    game.diving ||
    game.aiming ||
    (game.climb && ordinaryLength >= 2.2) ||
    game.ropeRide
  )
    return ordinary;

  // Keep an ordinary mantle view unless a casting pushes it into the body
  // fade range. A safe neighboring view then retains the visible explorer.

  // Retain the supplied arm and vertical lift, including the transition out
  // of an aimed view, instead of replacing them with a full-distance orbit.
  const offset = desired.clone().sub(target),
    distance = Math.hypot(offset.x, offset.z) / Math.cos(viewPitch),
    lift = offset.y - Math.sin(viewPitch) * distance,
    nearbyCandidates = [
      [0, -0.2],
      [0, 0.2],
      [-0.15, 0],
      [0.15, 0],
      [0, -0.4],
      [0, 0.4],
      [-0.3, 0],
      [0.3, 0],
      ...[-0.15, 0.15, -0.3, 0.3].flatMap((yaw) =>
        [-0.2, 0.2, -0.4, 0.4].map((pitch) => [yaw, pitch]),
      ),
    ],
    candidates = [
      ...nearbyCandidates,
      // A close pillar can cover the entire small neighborhood. Try its sides
      // only if none of those rays provides enough room for the explorer.
      ...[
        -0.45, 0.45, -0.6, 0.6, -0.9, 0.9, -1.05, 1.05, -1.2, 1.2, -1.35, 1.35,
        -1.5, 1.5, -1.65, 1.65, -1.8, 1.8, -1.95, 1.95, -2.1, 2.1,
      ].flatMap((yaw) =>
        [0, -0.2, 0.2, -0.4, 0.4].map((pitch) => [yaw, pitch]),
      ),
    ];
  let best, shorter;
  for (const [index, [yawOffset, pitchOffset]] of candidates.entries()) {
    if (index === nearbyCandidates.length && best) break;
    const yaw = game.yaw + yawOffset,
      pitch = MathUtils.clamp(viewPitch + pitchOffset, -0.65, 1.05),
      end = target
        .clone()
        .add(
          new Vector3(
            Math.sin(yaw) * Math.cos(pitch) * distance,
            Math.sin(pitch) * distance + lift,
            Math.cos(yaw) * Math.cos(pitch) * distance,
          ),
        ),
      safe = constrainCamera(target, end, game.cameraSurfaces, canOccupy);
    const safeLength = safe.distanceTo(target);
    if (safeLength < 2.2) continue;
    const next = follow(end),
      length = next.distanceTo(target),
      score =
        Math.min(length, 3.2) * 2 +
        Math.min(safeLength, 5.3) -
        (Math.abs(yawOffset) + Math.abs(pitch - viewPitch)) * 0.5;
    // A low bridge may leave a visible arm just short of the comfortable
    // distance. Keep that option only if the full search finds no longer view.
    if (safeLength < 3.2) {
      if (!shorter || score > shorter.score) shorter = { next, safe, score };
      continue;
    }
    if (!best || score > best.score) best = { next, safe, score };
    if (length >= 3.2) return next;
  }
  best ||= shorter;
  if (!best) return ordinary;
  if (best.next.distanceTo(target) >= 2.2) return best.next;
  // A narrow shaft may also block the interpolated sweep. Resolve that contact
  // immediately, like an inward wall correction, then extend with normal follow.
  const length = Math.min(
    best.safe.distanceTo(target),
    Math.max(2.2, game.camera.position.distanceTo(target)),
  );
  return constrainCamera(
    target,
    target.clone().add(best.safe.clone().sub(target).setLength(length)),
    game.cameraSurfaces,
    canOccupy,
  );
}
