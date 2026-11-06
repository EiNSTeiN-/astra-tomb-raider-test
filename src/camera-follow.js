import { MathUtils, Quaternion, Vector3 } from "three";
import { constrainCamera, followCamera } from "./camera-collision.js";
import { guardianCameraSurfaces } from "./guardian-camera.js";
import { galleryAt } from "./sunken-gallery-layout.js";
import { galleryCameraExit } from "./gallery-camera-exit.js";
import {
  cameraBodyTargets,
  cameraBodyVisibility,
} from "./camera-body-frame.js";

const APPROACH_TIME = 0.3;
const WALKING_TURN_RATE = 3;
const SWIM_ARM_RATE = 3;

function enclosedSwimmer(game) {
  const p = game.player?.position;
  if (!(game.swimming || game.diving) || !p) return false;
  if (galleryAt(game, p.x, p.y, p.z)) return true;
  // The gallery opens into its sounding well. Keep body framing while rising
  // past that aperture; switching to ordinary open-water follow here retracts
  // the lens against the bank and briefly fades the explorer.
  const well = game.sunkenGallery?.well;
  return (
    !!well &&
    p.y < well.position.y + 0.15 &&
    Math.abs(p.x - well.position.x) < well.userData.width / 2 &&
    Math.abs(p.z - well.position.z) < well.userData.length / 2
  );
}

// A short arm can rotate sharply when it leaves a detour or turns toward a
// new heading. Keep a clear ground or gallery view within a modest angular step. Move
// with the target, retaining the collision solver's radial correction, and
// verify both the arm and lens path before accepting the slower turn. A newly
// obstructed view still receives its required immediate correction.
function gentleWalkingTurn(
  game,
  target,
  next,
  dt,
  canOccupy,
  surfaces,
  bodyFrame = null,
) {
  if (
    !game.cameraFollowTarget ||
    dt <= 0 ||
    dt > 0.1 ||
    (!enclosedSwimmer(game) &&
      (game.grounded === false || game.swimming || game.diving)) ||
    game.aiming ||
    game.climb ||
    game.ropeRide ||
    // Anticipatory detours already use the slower follow rate. Preserve their
    // planned escape path rather than adding angular lag beside the obstacle.
    (game.cameraContactRecovery && !enclosedSwimmer(game))
  )
    return next;
  const arm = game.camera.position.clone().sub(game.cameraFollowTarget),
    nextArm = next.clone().sub(target),
    length = nextArm.length(),
    retainedLength = enclosedSwimmer(game)
      ? MathUtils.clamp(
          length,
          Math.max(2.2, arm.length() - SWIM_ARM_RATE * dt),
          arm.length() + SWIM_ARM_RATE * dt,
        )
      : length,
    angle = arm.angleTo(nextArm),
    step = WALKING_TURN_RATE * dt;
  if (
    arm.length() < 2.2 ||
    length < 2.2 ||
    (angle <= step && retainedLength === length)
  )
    return next;
  const from = arm.clone().normalize(),
    turn = new Quaternion().setFromUnitVectors(
      from,
      nextArm.clone().normalize(),
    ),
    rotation = new Quaternion().slerp(
      turn,
      angle ? Math.min(1, step / angle) : 1,
    ),
    position = from
      .applyQuaternion(rotation)
      .multiplyScalar(retainedLength)
      .add(target),
    start = arm.clone().add(target),
    confined = enclosedSwimmer(game);
  let body = bodyFrame;
  const clear = (point) => {
    if (
      (!confined && !canOccupy(start)) ||
      !canOccupy(point) ||
      constrainCamera(target, point, surfaces, canOccupy).distanceTo(point) >
        1e-6 ||
      constrainCamera(
        confined ? game.camera.position : start,
        point,
        surfaces,
        canOccupy,
      ).distanceTo(point) > 1e-6
    )
      return false;
    body ??= cameraBodyTargets(game);
    return cameraBodyVisibility(surfaces, point, body, game, confined) === 1;
  };
  if (clear(position)) return position;
  if (confined) {
    // A rising target can close the direct angular step against a roof. Slide
    // within the same bounded neighborhood rather than jumping to a short arm.
    const yaw = Math.atan2(arm.x, arm.z),
      pitch = Math.atan2(arm.y, Math.hypot(arm.x, arm.z)),
      diagonal = step / Math.SQRT2;
    let best;
    for (const [dy, dp] of [
      [0, 0],
      [0, -step],
      [0, step],
      [-step, 0],
      [step, 0],
      [-diagonal, -diagonal],
      [diagonal, -diagonal],
      [-diagonal, diagonal],
      [diagonal, diagonal],
    ]) {
      const y = yaw + dy,
        p = MathUtils.clamp(pitch + dp, -1.4, 1.4),
        point = target
          .clone()
          .add(
            new Vector3(
              Math.sin(y) * Math.cos(p) * retainedLength,
              Math.sin(p) * retainedLength,
              Math.cos(y) * Math.cos(p) * retainedLength,
            ),
          );
      if (!clear(point)) continue;
      const score = point.distanceToSquared(next);
      if (!best || score < best.score) best = { point, score };
    }
    if (best) return best.point;
  }
  return next;
}

