// Authored spatial chambers. Coordinates are floor tiles; player movement around
// the board remains free. Only stone movement follows the carved tracks.
const stone = (id, name, weight, cell) => ({ id, name, weight, cell });
const socket = (name, cell, id) => ({ name, cells: [cell], stone: id });
const load = (name, cells, weight) => ({ name, cells, weight });
const clear = (name, cells) => ({ name, cells, weight: 0 });
export const COUNTERWEIGHTS = {
  verdant: {
    title: "The roots of the sun",
    inscription:
      "The sun rests beyond the broken spine. The root returns to the western spring. Match each carved stone to its named socket.",
    walls: [
      [2, 1],
      [2, 2],
      [2, 3],
    ],
    stones: [stone("A", "SUN", 1, [0, 3]), stone("B", "ROOT", 2, [4, 3])],
    goals: [socket("SUN", [4, 0], "A"), socket("ROOT", [0, 0], "B")],
  },
  sands: {
    title: "The weight of noon",
    inscription:
      "Dawn asks for three measures. Dusk asks for four. The marks cut into each stone show its weight; either tile of a receiver can bear the load.",
    walls: [
      [1, 2],
      [3, 2],
    ],
    stones: [
      stone("A", "I", 1, [0, 4]),
      stone("B", "II", 2, [2, 3]),
      stone("C", "IV", 4, [4, 4]),
    ],
    goals: [
      load(
        "DAWN · 3",
        [
          [0, 0],
          [1, 0],
        ],
        3,
      ),
      load(
        "DUSK · 4",
        [
          [3, 0],
          [4, 0],
        ],
        4,
      ),
    ],
  },
  frost: {
    title: "The silent bellkeepers",
    inscription:
      "The pilgrim carries the low bell around the eastern wall. Wind and star must exchange their places. Return each bell stone to the socket bearing its name.",
    walls: [
      [1, 1],
      [2, 1],
      [3, 3],
    ],
    stones: [
      stone("A", "BELL", 1, [0, 3]),
      stone("B", "WIND", 2, [4, 2]),
      stone("C", "STAR", 3, [2, 4]),
    ],
    goals: [
      socket("BELL", [4, 0], "A"),
      socket("WIND", [0, 0], "B"),
      socket("STAR", [2, 2], "C"),
    ],
  },
  tides: {
    title: "The harbor's balance",
    inscription:
      "Three measures hold the sea door. Two hold the river. Keep the central drain clear so the pressure can escape.",
    walls: [
      [1, 1],
      [3, 3],
    ],
    stones: [
      stone("A", "I", 1, [4, 4]),
      stone("B", "II", 2, [0, 4]),
      stone("C", "II", 2, [2, 2]),
    ],
    goals: [
      load(
        "SEA · 3",
        [
          [0, 0],
          [1, 0],
        ],
        3,
      ),
      load(
        "RIVER · 2",
        [
          [3, 0],
          [4, 0],
        ],
        2,
      ),
      clear("DRAIN · CLEAR", [
        [2, 1],
        [2, 2],
        [2, 3],
      ]),
    ],
  },
  embers: {
    title: "An iron promise",
    inscription:
      "Iron belongs at the furnace mouth. Ash and fire together weigh four measures on the cooling cradle. Leave the exhaust track empty.",
    walls: [
      [1, 2],
      [3, 1],
    ],
    stones: [
      stone("A", "IRON", 2, [0, 4]),
      stone("B", "ASH", 1, [4, 3]),
      stone("C", "FIRE", 3, [2, 2]),
    ],
    goals: [
      socket("IRON", [2, 0], "A"),
      load(
        "COOLING · 4",
        [
          [0, 1],
          [0, 2],
        ],
        4,
      ),
      clear("EXHAUST · CLEAR", [
        [3, 3],
        [3, 4],
      ]),
    ],
  },
  sky: {
    title: "The two wings",
    inscription:
      "Neither wing may carry more than the other. Place three measures on each receiver, then clear the central crossing. Heavy stones can be pulled as well as pushed.",
    walls: [
      [1, 1],
      [3, 1],
      [1, 3],
      [3, 3],
    ],
    stones: [
      stone("A", "I", 1, [0, 4]),
      stone("B", "II", 2, [4, 4]),
      stone("C", "III", 3, [2, 2]),
    ],
    goals: [
      load(
        "WEST · 3",
        [
          [0, 0],
          [0, 1],
        ],
        3,
      ),
      load(
        "EAST · 3",
        [
          [4, 0],
          [4, 1],
        ],
        3,
      ),
      clear("CROSSING · CLEAR", [
        [2, 1],
        [2, 2],
        [2, 3],
      ]),
    ],
  },
  crystal: {
    title: "The answer in the stone",
    inscription:
      "The deep voice answers on the western side. The high voice answers in the east. The middle voice belongs between them. Match the names; listen as each socket awakens.",
    walls: [
      [2, 1],
      [1, 3],
      [3, 3],
    ],
    stones: [
      stone("A", "LOW", 1, [4, 4]),
      stone("B", "MID", 2, [0, 4]),
      stone("C", "HIGH", 3, [2, 2]),
    ],
    goals: [
      socket("LOW", [0, 0], "A"),
      socket("MID", [2, 0], "B"),
      socket("HIGH", [4, 0], "C"),
    ],
  },
  eclipse: {
    title: "A measure of the world",
    inscription:
      "The sun returns to the meridian. Moon and earth share five measures on the western scales. The path of the traveler remains empty.",
    walls: [
      [1, 1],
      [3, 1],
      [3, 3],
    ],
    stones: [
      stone("A", "SUN", 1, [0, 4]),
      stone("B", "MOON", 2, [4, 4]),
      stone("C", "EARTH", 3, [2, 3]),
    ],
    goals: [
      socket("SUN", [4, 0], "A"),
      load(
        "WORLD · 5",
        [
          [0, 0],
          [0, 1],
        ],
        5,
      ),
      clear("PATH · CLEAR", [
        [2, 1],
        [2, 2],
      ]),
    ],
  },
};
export const TILE = 1.6;
export const sameCell = (a, b) => a[0] === b[0] && a[1] === b[1];
export const initialStones = (trial) =>
  trial.stones.map((stone) => [...stone.cell]);
