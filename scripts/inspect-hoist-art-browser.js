// Prepared observer views for disposable development saves, not a playthrough.
import { updateBellHoist } from "/src/bell-hoist.js";
import { hoistHeight } from "/src/bell-hoist-rules.js";

export function hoistArtView(game, name = "hall", quality = "high") {
  const h = game.bellHoist;
  if (!h) throw new Error("Prepare the snow chapter first");
  game.renderer.setAnimationLoop(null);
  game.setPaused(false);
  game.store.data.settings.quality = quality;
  game.applySettings();
  h.motion = null;
  h.saved.stop = 1;
  h.saved.visited = true;
  h.saved.clapper = false;
  h.saved.bell = false;
  h.saved.recovered = false;
  h.cars.forEach((car, i) => {
    car.root.position.y = hoistHeight(1, i);
    car.deck.y = h.y + car.root.position.y;
  });
  const views = {
    hall: [0, 0.18, -20, Math.PI, -0.12],
    car: [-7, 5.78, -8, Math.PI, 0.05],
    bell: [12, 11.38, -10.5, 0, -0.25],
    archive: [-12, 11.38, -20, 0, 0.05],
  };
  const [x, y, z, yaw, pitch] = views[name];
  game.player.position.set(h.x + x, h.y + y, h.z + z);
  Object.assign(game, {
    jumpY: y,
    grounded: true,
    velocityY: 0,
    climb: null,
    dodge: null,
    yaw,
    pitch,
    elapsed: 9,
  });
  game.touchMove = { x: 0, z: 0 };
  game.keys.clear();
  updateBellHoist(game, 0, true);
  for (let i = 0; i < 60; i++) game.updatePlayer(1 / 60);
  for (let i = 0; i < 90; i++) game.updateCamera(1 / 60);
  game.updateAudio();
  game.cb.update(game.state());
  game.renderScene(0);
  return {
    position: game.player.position.toArray(),
    camera: game.camera.position.toArray(),
    rotation: game.camera.quaternion.toArray(),
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    programs: game.renderer.info.programs.map(
      (p) => p.diagnostics?.runnable !== false,
    ),
  };
}
