import { cavernView } from "./verify-caverns-browser.js";

// Fixed art-review cameras. These do not measure playthrough duration.
export function mineralView(game, view = "cluster") {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  game.elapsed = 10;
  game.camera.fov = 62;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  if (view === "cluster") cavernView(game, 1, true);
  else {
    const node = game.resonanceSites[1].nodes[0],
      c = node.center;
    game.player.position.copy(node.control.group.position);
    game.updateDecorations(0);
    game.camera.position.set(c.x + 3.1, c.y + 2.9, c.z + 5.2);
    game.camera.lookAt(c.x, c.y + 2, c.z);
    game.renderScene(0);
  }
  const gl = game.renderer.getContext();
  return {
    view,
    camera: game.camera.position.toArray(),
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}
