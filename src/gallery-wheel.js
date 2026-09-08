import * as THREE from "three";
import { galleryAt, galleryClear } from "./sunken-gallery-layout.js";
import { poseCylinderGrip } from "./hand-grip.js";

export const GALLERY_WHEEL = Object.freeze({
  startAngle: Math.PI / 6,
  turnAngle: Math.PI / 3,
  alignTime: 0.3,
  turnStart: 0.42,
  releaseTime: 1.05,
  endTime: 1.35,
});

function stance(game) {
  const w = game.sunkenGallery.profile.wheel;
  return new THREE.Vector3(w.x, w.y - 0.3, w.z - 0.65);
}

function clearApproach(game, from, to) {
  const steps = Math.max(1, Math.ceil(from.distanceTo(to) / 0.1));
  for (let i = 0; i <= steps; i++) {
    const p = from.clone().lerp(to, i / steps);
    if (!galleryClear(game, p.x, p.y, p.z)) return false;
  }
  return true;
}

export function canUseGalleryWheel(game) {
  const gallery = game.sunkenGallery,
    p = game.player?.position;
  if (!gallery || !p || !game.diving || gallery.operation) return false;
  const w = gallery.profile.wheel;
  return (
    !game.progress.gallery.opened &&
    Math.abs(gallery.wheel.rotation.z - GALLERY_WHEEL.startAngle) < 0.035 &&
    p.z < w.z - 0.35 &&
    p.distanceTo(new THREE.Vector3().copy(w)) < 2.1 &&
    !!galleryAt(game, p.x, p.y, p.z) &&
    clearApproach(game, p, stance(game))
  );
}

export function beginGalleryWheel(game) {
  if (!canUseGalleryWheel(game)) return false;
  const target = stance(game);
  game.sunkenGallery.operation = {
    time: 0,
    turn: 0,
    from: game.player.position.clone(),
    target,
    alignTime: Math.max(
      GALLERY_WHEEL.alignTime,
      (game.player.position.distanceTo(target) * 1.5) / 3.1,
    ),
    yaw: game.avatar.rotation.y,
    last: game.player.position.clone(),
  };
  return true;
}

function turnTime(op) {
  return op.time - op.alignTime + GALLERY_WHEEL.alignTime;
}

export function galleryWheelBrace(game) {
  const op = game.sunkenGallery?.operation;
  if (!op) return 0;
  return (
    THREE.MathUtils.smoothstep(op.time, 0, op.alignTime) *
    (1 -
      THREE.MathUtils.smoothstep(
        turnTime(op),
        GALLERY_WHEEL.releaseTime,
        GALLERY_WHEEL.endTime,
      ))
  );
}

// Called after ordinary diving movement, so oxygen and movement cancellation
// remain part of the same simulation even while the explorer reaches the wheel.
export function advanceGalleryWheel(game, dt, input, rise) {
  const gallery = game.sunkenGallery,
    op = gallery?.operation;
  if (!op || game.paused) return;
  if (
    !game.diving ||
    game.health <= 0 ||
    Math.hypot(input.x, input.z) > 0.05 ||
    rise ||
    game.keys.has("KeyX") ||
    game.player.position.distanceTo(op.last) > 0.2
  ) {
    gallery.operation = null;
    return;
  }
  op.time = Math.min(
    GALLERY_WHEEL.endTime + op.alignTime - GALLERY_WHEEL.alignTime,
    op.time + dt,
  );
  const align = THREE.MathUtils.smoothstep(op.time, 0, op.alignTime),
    next = op.from.clone().lerp(op.target, align);
  if (!clearApproach(game, game.player.position, next)) {
    gallery.operation = null;
    return;
  }
  game.player.position.copy(next);
  op.last.copy(next);
  game.avatar.rotation.y =
    op.yaw + Math.atan2(Math.sin(-op.yaw), Math.cos(-op.yaw)) * align;
  op.turn = THREE.MathUtils.smoothstep(
    turnTime(op),
    GALLERY_WHEEL.turnStart,
    GALLERY_WHEEL.releaseTime,
  );
  gallery.wheel.rotation.z =
    GALLERY_WHEEL.startAngle - op.turn * GALLERY_WHEEL.turnAngle;
  if (
    turnTime(op) >= GALLERY_WHEEL.releaseTime &&
    !game.progress.gallery.opened
  ) {
    game.progress.gallery.opened = true;
    game.audio.tone("switch");
    game.cb.toast?.(
      "The emergency wheel releases both gates. The memorial and the return passage are opening.",
      5000,
    );
    game.save();
    game.cb.update?.(game.state());
  }
  if (turnTime(op) >= GALLERY_WHEEL.endTime - 1e-8) gallery.operation = null;
}

export function poseGalleryWheel(game) {
  const gallery = game.sunkenGallery,
    op = gallery?.operation;
  if (!op || !game.rig) return;
  const reach =
    THREE.MathUtils.smoothstep(turnTime(op), 0.16, GALLERY_WHEEL.turnStart) *
    (1 -
      THREE.MathUtils.smoothstep(
        turnTime(op),
        GALLERY_WHEEL.releaseTime,
        1.25,
      ));
  gallery.wheel.updateWorldMatrix(true, true);
  const rotation = gallery.wheel.getWorldQuaternion(new THREE.Quaternion());
  poseCylinderGrip(
    game,
    gallery.handles.map((h) => h.getWorldPosition(new THREE.Vector3())),
    new THREE.Vector3(1, 0, 0).applyQuaternion(rotation),
    new THREE.Vector3(0, 1, 0).applyQuaternion(rotation),
    reach,
  );
}
