// Assisted comparison on disposable progress. Supply an archived animator from
// the preceding revision; no objective is earned and this helper never saves.
import * as THREE from "three";
import { animateExplorer } from "../src/explorer.js";
import { advanceCharacter } from "../src/character-motion.js";
import { restoreCableGrip } from "../src/hand-grip.js";
import { restoreCrouchHands } from "../src/explorer-crouch.js";

// Repeating the unchanged animator can vary a first-frame finger transform by
// less than 1e-10. This remains below ordinary GPU matrix/position precision.
export const GROUNDING_COMPARE_EPSILON = 1e-8;

function visible(mesh) {
  for (let p = mesh; p; p = p.parent) if (!p.visible) return false;
  return true;
}
function skin(game) {
  const meshes = [];
  game.avatar.traverse((m) => {
    if (m.isMesh && visible(m)) meshes.push(m);
  });
  const count = meshes.reduce(
      (n, m) => n + m.geometry.attributes.position.count,
      0,
    ),
    values = new Float64Array(count * 3),
    p = new THREE.Vector3();
  let offset = 0;
  for (const mesh of meshes)
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld);
      values.set(p.toArray(), offset);
      offset += 3;
    }
  return values;
}
function difference(a, b) {
  if (a.length !== b.length) return Infinity;
  let worst = 0;
  for (let i = 0; i < a.length; i++)
    worst = Math.max(worst, Math.abs(a[i] - b[i]));
  return worst;
}

