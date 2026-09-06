const triangle = [
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 2],
  [2, 0],
  [2, 1],
];
const circulation = [
  [0, 1],
  [1, 2],
  [2, 0],
];

// Authored measures introduce check valves before the final circulation lock.
export const HYDRAULIC_TRIALS = [
  {
    title: "The shore measure",
    capacity: [8, 5, 3],
    target: [4, 1, 3],
    links: triangle,
    positions: [
      [-9, 20],
      [0, 23],
      [9, 20],
    ],
    instruction:
      "All three cisterns share a return line. Measure the water that will lift the harbor float.",
  },
  {
    title: "The harbor balance",
    capacity: [10, 7, 3],
    target: [5, 2, 3],
    links: triangle,
    positions: [
      [-9, 23],
      [0, 20],
      [9, 23],
    ],
    instruction:
      "The harbor float requires half the supply in cistern I. Use the smaller chambers as measures.",
  },
  {
    title: "The coral pump",
    capacity: [12, 7, 5],
    target: [6, 1, 5],
    links: triangle,
    positions: [
      [-10, 20],
      [-1, 24],
      [8, 21],
    ],
    instruction:
      "Prime the restored pump with the engraved measure. The five-unit cistern must finish full.",
  },
  {
    title: "The tidekeeper’s return",
    capacity: [9, 5, 4],
    target: [3, 5, 1],
    links: triangle.filter(([a, b]) => a !== 2 || b !== 0),
    positions: [
      [-8, 21],
      [1, 24],
      [10, 20],
    ],
    instruction:
      "A check valve blocks III → I. Return water through cistern II to reproduce the low tide.",
  },
  {
    title: "The isolated intake",
    capacity: [14, 9, 5],
    target: [8, 1, 5],
    links: triangle.filter(([a, b]) => a !== 1 || b !== 0),
    positions: [
      [-10, 23],
      [0, 20],
      [9, 22],
    ],
    instruction:
      "The intake blocks II → I. Use cistern III as the return chamber while lowering the court.",
  },
  {
    title: "The arcade counterflow",
    capacity: [11, 7, 4],
    target: [3, 4, 4],
    links: triangle.filter(([a, b]) => a !== 2 || b !== 1),
    positions: [
      [-9, 20],
      [0, 24],
      [10, 22],
    ],
    instruction:
      "The arcade’s return valve blocks III → II. Route that water through cistern I.",
  },
  {
    title: "The queen’s circulation",
    capacity: [16, 9, 7],
    target: [2, 7, 7],
    links: [...circulation, [1, 0]],
    positions: [
      [-10, 21],
      [-1, 24],
      [9, 20],
    ],
    instruction:
      "Water circulates I → II → III → I. Only II → I also has a return valve.",
  },
  {
    title: "The pressure reserve",
    capacity: [13, 8, 5],
    target: [3, 5, 5],
    links: [...circulation, [0, 2]],
    positions: [
      [-9, 24],
      [0, 20],
      [10, 23],
    ],
    instruction:
      "Water circulates I → II → III → I. A bypass also carries I → III. Match every pressure mark.",
  },
  {
    title: "The abyssal lock",
    capacity: [17, 10, 7],
    target: [3, 7, 7],
    links: circulation,
    positions: [
      [-10, 20],
      [0, 24],
      [10, 20],
    ],
    instruction:
      "The final lock is a one-way circuit: I → II → III → I. Preserve all seventeen units and match the royal measure.",
  },
];
// Keep the pump walkways inside the narrowest island courts.
for (const trial of HYDRAULIC_TRIALS)
  trial.positions = trial.positions.map(([x, z]) => [x, z - 2.5]);
