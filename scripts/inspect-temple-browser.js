// Fixed observer views for comparisons on disposable development progress.
import * as THREE from "three";
export const TEMPLE_VIEWS = {
  pier: { room: 2, camera: [12, 2.1, -13], target: [5.5, 3.8, -18] },
  arcade: { room: 2, camera: [24, 2.1, -27], target: [9, 5.8, -18] },
  root: { room: 2, camera: [-11, 2, 23], target: [-19, 4.4, 18] },
  court: { room: 0, camera: [0, 2.1, 16], target: [0, 6.2, -18] },
};
export function templeView(game, name, quality = "high") {
  const view = TEMPLE_VIEWS[name],
    room = game.map.rooms[view.room];
  const base = new THREE.Vector3(
    room.x * 7,
    game.groundHeight(room.x * 7, room.z * 7),
    room.z * 7,
  );
  game.store.data.settings.quality = quality;
  game.applySettings();
  const camera = new THREE.Vector3(...view.camera).add(base);
  game.player.position.copy(camera);
  game.player.position.y = game.groundHeight(camera.x, camera.z);
  game.avatar.visible = false;
  game.camera.position.copy(camera);
  game.camera.lookAt(new THREE.Vector3(...view.target).add(base));
  game.camera.fov = 58;
  game.camera.updateProjectionMatrix();
  game.updateDecorations(0);
  game.renderScene(0);
  for (const element of document.querySelectorAll(
    "#game-screen > :not(#game-canvas), .toast",
  ))
    element.style.visibility = "hidden";
  return {
    camera: game.camera.position.toArray(),
    rotation: game.camera.quaternion.toArray(),
    triangles: game.renderer.info.render.triangles,
    calls: game.renderer.info.render.calls,
    programs: game.renderer.info.programs.map((p) =>
      game.renderer
        .getContext()
        .getProgramParameter(p.program, game.renderer.getContext().LINK_STATUS),
    ),
    obstacles: game.obstacles.filter((o) => o.temple),
  };
}
