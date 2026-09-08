import { boxEntry } from "./camera-collision.js";

export const CLEFT_HAND_HEIGHT = 1.9;
export const CLEFT_RECORD = {
  title: "A map for those who followed",
  text: "The surveyors cut their measures into the sheltered face, where the sand could not erase them. Their last drawing shows a chain of wells beyond the city: water for the quarry workers, then their families, then anyone who reached the road. Beside the final bearing, someone has added a smaller handprint and the words: leave the line for the next climber.",
  note: "Elara’s annotation: They climbed to find a way out. They left the anchors so that others could follow.",
};
export const CLEFT_TERRACES = [
  { x: -10, y: 0.18, w: 2.5, node: 0, name: "The quarry foot" },
  { x: 6, y: 6, w: 2.5, node: 12, name: "The wind shelf" },
  { x: -7.4, y: 12, w: 2.5, node: 22, name: "The shaded measure" },
  { x: 6, y: 18, w: 4, node: 32, name: "The surveyors’ lookout" },
];
const POINTS = [
  [-10, 2.08],
  [-10, 3.2],
  [-9, 4.3],
  [-7.6, 4.7],
  [-6.2, 5.3],
  [-3.8, 5.8],
  [-2.4, 6.3],
  [-1, 6.9],
  [0.4, 7.5],
  [1.8, 7.9],
  [3.2, 7.9],
  [4.6, 7.9],
  [6, 7.9],
  [6, 9.1],
  [5, 10.2],
  [3.6, 10.8],
  [2.2, 11.4],
  [-0.4, 11.8],
  [-1.8, 12.4],
  [-3.2, 13],
  [-4.6, 13.9],
  [-6, 13.9],
  [-7.4, 13.9],
  [-7.4, 15.1],
  [-6.4, 16.2],
  [-5, 16.8],
  [-3.6, 17.2],
  [-2.2, 17.8],
  [0.4, 19.1],
  [1.8, 19.9],
  [3.2, 19.9],
  [4.6, 19.9],
  [6, 19.9],
  // Longer upper fork bypasses the first broken span.
  [-6.2, 6.5],
  [-5.2, 7.5],
  [-3.8, 7.5],
  [-2.4, 7.5],
];
export const CLEFT_NODES = POINTS.map(([x, y], id) => ({
  id,
  x,
  y,
  terrace: CLEFT_TERRACES.findIndex((t) => t.node === id),
}));
export const CLEFT_EDGES = [
  ...Array.from({ length: 32 }, (_, i) => [i, i + 1]),
  [4, 33],
  [33, 34],
  [34, 35],
  [35, 36],
  [36, 7],
].map(([a, b]) => ({ a, b, leap: [4, 16, 27].includes(a) && b === a + 1 }));

export function cleftDirection(node, x, up) {
  const length = Math.hypot(x, up);
  if (length < 0.35) return null;
  let result = null,
    best = 0.48;
  for (const e of CLEFT_EDGES) {
    const id = e.a === node ? e.b : e.b === node ? e.a : -1;
    if (id < 0) continue;
    const a = CLEFT_NODES[node],
      b = CLEFT_NODES[id];
    const dot =
      ((b.x - a.x) * x + (b.y - a.y) * up) /
      (Math.hypot(b.x - a.x, b.y - a.y) * length);
    if (dot > best) {
      best = dot;
      result = { id, leap: e.leap };
    }
  }
  return result;
}
export function normalizeCleft(value) {
  const visited = value?.visited === true;
  const terrace =
    visited && Number.isInteger(value?.terrace)
      ? Math.max(0, Math.min(3, value.terrace))
      : 0;
  return {
    visited,
    terrace,
    recovered: visited && terrace === 3 && value?.recovered === true,
  };
}
export function addSurveyorsCleft(map, level) {
  if (level.id !== "sands") return map;
  // Appended after the seeded campaign: no existing feature or encounter moves.
  map.cleft = { x: 29, z: 31, r: 3, cleft: true };
  for (let z = 28; z <= 35; z++)
    for (let x = 26; x <= 32; x++) map.grid[z][x] = 1;
  const path = [];
  for (let x = 22; x <= 29; x++) {
    map.grid[35][x] = 1;
    path.push({ x, z: 35 });
  }
  map.paths.push(path);
  return map;
}
export function insideCleft(game) {
  const c = game.cleft,
    p = game.player?.position;
  return (
    !!c && !!p && Math.abs(p.x - c.x) < 21 && p.z > c.z - 6 && p.z < c.z + 29
  );
}
export function cleftDeckAt(game, x, z, maxY = Infinity) {
  let result = null;
  for (const d of game.cleft?.decks || []) {
    if (Math.abs(x - d.x) > d.w || Math.abs(z - d.z) > d.d || d.y > maxY + 0.2)
      continue;
    if (!result || d.y > result.height) result = { height: d.y, surface: d };
  }
  return result;
}
export function cleftBlocked(game, x, z, y, clearance = 1.8) {
  return (game.cleft?.solids || []).some(
    (o) =>
      Math.abs(x - o.x) < o.w + 0.2 &&
      Math.abs(z - o.z) < o.d + 0.2 &&
      y < o.top - 0.01 &&
      y + clearance > o.bottom + 0.01,
  );
}
export function cleftOccludes(game, from, to) {
  return (game.cleft?.solids || []).some(
    (o) =>
      boxEntry(
        from,
        to,
        {
          min: { x: o.x - o.w, y: o.bottom, z: o.z - o.d },
          max: { x: o.x + o.w, y: o.top, z: o.z + o.d },
        },
        0,
        true,
      ) !== null,
  );
}
