import { CLEFT_EDGES, CLEFT_HAND_HEIGHT } from "../src/cleft-rules.js";

// Run in the development browser with a loaded desert chapter. This reads the
// actual generated world, including all campaign obstacles; it does not move
// the player, solve the climb or change the save.
export function inspectCleftClearance(game) {
  const cleft = game.cleft;
  if (!cleft)
    throw new Error("Load the desert chapter before inspecting the cleft.");
  const blocked = [];
  for (const edge of CLEFT_EDGES) {
    const a = cleft.nodes[edge.a].grip,
      b = cleft.nodes[edge.b].grip;
    for (let sample = 0; sample <= 40; sample++) {
      const t = sample / 40,
        p = a.clone().lerp(b, t);
      p.y -= CLEFT_HAND_HEIGHT;
      if (edge.leap) p.y += Math.sin(t * Math.PI) * 0.65;
      p.z += 0.55;
      if (!game.canMove(p.x, p.z, p.y - game.groundHeight(p.x, p.z)))
        blocked.push({ from: edge.a, to: edge.b, t, position: p.toArray() });
    }
  }
  const approach = [];
  for (let x = 23 * 7; x <= 29 * 7; x += 0.5)
    if (!game.canMove(x, 35 * 7, 0)) approach.push({ x, z: 35 * 7 });
  return {
    handholds: cleft.nodes.length,
    edges: CLEFT_EDGES.length,
    blocked,
    approach,
  };
}
