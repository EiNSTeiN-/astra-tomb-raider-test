import * as THREE from "three";

// The handholds face +Z. Frame that open side when taking a grip or return
// line, then let mouse, touch and keyboard look around within its clear arc.
// A full orbit behind this wall collapses the collision arm into the actor.
export function frameCleftCamera(game) {
  const c = game.cleft;
  if (!c) return;
  if (!game.wallGrip) {
    c.cameraActive = false;
    return;
  }
  if (!c.cameraActive) {
    game.yaw = 0;
    game.pitch = 0.2;
    c.cameraActive = true;
  }
  game.yaw = THREE.MathUtils.clamp(
    Math.atan2(Math.sin(game.yaw), Math.cos(game.yaw)),
    -0.85,
    0.85,
  );
  game.pitch = THREE.MathUtils.clamp(game.pitch, 0.02, 0.55);
}
