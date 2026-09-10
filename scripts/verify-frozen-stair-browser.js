// Assisted route review in a disposable development save. Stop the animation
// loop first; native E / Space input can be used between these movement legs.
export function stairPosition(g) {
  const s = g.frozenStair,
    p = g.player.position;
  return {
    local: [p.x - s.x, p.y - s.y, p.z - s.z],
    grounded: g.grounded,
    health: g.health,
    nearest: g.nearest?.id,
    field: [...g.progress.field],
    restored: s.saved.restored,
    moving: !!s.motion,
    angle: s.flight.rotation.x,
    sources: s.sources.map((x) => ({ id: x.id, activity: x.activity })),
  };
}
export function stairTick(g, count = 1) {
  for (let i = 0; i < count; i++) {
    g.elapsed += 1 / 60;
    g.updatePlayer(1 / 60);
    g.updateDecorations(1 / 60);
    g.updateCamera(1 / 60);
  }
}
export async function stairMove(g, points, { minimum = 0 } = {}) {
  const s = g.frozenStair;
  g.yaw = 0;
  g.keys.clear();
  for (const [x, z] of points) {
    let reached = false;
    for (let i = 0; i < 1500; i++) {
      const dx = s.x + x - g.player.position.x,
        dz = s.z + z - g.player.position.z,
        d = Math.hypot(dx, dz);
      if (d < 0.07) {
        reached = true;
        break;
      }
      const speed = Math.min(0.65, d * 4);
      g.touchMove = { x: (dx / d) * speed, z: (dz / d) * speed };
      stairTick(g);
      if (g.player.position.y < s.y + minimum - 0.07)
        throw new Error(`Fell: ${JSON.stringify(stairPosition(g))}`);
      if (i % 120 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (!reached)
      throw new Error(
        `Blocked to ${x},${z}: ${JSON.stringify(stairPosition(g))}`,
      );
  }
  g.touchMove = { x: 0, z: 0 };
  stairTick(g, 2);
  return stairPosition(g);
}
