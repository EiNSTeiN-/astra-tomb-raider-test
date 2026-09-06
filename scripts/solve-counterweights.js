import {
  freeCell,
  initialStones,
  stoneMove,
  weightsSolved,
} from "../src/counterweight-rules.js";
const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const key = (cell) => cell.join(",");
export function reachableFloor(trial, positions, start) {
  const queue = [start],
    parents = new Map([[key(start), null]]);
  for (let head = 0; head < queue.length; head++)
    for (const axis of directions) {
      const next = [queue[head][0] + axis[0], queue[head][1] + axis[1]];
      if (!parents.has(key(next)) && freeCell(trial, positions, next, true)) {
        parents.set(key(next), queue[head]);
        queue.push(next);
      }
    }
  return parents;
}
export function solveCounterweights(
  trial,
  initial = initialStones(trial),
  player = [2, 5],
  limit = 150000,
) {
  const receiverCells = [
    ...new Map(
      trial.goals
        .filter((goal) => goal.weight !== 0)
        .flatMap((goal) => goal.cells)
        .map((cell) => [key(cell), cell]),
    ).values(),
  ];
  const targets = [];
  const assign = (positions) => {
    if (positions.length === trial.stones.length) {
      if (weightsSolved(trial, positions)) targets.push(positions);
      return;
    }
    for (const cell of receiverCells)
      if (!positions.some((p) => key(p) === key(cell)))
        assign([...positions, cell]);
  };
  assign([]);
  const estimate = (positions) =>
    Math.min(
      ...targets.map((target) =>
        positions.reduce(
          (sum, cell, i) =>
            sum +
            Math.abs(cell[0] - target[i][0]) +
            Math.abs(cell[1] - target[i][1]),
          0,
        ),
      ),
    );
  const nodes = [
      {
        positions: initial,
        player,
        parent: -1,
        action: null,
        cost: 0,
        score: estimate(initial),
      },
    ],
    open = [0],
    seen = new Set();
  for (let expanded = 0; open.length && expanded < limit; expanded++) {
    open.sort(
      (a, b) =>
        nodes[b].score - nodes[a].score || nodes[a].cost - nodes[b].cost,
    );
    const head = open.pop(),
      node = nodes[head];
    if (weightsSolved(trial, node.positions)) {
      const path = [];
      let current = node;
      while (current.action) {
        path.push(current.action);
        current = nodes[current.parent];
      }
      return { path: path.reverse(), positions: node.positions, expanded };
    }
    const reachable = reachableFloor(trial, node.positions, node.player);
    const state =
      node.positions.map(key).join(";") + "/" + [...reachable.keys()].sort()[0];
    if (seen.has(state)) continue;
    seen.add(state);
    for (let index = 0; index < node.positions.length; index++)
      for (const axis of directions)
        for (const pull of [false, true]) {
          const move = stoneMove(trial, node.positions, index, axis, pull);
          if (!move || !reachable.has(key(move.grip))) continue;
          const positions = node.positions.map((cell) => [...cell]);
          positions[index] = move.to;
          const walking = [];
          let current = move.grip;
          while (current) {
            walking.push(current);
            current = reachable.get(key(current));
          }
          const cost = node.cost + 1;
          open.push(nodes.length);
          nodes.push({
            positions,
            player: move.player,
            parent: head,
            cost,
            score: cost + estimate(positions),
            action: { index, axis, pull, walking: walking.reverse(), ...move },
          });
        }
  }
  return null;
}
