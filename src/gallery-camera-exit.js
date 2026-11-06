import { Vector3 } from "three";
import { constrainCamera } from "./camera-collision.js";
import { cameraBodyVisibility } from "./camera-body-frame.js";
import { galleryAt, gallerySection } from "./sunken-gallery-layout.js";

// An underwater lens must leave through the real aperture before rising over
// its roof. A direct orbit to a clear point above that roof has no clear path.
export function galleryCameraExit(
  game,
  target,
  desired,
  dt,
  surfaces,
  canOccupy,
  body,
) {
  const gallery = game.sunkenGallery,
    p = game.player?.position;
  if (!gallery?.well || !p || galleryAt(game, p.x, p.y, p.z)) {
    game.cameraGalleryExit = null;
    return null;
  }
  const entrance = gallery.profile.volumes.find((v) => v.id === "entrance");
  if (!entrance) return null;
  const roof = entrance.max.y,
    section = gallerySection(gallery.profile, desired.x, desired.z),
    rise =
      game.cameraFollowTarget && dt > 0 && dt <= 0.1
        ? Math.max(
            0,
            (target.y - game.cameraFollowTarget.y) / Math.max(dt, 1 / 120),
          ) * 0.35
        : 0,
    threatened = section && desired.y + rise > section.ceiling - 0.35;
  const clear = (point) =>
    canOccupy(point) &&
    constrainCamera(target, point, surfaces, canOccupy).distanceTo(point) <
      1e-6 &&
    constrainCamera(
      game.camera.position,
      point,
      surfaces,
      canOccupy,
    ).distanceTo(point) < 1e-6 &&
    cameraBodyVisibility(surfaces, point, body, game, true) === 1;
  let plan = game.cameraGalleryExit;
  if (
    plan &&
    clear(desired) &&
    (!threatened ||
      (desired.y > roof + 0.35 && game.camera.position.y > roof + 0.35))
  ) {
    game.cameraGalleryExit = null;
    return null;
  }
  if (!plan) {
    const camera = game.camera.position;
    if (!threatened || !galleryAt(game, camera.x, camera.y, camera.z))
      return null;
    const side = camera.z >= p.z ? 1 : -1;
    for (const sign of [side, -side]) {
      const point = new Vector3(
        entrance.max.x + 0.65,
        Math.min(camera.y, roof - 0.35),
        Math.max(
          entrance.min.z + 0.35,
          Math.min(entrance.max.z - 0.35, p.z + sign * 2.5),
        ),
      );
      if (point.distanceTo(target) < 2.2 || !clear(point)) continue;
      plan = game.cameraGalleryExit = { point, stage: "aperture" };
      game.cameraBodyRecovery = game.cameraContactRecovery = null;
      break;
    }
    if (!plan) return null;
  }
  if (
    plan.stage === "aperture" &&
    game.camera.position.x > entrance.max.x + 0.4
  )
    plan.stage = "rise";
  const point = plan.point.clone();
  if (plan.stage === "rise") point.y = Math.max(desired.y, roof + 0.4);
  return {
    point,
    yaw: Math.atan2(point.x - target.x, point.z - target.z),
    pitch: 0,
  };
}
