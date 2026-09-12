import { updateHazards } from "../src/hazards.js";
// The caller seeds one entrance. Route checks then use the ordinary controller,
// guardians, hazards and camera without repositioning the player.
export function arcadeTick(g, frames = 1) {
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
export function arcadePosition(g) {
  const h = g.arcadeLock,
    p = g.player.position;
  return {
    local: [p.x, p.y - h.y, p.z],
    grounded: g.grounded,
    health: g.health,
    nearest: g.nearest?.id,
    level: h.saved.level,
    swimming: g.swimming,
    anchor: h.saved.anchor,
    field: g.progress.field.filter((id) => id.startsWith("field-5-")),
    turn: h.turn
      ? {
          time: h.turn.time,
          field: h.turn.control.field,
          pivot: h.turn.control.pivot,
        }
      : null,
    hint: g.state().traversalHint,
  };
}
function steer(g, x, z, max = 0.85) {
  const dx = x - g.player.position.x,
    dz = z - g.player.position.z,
    d = Math.hypot(dx, dz);
  if (d > 0.025) g.yaw = Math.atan2(-dx, -dz);
  g.touchMove = { x: 0, z: d < 0.025 ? 0 : -Math.min(max, d * 8) };
  return d;
}
export async function arcadeWalk(g, x, z) {
  const health = g.health;
  for (let i = 0; i < 1500; i++) {
    if (g.health !== health)
      throw new Error(
        `Health changed on walk: ${JSON.stringify(arcadePosition(g))}`,
      );
    if (steer(g, x, z) < 0.07 && g.grounded) {
      g.touchMove = { x: 0, z: 0 };
      arcadeTick(g, 2);
      return arcadePosition(g);
    }
    arcadeTick(g);
    if (i % 120 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error(
    `Arcade path blocked toward ${x},${z}: ${JSON.stringify(arcadePosition(g))}`,
  );
}
export function arcadeJump(g, x, z) {
  const health = g.health;
  g.keys.add("Space");
  for (let i = 0; i < 150; i++) {
    steer(g, x, z, 1);
    arcadeTick(g);
    if (g.health !== health)
      throw new Error(
        `Health changed on jump: ${JSON.stringify(arcadePosition(g))}`,
      );
    if (i > 8 && g.grounded) {
      g.touchMove = { x: 0, z: 0 };
      arcadeTick(g, 2);
      return arcadePosition(g);
    }
  }
  throw new Error(`No arcade landing: ${JSON.stringify(arcadePosition(g))}`);
}
