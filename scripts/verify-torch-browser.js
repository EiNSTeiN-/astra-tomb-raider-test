// Development-only assisted relay check. Use disposable progress.
import { searchRoute } from "/src/navigation.js";
import { waterAt } from "/src/hydrology.js";
import { useTorch } from "/src/torch.js";
import { EXPEDITIONS } from "/src/expeditions.js";

export function torchApproach(game, feature) {
  const candidates = Array.from({ length: 24 }, (_, i) => ({
    x: feature.x * 7 + Math.cos((i * Math.PI) / 12) * 2.2,
    z: feature.z * 7 + Math.sin((i * Math.PI) / 12) * 2.2,
  })).filter(
    (p) =>
      game.canMove(p.x, p.z, 0) && (waterAt(game, p.x, p.z)?.depth || 0) < 1.1,
  );
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - game.player.position.x, a.z - game.player.position.z) -
      Math.hypot(b.x - game.player.position.x, b.z - game.player.position.z),
  );
  if (!candidates.length) throw new Error(`No dry approach: ${feature.id}`);
  return candidates[0];
}

export function placeTorchObserver(game, feature) {
  const p = torchApproach(game, feature);
  game.player.position.set(p.x, game.groundHeight(p.x, p.z), p.z);
  Object.assign(game, {
    grounded: true,
    swimming: false,
    diving: false,
    velocityY: 0,
    jumpY: 0,
    airVelocity: null,
    climb: null,
    dodge: null,
  });
  game.fallPeak = game.player.position.y;
  game.keys.clear();
  game.touchMove = { x: 0, z: 0 };
  game.updatePlayer(1 / 60);
  return p;
}

export async function walkTorchLeg(game, feature) {
  const target = torchApproach(game, feature);
  const canStand = (x, z) =>
    game.canMove(x, z, 0) && (waterAt(game, x, z)?.depth || 0) < 1.1;
  const search = searchRoute(canStand, game.player.position, target, {
    cell: 1.4,
    margin: 48,
    maxDistance: 420,
    maxVisited: 50000,
  });
  let step;
  do {
    step = search.next();
    if (!step.done) await new Promise((r) => setTimeout(r, 0));
  } while (!step.done);
  const route = step.value;
  if (route.status !== "complete")
    throw new Error(`${feature.id}: ${route.status}, visited ${route.visited}`);
  const started = game.elapsed;
  game.yaw = 0;
  for (const point of route.points) {
    let reached = false;
    for (let tick = 0; tick < 2400; tick++) {
      const dx = point.x - game.player.position.x,
        dz = point.z - game.player.position.z,
        d = Math.hypot(dx, dz);
      if (d < 0.07) {
        reached = true;
        break;
      }
      const speed = Math.min(4, d * 35);
      game.touchMove = { x: ((dx / d) * speed) / 6, z: ((dz / d) * speed) / 6 };
      game.elapsed += 1 / 60;
      game.updatePlayer(1 / 60);
      if (!game.progress.torch)
        throw new Error(`Flame lost on dry route to ${feature.id}`);
      if (tick % 120 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (!reached)
      throw new Error(
        `Blocked toward ${JSON.stringify(point)} at ${game.player.position.toArray()}`,
      );
  }
  game.touchMove = { x: 0, z: 0 };
  game.updatePlayer(1 / 60);
  if (game.nearest?.id !== feature.id)
    throw new Error(`No interaction at ${feature.id}: ${game.nearest?.id}`);
  game.interact();
  if (!game.progress.field.includes(feature.id))
    throw new Error(`Not ignited: ${feature.id}`);
  game.updateDecorations(1);
  return {
    id: feature.id,
    waypoints: route.points.length,
    visited: route.visited,
    simulatedSeconds: game.elapsed - started,
    flame: game.progress.torch,
    health: game.health,
  };
}

export function prepareTorchRelay(game, stage = 0) {
  const tasks = EXPEDITIONS.verdant[stage].tasks;
  game.progress.stage = stage;
  game.progress.field = EXPEDITIONS.verdant
    .slice(0, stage)
    .flatMap((m) => m.tasks.map((t) => t.id));
  game.progress.field.push(
    ...tasks.filter((t) => t.kind !== "brazier").map((t) => t.id),
  );
  game.progress.torch = false;
  game.updateDecorations(100);
  const first = game.items.find(
    (f) => f.id === tasks.find((t) => t.kind === "brazier").id,
  );
  const camps = game.items.filter((f) => f.type === "camp");
  camps.sort(
    (a, b) =>
      Math.hypot(a.x - first.x, a.z - first.z) -
      Math.hypot(b.x - first.x, b.z - first.z),
  );
  placeTorchObserver(game, camps[0]);
  if (!useTorch(game)) throw new Error("Camp did not light the torch");
  return {
    camp: camps[0].id,
    targets: tasks.filter((t) => t.kind === "brazier").map((t) => t.id),
  };
}
