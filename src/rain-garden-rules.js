import { boxEntry } from "./camera-collision.js";

export const GARDEN_SITE = { x: 16, z: 43 };
export const GARDEN_FLOOR = 5.6;
export const GARDEN_UPPER = 9;
export const CHANNEL_TYPES = [
  "elbow",
  "elbow",
  "straight",
  "elbow",
  "straight",
  "elbow",
  "elbow",
  "elbow",
  "elbow",
];
export const CHANNEL_INITIAL = [0, 2, 0, 3, 1, 1, 2, 0, 3];
export const CHANNEL_SOLUTION = [0, 1, 1, 2, 0, 1, 0, 3, 3];
const DELTA = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function channelPorts(index, rotation) {
  return (CHANNEL_TYPES[index] === "straight" ? [0, 2] : [0, 1]).map(
    (d) => (d + rotation) % 4,
  );
}
// Follow the spring from the west of tile 4 to the east of tile 3. Reciprocal
// open ends are required; leaks, loops and a moving channel stop the flow.
export function traceGarden(rotations, moving = -1) {
  const path = [],
    visited = new Set();
  let index = 3,
    entry = 3;
  for (let i = 0; i < 10; i++) {
    if (index === moving || visited.has(index))
      return { path, complete: false };
    const ports = channelPorts(index, rotations[index]);
    if (!ports.includes(entry)) return { path, complete: false };
    visited.add(index);
    const out = ports.find((d) => d !== entry);
    path.push({ index, entry, out });
    if (index === 2 && out === 1) return { path, complete: true };
    const col = (index % 3) + DELTA[out][0],
      row = Math.floor(index / 3) + DELTA[out][1];
    if (col < 0 || row < 0 || col > 2 || row > 2)
      return { path, complete: false };
    index = row * 3 + col;
    entry = (out + 2) % 4;
  }
  return { path, complete: false };
}
export function gardenChannelPosition(index) {
  return { x: ((index % 3) - 1) * 3.5, z: (Math.floor(index / 3) - 1) * 3.5 };
}
export function gardenPowered(progress) {
  return (
    progress.stage > 2 ||
    progress.field?.includes("field-2-1") ||
    progress.field?.includes("field-2-2")
  );
}
export function normalizeRainGarden(value, progress) {
  let rotations = Array.from({ length: 9 }, (_, i) =>
    Number.isInteger(value?.rotations?.[i]) &&
    value.rotations[i] >= 0 &&
    value.rotations[i] < 4
      ? value.rotations[i]
      : CHANNEL_INITIAL[i],
  );
  const complete = progress.stage > 2 || progress.field?.includes("field-2-2");
  if (gardenPowered(progress) && !traceGarden(rotations).complete)
    rotations = [...CHANNEL_SOLUTION];
  return {
    rotations,
    stop:
      gardenPowered(progress) && (value?.stop === 0 || value?.stop === 1)
        ? value.stop
        : complete
          ? 1
          : 0,
  };
}
export function addRainGarden(map, level) {
  if (level.id !== "verdant") return map;
  map.rainGarden = { ...GARDEN_SITE };
  for (const [step, [x, z, height]] of [
    [-7, 7, 0],
    [0, 7, GARDEN_FLOOR],
    [7, -7, GARDEN_UPPER],
  ].entries()) {
    Object.assign(
      map.features.find((f) => f.id === `field-2-${step}`),
      {
        x: GARDEN_SITE.x + x / 7,
        z: GARDEN_SITE.z + z / 7,
        gardenHeight: height,
      },
    );
  }
  return map;
}
export function gardenDeckAt(game, x, z, maxY = Infinity) {
  const g = game.rainGarden;
  if (!g || Math.abs(x - g.x) > 14 || Math.abs(z - g.z) > 14) return null;
  let best = null;
  for (const d of g.decks)
    if (
      Math.abs(x - d.x) < d.w &&
      Math.abs(z - d.z) < d.d &&
      d.y <= maxY + 0.2 &&
      (!best || d.y > best.height)
    )
      best = { height: d.y, surface: d };
  return best;
}
export function gardenBlocked(game, x, z, y, clearance = 1.8) {
  const g = game.rainGarden;
  if (!g || Math.abs(x - g.x) > 14 || Math.abs(z - g.z) > 14) return false;
  return (
    g.solids.some(
      (s) =>
        Math.abs(x - s.x) < s.w + 0.2 &&
        Math.abs(z - s.z) < s.d + 0.2 &&
        y < s.top &&
        y + clearance > s.bottom,
    ) ||
    g.decks.some(
      (d) =>
        Math.abs(x - d.x) < d.w + 0.12 &&
        Math.abs(z - d.z) < d.d + 0.12 &&
        y < d.y - 0.22 &&
        y + clearance > d.y - d.thickness,
    )
  );
}
export function gardenOccludes(game, from, to) {
  const g = game.rainGarden;
  if (!g) return false;
  const hit = (s, bottom, top) =>
    boxEntry(
      from,
      to,
      {
        min: { x: s.x - s.w, y: bottom, z: s.z - s.d },
        max: { x: s.x + s.w, y: top, z: s.z + s.d },
      },
      0,
      true,
    ) !== null;
  return (
    g.solids.some((s) => hit(s, s.bottom, s.top)) ||
    g.decks.some((d) => hit(d, d.y - d.thickness, d.y))
  );
}
export function gardenSavePosition(game) {
  const g = game.rainGarden,
    p = game.player?.position,
    d = g?.carDeck;
  if (
    !g?.motion ||
    !p ||
    !game.grounded ||
    Math.abs(p.y - d.y) > 0.24 ||
    Math.abs(p.x - d.x) > d.w ||
    Math.abs(p.z - d.z) > d.d
  )
    return null;
  return {
    x: p.x,
    z: p.z,
    y: g.y + (g.saved.stop ? GARDEN_UPPER : GARDEN_FLOOR),
  };
}
