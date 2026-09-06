// Nine authored optical routes. Crossings transmit light; only a mirror bends it.
export const SOLAR_ROUTES = [
  [
    [-1, 4],
    [1, 4],
    [1, 1],
    [4, 1],
    [4, 3],
    [6, 3],
  ],
  [
    [-1, 1],
    [1, 1],
    [1, 4],
    [4, 4],
    [4, 2],
    [6, 2],
  ],
  [
    [-1, 5],
    [0, 5],
    [0, 1],
    [3, 1],
    [3, 4],
    [5, 4],
    [5, 2],
    [6, 2],
  ],
  [
    [-1, 0],
    [2, 0],
    [2, 2],
    [0, 2],
    [0, 5],
    [4, 5],
    [4, 3],
    [6, 3],
  ],
  [
    [-1, 3],
    [0, 3],
    [0, 0],
    [3, 0],
    [3, 2],
    [1, 2],
    [1, 5],
    [5, 5],
    [5, 1],
    [6, 1],
  ],
  [
    [-1, 2],
    [1, 2],
    [1, 0],
    [5, 0],
    [5, 4],
    [3, 4],
    [3, 1],
    [2, 1],
    [2, 5],
    [4, 5],
    [4, 3],
    [6, 3],
  ],
  [
    [-1, 4],
    [2, 4],
    [2, 1],
    [0, 1],
    [0, 0],
    [4, 0],
    [4, 5],
    [1, 5],
    [1, 2],
    [5, 2],
    [5, 3],
    [6, 3],
  ],
  [
    [-1, 0],
    [0, 0],
    [0, 2],
    [2, 2],
    [2, 5],
    [5, 5],
    [5, 1],
    [3, 1],
    [3, 4],
    [4, 4],
    [4, 3],
    [6, 3],
  ],
  [
    [-1, 5],
    [0, 5],
    [0, 0],
    [5, 0],
    [5, 4],
    [1, 4],
    [1, 1],
    [4, 1],
    [4, 3],
    [2, 3],
    [2, 2],
    [6, 2],
  ],
];

export function solarLayout(stage) {
  const route = SOLAR_ROUTES[stage];
  if (!route) throw new RangeError("Unknown solar chamber");
  const mirrors = route.slice(1, -1).map(([x, y]) => ({ x, y }));
  const target = mirrors.map((p, i) => {
    const a = route[i],
      b = route[i + 2];
    const dx = Math.sign(p.x - a[0]),
      dy = Math.sign(p.y - a[1]);
    const ox = Math.sign(b[0] - p.x),
      oy = Math.sign(b[1] - p.y);
    return ox === dy && oy === dx ? 1 : 0;
  });
  return {
    mirrors,
    target,
    start: { x: route[0][0], y: route[0][1] },
    end: { x: route.at(-1)[0], y: route.at(-1)[1] },
  };
}

export function normalizeSolar(value) {
  const out = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [key, r] of Object.entries(value)) {
    if (
      !/^[0-8]$/.test(key) ||
      !r ||
      !Array.isArray(r.values) ||
      r.values.length !== SOLAR_ROUTES[Number(key)].length - 2 ||
      !r.values.every((v) => v === 0 || v === 1)
    )
      continue;
    out[key] = {
      values: [...r.values],
      moves: Number.isInteger(r.moves)
        ? Math.max(0, Math.min(100000, r.moves))
        : 0,
    };
  }
  return out;
}

export const solarLocal = ({ x, y }) => ({
  x: (x - 2.5) * 3.2,
  z: 8.8 + y * 2.35,
});

export function inSolarCourt(map, x, z) {
  return map.rooms
    .slice(1)
    .some(
      (room) =>
        Math.abs(x - room.x * 7) < 15.5 &&
        z > room.z * 7 + 5 &&
        z < room.z * 7 + 25,
    );
}

export function traceSolar(state, stopped = new Set()) {
  let { x, y } = state.start,
    dx = 1,
    dy = 0;
  const points = [{ x, y }],
    seen = new Set(),
    mirrors = [];
  for (let n = 0; n < 128; n++) {
    x += dx;
    y += dy;
    points.push({ x, y });
    if (x === state.end.x && y === state.end.y)
      return { points, mirrors, hit: true };
    if (x < 0 || x > 5 || y < 0 || y > 5) break;
    const key = `${x},${y},${dx},${dy}`;
    if (seen.has(key)) break;
    seen.add(key);
    const index = state.mirrors.findIndex((m) => m.x === x && m.y === y);
    if (index >= 0) {
      mirrors.push(index);
      if (stopped.has(index)) break;
      const a = dx,
        b = dy;
      dx = state.values[index] ? b : -b;
      dy = state.values[index] ? a : -a;
    }
  }
  return { points, mirrors, hit: false };
}
