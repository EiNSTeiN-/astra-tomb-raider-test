// Channel ports face north, east, south and west. A clockwise quarter-turn
// preserves the casting: a straight duct cannot become an elbow.
export const WIND_PORTS = [
  [0, -1, 1, 4],
  [1, 0, 2, 8],
  [0, 1, 4, 1],
  [-1, 0, 8, 2],
];
export const rotateWind = (mask) => ((mask << 1) & 15) | (mask >> 3);
export const WIND_TRIALS = [
  {
    title: "The first breath",
    columns: 3,
    rows: 3,
    path: [0, 1, 4, 3, 6, 7, 8],
    fixed: [],
    instruction:
      "Bring the western breeze through the lower receiver. Follow the moving silver stream to its first break.",
  },
  {
    title: "The pilgrim's return",
    columns: 4,
    rows: 3,
    path: [0, 4, 8, 9, 5, 1, 2, 6, 10, 11],
    fixed: [],
    instruction:
      "The pilgrim's route descends, returns to the high channel, then finds the lower eastern tower.",
  },
  {
    title: "The hanging garden",
    columns: 3,
    rows: 4,
    path: [0, 1, 2, 5, 4, 3, 6, 9, 10, 7, 8, 11],
    fixed: [],
    instruction:
      "Carry air between four terraces. The garden's bends can return the wind toward its source before sending it onward.",
  },
  {
    title: "The weaver's court",
    columns: 4,
    rows: 4,
    path: [0, 4, 5, 1, 2, 3, 7, 6, 10, 9, 8, 12, 13, 14, 15],
    fixed: [],
    instruction:
      "Weave a continuous route through the square court. Crossed-looking channels never connect unless both mouths face one another.",
  },
  {
    title: "The immovable bearings",
    columns: 4,
    rows: 3,
    path: [0, 1, 5, 4, 8, 9, 10, 6, 2, 3, 7, 11],
    fixed: [5, 6],
    instruction:
      "Two braced castings cannot turn. Lead the wind through their fixed mouths and around the outer galleries.",
  },
  {
    title: "The reversed stair",
    columns: 3,
    rows: 4,
    path: [0, 3, 6, 9, 10, 7, 4, 1, 2, 5, 8, 11],
    fixed: [4, 7],
    instruction:
      "The middle stair climbs against the incoming wind. Its two braced ducts mark a route from the lower terrace back to the upper gallery.",
  },
  {
    title: "The high receiver",
    columns: 4,
    rows: 4,
    path: [0, 1, 2, 6, 5, 4, 8, 12, 13, 9, 10, 11, 7, 3],
    fixed: [9],
    instruction:
      "The receiver stands on the upper eastern edge. Bring the wind back from the lower galleries; the braced elbow points toward its return.",
  },
  {
    title: "The eagle's labyrinth",
    columns: 4,
    rows: 4,
    path: [0, 4, 8, 12, 13, 9, 5, 1, 2, 3, 7, 6, 10, 14, 15, 11],
    fixed: [8, 7, 10],
    instruction:
      "Three braced channels anchor the labyrinth. Its receiver stands on the third terrace. Read the mouths before turning the next bearing.",
  },
  {
    title: "The city's last breath",
    columns: 4,
    rows: 4,
    path: [0, 4, 8, 12, 13, 9, 5, 1, 2, 6, 10, 14, 15],
    fixed: [9, 6, 14],
    instruction:
      "Restore the last engine through two returning columns. The fixed bearings preserve the old route to the lowest eastern receiver.",
  },
];
export const windName = (s, i) =>
  String.fromCharCode(65 + Math.floor(i / s.columns)) + ((i % s.columns) + 1);