export function freeCell(trial, positions, cell, player = false) {
  const [x, z] = cell,
    edge = player ? 1 : 0;
  return (
    x >= -edge &&
    z >= -edge &&
    x <= 4 + edge &&
    z <= 4 + edge &&
    !trial.walls.some((wall) => sameCell(wall, cell)) &&
    !positions.some((p) => sameCell(p, cell))
  );
}
export function pressureState(trial, positions) {
  return trial.goals.map((goal) => {
    const occupants = trial.stones.filter((stone, i) =>
      goal.cells.some((cell) => sameCell(cell, positions[i])),
    );
    const weight = occupants.reduce((total, stone) => total + stone.weight, 0);
    return {
      ...goal,
      value: weight,
      active: goal.stone
        ? occupants.some((stone) => stone.id === goal.stone)
        : weight === goal.weight,
    };
  });
}
export const weightsSolved = (trial, positions) =>
  pressureState(trial, positions).every((goal) => goal.active);
export function stoneMove(trial, positions, index, axis, pull = false) {
  if (
    index < 0 ||
    index >= positions.length ||
    Math.abs(axis[0]) + Math.abs(axis[1]) !== 1
  )
    return null;
  const from = positions[index],
    sign = pull ? -1 : 1;
  const to = [from[0] + axis[0] * sign, from[1] + axis[1] * sign];
  const grip = [from[0] - axis[0], from[1] - axis[1]];
  const retreat = [from[0] - axis[0] * 2, from[1] - axis[1] * 2];
  if (
    !freeCell(trial, positions, grip, true) ||
    !freeCell(trial, positions, to) ||
    (pull && !freeCell(trial, positions, retreat, true))
  )
    return null;
  return { from: [...from], to, grip, player: pull ? retreat : [...from] };
}
export function normalizeWeights(id, value) {
  const trial = COUNTERWEIGHTS[id];
  if (!trial) return null;
  const valid =
    Array.isArray(value?.positions) &&
    value.positions.length === trial.stones.length &&
    value.positions.every(
      (cell) =>
        Array.isArray(cell) &&
        cell.length === 2 &&
        cell.every(Number.isInteger),
    ) &&
    value.positions.every((cell, i) =>
      freeCell(
        trial,
        value.positions.filter((_, j) => j !== i),
        cell,
      ),
    );
  const positions = valid
    ? value.positions.map((cell) => [...cell])
    : initialStones(trial);
  return {
    positions,
    solved: valid && weightsSolved(trial, positions),
    moves:
      valid && Number.isFinite(value.moves)
        ? Math.max(0, Math.floor(value.moves))
        : 0,
  };
}