export const CISTERN_NAMES = ["I", "II", "III"];
export function transferWater(values, from, to, capacity = [8, 5, 3]) {
  const out = [...values];
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= out.length ||
    to >= out.length ||
    from === to
  )
    return out;
  const amount = Math.max(0, Math.min(out[from], capacity[to] - out[to]));
  out[from] -= amount;
  out[to] += amount;
  return out;
}
export function hydraulicStates(trial, start = [trial.capacity[0], 0, 0]) {
  const queue = [{ value: [...start], route: [] }],
    visited = new Set([start.join(",")]);
  for (let i = 0; i < queue.length; i++)
    for (const [from, to] of trial.links) {
      const value = transferWater(queue[i].value, from, to, trial.capacity),
        key = value.join(",");
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ value, route: [...queue[i].route, [from, to]] });
      }
    }
  return queue;
}
const reachable = HYDRAULIC_TRIALS.map((t) => hydraulicStates(t));
export function hydraulicLayout(stage) {
  const trial = HYDRAULIC_TRIALS[stage];
  if (!trial) throw new RangeError("Unknown hydraulic court");
  return {
    capacity: [...trial.capacity],
    target: [...trial.target],
    links: trial.links.map((l) => [...l]),
    values: [trial.capacity[0], 0, 0],
    selected: null,
    solution: reachable[stage]
      .find((s) => s.value.join(",") === trial.target.join(","))
      .route.map((r) => [...r]),
  };
}
export function normalizeHydraulics(saved) {
  const out = {};
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return out;
  for (let stage = 0; stage < HYDRAULIC_TRIALS.length; stage++) {
    const s = saved[String(stage)],
      trial = HYDRAULIC_TRIALS[stage];
    if (
      !Array.isArray(s?.values) ||
      s.values.length !== 3 ||
      !s.values.every(
        (v, i) => Number.isInteger(v) && v >= 0 && v <= trial.capacity[i],
      )
    )
      continue;
    if (
      !reachable[stage].some((v) => v.value.every((x, i) => x === s.values[i]))
    )
      continue;
    out[stage] = {
      values: [...s.values],
      moves: Number.isInteger(s.moves)
        ? Math.max(0, Math.min(100000, s.moves))
        : 0,
      selected:
        Number.isInteger(s.selected) &&
        s.selected >= 0 &&
        s.selected < 3 &&
        s.values[s.selected] > 0
          ? s.selected
          : null,
    };
  }
  return out;
}
export function hydraulicInput(state, index) {
  if (!Number.isInteger(index) || index < 0 || index > 2)
    return { kind: "invalid" };
  const from = state.selected;
  if (from === null) {
    if (state.values[index] === 0) return { kind: "empty", from: index };
    state.selected = index;
    return { kind: "selected", from: index };
  }
  if (from === index) {
    state.selected = null;
    return { kind: "cancelled", from };
  }
  if (!state.links.some(([a, b]) => a === from && b === index))
    return { kind: "blocked", from, to: index };
  if (state.values[index] === state.capacity[index])
    return { kind: "full", to: index };
  const values = transferWater(state.values, from, index, state.capacity),
    amount = state.values[from] - values[from];
  state.values = values;
  state.selected = null;
  state.moves++;
  return { kind: "transfer", from, to: index, amount };
}
export function hydraulicMessage(event) {
  const name = (i) => `cistern ${CISTERN_NAMES[i]}`;
  switch (event?.kind) {
    case "selected":
      return `${name(event.from)} selected. Choose its receiving cistern, or select it again to cancel.`;
    case "cancelled":
      return "Pump selection cleared. No water was moved.";
    case "empty":
      return `${name(event.from)} is empty. Choose a cistern that contains water.`;
    case "blocked":
      return `The check valve blocks ${CISTERN_NAMES[event.from]} → ${CISTERN_NAMES[event.to]}. Follow the engraved pipe arrows.`;
    case "full":
      return `${name(event.to)} is already full. Choose another receiving cistern.`;
    case "transfer":
      return `Pumping ${event.amount} units: ${CISTERN_NAMES[event.from]} → ${CISTERN_NAMES[event.to]}.`;
    default:
      return "Select a source cistern, then a receiver.";
  }
}
export function inHydraulicCourt(map, x, z) {
  return map.features.some(
    (f) =>
      f.type === "mechanism" &&
      Math.abs(x - f.x * 7) < 13.5 &&
      z > f.z * 7 + 15.5 &&
      z < f.z * 7 + 25.5,
  );
}
