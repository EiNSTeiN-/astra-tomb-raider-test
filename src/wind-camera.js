import { MathUtils, Vector3 } from "three";
import { constrainCamera } from "./camera-collision.js";

// The working pad faces each wheel along +Z. The shaft ends 24.5 cm before
// that pad, inside the camera's 28 cm safety margin when an upper peg rotates
// past chest height. Keep the look point on the clear side of that margin.
// This moves the view, never the controller, and fades out away from the pad.
export function windCameraStandoff(game) {
  if (!game.windSites?.length || game.swimming || game.diving) return 0;
  const p = game.player.position;
  let offset = 0;
  for (const site of game.windSites)
    for (const node of site.nodes) {
      const pad = node.control?.group.position;
      if (!pad) continue;
      const x = Math.abs(p.x - pad.x),
        z = Math.abs(p.z - pad.z),
        height = Math.abs(p.y - pad.y);
      if (x >= 1.3 || z >= 1.2 || height >= 1.4) continue;
      const influence =
        (1 - MathUtils.smoothstep(x, 0.65, 1.3)) *
        (1 - MathUtils.smoothstep(z, 0.65, 1.2)) *
        (1 - MathUtils.smoothstep(height, 0.8, 1.4));
      offset = Math.max(offset, Math.max(0, pad.z + 0.14 - p.z) * influence);
    }
  return offset;
}

// A clear ray to a shifted look point can pass beside a casting while the
// explorer's chest remains behind it. Preserve that body sight line too.
export function windCameraSpace(game, point, chest, offset) {
  return (
    game.cameraSpace(point) &&
    (!offset || game.cameraSurfaces.entry(chest, point, 0) >= 0.999)
  );
}

// Frame an accepted wheel operation from the working side of its rotating
// pegs. A clear view before turning can collapse when a peg reaches chest
// height. Choose once on Use; subsequent look input remains under player control.
export function frameWindControl(game) {
  if (!Number.isFinite(game.yaw) || !Number.isFinite(game.pitch)) return false;
  const chest = game.player.position.clone().add(new Vector3(0, 1.3, 0)),
    offset = windCameraStandoff(game),
    target = chest.clone().add(new Vector3(0, 0, offset)),
    current = Math.atan2(Math.sin(game.yaw), Math.cos(game.yaw)),
    preferred = MathUtils.clamp(current, -1.2, 1.2),
    headings = [
      ...new Set([preferred, 0, -0.3, 0.3, -0.6, 0.6, -0.9, 0.9, -1.2, 1.2]),
    ],
    pitches = [
      ...new Set([
        game.pitch,
        Math.min(1.05, game.pitch + 0.25),
        Math.max(-0.65, game.pitch - 0.25),
      ]),
    ];
  let best = null;
  for (const pitch of pitches)
    for (const yaw of headings) {
      const desired = target
          .clone()
          .add(
            new Vector3(
              Math.sin(yaw) * Math.cos(pitch) * 5.3,
              Math.sin(pitch) * 5.3 + 0.2,
              Math.cos(yaw) * Math.cos(pitch) * 5.3,
            ),
          ),
        position = constrainCamera(
          target,
          desired,
          game.cameraSurfaces,
          (point) => windCameraSpace(game, point, chest, offset),
        ),
        length = position.distanceTo(target),
        deviation =
          Math.abs(
            Math.atan2(Math.sin(yaw - current), Math.cos(yaw - current)),
          ) + Math.abs(pitch - game.pitch),
        score = Math.min(length, 5.3) - deviation * 0.25;
      if (!best || score > best.score) best = { yaw, pitch, length, score };
    }
  if (best.length < 2.2) return false;
  game.yaw += Math.atan2(
    Math.sin(best.yaw - current),
    Math.cos(best.yaw - current),
  );
  game.pitch = best.pitch;
  return true;
}
