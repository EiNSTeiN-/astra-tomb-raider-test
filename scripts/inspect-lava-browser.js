// Disposable-progress surface inspection. Pair these observer views with native
// movement, cooling and persistence checks before publishing a playable change.
import * as THREE from "three";
import { updateAtmosphere } from "../src/atmosphere.js";
import { animateGuardian } from "../src/guardian-art.js";

export function lavaView(game, index, options = {}) {
  const water = game.waterMeshes.filter((w) => w.userData.kind === "lava")[
    index
  ];
  const target = water.position.clone();
  let eye;
  for (const radius of options.close ? [9, 11, 13] : [18, 22, 26]) {
    for (const offset of [0, 0.25, -0.25, 0.5, -0.5]) {
      const angle = (options.angle || 0) + offset;
      const x = target.x + Math.sin(angle) * radius;
      const z = target.z + Math.cos(angle) * radius;
      const y = game.groundHeight(x, z);
      if (!game.canMove(x, z, 0) || y < water.position.y + 0.04) continue;
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
  if (!eye) return { index, ...options, blocked: true };
  game.player.position.set(eye.x, game.groundHeight(eye.x, eye.z), eye.z);
  game.avatar.visible = false;
  game.store.data.settings.quality = options.quality || "high";
  game.applySettings();
  game.elapsed = options.time ?? 0;
  game.updateDecorations(0);
  water.material.userData.forgeUniforms.forgeTime.value = game.elapsed;
  water.material.userData.forgeUniforms.forgeHeat.value = options.heat ?? 1;
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
    ...options,
    eye: eye.toArray(),
    target: target.toArray(),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    image: game.renderer.domElement.toDataURL("image/png"),
  };
}
