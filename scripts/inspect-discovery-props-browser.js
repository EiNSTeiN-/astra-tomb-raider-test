import * as THREE from "three";
import { updateAtmosphere } from "../src/atmosphere.js";

// Disposable development observer, with no progress changes or collection.
export function discoveryPropView(game, feature, side = false) {
  const f =
      typeof feature === "string"
        ? game.items.find((f) => f.id === feature)
        : feature,
    p = f.discovery,
    angle = p.stance.yaw + (side ? Math.PI / 3 : 0),
    target = new THREE.Vector3(p.x, p.y + 1.05, p.z);
  let eye;
  for (const radius of [4.8, 3.6, 6, 7.2]) {
    const x = p.x + Math.sin(angle) * radius,
      z = p.z + Math.cos(angle) * radius;
    if (!game.canMove(x, z, 0)) continue;
    const candidate = new THREE.Vector3(x, game.groundHeight(x, z) + 2.15, z),
      sight = new THREE.Vector3(p.x, p.y + 1.45, p.z);
    if (!game.lineOfSight(candidate, sight, 0, 0)) continue;
    eye = candidate;
    break;
  }
  if (!eye) return { id: f.id, blocked: true };
  game.player.position.copy(eye).y -= 2.15;
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
    id: f.id,
    style: f.discoveryStyle,
    eye: eye.toArray(),
    target: target.toArray(),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    image: game.renderer.domElement.toDataURL("image/png"),
  };
}
