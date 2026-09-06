// A valve reverses the shutters on its marked circuit. Heat is a binary state;
// the target can require lit chambers as well as cold ones.
export const THERMAL_TRIALS = [
  {
    title: "The cold-air manifold",
    columns: 3,
    rows: 3,
    circuit: "cross",
    target: ["000", "000", "000"],
    presses: [0, 1, 3, 5, 6],
    instruction:
      "Cool every chamber. A valve changes its own shutter and its immediate horizontal and vertical neighbors.",
  },
  {
    title: "The ignition galleries",
    columns: 4,
    rows: 3,
    circuit: "row",
    target: ["1111", "0000", "1111"],
    presses: [0, 1, 2, 3, 4, 5],
    instruction:
      "Light the upper and lower galleries while keeping the center cool. Each valve changes its row and the chamber directly below it.",
  },
  {
    title: "The diagonal relief",
    columns: 3,
    rows: 3,
    circuit: "diagonal",
    target: ["010", "000", "010"],
    presses: [0, 1, 2, 4, 6, 8],
    instruction:
      "Keep two pressure pilots lit. A valve changes its own chamber and its diagonal neighbors.",
  },
  {
    title: "The gear jacket",
    columns: 4,
    rows: 3,
    circuit: "elbow",
    target: ["1001", "0110", "1001"],
    presses: [0, 1, 3, 5, 7, 8, 10],
    instruction:
      "Match the alternating jacket around the gears. A valve changes its own chamber, the chamber to its right, and the chamber above it.",
  },
  {
    title: "The smelting feeds",
    columns: 3,
    rows: 4,
    circuit: "column",
    target: ["101", "101", "101", "101"],
    presses: [0, 1, 3, 4, 6, 9],
    instruction:
      "Heat the outside feeds and leave the central return cold. A valve changes its column and the chamber immediately to its right.",
  },
  {
    title: "The eternal pilot",
    columns: 4,
    rows: 4,
    circuit: "diagonal",
    target: ["0000", "0110", "0110", "0000"],
    presses: [0, 1, 2, 3, 4, 5, 6, 7],
    instruction:
      "Hold four central pilot flames inside a cold perimeter. Each valve changes its own shutter and its diagonal neighbors.",
  },
  {
    title: "The tempering cradle",
    columns: 4,
    rows: 4,
    circuit: "elbow",
    target: ["1001", "0110", "0110", "1001"],
    presses: [0, 1, 3, 4, 6, 8, 9, 11, 13, 15],
    instruction:
      "Match the key cradle’s heat pattern. Each valve changes itself, the chamber to its right, and the chamber above it.",
  },
  {
    title: "The heart-engine balance",
    columns: 4,
    rows: 4,
    circuit: "offset",
    target: ["1010", "0101", "1010", "0101"],
    presses: [0, 1, 2, 4, 5, 7, 9, 10, 12, 14, 15],
    instruction:
      "Alternate the engine’s firing and cooling chambers. A valve changes itself, its neighbor below, and the chamber two places to its right.",
  },
];
export const thermalCount = (trial) => trial.columns * trial.rows;
const bits = (value) => {
  const result = [];
  for (let i = 0; i < 16; i++) if (value & (1 << i)) result.push(i);
  return result;
};
export function thermalEffects(trial) {
  const { columns, rows, circuit } = trial;
  return Array.from({ length: thermalCount(trial) }, (_, index) => {
    const x = index % columns,
      y = Math.floor(index / columns);
    const offsets =
      circuit === "cross"
        ? [
            [0, 0],
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ]
        : circuit === "diagonal"
          ? [
              [0, 0],
              [-1, -1],
              [1, -1],
              [-1, 1],
              [1, 1],
            ]
          : circuit === "elbow"
            ? [
                [0, 0],
                [1, 0],
                [0, -1],
              ]
            : circuit === "offset"
              ? [
                  [0, 0],
                  [0, 1],
                  [2, 0],
                ]
              : circuit === "row"
                ? Array.from({ length: columns }, (_, i) => [i - x, 0]).concat([
                    [0, 1],
                  ])
                : Array.from({ length: rows }, (_, i) => [0, i - y]).concat([
                    [1, 0],
                  ]);
    let mask = 0;
    for (const [dx, dy] of offsets) {
      const px = x + dx,
        py = y + dy;
      if (px >= 0 && px < columns && py >= 0 && py < rows)
        mask |= 1 << (py * columns + px);
    }
    return mask;
  });
}
const memo = new Map();
export function thermalSolutions(trial) {
  if (memo.has(trial)) return memo.get(trial);
  const effects = thermalEffects(trial),
    n = 1 << effects.length;
  const masks = new Uint16Array(n),
    counts = new Uint8Array(n),
    best = new Map([[0, 0]]);
  for (let press = 1; press < n; press++) {
    const previous = press & (press - 1),
      index = 31 - Math.clz32(press ^ previous);
    masks[press] = masks[previous] ^ effects[index];
    counts[press] = counts[previous] + 1;
    const old = best.get(masks[press]);
    if (old === undefined || counts[press] < counts[old])
      best.set(masks[press], press);
  }
  memo.set(trial, best);
  return best;
}
export function thermalTarget(trial) {
  return trial.target
    .join("")
    .split("")
    .reduce((mask, value, i) => mask | (value === "1" ? 1 << i : 0), 0);
}
export function thermalSolution(stage, mask) {
  const trial = THERMAL_TRIALS[stage],
    pressed = thermalSolutions(trial).get(mask ^ thermalTarget(trial));
  return pressed === undefined ? null : bits(pressed);
}
export function thermalLayout(stage) {
  const trial = THERMAL_TRIALS[stage],
    effects = thermalEffects(trial),
    targetMask = thermalTarget(trial);
  const mask = trial.presses.reduce((m, i) => m ^ effects[i], targetMask);
  return {
    columns: trial.columns,
    rows: trial.rows,
    effects,
    targetMask,
    mask,
    last: null,
    solution: thermalSolution(stage, mask),
  };
}
export function thermalInput(state, index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.effects.length)
    return { kind: "invalid" };
  state.mask ^= state.effects[index];
  state.moves++;
  state.last = index;
  state.solution = thermalSolution(state.stage, state.mask);
  return { kind: "changed", index, affected: bits(state.effects[index]) };
}
export function normalizeThermal(saved) {
  const result = {};
  if (!saved || typeof saved !== "object" || Array.isArray(saved))
    return result;
  for (let stage = 0; stage < THERMAL_TRIALS.length; stage++) {
    const value = saved[stage],
      count = thermalCount(THERMAL_TRIALS[stage]);
    if (
      !Number.isInteger(value?.mask) ||
      value.mask < 0 ||
      value.mask >= 1 << count ||
      thermalSolution(stage, value.mask) === null
    )
      continue;
    result[stage] = {
      mask: value.mask,
      moves: Number.isInteger(value.moves)
        ? Math.max(0, Math.min(100000, value.moves))
        : 0,
      last:
        Number.isInteger(value.last) && value.last >= 0 && value.last < count
          ? value.last
          : null,
    };
  }
  return result;
}
export function thermalPosition(trial, index) {
  return {
    x: 4 + (index % trial.columns) * 3.8,
    z: 8.5 + Math.floor(index / trial.columns) * 3.8,
  };
}
export function inThermalCourt(map, x, z) {
  return map.features.some(
    (f) =>
      f.type === "mechanism" &&
      x - f.x * 7 > 1 &&
      x - f.x * 7 < 18 &&
      z - f.z * 7 > 6 &&
      z - f.z * 7 < 24,
  );
}
