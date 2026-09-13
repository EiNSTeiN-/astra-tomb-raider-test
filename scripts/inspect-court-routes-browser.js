// Development-only route inspection on disposable progress. This advances the
// normal player controller and follow camera along an assisted ground route.
// Enemies and combat are not stepped; raised bridge routes need separate review.
import { searchRoute } from "../src/navigation.js";
import { waterAt } from "../src/hydrology.js";
export async function planCourtRoute(game, destination) {
  const dry = (x, z) =>
    game.canMove(x, z, 0) && (waterAt(game, x, z)?.depth || 0) < 1.1;
  const search = searchRoute(dry, game.player.position, destination, {
    cell: 1.4,
    margin: 60,
    maxVisited: 70000,
    maxDistance: 500,
  });
  let step;
  do {
    step = search.next();
    if (!step.done) await new Promise((r) => setTimeout(r, 0));
  } while (!step.done);
  return step.value;
}
export function prepareCourtRoute(game) {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  game.keys.clear();
  game.touchMove = { x: 0, z: 0 };
  game.store.data.settings.quality = "high";
  game.applySettings();
  game.progress.torch = false;
  const room = game.map.rooms[1],
    c = { x: room.x * 7, z: room.z * 7 + 12 };
  let destination;
  for (const r of [0, 2, 4, 6])
    for (const a of [0, 0.8, -0.8, 1.6, -1.6, Math.PI]) {
      const p = { x: c.x + Math.sin(a) * r, z: c.z + Math.cos(a) * r };
      if (
        !destination &&
        game.canMove(p.x, p.z, 0) &&
        (waterAt(game, p.x, p.z)?.depth || 0) < 1.1
      )
        destination = p;
    }
  game.updateDecorations(0);
  game.updateCamera(10);
  return {
    chapter: game.level.id,
    start: { x: game.player.position.x, z: game.player.position.z },
    destination,
  };
}
export function advanceCourtRoute(game, state, limit = 120) {
  let moved = 0;
  for (let i = 0; i < limit && state.index < state.points.length; i++) {
    const p = state.points[state.index],
      dx = p.x - game.player.position.x,
      dz = p.z - game.player.position.z,
      d = Math.hypot(dx, dz);
    if (d < 0.1) {
      state.index++;
      state.stall = 0;
      continue;
    }
    const desired = Math.atan2(-dx, -dz),
      angle = Math.atan2(
        Math.sin(desired - game.yaw),
        Math.cos(desired - game.yaw),
      );
    game.yaw += angle * Math.min(1, 4 / 60);
    game.pitch = 0.13;
    const speed = Math.min(4, d * 25),
      vx = ((dx / d) * speed) / 6,
      vz = ((dz / d) * speed) / 6;
    game.touchMove = {
      x: vx * Math.cos(game.yaw) - vz * Math.sin(game.yaw),
      z: vx * Math.sin(game.yaw) + vz * Math.cos(game.yaw),
    };
    const old = game.player.position.clone();
    game.elapsed += 1 / 60;
    game.updatePlayer(1 / 60);
    game.updateCamera(1 / 60);
    if (i % 12 === 0) game.updateDecorations(12 / 60);
    const distance = old.distanceTo(game.player.position);
    moved += distance;
    state.distance += distance;
    state.frames++;
    state.stall = distance < 0.0001 ? state.stall + 1 : 0;
    if (state.stall > 180) break;
  }
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    index: state.index,
    waypoints: state.points.length,
    frames: state.frames,
    distance: state.distance,
    moved,
    stall: state.stall,
    player: game.player.position.toArray(),
    camera: game.camera.position.toArray(),
    health: game.health,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}
