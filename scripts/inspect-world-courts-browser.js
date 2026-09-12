// Development-only court survey on disposable progress. These ground-level
// observer views inspect geometry; they do not play or complete the routes.
import * as THREE from "three";
import { updateAtmosphere } from "../src/atmosphere.js";
import { animateGuardian } from "../src/guardian-art.js";

export function courtManifest(game) {
  return {
    chapter: game.level.id,
    state: { stage: game.progress.stage, completed: game.progress.completed },
    counts: {
      courts: game.map.rooms.length,
      fields: game.items.filter((f) => f.type === "field").length,
      discoveries: game.map.sideRooms.length,
      paths: game.map.paths.length,
    },
    views: game.map.rooms.flatMap((r, room) =>
      [0, Math.PI].map((angle, side) => ({
        id: `court-${room}-${side ? "rear" : "front"}`,
        room,
        angle,
        x: r.x * 7,
        z: r.z * 7,
      })),
    ),
  };
}

export function courtView(game, view) {
  // Search around the requested side rather than silently crossing to the
  // opposite face of an obstruction. Record a missing stance for later review.
  let eye;
  for (const radius of [32, 28, 24, 20]) {
    for (const offset of [0, 0.2, -0.2, 0.4, -0.4, 0.6, -0.6]) {
      const angle = view.angle + offset,
        x = view.x + Math.sin(angle) * radius,
        z = view.z + Math.cos(angle) * radius;
      if (!game.canMove(x, z, 0)) continue;
      const candidate = new THREE.Vector3(x, game.groundHeight(x, z) + 2.1, z),
        direction = new THREE.Vector3(view.x - x, 0, view.z - z).normalize();
      if (
        !game.lineOfSight(
          candidate,
          candidate.clone().addScaledVector(direction, 4),
          0,
          0,
        )
      )
        continue;
      eye = candidate;
      break;
    }
    if (eye) break;
  }
  if (!eye) return { ...view, blocked: true };
  const target = new THREE.Vector3(
    view.x,
    game.groundHeight(view.x, view.z) + 4,
    view.z,
  );
  game.player.position.copy(eye).y -= 2.1;
  game.avatar.visible = false;
  game.camera.position.copy(eye);
  game.camera.lookAt(target);
  game.camera.fov = 58;
  game.camera.updateProjectionMatrix();
  game.camera.updateMatrixWorld();
  updateAtmosphere(game, target);
  game.updateDecorations(0);
  for (const enemy of game.enemies) animateGuardian(game, enemy, 0);
  game.renderScene(0);
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    ...view,
    eye: eye.toArray(),
    target: target.toArray(),
    quality: game.store.data.settings.quality,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    image: game.renderer.domElement.toDataURL("image/png"),
  };
}
