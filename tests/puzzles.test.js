import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS } from "../src/campaign.js";
import {
  createPuzzle,
  applyMove,
  isSolved,
  pour,
  beamPath,
  hint,
  toggleLights,
} from "../src/puzzles.js";

for (const level of LEVELS)
  test(`${level.title}: all ${level.mechanisms} mechanisms have a playable solution`, () => {
    for (let stage = 0; stage < level.mechanisms; stage++) {
      const s = createPuzzle(level, stage);
      assert.deepEqual(
        s,
        createPuzzle(level, stage),
        "puzzles must survive reload deterministically",
      );
      assert.ok(!isSolved(s), `stage ${stage} starts solved`);
      assert.equal(typeof hint(s, level), "string");
      if (["cipher", "mirrors", "resonance"].includes(s.type)) {
        for (let i = 0; i < s.values.length; i++) {
          let moves = 0;
          while (s.values[i] !== s.target[i]) {
            applyMove(s, { index: i });
            assert.ok(moves++ < 12);
          }
        }
      } else if (s.type === "echo")
        s.target.forEach((index) => applyMove(s, { index }));
      else if (s.type === "sluices") {
        for (const [from, to] of s.solution) {
          applyMove(s, { index: from });
          applyMove(s, { index: to });
          assert.equal(
            s.values.reduce((a, b) => a + b),
            s.capacity[0],
            "water must be conserved",
          );
        }
      } else if (s.type === "forge") {
        const plan = [...s.solution];
        for (const index of plan) applyMove(s, { index });
      } else if (s.type === "bridges") {
        for (let i = 0; i < s.values.length; i++) {
          let n = 0;
          while (s.values[i] !== s.target[i]) {
            applyMove(s, { index: i });
            assert.ok(n++ < 4);
          }
        }
      } else if (s.type === "orrery")
        s.solution.forEach((n, index) => {
          for (let i = 0; i < n; i++) applyMove(s, { index });
        });
      assert.ok(isSolved(s), `${s.type} stage ${stage} solution failed`);
    }
  });
test("water cannot overflow, disappear, or pour into the same vessel", () => {
  assert.deepEqual(pour([8, 0, 0], 0, 1), [3, 5, 0]);
  assert.deepEqual(pour([3, 5, 0], 1, 2), [3, 2, 3]);
  assert.deepEqual(pour([3, 2, 3], 0, 2), [3, 2, 3]);
  assert.deepEqual(pour([3, 2, 3], 1, 1), [3, 2, 3]);
});
test("a furnace press is reversible and does not wrap at row edges", () => {
  assert.equal(toggleLights(toggleLights(0, 0), 0), 0);
  assert.equal(toggleLights(0, 3), (1 << 3) | (1 << 2) | (1 << 7));
});
test("mirror ray terminates when misdirected", () => {
  const s = createPuzzle(LEVELS[1], 0);
  const p = beamPath(s);
  assert.ok(p.points.length <= 51);
  assert.equal(p.hit, false);
});
