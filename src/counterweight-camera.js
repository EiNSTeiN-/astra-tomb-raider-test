import { MathUtils, Vector3 } from "three";
import {
  boxEntry,
  constrainCamera,
  faceCameraTarget,
} from "./camera-collision.js";
import { windCameraSpace, windCameraStandoff } from "./wind-camera.js";

// Predict the camera against translated stone bounds without moving the world,
// player, walking obstacles or saved cells. Counterweight bodies only translate.
function slideViews(game, move) {
  const body = game.blockGrip.block.group;
  body.updateWorldMatrix(true, false);
  const origin = body.getWorldPosition(new Vector3()),
    boxes = game.cameraSurfaces.dynamic
      .filter((surface) => surface.parent === body)
      .map((surface) =>
        surface.box
          .clone()
          .applyMatrix4(surface.local)
          .applyMatrix4(body.matrixWorld),
      );
  return Array.from({ length: 9 }, (_, i) => {
    const amount = i / 8,
      position = move.playerFrom.clone().lerp(move.playerTo, amount),
      delta = move.from.clone().lerp(move.to, amount).sub(origin),
      predicted = boxes.map((box) => box.clone().translate(delta));
    return {
      position,
      surfaces: {
        entry(start, end, radius = 0.28) {
          let t = game.cameraSurfaces.entry(start, end, radius, body);
          for (const box of predicted) {
            const hit = boxEntry(start, end, box, radius);
            if (hit !== null) t = Math.min(t, hit);
          }
          return t;
        },
      },
    };
  });
}

// Use closes the last 15 cm to a stone. A later slide can carry that stance
// beside another obstruction. Select once per accepted interaction, testing the
// complete slide; normal look input stays free between those decisions.
export function frameCounterweightGrip(game, axis, move = null) {
  if (
    !game.camera ||
    !Number.isFinite(game.yaw) ||
    !Number.isFinite(game.pitch)
  )
    return false;
  const views = (
      move
        ? slideViews(game, move)
        : [{ position: game.player.position, surfaces: game.cameraSurfaces }]
    ).map(({ position, surfaces }) => {
      const chest = position.clone().add(new Vector3(0, 1.3, 0)),
        offset = windCameraStandoff(game, position);
      return {
        chest,
        offset,
        target: chest.clone().add(new Vector3(0, 0, offset)),
        surfaces,
      };
    }),
    evaluate = (yaw, pitch) => {
      const arm = new Vector3(
        Math.sin(yaw) * Math.cos(pitch) * 5.3,
        Math.sin(pitch) * 5.3 + 0.2,
        Math.cos(yaw) * Math.cos(pitch) * 5.3,
      );
      let minimum = Infinity,
        first;
      for (const view of views) {
        const desired = view.target.clone().add(arm),
          position = constrainCamera(
            view.target,
            desired,
            view.surfaces,
            (point) =>
              windCameraSpace(
                game,
                point,
                view.chest,
                view.offset,
                view.surfaces,
              ),
          );
        minimum = Math.min(minimum, position.distanceTo(view.target));
        first ||= { position, desired };
      }
      const deviation =
        Math.abs(
          Math.atan2(Math.sin(yaw - game.yaw), Math.cos(yaw - game.yaw)),
        ) + Math.abs(pitch - game.pitch);
      return {
        ...first,
        yaw,
        pitch,
        minimum,
        score: Math.min(minimum, 5.3) - deviation * 0.25,
      };
    };
  // Preserve a player's clear view when it will stay clear throughout a slide.
  if (move && evaluate(game.yaw, game.pitch).minimum >= 2.2) return false;
  const rear = Math.atan2(-axis[0], -axis[1]),
    relative = Math.atan2(Math.sin(game.yaw - rear), Math.cos(game.yaw - rear)),
    headings = [
      ...new Set([
        MathUtils.clamp(relative, -1.2, 1.2),
        0,
        -0.3,
        0.3,
        -0.6,
        0.6,
        -0.9,
        0.9,
        -1.2,
        1.2,
      ]),
    ],
    pitches = [
      ...new Set([
        game.pitch,
        Math.min(1.05, game.pitch + 0.25),
        Math.max(-0.65, game.pitch - 0.25),
        1.05,
      ]),
    ];
  let best;
  const choose = (angles) => {
    for (const pitch of pitches)
      for (const angle of angles) {
        const candidate = evaluate(rear + angle, pitch);
        if (candidate.minimum >= 2.2 && (!best || candidate.score > best.score))
          best = candidate;
      }
  };
  choose(headings);
  // A wall can close the rear working side. Search the remaining orbit only
  // when that side has no clear view across the entire movement.
  if (!best) choose(Array.from({ length: 24 }, (_, i) => (i * Math.PI) / 12));
  if (!best) return false;
  game.yaw += Math.atan2(
    Math.sin(best.yaw - game.yaw),
    Math.cos(best.yaw - game.yaw),
  );
  game.pitch = best.pitch;
  game.camera.position.copy(best.position);
  game.cameraFollowTarget = views[0].target;
  faceCameraTarget(game.camera, views[0].target, best.desired);
  game.camera.updateMatrixWorld();
  game.rig?.visibility?.set(best.minimum);
  return true;
}
