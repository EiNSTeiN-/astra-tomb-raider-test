// Four carved signs form a cycle. Later covenants combine counts, shared signs
// and exclusions; the answer is deduced from the inscriptions, never random.
export const CIPHER_SIGNS = ["SUN", "ROOT", "RAIN", "MOON"];
export const cipherName = (i) => ["I", "II", "III", "IV", "V", "VI"][i];
const is = (at, value) => ({ kind: "is", at, value });
const shift = (at, from, by) => ({ kind: "shift", at, from, by });
const count = (value, total) => ({ kind: "count", value, total });
const distinct = (...at) => ({ kind: "distinct", at });
const exclude = (at, value) => ({ kind: "exclude", at, value });

export const CIPHER_TRIALS = [
  {
    title: "The keeper's first covenant",
    instruction:
      "Read the four signs around each drum. Follow the named cycle to open the outer sanctuary.",
    positions: [
      [-7, 12],
      [-2.4, 10],
      [2.4, 10],
      [7, 12],
    ],
    clues: [is(0, 0), shift(1, 0, 1), shift(2, 1, 1), shift(3, 2, 1)],
  },
  {
    title: "The rootbound promise",
    instruction:
      "Four keepers shared four different signs. Their remaining lines describe who followed whom.",
    positions: [
      [-6, 11],
      [6, 11],
      [-6, 18],
      [6, 18],
    ],
    clues: [distinct(0, 1, 2, 3), is(3, 1), shift(2, 1, -1), shift(0, 1, 2)],
  },
  {
    title: "The rainkeeper's census",
    instruction:
      "Two roots shelter the channel. Use the census together with the paired drums to recover the lost procession.",
    positions: [
      [-9, 13],
      [-4.5, 10],
      [0, 13],
      [4.5, 10],
      [9, 13],
    ],
    clues: [
      count(1, 2),
      is(0, 3),
      shift(3, 1, 0),
      shift(2, 1, 1),
      shift(4, 1, -1),
    ],
  },
  {
    title: "The reflected garden",
    instruction:
      "The garden repeats its rain sign twice. The surviving four-sign group makes the erased first line recoverable.",
    positions: [
      [-7, 10],
      [-7, 17],
      [0, 13],
      [7, 10],
      [7, 17],
    ],
    clues: [
      count(2, 2),
      shift(3, 0, 0),
      shift(1, 0, 1),
      shift(4, 2, 1),
      distinct(1, 2, 3, 4),
    ],
  },
  {
    title: "The eastern witnesses",
    instruction:
      "Two pairs remember sun and rain. A forbidden sign on the fourth witness breaks the symmetry.",
    positions: [
      [-9, 10],
      [-9, 17],
      [0, 10],
      [0, 17],
      [9, 10],
      [9, 17],
    ],
    clues: [
      shift(5, 0, 0),
      shift(4, 1, 0),
      count(0, 2),
      count(2, 2),
      distinct(0, 1, 2, 3),
      shift(2, 1, 1),
      shift(3, 0, 1),
      exclude(3, 3),
    ],
  },
  {
    title: "The moonlit procession",
    instruction:
      "Roots and moons each appear twice. Reconstruct the procession across the two banks without placing rain at its fourth drum.",
    positions: [
      [-9, 11],
      [-5, 15],
      [-9, 19],
      [9, 11],
      [5, 15],
      [9, 19],
    ],
    clues: [
      count(1, 2),
      count(3, 2),
      shift(2, 0, 0),
      shift(5, 1, 0),
      shift(3, 1, 1),
      shift(4, 3, 2),
      distinct(0, 1, 3, 4),
      exclude(3, 2),
    ],
  },
  {
    title: "The inner sanctuary's oath",
    instruction:
      "Read the matching ends and the opposed inner signs. The second keeper rejected rain, leaving only one complete oath.",
    positions: [
      [-9, 12],
      [-5, 9],
      [0, 12],
      [5, 9],
      [9, 12],
      [0, 19],
    ],
    clues: [
      shift(2, 0, 2),
      shift(5, 0, 0),
      shift(4, 1, 0),
      count(2, 2),
      count(1, 2),
      shift(3, 1, 2),
      distinct(0, 1, 2, 3),
      exclude(1, 2),
    ],
  },
  {
    title: "The heart's final covenant",
    instruction:
      "The last keeper left no starting sign. Combine the two repeated pairs, the census and the four different witnesses to unseal the heart.",
    positions: [
      [-8, 11],
      [0, 9],
      [8, 11],
      [8, 18],
      [0, 19],
      [-8, 18],
    ],
    clues: [
      shift(4, 0, 0),
      shift(5, 2, 0),
      count(3, 2),
      count(2, 2),
      shift(1, 0, 1),
      shift(3, 2, -1),
      distinct(0, 1, 2, 3),
    ],
  },
];

