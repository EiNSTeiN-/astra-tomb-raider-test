// Assisted, disposable-progress geometry views. These do not complete puzzles
// or establish unassisted play time. Pair with actual input/reload verification.
import * as THREE from "three";
import { updateAtmosphere } from "../src/atmosphere.js";
import { animateGuardian } from "../src/guardian-art.js";
import { updateSanctuaryGate } from "../src/sanctuary-gates.js";

export function chamberWallView(game, gateIndex, side, options = {}) {
  const gate = game.fieldGates[gateIndex],
    wall = gate.walls.find((w) => w.side === side);
  const matrix = new THREE.Matrix4().makeRotationY(wall.angle);
  matrix.setPosition(
    new THREE.Vector3(...wall.position).add(gate.root.position),
  );
  const point = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(matrix);
  const target = options.inside
    ? gate.root.position.clone().add(new THREE.Vector3(0, 3.5, -6))
    : point(0, 3.45, 0.82);
  let eye;
  for (const distance of options.inside
    ? [3, 4.5, 2]
    : options.near
      ? [8, 6, 10]
      : [13, 10, 18, 22]) {
    for (const offset of options.inside ? [2.4, -2.4, 0] : [-4, 4, -7, 7, 0]) {
      const p = options.inside
        ? gate.root.position.clone().add(new THREE.Vector3(offset, 0, distance))
        : point(offset, 0, distance);
      p.y = game.groundHeight(p.x, p.z) + 2.05;
      if (!game.canMove(p.x, p.z, 0)) continue;
      if (game.cameraSurfaces.entry(p, target, 0) < 0.99) continue;
      eye = p;
      break;
    }
    if (eye) break;
  }
  if (!eye)
    return {
      chapter: game.level.id,
      gateIndex,
      side,
      ...options,
      blocked: true,
    };
  game.player.position.copy(eye).y -= 2.05;
  game.avatar.visible = false;
  game.store.data.settings.quality = options.quality || "high";
  game.applySettings();
  game.updateDecorations(0);
  if (options.amount !== undefined) {
    gate.amount = options.amount;
    updateSanctuaryGate(game, gate, 0);
  }
  game.camera.position.copy(eye);
  game.camera.lookAt(target);
  game.camera.fov = options.inside ? 75 : options.near ? 78 : 62;
  game.camera.updateProjectionMatrix();
  game.camera.updateMatrixWorld();
  updateAtmosphere(game, gate.root.position);
  for (const enemy of game.enemies) animateGuardian(game, enemy, 0);
  game.renderScene(0);
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    chapter: game.level.id,
    gateIndex,
    side,
    ...options,
    eye: eye.toArray(),
    target: target.toArray(),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    image: game.renderer.domElement.toDataURL("image/png"),
  };
}
