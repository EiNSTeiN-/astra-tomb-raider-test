import { MathUtils, Vector3 } from "three";
import { constrainCamera, followCamera } from "./camera-collision.js";

// A wind court has narrow shafts and overhead ducts. Retraction alone can hide
// the explorer while a nearby orbit is clear. Keep the chosen look in save data;
// collision response may displace the camera by at most .3 yaw / .4 pitch.
export function followWindCamera(game, target, desired, dt, canOccupy) {
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
    ordinary = follow(desired);
  if (
    ordinary.distanceTo(target) >= 3.2 ||
    game.swimming ||
    game.diving ||
    game.aiming ||
    game.climb ||
    game.ropeRide ||
    game.zipRide ||
    !game.windSites?.some((site) =>
      site.nodes.some(
        (node) =>
          Math.abs(game.player.position.x - site.root.position.x - node.x) <
            2.6 &&
          Math.abs(game.player.position.z - site.root.position.z - node.z) <
            2.6 &&
          Math.abs(game.player.position.y - site.root.position.y - node.y) <
            1.4,
      ),
    )
  )
    return ordinary;

  const candidates = [
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
  ];
  let best;
  for (const [yawOffset, pitchOffset] of candidates) {
    const yaw = game.yaw + yawOffset,
      pitch = MathUtils.clamp(game.pitch + pitchOffset, -0.65, 1.05),
      end = target
        .clone()
        .add(
          new Vector3(
            Math.sin(yaw) * Math.cos(pitch) * 5.3,
            Math.sin(pitch) * 5.3 + 0.2,
            Math.cos(yaw) * Math.cos(pitch) * 5.3,
          ),
        ),
      safe = constrainCamera(target, end, game.cameraSurfaces, canOccupy);
    if (safe.distanceTo(target) < 3.2) continue;
    const next = follow(end),
      length = next.distanceTo(target),
      score =
        Math.min(length, 3.2) * 2 +
        Math.min(safe.distanceTo(target), 5.3) -
        (Math.abs(yawOffset) + Math.abs(pitch - game.pitch)) * 0.5;
    if (!best || score > best.score) best = { next, safe, score };
    if (length >= 3.2) return next;
  }
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
