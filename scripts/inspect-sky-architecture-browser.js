export function skyArchitectureView(game, view = "court", index = 5) {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  const r = game.map.rooms[index],
    x = r.x * 7,
    z = r.z * 7,
    y = game.groundHeight(x, z);
  game.player.position.set(x + 15, game.groundHeight(x + 15, z), z);
  game.elapsed = 10;
  game.updateDecorations(1);
  game.updateCamera(1);
  game.camera.fov = view === "court" ? 64 : 58;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  if (view === "court") {
    game.camera.position.set(x + 31, y + 12, z + 28);
    game.camera.lookAt(x, y + 5, z - 6);
  } else {
    game.camera.position.set(x + 6.5, y + 3.1, z - 10);
    game.camera.lookAt(x + 5.5, y + 3.1, z - 18);
  }
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    room: index,
    view,
    camera: game.camera.position.toArray(),
    quality: game.store.data.settings.quality,
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}
