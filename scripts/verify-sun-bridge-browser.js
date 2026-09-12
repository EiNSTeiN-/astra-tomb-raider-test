import { updateHazards } from "../src/hazards.js";
// The caller seeds one entrance. Route checks then use the ordinary controller,
// guardians, hazards and camera without repositioning the player.
export function sunTick(g, frames = 1) {
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
export function sunPosition(g) {
  const h = g.sunBridge,
    p = g.player.position;
  return {
    local: [p.x - h.x, p.y - h.y, p.z - h.z],
    grounded: g.grounded,
    health: g.health,
    nearest: g.nearest?.id,
    stops: [...h.saved.stops],
    angles: h.bridges.map((b) => b.angle),
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
  const dx = x + g.sunBridge.x - g.player.position.x,
    dz = z + g.sunBridge.z - g.player.position.z,
    d = Math.hypot(dx, dz);
  if (d > 0.025) g.yaw = Math.atan2(-dx, -dz);
  g.touchMove = { x: 0, z: d < 0.025 ? 0 : -Math.min(max, d * 8) };
  return d;
}
export async function sunWalk(g, x, z) {
  const health = g.health;
  for (let i = 0; i < 1500; i++) {
    if (g.health !== health)
      throw new Error(
        `Health changed on walk: ${JSON.stringify(sunPosition(g))}`,
      );
    if (steer(g, x, z) < 0.07 && g.grounded) {
      g.touchMove = { x: 0, z: 0 };
      sunTick(g, 2);
      return sunPosition(g);
    }
    sunTick(g);
    if (i % 120 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error(
    `Sun path blocked toward ${x},${z}: ${JSON.stringify(sunPosition(g))}`,
  );
}
export function sunJump(g, x, z) {
  const health = g.health;
  g.keys.add("Space");
  for (let i = 0; i < 150; i++) {
    steer(g, x, z, 1);
    sunTick(g);
    if (g.health !== health)
      throw new Error(
        `Health changed on jump: ${JSON.stringify(sunPosition(g))}`,
      );
    if (i > 8 && g.grounded) {
      g.touchMove = { x: 0, z: 0 };
      sunTick(g, 2);
      return sunPosition(g);
    }
  }
  throw new Error(`No sun landing: ${JSON.stringify(sunPosition(g))}`);
}
