import * as THREE from "three";
import { animateExplorer } from "../src/explorer.js";

// The optional animator allows an archived implementation to be compared in the
// same scene. Both views sample the same clip phase, independently of playback rate.
export function strideView(game, mode = "crouch", animate = animateExplorer) {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  const crouching = mode.startsWith("crouch"),
    moving = mode !== "crouch-idle";
  const speed = !moving
    ? 0
    : crouching
      ? 2.2
      : mode === "walk"
        ? 2.4
        : mode === "sprint"
          ? 10
          : 6;
  Object.assign(game, {
    grounded: true,
    swimming: false,
    crouching,
    climb: null,
    ropeRide: null,
    zipRide: null,
    dodge: null,
    aimUntil: 0,
    elapsed: 10,
    jumpY: 0,
    velocityY: 0,
    actualMoveSpeed: speed,
    moveVelocity: { x: 0, z: speed },
  });
  game.avatar.rotation.y = 0;
  const rig = game.rig,
    clip = !moving ? "Idle" : crouching || mode === "walk" ? "Walk" : "Run";
  rig.grounding = undefined;
  rig.mixer.stopAllAction();
  rig.actions[clip].reset().setEffectiveWeight(1).play();
  rig.state = clip;
  rig.crouchBlend = Number(crouching);
  for (let i = 0; i < 45; i++) animate(game, 1 / 60, moving, mode === "sprint");
  const action = rig.actions[clip],
    time = action.getClip().duration * (moving ? 0.36 : 0.2);
  rig.mixer.setTime(time / action.getEffectiveTimeScale());
  animate(game, 0, moving, mode === "sprint");
  game.updateDecorations(0);
  game.camera.position
    .copy(game.player.position)
    .add(new THREE.Vector3(2.6, 1.35, 1.3));
  game.camera.fov = 42;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  game.camera.lookAt(
    game.player.position
      .clone()
      .add(new THREE.Vector3(0, crouching ? 0.72 : 0.88, 0)),
  );
  game.renderScene(0);
  const position = (name) =>
    rig.model
      .getObjectByName("mixamorig" + name)
      .getWorldPosition(new THREE.Vector3())
      .sub(game.player.position)
      .toArray();
  return {
    mode,
    clip,
    phase: action.time / action.getClip().duration,
    rate: action.getEffectiveTimeScale(),
    player: game.player.position.toArray(),
    camera: game.camera.position.toArray(),
    rotation: game.camera.quaternion.toArray(),
    knees: ["Left", "Right"].map((s) => position(s + "Leg")),
    feet: ["Left", "Right"].map((s) => position(s + "Foot")),
    contacts: rig.grounding.contacts,
    pelvis: rig.grounding.pelvis,
    triangles: game.renderer.info.render.triangles,
    calls: game.renderer.info.render.calls,
  };
}
