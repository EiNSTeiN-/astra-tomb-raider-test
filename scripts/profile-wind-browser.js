import { createPuzzle, applyMove } from "../src/puzzles.js";

export function prepareWindProfile(game) {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  game.progress.completed = false;
  game.progress.stage = 3;
  game.progress.field = [0, 1, 2].map((i) => `field-3-${i}`);
  game.counterweights.saved.solved = true;
  const state = createPuzzle(game.level, 3);
  applyMove(state, { index: 0 });
  applyMove(state, { index: 0 });
  game.setWindValues(3, state);
  game.player.position.copy(game.windSites[3].tablet.group.position);
  game.elapsed = 10;
  game.updateDecorations(1);
  game.windFocus = 3;
  game.updateCamera(1);
}
export function renderWindProfile(game) {
  game.updateCamera(0);
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    quality: game.store.data.settings.quality,
    width: game.renderer.domElement.clientWidth,
    height: game.renderer.domElement.clientHeight,
    position: game.player.position.toArray(),
    camera: game.camera.position.toArray(),
    fov: game.camera.fov,
    filmOffset: game.camera.filmOffset,
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    points: game.renderer.info.render.points,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}