const cycle = (v) => ((v % 4) + 4) % 4;
export function cipherClueHolds(clue, values) {
  switch (clue.kind) {
    case "is":
      return values[clue.at] === clue.value;
    case "exclude":
      return values[clue.at] !== clue.value;
    case "shift":
      return values[clue.at] === cycle(values[clue.from] + clue.by);
    case "count":
      return values.filter((v) => v === clue.value).length === clue.total;
    case "distinct":
      return new Set(clue.at.map((i) => values[i])).size === clue.at.length;
    default:
      return false;
  }
}
export function cipherClue(clue) {
  const at = cipherName(clue.at);
  if (clue.kind === "is") return `${at} bears ${CIPHER_SIGNS[clue.value]}.`;
  if (clue.kind === "exclude")
    return `${at} never bears ${CIPHER_SIGNS[clue.value]}.`;
  if (clue.kind === "count")
    return `Exactly ${clue.total} drums bear ${CIPHER_SIGNS[clue.value]}.`;
  if (clue.kind === "distinct")
    return `${clue.at.map(cipherName).join(", ")} all bear different signs.`;
  if (clue.by === 0)
    return `${at} bears the same sign as ${cipherName(clue.from)}.`;
  return `${at} is ${Math.abs(clue.by)} ${Math.abs(clue.by) === 1 ? "step" : "steps"} ${clue.by > 0 ? "after" : "before"} ${cipherName(clue.from)} in the cycle.`;
}
export function cipherCandidates(trial) {
  const answers = [],
    size = trial.positions.length;
  for (let mask = 0; mask < 4 ** size; mask++) {
    const values = Array.from(
      { length: size },
      (_, i) => (mask >> (i * 2)) & 3,
    );
    if (trial.clues.every((c) => cipherClueHolds(c, values)))
      answers.push(values);
  }
  return answers;
}
const solutions = new Map();
export function cipherLayout(stage) {
  const trial = CIPHER_TRIALS[stage];
  if (!solutions.has(stage)) {
    const candidates = cipherCandidates(trial);
    if (candidates.length !== 1)
      throw Error(`Covenant ${stage} has ${candidates.length} solutions`);
    solutions.set(stage, candidates[0]);
  }
  return {
    target: [...solutions.get(stage)],
    values: trial.positions.map(() => 0),
    last: null,
  };
}
export function cipherInput(state, index, delta = 1) {
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
export function normalizeCipher(saved) {
  const result = {};
  if (!saved || typeof saved !== "object") return result;
  for (let stage = 0; stage < CIPHER_TRIALS.length; stage++) {
    const s = saved[stage],
      size = CIPHER_TRIALS[stage].positions.length;
    if (
      !Array.isArray(s?.values) ||
      s.values.length !== size ||
      !s.values.every((v) => Number.isInteger(v) && v >= 0 && v < 4)
    )
      continue;
    result[stage] = {
      values: [...s.values],
      moves: Number.isInteger(s.moves)
        ? Math.max(0, Math.min(100000, s.moves))
        : 0,
      last:
        Number.isInteger(s.last) && s.last >= 0 && s.last < size
          ? s.last
          : null,
    };
  }
  return result;
}
export function inCipherCourt(map, x, z, padding = 0) {
  return map.features.some(
    (f) =>
      f.type === "mechanism" &&
      Math.abs(x - f.x * 7) < 12 + padding &&
      z - f.z * 7 > 7 - padding &&
      z - f.z * 7 < 25 + padding,
  );
}
