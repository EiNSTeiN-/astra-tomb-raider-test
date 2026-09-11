import { updateHazards } from "../src/hazards.js";

// Assisted route checks use the normal player, hazard and camera updates. The
// caller seeds only the mission's entry state; these helpers do not teleport.
export function cartTick(game, frames = 1) {
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
export function cartPosition(game) {
  const h = game.temperingCart;
  return {
    position: game.player.position.toArray(),
    health: game.health,
    field: [...game.progress.field],
    nearest: game.nearest?.id,
    cart: { ...h.saved },
    distance: h.distance,
    drive: h.drive,
    turning: !!h.turn,
    hint: game.state().traversalHint,
  };
}
export function cartWalk(game, points) {
  for (const [x, z] of points) {
    for (let frame = 0; frame < 1800; frame++) {
      const p = game.player.position,
        dx = x - p.x,
        dz = z - p.z,
        d = Math.hypot(dx, dz);
      if (d < 0.07) break;
      game.yaw = 0;
      const speed = Math.min(0.32, d * 1.4);
      game.touchMove = { x: (dx / d) * speed, z: (dz / d) * speed };
      cartTick(game);
      if (frame === 1799)
        throw new Error(
          `Cart route blocked toward ${x},${z}: ${JSON.stringify(cartPosition(game))}`,
        );
    }
    game.touchMove = { x: 0, z: 0 };
    cartTick(game, 8);
  }
}
