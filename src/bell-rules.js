export const BELL_FREQUENCIES = [261.63, 329.63, 392, 523.25];
export const BELL_INTERVAL = 1.1;
export const BELL_LEAD = 0.25;
// Composed phrases use every bell and recognizable intervals. The stair lesson
// repeats paired notes; the others avoid runs that hide the ordering challenge.
export const BELL_PHRASES = [
  [0, 1, 2, 3, 2],
  [0, 2, 1, 3, 2, 0],
  [0, 1, 0, 2, 1, 3, 2],
  [0, 0, 1, 1, 2, 2, 3, 2],
  [2, 0, 3, 1, 2],
  [3, 1, 2, 0, 1, 3],
  [0, 2, 3, 1, 2, 0, 3],
  [0, 1, 3, 2, 0, 2, 1, 3],
];

export const BELL_LESSONS = [
  {
    mode: "repeat",
    title: "The pilgrim's greeting",
    instruction: "Answer the bells in the order you hear them.",
  },
  {
    mode: "reverse",
    title: "The valley's answer",
    instruction:
      "The valley returns an echo. Answer the phrase in reverse order.",
  },
  {
    mode: "rise",
    title: "The ascending prayer",
    instruction:
      "Answer in the same order, advancing each sign once: WIND → BELL → ICE → STAR → WIND.",
  },
  {
    mode: "repeat",
    title: "The frozen stair",
    instruction:
      "Keep the stair's rhythm. Answer the bells in the order you hear them.",
  },
  {
    mode: "reverse",
    title: "The remembered names",
    instruction:
      "Return through the names. Answer the phrase in reverse order.",
  },
  {
    mode: "fall",
    title: "The sheltered voice",
    instruction:
      "Answer in the same order, stepping each sign back once: WIND → STAR → ICE → BELL → WIND.",
  },
  {
    mode: "rise",
    title: "The summit signal",
    instruction:
      "Raise the summit's answer. Advance each sign once: WIND → BELL → ICE → STAR → WIND.",
  },
  {
    mode: "reverse",
    title: "The final promise",
    instruction:
      "The library remembers the way back. Answer the whole phrase in reverse order.",
  },
];

export function bellAnswer(cue, stage) {
  const mode = BELL_LESSONS[stage]?.mode;
  if (mode === "reverse") return [...cue].reverse();
  return cue.map(
    (n) => (n + (mode === "rise" ? 1 : mode === "fall" ? 3 : 0)) % 4,
  );
}

export function bellCue(target, stage) {
  const mode = BELL_LESSONS[stage]?.mode;
  if (mode === "reverse") return [...target].reverse();
  return target.map(
    (n) => (n + (mode === "rise" ? 3 : mode === "fall" ? 1 : 0)) % 4,
  );
}

export function normalizeBells(record) {
  const out = {};
  if (!record || typeof record !== "object" || Array.isArray(record))
    return out;
  for (const [key, state] of Object.entries(record)) {
    if (
      !/^[0-7]$/.test(key) ||
      !state ||
      !Array.isArray(state.values) ||
      state.values.length > 5 + (Number(key) % 4) ||
      !state.values.every((n) => Number.isInteger(n) && n >= 0 && n < 4)
    )
      continue;
    out[key] = {
      values: [...state.values],
      moves: Number.isInteger(state.moves)
        ? Math.max(0, Math.min(100000, state.moves))
        : 0,
      heard: state.heard === true,
    };
  }
  return out;
}
