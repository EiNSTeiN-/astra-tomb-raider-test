import test from "node:test";
import assert from "node:assert/strict";
import {
  fillHeightfieldBasins,
  fillBodyPockets,
} from "../src/jungle-rim-drainage.js";
import { createTerrainSurfaceSampler } from "../src/terrain-surface.js";
import { terrainBodyClear } from "../src/terrain-body-clearance.js";
function grid() {
  const width = 7,
    heights = new Float32Array(49).fill(2),
    editable = new Uint8Array(49);
  for (let z = 1; z < 6; z++)
    for (let x = 1; x < 6; x++) editable[z * 7 + x] = 1;
  return { width, heights, editable };
}
test("enclosed soil pockets fill to their spill while protected ground stays exact", () => {
  const { width, heights, editable } = grid();
  heights[24] = 0;
  const before = heights.slice();
  const r = fillHeightfieldBasins(heights, width, editable);
  assert.equal(heights[24], 2);
  assert.equal(r.raised, 1);
  assert.equal(r.maxFill, 2);
  for (let i = 0; i < heights.length; i++)
    if (!editable[i]) assert.equal(heights[i], before[i]);
  const fixed = grid();
  fixed.heights[24] = 0;
  fixed.editable[24] = 0;
  fixed.heights[23] = 0;
  fillHeightfieldBasins(fixed.heights, 7, fixed.editable);
  assert.equal(fixed.heights[24], 0);
  assert.equal(fixed.heights[23], 0);
});
test("drainage respects the actual terrain diagonal instead of crossing its ridge", () => {
  const a = grid();
  a.heights[2 * 7 + 2] = 0;
  for (let z = 3; z < 7; z++) a.heights[z * 7 + 3] = 0;
  fillHeightfieldBasins(a.heights, 7, a.editable);
  assert.equal(
    a.heights[2 * 7 + 2],
    2,
    "NW/SE is not an edge in the delivered mesh",
  );
  assert.equal(a.heights[3 * 7 + 3], 0);
  const b = grid();
  b.heights[2 * 7 + 3] = 0;
  for (let z = 3; z < 7; z++) b.heights[z * 7 + 2] = 0;
  fillHeightfieldBasins(b.heights, 7, b.editable);
  assert.equal(
    b.heights[2 * 7 + 3],
    0,
    "NE/SW retains the real diagonal outlet",
  );
});
test("open slopes and channels retain all their heights", () => {
  const { heights, editable } = grid();
  for (let z = 0; z < 7; z++)
    for (let x = 0; x < 7; x++) heights[z * 7 + x] = x + z;
  const before = heights.slice();
  assert.equal(fillHeightfieldBasins(heights, 7, editable).raised, 0);
  assert.deepEqual(heights, before);
});

test("body-sized troughs receive a real floor while open steep faces retain their geometry", () => {
  const { heights, editable } = grid(),
    step = 1.75;
  for (let z = 0; z < 7; z++)
    for (let x = 0; x < 7; x++)
      heights[z * 7 + x] = Math.abs(x - 3) * 6 + z * 0.1;
  const read = () =>
    createTerrainSurfaceSampler({
      width: 7,
      step,
      height: (x, z) =>
        heights[Math.round(z / step) * 7 + Math.round(x / step)],
    });
  let ground = read();
  assert(
    !terrainBodyClear(
      { groundHeight: ground },
      3 * step,
      ground(3 * step, 3 * step),
      3 * step,
    ),
  );
  const before = heights.slice(),
    r = fillBodyPockets(heights, 7, step, editable);
  assert(r.raised > 0);
  ground = read();
  assert(
    terrainBodyClear(
      { groundHeight: ground },
      3 * step,
      ground(3 * step, 3 * step),
      3 * step,
    ),
  );
  for (let i = 0; i < heights.length; i++)
    if (!editable[i]) assert.equal(heights[i], before[i]);
  const slope = grid();
  for (let z = 0; z < 7; z++)
    for (let x = 0; x < 7; x++) slope.heights[z * 7 + x] = x * 6 + z * 0.1;
  const original = slope.heights.slice();
  assert.equal(
    fillBodyPockets(slope.heights, 7, step, slope.editable).raised,
    0,
  );
  assert.deepEqual(slope.heights, original);
});
