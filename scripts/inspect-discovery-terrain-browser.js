// Development-only observer views on disposable progress. These inspect the
// ground around notes and caches; they do not collect or complete discoveries.
import * as THREE from "three";
import { updateAtmosphere } from "../src/atmosphere.js";

export function discoveryView(game, index, angle = 0) {
  const room = game.map.sideRooms[index],
    feature = game.items.find(
      (f) => f.id === `${index < 12 ? "note" : "treasure"}-${index}`,
    ),
    x = room.x * 7,
    z = room.z * 7,
    target = new THREE.Vector3(x, game.groundHeight(x, z) + 1, z);
  let eye;
  for (const radius of [12, 10, 8, 6]) {
    for (const offset of [0, 0.2, -0.2, 0.4, -0.4]) {
      const px = x + Math.sin(angle + offset) * radius,
        pz = z + Math.cos(angle + offset) * radius;
      if (!game.canMove(px, pz, 0)) continue;
      const candidate = new THREE.Vector3(
        px,
        game.groundHeight(px, pz) + 2.1,
        pz,
      );
      if (!game.lineOfSight(candidate, target, 0, 0)) continue;
      eye = candidate;
      break;
    }
    if (eye) break;
  }
  if (!eye) return { index, id: feature?.id, angle, x, z, blocked: true };
  game.player.position.copy(eye).y -= 2.1;
  game.avatar.visible = false;
  game.camera.position.copy(eye);
  game.camera.lookAt(target);
  game.camera.fov = 58;
  game.camera.clearViewOffset();
  game.camera.updateProjectionMatrix();
  game.camera.updateMatrixWorld();
  updateAtmosphere(game, target);
  game.updateDecorations(0);
  game.renderScene(0);
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    index,
    id: feature?.id,
    angle,
    x,
    z,
    eye: eye.toArray(),
    target: target.toArray(),
    quality: game.store.data.settings.quality,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    image: game.renderer.domElement.toDataURL("image/png"),
  };
}
