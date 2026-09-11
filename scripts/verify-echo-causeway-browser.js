import { updateHazards } from "../src/hazards.js";

// Seed the southern entrance once, then drive the ordinary movement, hazards
// and following camera. None of these helpers relocate the explorer.
export function echoTick(game, frames = 1) {
  for (let i = 0; i < frames; i++) {
    if (!game.paused) {
      game.elapsed += 1 / 60;
      game.updatePlayer(1 / 60);
      game.updateEnemies(1 / 60);
      updateHazards(game, 1 / 60);
      game.hitTimer = Math.max(0, game.hitTimer - 1 / 60);
      game.attackCooldown = Math.max(0, game.attackCooldown - 1 / 60);
      game.updateDecorations(1 / 60);
    }
    game.updateCamera(1 / 60);
  }
  game.cb.update(game.state());
}
export function echoPosition(game) {
  const h = game.echoCauseway;
  return {
    position: game.player.position.toArray(),
    grounded: game.grounded,
    health: game.health,
    field: [...game.progress.field],
    nearest: game.nearest?.id,
    causeway: { ...h.saved },
    pulses: [...h.pulses],
    stones: h.stones.map((s) => ({ y: s.deck.y, ...s.phase })),
    hint: game.state().traversalHint,
  };
}
export function echoWalk(game, x, z) {
  for (let frame = 0; frame < 600; frame++) {
    const p = game.player.position,
      dx = x - p.x,
      dz = z - p.z,
      d = Math.hypot(dx, dz);
    if (d < 0.05 && game.grounded) {
      game.touchMove = { x: 0, z: 0 };
      return;
    }
    game.yaw = Math.atan2(-dx, -dz);
    game.touchMove = { x: 0, z: -Math.min(1, d * 10) };
    echoTick(game);
  }
  throw new Error(
    `Echo route blocked toward ${x},${z}: ${JSON.stringify(echoPosition(game))}`,
  );
}
export function echoJump(game, x, z) {
  game.yaw = Math.atan2(-x, -z);
  game.touchMove = { x: 0, z: -1 };
  game.keys.add("Space");
  for (let frame = 0; frame < 90; frame++) {
    echoTick(game);
    if (frame > 8 && game.grounded) {
      game.touchMove = { x: 0, z: 0 };
      return;
    }
  }
  throw new Error(
    `No echo jump landing: ${JSON.stringify(echoPosition(game))}`,
  );
}
