// An authored, ground-level listening labyrinth beside the crystal entry camp.
// Cell centers are seven metres apart. Edges describe open passages, not hints.
export const ECHO_BOUNDS = { left: 7, right: 35, top: 28, bottom: 84 };
export const ECHO_EDGES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [0, 4],
  [3, 7],
  [4, 5],
  [6, 7],
  [5, 9],
  [6, 10],
  [8, 9],
  [9, 10],
  [10, 11],
  [8, 12],
  [11, 15],
  [12, 13],
  [14, 15],
  [13, 17],
  [14, 18],
  [16, 17],
  [17, 18],
  [18, 19],
  [16, 20],
  [19, 23],
  [20, 21],
  [21, 22],
  [22, 23],
  [20, 24],
  [23, 27],
  [24, 25],
  [26, 27],
  [25, 29],
  [26, 30],
  [28, 29],
  [29, 30],
  [30, 31],
];
export const ECHO_SHORTCUTS = [
  { a: 5, b: 6, after: 1 },
  { a: 17, b: 21, after: 2 },
];
export const ECHO_STONES = [
  { cell: 0, count: 3, name: "The waiting voice" },
  { cell: 3, count: 2, name: "The returning voice" },
  { cell: 12, count: 4, name: "A fractured echo" },
  { cell: 28, count: 1, name: "The solitary voice" },
  { cell: 31, count: 4, name: "A fractured echo" },
];
export const ECHO_ORDER = [1, 3, 0];
export const ECHO_FRAGMENTS = [
  "Two breaths, returning: ‘I followed the doubled voice, expecting someone on the other side. It was my own call, held in the stone since yesterday. Beneath it I heard one clear answer. I went toward the single pulse.’",
  "One breath, alone: ‘The stone remembered my voice, but not my fear. For the first time since the descent, I sat down. Farther in, three patient breaths repeated. Someone had waited here before me.’",
  "Three breaths, waiting: ‘The last voice was not mine. A keeper had recorded the way home for anyone who lost their way. I have joined my memory to hers. Return these fragments to the entrance tablet; no one should have to follow a voice alone.’",
];
export const ECHO_RECORD = {
  title: "Someone waited here",
  text: "Elara came to the listening gallery looking for another explorer. She found a chain of calls recorded across centuries: a miner, a keeper, a child. Each had left a voice for the next person in the dark. Her final entry adds a fourth: ‘Vesper, you do not owe the mountain another disappearance. Whatever you find below, come home.’",
};
export const ECHO_PERIOD = 4;
export function echoEnvelope(count, time) {
  const t = ((time % ECHO_PERIOD) + ECHO_PERIOD) % ECHO_PERIOD;
  const n = Math.floor(t / 0.55),
    age = t - n * 0.55;
  if (n >= count || age > 0.36) return 0;
  return Math.min(1, age / 0.025) * (1 - age / 0.36) ** 2;
}
export function echoCell(index) {
  return { x: 10.5 + (index % 4) * 7, z: 31.5 + Math.floor(index / 4) * 7 };
}
export function echoCellAt(x, z) {
  if (x < 7 || x >= 35 || z < 28 || z >= 84) return null;
  return Math.floor((z - 28) / 7) * 4 + Math.floor((x - 7) / 7);
}
export function inEchoGallery(map, x, z, padding = 0) {
  return (
    !!map.echoGallery &&
    x >= 7 - padding &&
    x <= 43 + padding &&
    z >= 28 - padding &&
    z <= 84 + padding
  );
}
export function normalizeEcho(value) {
  const visited = value?.visited === true;
  const fragments =
    visited && Number.isInteger(value?.fragments)
      ? Math.max(0, Math.min(3, value.fragments))
      : 0;
  return {
    visited,
    fragments,
    recovered: fragments === 3 && value?.recovered === true,
    charted:
      visited && Array.isArray(value?.charted)
        ? [
            ...new Set(
              value.charted.filter(
                (v) => Number.isInteger(v) && v >= 0 && v < 32,
              ),
            ),
          ].sort((a, b) => a - b)
        : [],
  };
}
export function addEchoGallery(map, level) {
  if (level.id !== "crystal") return map;
  map.echoGallery = { x: 3, z: 8 };
  for (let z = 4; z <= 12; z++) for (let x = 1; x <= 5; x++) map.grid[z][x] = 1;
  const path = [];
  for (let x = 5; x <= 8; x++) {
    map.grid[9][x] = map.grid[10][x] = 1;
    path.push({ x, z: 9 });
  }
  map.paths.push(path);
  return map;
}
// Each wall is emitted once, including the outer boundary. The eastern entry
// has a full cell-width opening. Shortcut panels occupy otherwise closed edges.
export function echoWalls() {
  const walls = [];
  for (let a = 0; a < 32; a++) {
    const p = echoCell(a),
      col = a % 4,
      row = Math.floor(a / 4);
    const add = (b, x, z, w, d) => {
      if (ECHO_EDGES.some((e) => e[0] === a && e[1] === b)) return;
      const shortcut = ECHO_SHORTCUTS.find((e) => e.a === a && e.b === b);
      walls.push({ x, z, w, d, a, b, after: shortcut?.after || 0 });
    };
    if (!col)
      walls.push({ x: p.x - 3.5, z: p.z, w: 0.7, d: 7, a, b: -1, after: 0 });
    if (!row)
      walls.push({ x: p.x, z: p.z - 3.5, w: 7, d: 0.7, a, b: -1, after: 0 });
    if (col < 3) add(a + 1, p.x + 3.5, p.z, 0.7, 7);
    else if (a !== 23) add(-1, p.x + 3.5, p.z, 0.7, 7);
    if (row < 7) add(a + 4, p.x, p.z + 3.5, 7, 0.7);
    else add(-1, p.x, p.z + 3.5, 7, 0.7);
  }
  return walls;
}
