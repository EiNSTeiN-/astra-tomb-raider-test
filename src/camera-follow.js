import { MathUtils, Quaternion, Vector3 } from "three";
import { constrainCamera, followCamera } from "./camera-collision.js";
import {
  cameraBodyTargets,
  cameraBodyVisibility,
} from "./camera-body-frame.js";

const APPROACH_TIME = 0.3;
const WALKING_TURN_RATE = 3;

// A short arm can rotate sharply when it leaves a detour or turns toward a
// new heading. Keep a clear walking view within a modest angular step. Move
// with the target, retaining the collision solver's radial correction, and
// verify both the arm and lens path before accepting the slower turn. A newly
// obstructed view still receives its required immediate correction.
function gentleWalkingTurn(game, target, next, dt, canOccupy) {
  if (
    !game.cameraFollowTarget ||
    dt <= 0 ||
    dt > 0.1 ||
    game.grounded === false ||
    game.swimming ||
    game.diving ||
    game.aiming ||
    game.climb ||
    game.ropeRide ||
    // Anticipatory detours already use the slower follow rate. Preserve their
    // planned escape path rather than adding angular lag beside the obstacle.
    game.cameraContactRecovery
  )
    return next;
  const arm = game.camera.position.clone().sub(game.cameraFollowTarget),
    nextArm = next.clone().sub(target),
    length = nextArm.length(),
    angle = arm.angleTo(nextArm),
    step = WALKING_TURN_RATE * dt;
  if (arm.length() < 2.2 || length < 2.2 || angle <= step) return next;
  const from = arm.clone().normalize(),
    turn = new Quaternion().setFromUnitVectors(
      from,
      nextArm.clone().normalize(),
    ),
    rotation = new Quaternion().slerp(turn, step / angle),
    position = from
      .applyQuaternion(rotation)
      .multiplyScalar(length)
      .add(target),
    start = arm.add(target);
  if (
    !canOccupy(start) ||
    !canOccupy(position) ||
    constrainCamera(
      target,
      position,
      game.cameraSurfaces,
      canOccupy,
    ).distanceTo(position) > 1e-6 ||
    constrainCamera(start, position, game.cameraSurfaces, canOccupy).distanceTo(
      position,
    ) > 1e-6 ||
    cameraBodyVisibility(
      game.cameraSurfaces,
      position,
      cameraBodyTargets(game),
      game,
    ) < 1
  )
    return next;
  return position;
}

// Anticipate horizontal contact along the current walking direction. Check the
// intervening follow path too: a clear destination can have a blocked sweep.
// This only selects a gentler detour; followCamera still enforces actual walls,
// terrain and near-plane clearance at the current position on every update.
function clearApproach(game, target, end, ahead, canOccupy) {
  if (ahead.lengthSq() < 1e-8) return true;
  for (const amount of [1 / 3, 2 / 3, 1]) {
    const shift = ahead.clone().multiplyScalar(amount),
      start = target.clone().add(shift),
      projected = game.camera.position
        .clone()
        .add(shift)
        .lerp(
          end.clone().add(shift),
          1 - Math.exp(-3 * APPROACH_TIME * amount),
        );
    if (
      constrainCamera(
        start,
        projected,
        game.cameraSurfaces,
        canOccupy,
      ).distanceTo(projected) > 0.08
    )
      return false;
  }
  return true;
}

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
  const solve = () =>
    gentleWalkingTurn(
      game,
      target,
      followClearCameraStep(game, target, desired, dt, canOccupy, viewPitch),
      dt,
      canOccupy,
    );
  return game.cameraSurfaces?.withSnapshot
    ? game.cameraSurfaces.withSnapshot(solve)
    : solve();
}

