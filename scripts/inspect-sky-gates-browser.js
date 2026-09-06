export function skyGateView(game, view = "front", stage = 4, opened = false) {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  const gate = game.fieldGates[stage],
    c = gate.root.position;
  game.progress.completed = opened;
  gate.amount = opened ? 1 : 0;
  game.player.position.set(
    c.x + 10,
    game.groundHeight(c.x + 10, c.z + 12),
    c.z + 12,
  );
  game.elapsed = 10;
  game.updateDecorations(3);
  game.updateCamera(1);
  game.camera.fov = view === "front" ? 62 : 58;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  if (view === "front") {
    game.camera.position.set(c.x + 10, c.y + 6.2, c.z + 24);
    game.camera.lookAt(c.x, c.y + 4.5, c.z + 5);
  } else {
    game.camera.position.set(c.x + 4.5, c.y + 4.2, c.z + 7.9);
    game.camera.lookAt(c.x + 6.1, c.y + 3.55, c.z + 6.5);
  }
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    view,
    stage,
    opened,
    quality: game.store.data.settings.quality,
    camera: game.camera.position.toArray(),
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}
