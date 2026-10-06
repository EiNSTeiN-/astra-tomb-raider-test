import { MathUtils, Vector3 } from "three";
import { followClearCamera } from "./camera-follow.js";

// Start rising before a reverse arm reaches a drum. The clear path over its
// crown joins both sides continuously, instead of jumping between side orbits.
export function cipherCameraRecovery(game, look = game) {
  const pitch = look.pitch;
  if (
    !game.cipherSites?.length ||
    game.swimming ||
    game.diving ||
    game.aiming ||
    game.aimBlend > 0.001 ||
    game.climb ||
    game.ropeRide ||
    game.zipRide ||
    game.blockGrip
  )
    return { offset: 0, pitch, strength: 0 };
  const p = game.player.position;
  let influence = 0,
    narrow = 0;
  for (const site of game.cipherSites)
    for (let i = 0; i <= site.nodes.length; i++) {
      const control =
          i < site.nodes.length ? site.nodes[i].control : site.tablet,
        pad = control.group.position,
        x = Math.abs(p.x - pad.x),
        z = Math.abs(p.z - pad.z),
        height = Math.abs(p.y - pad.y);
      if (x >= 1.3 || z >= 2.2 || height >= 1.4) continue;
      const strength =
        (1 - MathUtils.smoothstep(x, 0.65, 1.3)) *
        (1 - MathUtils.smoothstep(z, 1.25, 2.2)) *
        (1 - MathUtils.smoothstep(height, 0.8, 1.4));
      influence = Math.max(influence, strength);
      // Two rear centre drums leave the inscription close behind their working
      // stance. Rise over that tablet on the forward approach as well.
      const gap = site.tablet.group.position.z - pad.z;
      if (
        control.kind === "drum" &&
        Math.abs(pad.x - site.tablet.group.position.x) < 2.4 &&
        gap > 1.7 &&
        gap < 5.5
      )
        narrow = Math.max(narrow, strength);
    }
  const reverse = Math.max(0, -Math.cos(look.yaw)),
    forward = Math.max(0, Math.cos(look.yaw)),
    loft = Math.max(
      influence * MathUtils.smoothstep(reverse, 0.15, 0.85),
      narrow * MathUtils.smoothstep(forward, 0.15, 0.85),
    );
  return {
    offset: 1.3 * influence * reverse,
    pitch: MathUtils.lerp(pitch, Math.max(pitch, 1.05), loft),
    strength: Math.max(influence * reverse, loft),
  };
}

// A clear shifted arm must also leave room around the explorer's own chest.
// This tube covers the body rays that previously crossed a wheel or tablet.
export function cipherCameraSpace(game, point, chest, strength) {
  return !strength || game.cameraSurfaces.entry(chest, point, 0.22) >= 0.999;
}

// Retain the saved look when its recovered view is clear on arrival. The
// ordinary arrival policy still handles other places and obstructed arrivals.
export function cipherArrivalCamera(game, chest, preferred) {
  const recovery = cipherCameraRecovery(game, preferred);
  if (!recovery.strength) return null;
  const target = chest.clone().add(new Vector3(0, 0, recovery.offset)),
    desired = target
      .clone()
      .add(
        new Vector3(
          Math.sin(preferred.yaw) * Math.cos(recovery.pitch) * 5.3,
          Math.sin(recovery.pitch) * 5.3 + 0.2,
          Math.cos(preferred.yaw) * Math.cos(recovery.pitch) * 5.3,
        ),
      ),
    position = followClearCamera(
      {
        camera: { position: target.clone() },
        cameraFollowTarget: target,
        cameraSurfaces: game.cameraSurfaces,
        yaw: preferred.yaw,
        pitch: preferred.pitch,
      },
      target,
      desired,
      1,
      (p) =>
        game.cameraSpace(p) &&
        cipherCameraSpace(game, p, chest, recovery.strength),
      recovery.pitch,
    ),
    length = position.distanceTo(target);
  if (length < 3.2) return null;
  return { ...preferred, position, desired, length, target };
}
