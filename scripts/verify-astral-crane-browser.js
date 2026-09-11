import { updateHazards } from "../src/hazards.js";

// Seed the mission entrance once, then use the normal movement, hazards and
// camera for this assisted route. These helpers never relocate the player.
export function craneTick(game, frames = 1) {
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
export function cranePosition(game) {
  return {
    position: game.player.position.toArray(),
    health: game.health,
    field: [...game.progress.field],
    nearest: game.nearest?.id,
    crane: { ...game.astralCrane.saved },
    operating: game.astralCrane.operating,
    hint: game.state().traversalHint,
  };
}
export function craneWalk(game, points) {
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
      craneTick(game);
      if (frame === 1799)
        throw new Error(
          `Crane route blocked toward ${x},${z}: ${JSON.stringify(cranePosition(game))}`,
        );
    }
    game.touchMove = { x: 0, z: 0 };
    craneTick(game, 8);
  }
}