// Anticipate contact along the current direction, including vertical motion
// inside the submerged gallery. Check the
// intervening follow path too: a clear destination can have a blocked sweep.
// This only selects a gentler detour; followCamera still enforces actual walls,
// terrain and near-plane clearance at the current position on every update.
function clearApproach(game, target, end, ahead, canOccupy, surfaces) {
  if (ahead.lengthSq() < 1e-8) return true;
  for (const amount of [1 / 3, 2 / 3, 1]) {
    const shift = ahead.clone().multiplyScalar(amount),
      start = target.clone().add(shift),
      destination = end.clone().add(shift),
      attachment = enclosedSwimmer(game)
        ? 1 -
          MathUtils.smoothstep(
            constrainCamera(start, destination, surfaces, canOccupy).distanceTo(
              start,
            ),
            1.8,
            3.2,
          )
        : 1,
      projected = game.camera.position
        .clone()
        .addScaledVector(shift, attachment)
        .lerp(destination, 1 - Math.exp(-3 * APPROACH_TIME * amount));
    if (
      constrainCamera(start, projected, surfaces, canOccupy).distanceTo(
        projected,
      ) > 0.08 ||
      (enclosedSwimmer(game) &&
        constrainCamera(
          game.camera.position,
          projected,
          surfaces,
          canOccupy,
        ).distanceTo(projected) > 0.08)
    )
      return false;
  }
  return true;
}

// Pillars, shafts and overhead parts can close the interpolated follow path
// even when its destination is clear. Prefer small turns and moderate sideways
// views before larger upward offsets, widening yaw to 2.1 when needed. Keep
// the player's chosen look in save data throughout collision response. Open
// water retains its ordinary follow; the gallery's confined swim routes need
// the same body framing as a passage on foot.
export function followClearCamera(
  game,
  target,
  desired,
  dt,
  canOccupy,
  viewPitch = game.pitch,
  surfaces = guardianCameraSurfaces(game),
) {
  const solve = () => {
    const confined =
        enclosedSwimmer(game) && !game.aiming && !game.climb && !game.ropeRide,
      body = confined ? cameraBodyTargets(game) : null;
    if (!confined) game.cameraGalleryExit = null;
    const exit = confined
      ? galleryCameraExit(game, target, desired, dt, surfaces, canOccupy, body)
      : null;
    let next;
    if (exit) {
      next = constrainCamera(
        target,
        constrainCamera(
          game.camera.position,
          followCamera(
            game.camera.position,
            target,
            exit.point,
            dt,
            surfaces,
            canOccupy,
            game.cameraFollowTarget,
          ),
          surfaces,
          canOccupy,
        ),
        surfaces,
        canOccupy,
      );
      if (
        next.distanceTo(target) >= 2.2 &&
        cameraBodyVisibility(surfaces, next, body, game, true) === 1
      ) {
        game.cameraBodyRecovery = game.cameraContactRecovery = null;
      } else
        next = followClearCameraStep(
          game,
          target,
          exit.point,
          dt,
          canOccupy,
          exit.pitch,
          surfaces,
          false,
          body,
          exit.yaw,
        );
    } else
      next = followClearCameraStep(
        game,
        target,
        desired,
        dt,
        canOccupy,
        viewPitch,
        surfaces,
        true,
        body,
      );
    return gentleWalkingTurn(game, target, next, dt, canOccupy, surfaces, body);
  };
  return surfaces?.withSnapshot ? surfaces.withSnapshot(solve) : solve();
}