export const windPosition = (s, i) => ({
  x: ((i % s.columns) - (s.columns - 1) / 2) * 3.5,
  z: 9.5 + Math.floor(i / s.columns) * 3.5,
});
export function windLayout(stage) {
  const trial = WIND_TRIALS[stage],
    { columns, rows, path, fixed } = trial;
  const target = Array.from({ length: columns * rows }, (_, i) =>
    (i + stage) % 2 ? 3 : 5,
  );
  const direction = (a, b) =>
    b - a === -columns ? 1 : b - a === 1 ? 2 : b - a === columns ? 4 : 8;
  path.forEach(
    (cell, i) =>
      (target[cell] =
        (i ? direction(cell, path[i - 1]) : 8) |
        (i === path.length - 1 ? 2 : direction(cell, path[i + 1]))),
  );
  const values = target.map((mask, i) => {
    if (fixed.includes(i)) return mask;
    for (let n = 0; n < 1 + ((i * 7 + stage * 3) % 3); n++)
      mask = rotateWind(mask);
    return mask;
  });
  const state = {
    columns,
    rows,
    path: [...path],
    fixed: [...fixed],
    target,
    values,
    start: 0,
    end: path.at(-1),
    moves: 0,
    last: null,
  };
  if (traceWind(state).hit) values[0] = rotateWind(values[0]);
  return state;
}
export function traceWind(s) {
  const cells = [],
    visited = new Set();
  let cell = s.start ?? 0,
    incoming = 8;
  while (cell >= 0 && cell < s.values.length && !visited.has(cell)) {
    const mask = s.values[cell];
    if (!(mask & incoming)) return { cells, hit: false, blocked: cell };
    visited.add(cell);
    cells.push(cell);
    const outlet = WIND_PORTS.find(
      ([, , port]) => port !== incoming && mask & port,
    );
    if (!outlet) return { cells, hit: false, blocked: cell };
    const [dx, dz, port, opposite] = outlet;
    if (cell === s.end && port === 2)
      return { cells, hit: true, blocked: null };
    const x = (cell % s.columns) + dx,
      z = Math.floor(cell / s.columns) + dz;
    if (x < 0 || x >= s.columns || z < 0 || z >= s.rows)
      return { cells, hit: false, blocked: cell };
    cell = z * s.columns + x;
    incoming = opposite;
  }
  return { cells, hit: false, blocked: cell };
}
export function windInput(s, index) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= s.values.length ||
    s.fixed.includes(index)
  )
    return { kind: "ignored" };
  s.values[index] = rotateWind(s.values[index]);
  s.moves++;
  s.last = index;
  return { kind: "turned", index };
}
// One known route remains available from every valid arrangement; unrelated
// ducts need not match the record for the actual receiver to accept airflow.
export function windSolution(s) {
  if (traceWind(s).hit) return [];
  const route = [];
  for (const i of s.path) {
    let mask = s.values[i];
    for (let n = 0; mask !== s.target[i] && n < 4; n++) {
      route.push(i);
      mask = rotateWind(mask);
    }
  }
  return route;
}
export function normalizeWind(value) {
  const clean = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return clean;
  WIND_TRIALS.forEach((_, stage) => {
    const v = value[stage],
      s = windLayout(stage);
    if (!v || !Array.isArray(v.values) || v.values.length !== s.values.length)
      return;
    if (
      !v.values.every(
        (mask, i) =>
          Number.isInteger(mask) &&
          [
            s.target[i],
            rotateWind(s.target[i]),
            rotateWind(rotateWind(s.target[i])),
            rotateWind(rotateWind(rotateWind(s.target[i]))),
          ].includes(mask) &&
          (!s.fixed.includes(i) || mask === s.target[i]),
      )
    )
      return;
    clean[stage] = {
      values: [...v.values],
      moves: Number.isInteger(v.moves)
        ? Math.max(0, Math.min(100000, v.moves))
        : 0,
      last:
        Number.isInteger(v.last) &&
        v.last >= 0 &&
        v.last < s.values.length &&
        !s.fixed.includes(v.last)
          ? v.last
          : null,
    };
  });
  return clean;
}
export function inWindCourt(map, x, z) {
  return map.features.some(
    (f) =>
      f.type === "mechanism" &&
      Math.abs(x - f.x * 7) < 12 &&
      z - f.z * 7 > 5 &&
      z - f.z * 7 < 23,
  );
}
