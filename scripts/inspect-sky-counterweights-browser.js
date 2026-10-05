// Grounded, stationary observers for the first cloud-city chamber. Progress
// comes from the loaded save; this helper does not solve or move puzzle stones.
import * as THREE from "three";
import { updateAtmosphere } from "../src/atmosphere.js";

export function skyCounterweightView(game, view, quality = "high") {
  const chamber = game.counterweights,
    root = chamber.group.position;
  game.renderer.setAnimationLoop(null);
  game.keys.clear();
  game.touchMove = { x: 0, z: 0 };
  game.setPaused(true);
  game.store.data.settings.quality = quality;
  game.applySettings();
  let feet, target;
  if (view < 4) {
    const [x, z] = [
      [-4.8, 4.8],
      [4.8, 4.8],
      [-4.8, -4.8],
      [4.8, -4.8],
    ][view];
    feet = root.clone().add(new THREE.Vector3(x, 0, z));
    target = root.clone().add(new THREE.Vector3(0, 0.8, 0));
  } else if (view === 4) {
    feet = chamber.tablet.clone().add(new THREE.Vector3(0, 0, 2.2));
    target = chamber.tablet.clone().add(new THREE.Vector3(0, 0.8, 0));
  } else {
    const body = chamber.blocks[view - 5].group;
    game.world.updateMatrixWorld(true);
    target = body
      .getWorldPosition(new THREE.Vector3())
      .add(new THREE.Vector3(0, 0.8, 0));
    for (const [x, z] of [
      [1.5, 0],
      [0, 1.5],
      [-1.5, 0],
      [0, -1.5],
    ]) {
      const p = target.clone().add(new THREE.Vector3(x, 0, z));
      if (game.canMove(p.x, p.z, 0)) {
        feet = p;
        break;
      }
    }
  }
  if (!feet || !game.canMove(feet.x, feet.z, 0))
    return { view, quality, blocked: true };
  feet.y = game.groundHeight(feet.x, feet.z);
  const eye = feet.clone().add(new THREE.Vector3(0, view < 4 ? 2.4 : 1.6, 0));
  if (!game.cameraSpace(eye)) return { view, quality, blocked: true };
  game.player.position.copy(feet);
  game.player.visible = false;
  game.elapsed = 12;
  game.updateDecorations(2);
  updateAtmosphere(game, feet);
  game.camera.fov = view < 4 ? 70 : 58;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  game.camera.position.copy(eye);
  game.camera.lookAt(target);
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    view,
    quality,
    eye: eye.toArray(),
    target: target.toArray(),
    positions: chamber.saved.positions.map((cell) => [...cell]),
    solved: chamber.saved.solved,
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    image: game.renderer.domElement.toDataURL(),
  };
}