function followClearCameraStep(
  game,
  target,
  desired,
  dt,
  canOccupy,
  viewPitch = game.pitch,
  surfaces = guardianCameraSurfaces(game),
  allowAnticipation = true,
  bodyFrame = null,
  viewYaw = game.yaw,
) {
  let steering = false;
  const follow = (end) => {
      const next = followCamera(
        game.camera.position,
        target,
        end,
        dt * (steering ? 3 / 8 : 1),
        surfaces,
        canOccupy,
        game.cameraFollowTarget,
      );
      return enclosedSwimmer(game)
        ? constrainCamera(
            target,
            constrainCamera(game.camera.position, next, surfaces, canOccupy),
            surfaces,
            canOccupy,
          )
        : next;
    },
    ordinary = follow(desired),
    ordinaryLength = ordinary.distanceTo(target);
  if (
    ((game.swimming || game.diving) && !enclosedSwimmer(game)) ||
    game.aiming ||
    (game.climb && ordinaryLength >= 2.2) ||
    game.ropeRide
  ) {
    game.cameraBodyRecovery = null;
    game.cameraContactRecovery = null;
    return ordinary;
  }
  const confined = enclosedSwimmer(game),
    workingWheel = confined && !!game.sunkenGallery?.operation,
    comfortable = confined ? 2.4 : 3.2,
    body = bodyFrame ?? cameraBodyTargets(game),
    visibility = (position) =>
      // A confined swim candidate must clear the full posed silhouette. Stop
      // at its first blocked sample; rejected views need no fraction estimate.
      cameraBodyVisibility(
        surfaces,
        position,
        body,
        game,
        enclosedSwimmer(game),
      ),
    ordinaryVisible = visibility(ordinary),
    ahead =
      game.cameraFollowTarget && dt > 0 && dt <= 0.1
        ? target
            .clone()
            .sub(game.cameraFollowTarget)
            // Surface buoyancy and a held rise stroke reset each frame; they
            // do not predict continued ascent into the bell cap. Retain real
            // vertical anticipation while diving through confined passages.
            .multiply(
              new Vector3(1, enclosedSwimmer(game) && game.diving ? 1 : 0, 1),
            )
            .multiplyScalar(APPROACH_TIME / Math.max(dt, 1 / 120))
            .clampLength(0, 1.2)
        : new Vector3(),
    anticipated =
      allowAnticipation &&
      !clearApproach(game, target, desired, ahead, canOccupy, surfaces),
    bodyRecovery =
      workingWheel ||
      anticipated ||
      (confined && ordinaryLength < comfortable) ||
      ordinaryVisible < 1 ||
      (game.cameraBodyRecovery &&
        (visibility(desired) < 1 ||
          constrainCamera(target, desired, surfaces, canOccupy).distanceTo(
            target,
          ) < comfortable));
  if (ordinaryLength >= comfortable && !bodyRecovery) {
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
      [0, 0],
      [0, -0.2],
      [0, 0.2],
      [-0.15, 0],
      [0.15, 0],
      [-0.3, 0],
      [0.3, 0],
      ...[-0.15, 0.15, -0.3, 0.3].flatMap((yaw) =>
        [-0.2, 0.2].map((pitch) => [yaw, pitch]),
      ),
    ],
    retained = bodyRecovery && game.cameraBodyRecovery,
    lowerNearbyFirst =
      retained &&
      MathUtils.clamp(viewPitch + retained[1], -0.65, 1.05) - viewPitch > 0.2,
    shortenedRetained = retained && retained[2] < 1,
    shorterScales = [
      ...new Set([4.2, 3.4].map((arm) => Math.min(1, arm / distance))),
    ].filter((scale) => scale < 1),
    candidates = [
      // Move toward the wheel's working side while the explorer braces. Their
      // head moves forward as the grip releases; waiting for that pose would
      // require an immediate correction around the rim. Saved look stays put.
      ...(workingWheel
        ? [
            [
              Math.atan2(
                Math.sin(Math.PI - viewYaw),
                Math.cos(Math.PI - viewYaw),
              ),
              0,
            ],
          ]
        : []),
      ...(retained && !lowerNearbyFirst ? [retained] : []),
      ...nearbyCandidates,
      // A high requested look still needs a low escape beneath a gallery
      // ceiling. Relative offsets alone may leave every nearby pitch high.
      ...(confined && viewPitch > 0.2
        ? [0, -0.2, -0.4].flatMap((pitch) =>
            [0, -0.3, 0.3].map((yaw) => [yaw, pitch - viewPitch]),
          )
        : []),
      // Keep a settled shorter view after checking the immediate lower
      // neighborhood. Re-extending through the same bank causes pitching.
      ...(lowerNearbyFirst && shortenedRetained ? [retained] : []),
      // Try a moderate sideways view before lifting above the explorer. A
      // remembered upward detour must yield when the lower neighborhood opens.
      ...[-0.45, 0.45, -0.6, 0.6, -0.9, 0.9].flatMap((yaw) =>
        [0, -0.2, 0.2].map((pitch) => [yaw, pitch]),
      ),
      ...[0, -0.15, 0.15, -0.3, 0.3, -0.45, 0.45, -0.6, 0.6, -0.9, 0.9].flatMap(
        (yaw) => [-0.4, 0.4].map((pitch) => [yaw, pitch]),
      ),
      // A bank can hide the boots from a distant lens while a nearer lens
      // clears the whole body. Try comfortable shorter arms before a steep
      // overhead detour; every candidate keeps the same swept clearance.
      ...[0, -0.2, 0.2, -0.4, 0.4, 0.6].flatMap((pitch) =>
        [0, -0.3, 0.3, -0.6, 0.6].flatMap((yaw) =>
          shorterScales.map((scale) => [yaw, pitch, scale]),
        ),
      ),
      ...(lowerNearbyFirst && !shortenedRetained ? [retained] : []),
      // A steep foreground bank can cover the boots while the central arm
      // clears it. Lift the view before swinging far around the explorer.
      ...[0, -0.15, 0.15, -0.3, 0.3].flatMap((yaw) =>
        [0.6, 0.8, 1].map((pitch) => [yaw, pitch]),
      ),
      // A close pillar can cover the entire small neighborhood. Try its sides
      // only if none of those rays provides enough room for the explorer.
      ...[
        -1.05, 1.05, -1.2, 1.2, -1.35, 1.35, -1.5, 1.5, -1.65, 1.65, -1.8, 1.8,
        -1.95, 1.95, -2.1, 2.1,
      ].flatMap((yaw) =>
        [0, -0.2, 0.2, -0.4, 0.4].map((pitch) => [yaw, pitch]),
      ),
      ...(confined
        ? [-2.4, 2.4, -2.7, 2.7, Math.PI].flatMap((yaw) =>
            [0, -0.2, 0.2].map((pitch) => [yaw, pitch]),
          )
        : []),
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
  for (const [
    index,
    [yawOffset, pitchOffset, distanceScale = 1],
  ] of candidates.entries()) {
    if (index === nearbyCandidates.length && best && !bodyRecovery) break;
    const yaw = viewYaw + yawOffset,
      pitch = MathUtils.clamp(viewPitch + pitchOffset, -0.65, 1.05),
      armDistance = distance * distanceScale,
      recovery =
        distanceScale === 1
          ? [yawOffset, pitchOffset]
          : [yawOffset, pitchOffset, distanceScale],
      end = target
        .clone()
        .add(
          new Vector3(
            Math.sin(yaw) * Math.cos(pitch) * armDistance,
            Math.sin(pitch) * armDistance + lift,
            Math.cos(yaw) * Math.cos(pitch) * armDistance,
          ),
        ),
      safe = constrainCamera(target, end, surfaces, canOccupy);
    const safeLength = safe.distanceTo(target);
    if (safeLength < 2.2) continue;
    if (
      anticipated &&
      !clearApproach(game, target, end, ahead, canOccupy, surfaces)
    )
      continue;
    const next = follow(end);
    if (confined && dt > 0 && dt <= 0.1 && safeLength >= comfortable) {
      const length = next.distanceTo(target),
        opaqueLength = 2.21,
        previousLength = game.camera.position.distanceTo(
          game.cameraFollowTarget || target,
        );
      // A turning interpolation can shave millimetres off an otherwise clear
      // opaque view. Extend at the existing radial rate before searching more
      // orbits, retaining both the arm and the actual lens sweep. The extra
      // centimetre avoids rounding back into the 2.2 m fade boundary.
      if (length < 2.2 && opaqueLength <= previousLength + SWIM_ARM_RATE * dt) {
        const extended = target
          .clone()
          .add(next.clone().sub(target).setLength(opaqueLength));
        if (
          canOccupy(extended) &&
          constrainCamera(target, extended, surfaces, canOccupy).distanceTo(
            extended,
          ) < 1e-6 &&
          constrainCamera(
            game.camera.position,
            extended,
            surfaces,
            canOccupy,
          ).distanceTo(extended) < 1e-6
        )
          next.copy(extended);
      }
    }
    const length = next.distanceTo(target),
      visible = visibility(next),
      endVisible = visibility(safe),
      score =
        Math.min(length, comfortable) * 2 +
        Math.min(safeLength, 5.3) -
        (Math.abs(yawOffset) + Math.abs(pitch - viewPitch)) * 0.5 -
        (1 - visible) * 12 -
        (1 - endVisible) * 12;
    // A low bridge may leave a visible arm just short of the comfortable
    // distance. Keep that option only if the full search finds no longer view.
    if (safeLength < comfortable) {
      if (!shorter || score > shorter.score)
        shorter = { next, safe, score, recovery };
      continue;
    }
    if (!best || score > best.score) best = { next, safe, score, recovery };
    // A clear swim detour may still be extending through the opaque range.
    // Keep any clear extension toward a comfortable endpoint. Requiring a
    // previously remembered detour here needlessly exhausts every candidate
    // at the first short-but-opaque frame of a new swim recovery.
    const extendingSwim = confined && length >= 2.2;
    if (
      (length >= comfortable || extendingSwim) &&
      visible === 1 &&
      endVisible === 1
    ) {
      // Arm recovery needs the same continuity as body recovery: otherwise a
      // clear interpolated arm can fall straight back toward a blocked request.
      rememberRecovery(recovery);
      return next;
    }
  }
  best ||= shorter;
  if (!best) {
    // A projected target can cross a bank or obstacle that the player will
    // stop before. If that forecast rejects every detour, retain a legal view
    // at the actual current position instead of collapsing into the body.
    // The second search still enforces walls, terrain and current body sight.
    if (anticipated && ordinaryLength < 2.2)
      return followClearCameraStep(
        game,
        target,
        desired,
        dt,
        canOccupy,
        viewPitch,
        surfaces,
        false,
        body,
        viewYaw,
      );
    return ordinary;
  }
  rememberRecovery(best.recovery);
  if (best.next.distanceTo(target) >= 2.2) return best.next;
  // A narrow shaft may also block the interpolated sweep. Resolve that contact
  // immediately, like an inward wall correction, then extend with normal follow.
  const length = Math.min(
    best.safe.distanceTo(target),
    Math.max(confined ? 2.25 : 2.2, game.camera.position.distanceTo(target)),
  );
  const position = constrainCamera(
    target,
    target.clone().add(best.safe.clone().sub(target).setLength(length)),
    surfaces,
    canOccupy,
  );
  return confined
    ? constrainCamera(game.camera.position, position, surfaces, canOccupy)
    : position;
}
