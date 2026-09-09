import * as THREE from "three";
import { animateExplorer } from "../src/explorer.js";

// Assisted, fixed-camera review; ordinary keyboard/touch checks are separate.
export function crouchView(
  game,
  { moving = false, time = 0.4, side = false } = {},
) {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  Object.assign(game, {
    grounded: true,
    swimming: false,
    crouching: true,
    climb: null,
    ropeRide: null,
    zipRide: null,
    dodge: null,
    aimUntil: 0,
    elapsed: 10,
    jumpY: 0,
    velocityY: 0,
    actualMoveSpeed: moving ? 2.2 : 0,
    moveVelocity: { x: 0, z: moving ? 2.2 : 0 },
  });
  game.avatar.rotation.y = 0;
  const rig = game.rig,
    clip = moving ? "Walk" : "Idle";
  rig.mixer.stopAllAction();
  rig.actions[clip].reset().play();
  rig.state = clip;
  rig.crouchBlend = 1;
  for (let i = 0; i < 30; i++) animateExplorer(game, 1 / 60, moving, false);
  rig.mixer.setTime(time);
  animateExplorer(game, 0, moving, false);
  game.updateDecorations(0);
  game.camera.position
    .copy(game.player.position)
    .add(new THREE.Vector3(side ? 2.5 : 1.25, 1.15, side ? 0.8 : 2.7));
  game.camera.fov = 39;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  game.camera.lookAt(
    game.player.position.clone().add(new THREE.Vector3(0, 0.75, 0)),
  );
  game.renderScene(0);
  const point = (name) =>
    rig.model
      .getObjectByName("mixamorig" + name)
      .getWorldPosition(new THREE.Vector3())
      .sub(game.player.position)
      .toArray();
  return {
    player: game.player.position.toArray(),
    camera: game.camera.position.toArray(),
    cameraRotation: game.camera.quaternion.toArray(),
    moving,
    time,
    side,
    hands: ["Left", "Right"].map((s) => ({
      shoulder: point(s + "Arm"),
      elbow: point(s + "ForeArm"),
      wrist: point(s + "Hand"),
      knuckle: point(s + "HandMiddle1"),
      tip: point(s + "HandMiddle3"),
    })),
    triangles: game.renderer.info.render.triangles,
    calls: game.renderer.info.render.calls,
  };
}
