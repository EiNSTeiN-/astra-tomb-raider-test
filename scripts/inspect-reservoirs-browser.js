// Disposable-progress surface inspection. Pair these observer views with native
// movement and persistence checks before publishing a playable change.
import * as THREE from "three";
import { updateAtmosphere } from "../src/atmosphere.js";
import { waterAt } from "../src/hydrology.js";
import { animateGuardian } from "../src/guardian-art.js";

export function reservoirView(game, index, options = {}) {
  const water = game.waterMeshes.filter((w) =>
    w.userData.id?.startsWith("reservoir-"),
  )[index];
  const target = water.position.clone();
  let eye;
  for (const [dx, dz] of [
    [0, 0],
    [-4, 0],
    [4, 0],
    [0, 4],
    [0, -4],
  ]) {
    target.copy(water.position).add(new THREE.Vector3(dx, 0, dz));
    if (!waterAt(game, target.x, target.z)) continue;
    for (const radius of options.close ? [9, 11, 13] : [14, 18, 22, 26]) {
      for (const offset of [
        0,
        0.25,
        -0.25,
        0.5,
        -0.5,
        1,
        -1,
        1.5,
        -1.5,
        2,
        -2,
        Math.PI,
      ]) {
        const angle = (options.angle || 0) + offset;
        const x = target.x + Math.sin(angle) * radius;
        const z = target.z + Math.cos(angle) * radius;
        const y = game.groundHeight(x, z);
        if (!game.canMove(x, z, 0) || (waterAt(game, x, z)?.depth || 0) > 0.1)
          continue;
        const candidate = new THREE.Vector3(
          x,
          y + (options.close ? 2.5 : 2.1),
          z,
        );
        if (
          game.enemies.some(
            (e) =>
              Math.hypot(e.group.position.x - x, e.group.position.z - z) < 3.2,
          )
        )
          continue;
        if (game.cameraSurfaces.entry(candidate, target, 0) < 0.98) continue;
        eye = candidate;
        break;
      }
      if (eye) break;
    }
    if (eye) break;
  }
  if (!eye) return { index, ...options, blocked: true };
  game.player.position.set(eye.x, game.groundHeight(eye.x, eye.z), eye.z);
  game.avatar.visible = false;
  game.store.data.settings.quality = options.quality || "high";
  game.applySettings();
  game.elapsed = options.time ?? 0;
  game.updateDecorations(0);

  game.camera.position.copy(eye);
  game.camera.lookAt(target);
  game.camera.fov = options.close ? 65 : 58;
  game.camera.updateProjectionMatrix();
  game.camera.updateMatrixWorld();
  updateAtmosphere(game, target);
  for (const enemy of game.enemies) animateGuardian(game, enemy, 0);
  game.renderScene(0);
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    index,
    site: water.userData.id,
    chapter: game.level.id,
    ...options,
    eye: eye.toArray(),
    target: target.toArray(),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    image: game.renderer.domElement.toDataURL("image/png"),
  };
}
