// Assisted development route: stop the render loop and use a disposable save.
// Movement follows actual player physics. Trap, projectile and enemy updates
// remain live; this helper supplies directions and does not measure human pace.
import { updateHazards } from "../src/hazards.js";

export function gardenPosition(g) {
  const r = g.rainGarden,
    p = g.player.position;
  return {
    local: [p.x - r.x, p.y - r.y, p.z - r.z],
    grounded: g.grounded,
    health: g.health,
    nearest: g.nearest?.id,
    field: [...g.progress.field],
    rotations: [...r.saved.rotations],
    stop: r.saved.stop,
    moving: !!r.motion,
    turn: r.turn?.index ?? null,
    hint: g.state().traversalHint,
    objective: g.state().objective,
  };
}

export function gardenTick(g, count = 1) {
  for (let i = 0; i < count; i++) {
    if (!g.paused) {
      g.elapsed += 1 / 60;
      g.updatePlayer(1 / 60);
      updateHazards(g, 1 / 60);
      g.updateEnemies(1 / 60);
      g.hitTimer = Math.max(0, g.hitTimer - 1 / 60);
      g.attackCooldown = Math.max(0, g.attackCooldown - 1 / 60);
    }
    g.updateDecorations(1 / 60);
    g.updateCamera(1 / 60);
  }
  g.cb.update(g.state());
}

export async function gardenMove(g, points) {
  const r = g.rainGarden;
  g.yaw = 0;
  g.keys.clear();
  for (const [x, z] of points) {
    let reached = false;
    for (let i = 0; i < 1500; i++) {
      const dx = r.x + x - g.player.position.x,
        dz = r.z + z - g.player.position.z,
        d = Math.hypot(dx, dz);
      if (d < 0.07) {
        reached = true;
        break;
      }
      const speed = Math.min(0.65, d * 4);
      g.touchMove = { x: (dx / d) * speed, z: (dz / d) * speed };
      gardenTick(g);
      if (i % 120 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (!reached)
      throw new Error(
        `Blocked to ${x},${z}: ${JSON.stringify(gardenPosition(g))}`,
      );
  }
  g.touchMove = { x: 0, z: 0 };
  gardenTick(g, 2);
  return gardenPosition(g);
}