function followClearCameraStep(
  game,
  target,
  desired,
  dt,
  canOccupy,
  viewPitch = game.pitch,
) {
  let steering = false;
  const follow = (end) =>
      followCamera(
        game.camera.position,
        target,
        end,
        dt * (steering ? 3 / 8 : 1),
        game.cameraSurfaces,
        canOccupy,
        game.cameraFollowTarget,
      ),
    ordinary = follow(desired),
    ordinaryLength = ordinary.distanceTo(target);
  if (
    game.swimming ||
    game.diving ||
    game.aiming ||
    (game.climb && ordinaryLength >= 2.2) ||
    game.ropeRide
  ) {
    game.cameraBodyRecovery = null;
    game.cameraContactRecovery = null;
    return ordinary;
  }
  const body = cameraBodyTargets(game),
    visibility = (position) =>
      cameraBodyVisibility(game.cameraSurfaces, position, body, game),
    ordinaryVisible = visibility(ordinary),
    ahead =
      game.cameraFollowTarget && dt > 0 && dt <= 0.1
        ? target
            .clone()
            .sub(game.cameraFollowTarget)
            .setY(0)
            .multiplyScalar(APPROACH_TIME / Math.max(dt, 1 / 120))
            .clampLength(0, 1.2)
        : new Vector3(),
    anticipated = !clearApproach(game, target, desired, ahead, canOccupy),
    bodyRecovery =
      anticipated ||
      ordinaryVisible < 1 ||
      (game.cameraBodyRecovery &&
        (visibility(desired) < 1 ||
          constrainCamera(
            target,
            desired,
            game.cameraSurfaces,
            canOccupy,
          ).distanceTo(target) < 3.2));
  if (ordinaryLength >= 3.2 && !bodyRecovery) {
    game.cameraBodyRecovery = null;
    game.cameraContactRecovery = null;
    return ordinary;
  }

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
    retained = bodyRecovery && game.cameraBodyRecovery,
    lowerNearbyFirst =
      retained &&
      MathUtils.clamp(viewPitch + retained[1], -0.65, 1.05) - viewPitch > 0.4,
    candidates = [
      ...(retained && !lowerNearbyFirst ? [retained] : []),
      ...nearbyCandidates,
      // A bank can need an overhead view during a turn, then expose a lower
      // neighboring arm. Do not let that remembered lift prevent trying it.
      // The existing body and swept-arm checks still govern each option.
      ...(lowerNearbyFirst ? [retained] : []),
      // A steep foreground bank can cover the boots while the central arm
      // clears it. Lift the view before swinging far around the explorer.
      ...[0, -0.15, 0.15, -0.3, 0.3].flatMap((yaw) =>
        [0.6, 0.8, 1].map((pitch) => [yaw, pitch]),
      ),
      // A close pillar can cover the entire small neighborhood. Try its sides
      // only if none of those rays provides enough room for the explorer.
      ...[
        -0.45, 0.45, -0.6, 0.6, -0.9, 0.9, -1.05, 1.05, -1.2, 1.2, -1.35, 1.35,
        -1.5, 1.5, -1.65, 1.65, -1.8, 1.8, -1.95, 1.95, -2.1, 2.1,
      ].flatMap((yaw) =>
        [0, -0.2, 0.2, -0.4, 0.4].map((pitch) => [yaw, pitch]),
      ),
    ];
  // Keep an established detour gentle after the player stops; changing its
  // response rate at that moment otherwise produces a new sudden correction.
  steering =
    anticipated ||
    (game.cameraBodyRecovery &&
      game.cameraContactRecovery === game.cameraBodyRecovery);
  const rememberRecovery = (recovery) => {
    game.cameraBodyRecovery = recovery;
    game.cameraContactRecovery = steering ? recovery : null;
  };
  let best, shorter;
  for (const [index, [yawOffset, pitchOffset]] of candidates.entries()) {
    if (index === nearbyCandidates.length && best && !bodyRecovery) break;
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
    if (anticipated && !clearApproach(game, target, end, ahead, canOccupy))
      continue;
    const next = follow(end),
      length = next.distanceTo(target),
      visible = visibility(next),
      endVisible = visibility(safe),
      score =
        Math.min(length, 3.2) * 2 +
        Math.min(safeLength, 5.3) -
        (Math.abs(yawOffset) + Math.abs(pitch - viewPitch)) * 0.5 -
        (1 - visible) * 12 -
        (1 - endVisible) * 12;
    // A low bridge may leave a visible arm just short of the comfortable
    // distance. Keep that option only if the full search finds no longer view.
    if (safeLength < 3.2) {
      if (!shorter || score > shorter.score)
        shorter = { next, safe, score, recovery: [yawOffset, pitchOffset] };
      continue;
    }
    if (!best || score > best.score)
      best = { next, safe, score, recovery: [yawOffset, pitchOffset] };
    if (length >= 3.2 && visible === 1 && endVisible === 1) {
      // Arm recovery needs the same continuity as body recovery: otherwise a
      // clear interpolated arm can fall straight back toward a blocked request.
      rememberRecovery([yawOffset, pitchOffset]);
      return next;
    }
  }
  best ||= shorter;
  if (!best) return ordinary;
  rememberRecovery(best.recovery);
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
