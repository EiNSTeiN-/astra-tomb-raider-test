import test from "node:test";
import assert from "node:assert/strict";
import { planJungleTreeCaps } from "../src/jungle-tree-caps.js";

const map = { size: 61, grid: [], features: [] },
  anchor = { x: 31, z: 80, rotation: Math.PI, scale: 1, variant: 0 };

test("planting caps move off an unplantable face and retain a nearby alternative", () => {
  const height = (x) => (x > 31.5 ? 20 : 0),
    caps = planJungleTreeCaps(map, [], [anchor], height, 1.75);
  assert.equal(caps.length, 2);
  assert(caps.every((p) => p.x < anchor.x));
  assert(
    caps.every((p) => Math.hypot(p.x - anchor.x, p.z - anchor.z) <= 4.000001),
  );
  assert(Math.hypot(caps[0].x - caps[1].x, caps[0].z - caps[1].z) >= 2.5);
  assert(caps.every((p) => p.radius > 2 && p.radius < 3));
  const impossible = planJungleTreeCaps(map, [], [anchor], (x) => x * 20, 1.75);
  assert.deepEqual(
    impossible,
    [],
    "steep seeds without any viable pocket must not suppress erosion",
  );
});

test("caps reserve complete root footprints beside paths, water and working features", () => {
  const flat = () => 0,
    open = planJungleTreeCaps(map, [], [anchor], flat, 1.75);
  assert.equal(open.length, 2);
  assert.equal(open[0].x, anchor.x);
  assert.equal(open[0].z, anchor.z);
  const grid = [];
  for (let z = 9; z <= 14; z++) {
    grid[z] = [];
    for (let x = 2; x <= 7; x++) grid[z][x] = 1;
  }
  assert.deepEqual(
    planJungleTreeCaps({ ...map, grid }, [], [anchor], flat, 1.75),
    [],
  );
  assert.deepEqual(
    planJungleTreeCaps(
      map,
      [{ x: 31, z: 80, width: 20, length: 20 }],
      [anchor],
      flat,
      1.75,
    ),
    [],
  );
  const features = [];
  for (let z = 10; z <= 13; z++)
    for (let x = 3; x <= 6; x++) features.push({ x, z });
  assert.deepEqual(
    planJungleTreeCaps({ ...map, features }, [], [anchor], flat, 1.75),
    [],
  );
});

test("planning rebuilds reference samples when the supplied height field changes", () => {
  const first = planJungleTreeCaps(map, [], [anchor], () => 0, 1.75),
    second = planJungleTreeCaps(map, [], [anchor], (x) => x * 20, 1.75),
    third = planJungleTreeCaps(map, [], [anchor], () => 0, 1.75);
  assert(first.length > 0);
  assert.deepEqual(second, []);
  assert.deepEqual(third, first);
});
