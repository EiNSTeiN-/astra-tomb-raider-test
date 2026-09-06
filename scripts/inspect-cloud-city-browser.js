import { spanCoordinates, bridgeDeckY } from "../src/sky-bridge-rules.js";

export function cloudCityView(game, index = 8) {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  game.progress.completed = true;
  const b = game.skyBridges[index],
    c = spanCoordinates(b, b.bx, b.bz);
  const x = b.ax - c.ux * 4,
    z = b.az - c.uz * 4;
  game.player.position.set(x, game.groundHeight(x, z), z);
  game.elapsed = 10;
  game.updateDecorations(3);
  game.updateCamera(1);
  game.camera.fov = 62;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  game.camera.position.set(x, bridgeDeckY(b, 0) + 3.2, z);
  game.camera.lookAt(
    b.bx + c.ux * 24,
    bridgeDeckY(b, c.length) + 1.4,
    b.bz + c.uz * 24,
  );
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    bridge: b.id,
    quality: game.store.data.settings.quality,
    position: game.player.position.toArray(),
    camera: game.camera.position.toArray(),
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}
