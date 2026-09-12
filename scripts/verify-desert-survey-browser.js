import { updateHazards } from "../src/hazards.js";
// The caller seeds one entrance. Route checks then use the ordinary controller,
// guardians, hazards and camera without repositioning the player.
export function surveyTick(g, frames = 1) {
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
export function surveyPosition(g) {
  return {
    position: g.player.position.toArray(),
    grounded: g.grounded,
    health: g.health,
    field: g.progress.field.filter((id) => id.startsWith("field-0-")),
    focus: g.desertSurvey?.focus?.control.index ?? null,
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
export async function surveyWalk(g, x, z) {
  const health = g.health;
  for (let i = 0; i < 1500; i++) {
    if (g.health !== health)
      throw new Error(
        `Health changed on walk: ${JSON.stringify(surveyPosition(g))}`,
      );
    if (steer(g, x, z) < 0.07 && g.grounded) {
      g.touchMove = { x: 0, z: 0 };
      surveyTick(g, 2);
      return surveyPosition(g);
    }
    surveyTick(g);
    if (i % 120 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error(
    `Survey path blocked toward ${x},${z}: ${JSON.stringify(surveyPosition(g))}`,
  );
}
