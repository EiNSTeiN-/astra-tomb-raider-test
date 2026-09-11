import { updateHazards } from "../src/hazards.js";
// Seed the entrance once. These helpers then use normal movement, wind,
// guardians, hazards and camera updates without relocating the player.
export function shutterTick(g, frames = 1) {
  for (let i = 0; i < frames; i++) {
    if (!g.paused) {
      g.elapsed += 1 / 60;
      g.updatePlayer(1 / 60);
      g.updateEnemies(1 / 60);
      updateHazards(g, 1 / 60);
      g.hitTimer = Math.max(0, g.hitTimer - 1 / 60);
      g.attackCooldown = Math.max(0, g.attackCooldown - 1 / 60);
      g.updateDecorations(1 / 60);
    }
    g.updateCamera(1 / 60);
  }
  g.cb.update(g.state());
}
export function shutterPosition(g) {
  const h = g.shutterHouse,
    p = g.player.position;
  return {
    position: p.toArray(),
    local: [p.x - h.x, p.y - h.y, p.z - h.z],
    grounded: g.grounded,
    health: g.health,
    nearest: g.nearest?.id,
    turns: [...h.saved.turns],
    field: [...g.progress.field],
    turn: h.turn ? { ...h.turn } : null,
    time: h.time,
    wind: g.shutterWind,
    hint: g.state().traversalHint,
  };
}
export async function shutterWalk(g, x, z) {
  const h = g.shutterHouse;
  x += h.x;
  z += h.z;
  for (let i = 0; i < 1500; i++) {
    const dx = x - g.player.position.x,
      dz = z - g.player.position.z,
      d = Math.hypot(dx, dz);
    if (d < 0.07 && g.grounded) {
      g.touchMove = { x: 0, z: 0 };
      shutterTick(g, 2);
      return shutterPosition(g);
    }
    g.yaw = Math.atan2(-dx, -dz);
    g.touchMove = { x: 0, z: -Math.min(0.85, d * 8) };
    shutterTick(g);
    if (i % 120 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error(
    `Shutter path blocked toward ${x},${z}: ${JSON.stringify(shutterPosition(g))}`,
  );
}
export function shutterJump(g, direction) {
  g.yaw = Math.atan2(-direction, 0);
  g.touchMove = { x: 0, z: -1 };
  g.keys.add("Space");
  for (let i = 0; i < 90; i++) {
    shutterTick(g);
    if (i > 8 && g.grounded) {
      g.touchMove = { x: 0, z: 0 };
      shutterTick(g, 2);
      return shutterPosition(g);
    }
  }
  throw new Error(`No landing: ${JSON.stringify(shutterPosition(g))}`);
}
