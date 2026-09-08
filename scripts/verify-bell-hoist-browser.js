// Assisted route checks for a disposable development save. Stop the animation
// loop first; use native E / Space input between movement legs.
import { bellHoistControl } from "/src/bell-hoist.js";

export function hoistPosition(g) {
  const h = g.bellHoist,
    p = g.player.position,
    c = bellHoistControl(g);
  return {
    local: [p.x - h.x, p.y - h.y, p.z - h.z],
    grounded: g.grounded,
    health: g.health,
    control: c?.kind,
    car: c?.car,
    stop: h.saved.stop,
    moving: !!h.motion,
    saved: { ...h.saved },
    audio: h.sources.map((s) => ({
      id: s.id,
      activity: s.activity,
      x: s.x,
      y: s.y,
      z: s.z,
    })),
  };
}
export function hoistTick(g, count = 1) {
  for (let i = 0; i < count; i++) {
    g.elapsed += 1 / 60;
    g.updatePlayer(1 / 60);
  }
}
export async function hoistMove(g, points, { minimum = 0 } = {}) {
  const h = g.bellHoist,
    start = g.elapsed;
  g.yaw = 0;
  for (const [x, z] of points) {
    let reached = false;
    for (let n = 0; n < 1500; n++) {
      const dx = h.x + x - g.player.position.x,
        dz = h.z + z - g.player.position.z,
        d = Math.hypot(dx, dz);
      if (d < 0.07) {
        reached = true;
        break;
      }
      const speed = Math.min(0.66, d * 4);
      g.touchMove = { x: (dx / d) * speed, z: (dz / d) * speed };
      hoistTick(g);
      if (g.player.position.y < h.y + minimum - 0.07)
        throw new Error(`Fell: ${JSON.stringify(hoistPosition(g))}`);
      if (n % 120 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (!reached)
      throw new Error(
        `Blocked to ${x},${z}: ${JSON.stringify(hoistPosition(g))}`,
      );
  }
  g.touchMove = { x: 0, z: 0 };
  hoistTick(g, 2);
  return { ...hoistPosition(g), simulatedSeconds: g.elapsed - start };
}
