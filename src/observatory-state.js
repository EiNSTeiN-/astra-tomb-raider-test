import { createPuzzle } from "./puzzles.js";

export function normalizeAlignments(value) {
  const out = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [stage, record] of Object.entries(value)) {
    if (
      !/^[0-9]$/.test(stage) ||
      !record ||
      !Array.isArray(record.values) ||
      record.values.length !== 3 ||
      !record.values.every((v) => Number.isInteger(v) && v >= 0 && v < 8)
    )
      continue;
    out[stage] = {
      values: [...record.values],
      moves: Number.isInteger(record.moves)
        ? Math.max(0, Math.min(100000, record.moves))
        : 0,
    };
  }
  return out;
}

export function observatoryState(level, progress, room) {
  const stage = Math.max(0, room - 1),
    puzzle = createPuzzle(level, stage);
  const complete = progress.completed || progress.stage > stage;
  const restored = complete
    ? 1
    : [0, 1, 2].filter((step) =>
        progress.field?.includes(`field-${stage}-${step}`),
      ).length / 3;
  const record = normalizeAlignments(progress.alignments)[stage];
  return {
    stage,
    target: puzzle.target,
    values: complete ? [...puzzle.target] : record?.values || [0, 0, 0],
    complete,
    restored,
    aperture: stage === 2 ? restored : 0.06 + restored * 0.88,
    glow: 0.18 + restored * 0.5 + Number(complete) * 0.32,
  };
}
