// Twelve collar marks form a cycle. Inscriptions describe relations between
// named stones; paired tones and converging wave rings offer a second route.
export const RESONANCE_TRIALS = [
  {
    title: "The three guide lights",
    instruction:
      "Wake the three guide lights in unison. A names the first voice; B and C repeat it.",
    clues: [{ value: 3 }, { from: 0, shift: 0 }, { from: 1, shift: 0 }],
    positions: [
      [-4, 13],
      [0, 11],
      [4, 13],
    ],
    memory:
      "She left three lights at the entrance. A promise that she would find her way back.",
  },
  {
    title: "The descending echo",
    instruction:
      "The echo falls through the chamber. Count backward around the twelve marks from one stone to the next.",
    clues: [{ value: 7 }, { from: 0, shift: -2 }, { from: 1, shift: -5 }],
    positions: [
      [-7, 12],
      [0, 10],
      [7, 12],
    ],
    memory:
      "The lower gallery answered in her voice, one breath later than it should have.",
  },
  {
    title: "The mirrored archive",
    instruction:
      "The two banks face one another. Opposite marks add to twelve; the archive names the first mark on each bank.",
    clues: [
      { value: 2 },
      { value: 7 },
      { from: 0, mirror: 12 },
      { from: 1, mirror: 12 },
    ],
    positions: [
      [-6, 11],
      [-6, 18],
      [6, 11],
      [6, 18],
    ],
    memory:
      "These are not books. Every facet holds the reflection of someone who stood here.",
  },
  {
    title: "The ascending chamber",
    instruction:
      "Carry the voice upward in equal steps. Each stone stands three marks beyond the preceding stone.",
    clues: [
      { value: 1 },
      { from: 0, shift: 3 },
      { from: 1, shift: 3 },
      { from: 2, shift: 3 },
    ],
    positions: [
      [-8, 11],
      [-3, 14],
      [3, 17],
      [8, 20],
    ],
    memory:
      "She sang to keep count of the steps. The chamber learned the song.",
  },
  {
    title: "The violet counterpoint",
    instruction:
      "The left and right arms answer the central pair. Follow each named relation, wrapping past eleven to zero.",
    clues: [
      { value: 8 },
      { from: 0, shift: 7 },
      { from: 0, mirror: 12 },
      { from: 1, shift: 6 },
    ],
    positions: [
      [0, 10],
      [-7, 15],
      [7, 15],
      [0, 20],
    ],
    memory:
      "Two expedition voices. One remained in the stone after its owner had gone.",
  },
  {
    title: "The broken conversation",
    instruction:
      "Rejoin the five fragments from A through E. Their missing intervals are engraved beside the tuning collars.",
    clues: [
      { value: 10 },
      { from: 0, shift: 3 },
      { from: 1, shift: 4 },
      { from: 2, shift: 3 },
      { from: 3, shift: 4 },
    ],
    positions: [
      [-10, 17],
      [-6, 12],
      [0, 10],
      [6, 12],
      [10, 17],
    ],
    memory:
      "'If you hear this, Vesper, the compass was right. Please do not follow it alone.'",
  },
  {
    title: "The heart's two voices",
    instruction:
      "Match the paired voices on each bank. The heart stone answers the upper bank five marks higher.",
    clues: [
      { value: 4 },
      { from: 0, shift: 0 },
      { from: 0, shift: 5 },
      { from: 2, shift: 0 },
      { from: 2, shift: 5 },
    ],
    positions: [
      [-8, 11],
      [-8, 18],
      [8, 11],
      [8, 18],
      [0, 21],
    ],
    memory:
      "The heart has been beating in two rhythms. One belongs to the mountain.",
  },
  {
    title: "The prism's remembered path",
    instruction:
      "Trace the remembered path around the spiral. The third stone reflects B; the last stone joins its voice to the first.",
    clues: [
      { value: 3 },
      { from: 0, shift: 4 },
      { from: 1, mirror: 17 },
      { from: 2, shift: -6 },
      { from: 0, mirror: 4 },
    ],
    positions: [
      [-8, 11],
      [2, 10],
      [9, 15],
      [3, 21],
      [-6, 18],
    ],
    memory:
      "The final reflection turns toward you. She is older than the woman in your photograph. She is alive.",
  },
];
export const resonanceName = (index) => String.fromCharCode(65 + index);
export const resonanceFrequency = (value) => 196 + value * 2;
const cycle = (value) => ((value % 12) + 12) % 12;
export function resonanceTargets(trial) {
  const values = [];
  for (const c of trial.clues)
    values.push(
      c.value ??
        cycle(
          c.mirror !== undefined
            ? c.mirror - values[c.from]
            : values[c.from] + c.shift,
        ),
    );
  return values;
}
export function resonanceClue(trial, index) {
  const c = trial.clues[index],
    name = resonanceName(index);
  if (c.value !== undefined) return `${name} = ${c.value}`;
  if (c.mirror !== undefined)
    return `${resonanceName(c.from)} + ${name} = ${c.mirror}`;
  return `${name} = ${resonanceName(c.from)}${c.shift ? ` ${c.shift < 0 ? "−" : "+"} ${Math.abs(c.shift)}` : ""}`;
}
export function resonanceLayout(stage) {
  const trial = RESONANCE_TRIALS[stage];
  return {
    target: resonanceTargets(trial),
    values: trial.clues.map(() => 0),
    last: null,
  };
}
export function resonanceInput(state, index, delta = 1) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= state.values.length ||
    ![1, -1].includes(delta)
  )
    return { kind: "invalid" };
  state.values[index] = cycle(state.values[index] + delta);
  state.moves++;
  state.last = index;
  return { kind: "changed", index, delta };
}
export function resonanceSolution(state) {
  return state.values.flatMap((v, index) => {
    const up = cycle(state.target[index] - v),
      delta = up <= 6 ? 1 : -1;
    return Array.from({ length: Math.min(up, 12 - up) }, () => ({
      index,
      delta,
    }));
  });
}
export function normalizeResonance(saved) {
  const result = {};
  if (!saved || typeof saved !== "object") return result;
  for (let stage = 0; stage < RESONANCE_TRIALS.length; stage++) {
    const s = saved[stage],
      count = RESONANCE_TRIALS[stage].clues.length;
    if (
      !Array.isArray(s?.values) ||
      s.values.length !== count ||
      !s.values.every((v) => Number.isInteger(v) && v >= 0 && v < 12)
    )
      continue;
    result[stage] = {
      values: [...s.values],
      moves: Number.isInteger(s.moves)
        ? Math.max(0, Math.min(100000, s.moves))
        : 0,
      last:
        Number.isInteger(s.last) && s.last >= 0 && s.last < count
          ? s.last
          : null,
    };
  }
  return result;
}
export function inResonanceCourt(map, x, z, padding = 0) {
  return map.features.some(
    (f) =>
      f.type === "mechanism" &&
      x - f.x * 7 > -12 - padding &&
      x - f.x * 7 < 12 + padding &&
      z - f.z * 7 > 9 - padding &&
      z - f.z * 7 < 23 + padding,
  );
}
