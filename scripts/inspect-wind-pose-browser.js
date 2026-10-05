// Frame-controlled inspection using the delivered controller and animator.
// Load an earned wheel-side save first. This does not advance enemy AI/combat.
import * as THREE from "three";
import { supportAt } from "../src/character-motion.js";
import { strideSoles, sampleStrideSoles } from "./inspect-stride.js";
import { handGeometry } from "./inspect-hand-geometry.js";

const soles = new WeakMap();

export function prepareWindPoseInspection(game) {
  if (!game.windSites?.length || !game.rig)
    throw Error("Load the sky chapter and delivered explorer first");
  game.renderer.setAnimationLoop(null);
  game.setPaused(false);
  game.keys.clear();
  game.touchMove = { x: 0, z: 0 };
  soles.set(game, strideSoles(game.rig.model));
}

export function windPoseSnapshot(game) {
  game.avatar.updateWorldMatrix(true, false);
  game.rig.model.updateMatrixWorld(true);
  const feet = soles.get(game) || strideSoles(game.rig.model),
    grip = game.windGrip,
    site = game.windSites[grip?.stage ?? game.progress.stage],
    node = grip && site?.nodes[grip.index];
  soles.set(game, feet);
  return {
    player: game.player.position.toArray(),
    grounded: game.grounded,
    jumpY: game.jumpY,
    velocityY: game.velocityY,
    gait: game.rig.state,
    facing: game.avatar.rotation.y,
    avatarHeight: game.avatar.position.y,
    contacts: structuredClone(game.rig.grounding?.contacts),
    soles: sampleStrideSoles(feet).map((points) => {
      const gaps = points.map(
        (point) =>
          point.y -
          supportAt(game, point.x, point.z, game.player.position.y + 0.45)
            .height,
      );
      return { min: Math.min(...gaps), max: Math.max(...gaps) };
    }),
    hands: node
      ? ["Left", "Right"].map((side, index) =>
          game.rig.model
            .getObjectByName(`mixamorig${side}Hand`)
            .getWorldPosition(new THREE.Vector3())
            .distanceTo(
              node.handles[grip.order?.[index] ?? index].getWorldPosition(
                new THREE.Vector3(),
              ),
            ),
        )
      : null,
    grip: grip ? { stage: grip.stage, index: grip.index } : null,
    moves: site?.state.moves,
    camera: game.camera.position.toArray(),
    cameraTarget: game.cameraFollowTarget?.toArray(),
  };
}

export function stepWindPose(game, dt = 1 / 60) {
  game.elapsed += dt;
  game.updatePlayer(dt);
  game.updateDecorations(dt);
  game.updateCamera(dt);
  game.cb.update?.(game.state());
  return windPoseSnapshot(game);
}

export function captureWindPose(game) {
  game.cb.update?.(game.state());
  game.renderScene(0);
  const gl = game.renderer.getContext();
  const grip = game.windGrip,
    node = grip && game.windSites[grip.stage].nodes[grip.index],
    handSurface = node?.handles[0].userData.windHandgrip
      ? handGeometry(game, {
          handles: (grip.order || [0, 1]).map((index) => node.handles[index]),
          halfLength: 0.08,
        }).map(({ side, fingers }) => ({ side, fingers }))
      : null;
  return {
    ...windPoseSnapshot(game),
    handSurface,
    linked: game.renderer.info.programs.every((program) =>
      gl.getProgramParameter(program.program, gl.LINK_STATUS),
    ),
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    image: game.renderer.domElement.toDataURL("image/png"),
  };
}