export function createGroundingComparison(game, referenceAnimate) {
  if (!game.paused || typeof referenceAnimate !== "function")
    throw Error("Use disposable paused progress and a reference animator");
  const nodes = [];
  game.avatar.traverse((node) =>
    nodes.push({
      node,
      position: node.position.clone(),
      quaternion: node.quaternion.clone(),
      scale: node.scale.clone(),
      visible: node.visible,
    }),
  );
  const cameraPosition = game.camera.position.clone(),
    cameraRotation = game.camera.quaternion.clone();
  function reset(pose) {
    restoreCableGrip(game);
    restoreCrouchHands(game);
    for (const b of nodes) {
      b.node.position.copy(b.position);
      b.node.quaternion.copy(b.quaternion);
      b.node.scale.copy(b.scale);
      b.node.visible = b.visible;
    }
    const [x, y, z] = pose.position;
    game.player.position.set(x, y, z);
    game.jumpY = y - game.groundHeight(x, z);
    game.velocityY = 0;
    game.grounded = true;
    game.elapsed = 25;
    game.keys.clear();
    game.touchMove = game.moveVelocity = { x: 0, z: 0 };
    game.actualMoveSpeed = 0;
    game.swimming = game.diving = game.aiming = false;
    game.crouching = !!pose.crouching;
    game.climb =
      game.ropeRide =
      game.zipRide =
      game.wallGrip =
      game.blockGrip =
      game.dodge =
        null;
    game.campEscape = game.airVelocity = null;
    game.aimUntil = 0;
    game.yaw = pose.yaw;
    game.pitch = 0.13;
    game.avatar.visible = true;
    game.avatar.position.set(0, 0, 0);
    game.avatar.rotation.set(0, pose.yaw + Math.PI, 0);
    const rig = game.rig;
    rig.grounding = rig.terrainCrouch = rig.crouchHands = undefined;
    rig.gripBaseActive = false;
    rig.hangLift = rig.crouchBlend = 0;
    rig.mixer.stopAllAction();
    rig.actions.Idle.reset().setEffectiveWeight(1).play();
    rig.state = "Idle";
    rig.mixer.setTime(0);
    game.playerNoises = [];
    game.noiseSerial = 0;
    game.camera.position.copy(cameraPosition);
    game.camera.quaternion.copy(cameraRotation);
    game.camera.updateMatrixWorld();
    game.updateDecorations(0);
    game.world.updateMatrixWorld(true);
    game.player.updateWorldMatrix(true, true);
  }
  function trace() {
    const values = [
      game.player.position.x,
      game.player.position.y,
      game.player.position.z,
      game.jumpY,
      game.velocityY,
      game.actualMoveSpeed,
      Number(game.grounded),
      Number(game.crouching),
      game.rig.crouchBlend,
      game.rig.grounding?.pelvis ?? 0,
    ];
    for (const { node } of nodes)
      values.push(...node.matrixWorld.elements, Number(node.visible));
    return Float64Array.from(values);
  }
  function run(pose, animate) {
    reset(pose);
    const frames = [],
      footsteps = [],
      previousStep = game.audio.footstep;
    game.audio.footstep = function (surface, sprint, position, volume) {
      footsteps.push({
        surface,
        sprint,
        position: position.toArray(),
        volume,
        time: game.elapsed,
      });
      return previousStep?.call(this, surface, sprint, position, volume);
    };
    const start = performance.now(),
      wasPaused = game.paused;
    game.paused = false;
    try {
      for (let i = 0; i < (pose.frames ?? 36); i++) {
        const before = game.player.position.clone(),
          dt = 1 / 60;
        advanceCharacter(game, pose.velocity ?? { x: 0, z: 0 }, dt);
        const distance = Math.hypot(
          game.player.position.x - before.x,
          game.player.position.z - before.z,
        );
        game.actualMoveSpeed = distance / dt;
        game.moveVelocity = {
          x: (game.player.position.x - before.x) / dt,
          z: (game.player.position.z - before.z) / dt,
        };
        game.elapsed += dt;
        animate(game, dt, distance > 1e-5, false);
        game.player.updateWorldMatrix(true, true);
        frames.push(trace());
      }
    } finally {
      game.audio.footstep = previousStep;
      game.paused = wasPaused;
    }
    const milliseconds = performance.now() - start,
      vertices = skin(game);
    return {
      frames,
      footsteps,
      milliseconds,
      vertices,
      position: game.player.position.toArray(),
      grounded: game.grounded,
      legal: game.canMove(
        game.player.position.x,
        game.player.position.z,
        game.jumpY,
      ),
      health: game.health,
    };
  }
  return async (
    pose,
    { capture, onRun, currentAnimate = animateExplorer } = {},
  ) => {
    const reference = run(pose, referenceAnimate);
    await onRun?.({ phase: "reference", milliseconds: reference.milliseconds });
    await capture?.("reference");
    const current = run(pose, currentAnimate);
    await onRun?.({ phase: "current", milliseconds: current.milliseconds });
    let matrixDifference = 0,
      controllerEqual = true,
      matrixWitness = null;
    for (let i = 0; i < reference.frames.length; i++)
      for (let j = 0; j < reference.frames[i].length; j++) {
        const delta = Math.abs(reference.frames[i][j] - current.frames[i][j]);
        if (j < 8 && reference.frames[i][j] !== current.frames[i][j])
          controllerEqual = false;
        if (delta > matrixDifference) {
          matrixDifference = delta;
          const index = Math.floor((j - 10) / 17);
          matrixWitness = {
            frame: i + 1,
            index: j,
            node:
              j < 10
                ? "player/grounding state"
                : nodes[index].node.name || nodes[index].node.type,
            component: j < 10 ? j : (j - 10) % 17,
            reference: reference.frames[i][j],
            current: current.frames[i][j],
          };
        }
      }
    const vertexDifference = difference(reference.vertices, current.vertices);
    let footstepDifference = 0,
      footstepsEqual = reference.footsteps.length === current.footsteps.length;
    for (let i = 0; i < reference.footsteps.length && footstepsEqual; i++) {
      const a = reference.footsteps[i],
        b = current.footsteps[i];
      footstepsEqual =
        a.surface === b.surface &&
        a.sprint === b.sprint &&
        a.volume === b.volume &&
        a.time === b.time;
      footstepDifference = Math.max(
        footstepDifference,
        difference(a.position, b.position),
      );
    }
    footstepsEqual &&= footstepDifference <= GROUNDING_COMPARE_EPSILON;
    await capture?.("current");
    return {
      pose,
      frames: reference.frames.length,
      nodes: nodes.length,
      samples: reference.vertices.length / 3,
      matrixDifference,
      matrixWitness,
      controllerEqual,
      vertexDifference,
      footstepsEqual,
      footstepDifference,
      tolerance: GROUNDING_COMPARE_EPSILON,
      reference: {
        milliseconds: reference.milliseconds,
        position: reference.position,
        grounded: reference.grounded,
        legal: reference.legal,
        health: reference.health,
        footsteps: reference.footsteps,
      },
      current: {
        milliseconds: current.milliseconds,
        position: current.position,
        grounded: current.grounded,
        legal: current.legal,
        health: current.health,
        footsteps: current.footsteps,
      },
      matches:
        controllerEqual &&
        matrixDifference <= GROUNDING_COMPARE_EPSILON &&
        vertexDifference <= GROUNDING_COMPARE_EPSILON &&
        footstepsEqual,
    };
  };
}
