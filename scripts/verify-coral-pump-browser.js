// Assisted movement within the pump clearing in a disposable development save.
// Stop the live loop first. Native E input operates the actual game controls.
export function pumpPosition(g) {
  const p = g.coralPump;
  return {
    local: [
      g.player.position.x - p.x,
      g.player.position.y - p.y,
      g.player.position.z - p.z,
    ],
    health: g.health,
    field: [...g.progress.field],
    saved: { ...p.saved },
    pressure: p.pressure,
    stable: p.stable,
    carrying: g.carrying,
  };
}
export function pumpTick(g, count = 1) {
  for (let i = 0; i < count; i++) {
    g.elapsed += 1 / 60;
    g.updatePlayer(1 / 60);
    g.updateDecorations(1 / 60);
    g.updateCamera(1 / 60);
  }
}
export async function pumpMove(g, points) {
  const p = g.coralPump;
  g.yaw = 0;
  g.keys.clear();
  for (const [x, z] of points) {
    let reached = false;
    for (let i = 0; i < 1500; i++) {
      const dx = p.x + x - g.player.position.x,
        dz = p.z + z - g.player.position.z,
        d = Math.hypot(dx, dz);
      if (d < 0.07) {
        reached = true;
        break;
      }
      const speed = Math.min(0.65, d * 4);
      g.touchMove = { x: (dx / d) * speed, z: (dz / d) * speed };
      pumpTick(g);
      if (i % 120 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (!reached)
      throw new Error(
        `Blocked toward ${x},${z}: ${JSON.stringify(pumpPosition(g))}`,
      );
  }
  g.touchMove = { x: 0, z: 0 };
  pumpTick(g, 2);
  return pumpPosition(g);
}
