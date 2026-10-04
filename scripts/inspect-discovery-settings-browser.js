import * as THREE from "three";
import { updateAtmosphere } from "../src/atmosphere.js";

// Development observer for the surroundings of a pickup. Both the eye and
// its sightline must be valid; this never cuts through a wall for a capture.
export function discoverySettingView(game, id, side = false) {
  const f = game.items.find((f) => f.id === id),
    p = f.discovery,
    angle = p.stance.yaw + (side ? Math.PI / 3 : 0),
    target = new THREE.Vector3(p.x, p.y + 1, p.z);
  let eye;
  for (const radius of [8.4, 7.2, 6, 10.2, 4.8, 3.6]) {
    const x = p.x + Math.sin(angle) * radius,
      z = p.z + Math.cos(angle) * radius;
    if (!game.canMove(x, z, 0)) continue;
    const candidate = new THREE.Vector3(x, game.groundHeight(x, z) + 2.5, z);
    const sight = new THREE.Vector3(p.x, p.y + 1.45, p.z);
    if (!game.lineOfSight(candidate, sight, 0, 0)) continue;
    eye = candidate;
    break;
  }
  if (!eye) return { id, side, blocked: true };
  game.player.position.copy(eye).y -= 2.5;
  game.avatar.visible = false;
  game.camera.position.copy(eye);
  game.camera.lookAt(target);
  game.camera.fov = 62;
  game.camera.clearViewOffset();
  game.camera.updateProjectionMatrix();
  game.camera.updateMatrixWorld();
  updateAtmosphere(game, target);
  game.updateDecorations(0);
  game.renderScene(0);
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    id,
    side,
    eye: eye.toArray(),
    target: target.toArray(),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    image: game.renderer.domElement.toDataURL("image/png"),
  };
}
