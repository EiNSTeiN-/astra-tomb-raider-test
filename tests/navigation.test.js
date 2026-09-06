import test from "node:test";
import assert from "node:assert/strict";
import { clearSegment, findRoute, searchRoute } from "../src/navigation.js";
import { Adventure } from "../src/game.js";
import { LEVELS, createMap } from "../src/campaign.js";

function assertClear(canStand, start, points) {
  for (const point of points) {
    assert.ok(
      clearSegment(canStand, start, point, 0.08),
      `blocked segment ${JSON.stringify({ start, point })}`,
    );
    start = point;
  }
}
test("runtime route searches yield at bounded intervals and match the complete result", () => {
  const canStand = (x, z) => !(Math.abs(x) < 0.8 && Math.abs(z) < 12);
  const start = { x: -4, z: 0 },
    target = { x: 4, z: 0 },
    search = searchRoute(canStand, start, target);
  let last = 0,
    slices = 0,
    step;
  do {
    step = search.next();
    assert.ok(step.value.visited - last <= 32);
    last = step.value.visited;
    slices++;
  } while (!step.done);
  assert.ok(slices > 1);
  assert.deepEqual(step.value, findRoute(canStand, start, target));
});
test("a guardian route bends around a courtyard wall without clipping its corners", () => {
  const canStand = (x, z) => !(Math.abs(x) < 0.8 && Math.abs(z) < 5);
  const start = { x: -4, z: 0 },
    target = { x: 4, z: 0 };
  const route = findRoute(canStand, start, target);
  assert.equal(route.status, "complete");
  assert.ok(route.points.some((p) => Math.abs(p.z) >= 5));
  assertClear(canStand, start, route.points);
  assert.deepEqual(findRoute(canStand, start, target), route);
});
test("swept route edges cannot hop a thin wall between grid nodes", () => {
  const canStand = (x, z) => !(x > 0.5 && x < 1.2 && Math.abs(z) < 6);
  const start = { x: -3, z: 0 },
    target = { x: 4, z: 0 };
  const route = findRoute(canStand, start, target);
  assert.equal(route.status, "complete");
  assertClear(canStand, start, route.points);
  assert.ok(route.points.some((p) => Math.abs(p.z) >= 6));
});
test("an unreachable target consumes a bounded budget and opening its gate restores a route", () => {
  let open = false;
  const canStand = (x, z) =>
    !(
      Math.abs(x) < 6 &&
      Math.abs(z) < 6 &&
      (Math.abs(x) > 4 || z < -4 || (!open && z > 4))
    );
  const start = { x: 0, z: 10 },
    target = { x: 0, z: 0 };
  const closed = findRoute(canStand, start, target, { maxVisited: 80 });
  assert.notEqual(closed.status, "complete");
  assert.ok(closed.visited <= 80);
  assertClear(canStand, start, closed.points);
  open = true;
  const route = findRoute(canStand, start, target);
  assert.equal(route.status, "complete");
  assertClear(canStand, start, route.points);
  assert.equal(findRoute(canStand, start, { x: 200, z: 200 }).visited, 0);
});
test("routes enter every chapter's sanctuaries from the side when the gate is open", () => {
  let count = 0;
  for (const level of LEVELS) {
    const map = createMap(level);
    for (const f of map.features.filter((f) => f.type === "mechanism")) {
      const x = f.x * 7,
        z = f.z * 7;
      const game = Object.assign(Object.create(Adventure.prototype), {
        map,
        obstacles: [
          { x: x - 6.5, z, w: 0.85, d: 7.2, h: 7.5 },
          { x: x + 6.5, z, w: 0.85, d: 7.2, h: 7.5 },
          { x, z: z - 6.5, w: 7.2, d: 0.85, h: 7.5 },
        ],
      });
      const canStand = (px, pz) => game.canMove(px, pz, 0);
      const start = [
        { x: x + 9, z },
        { x: x - 9, z },
        { x, z: z + 10 },
      ].find((p) => canStand(p.x, p.z));
      assert.ok(start, `${level.id}/${f.id} has an approach`);
      const route = findRoute(canStand, start, { x, z });
      assert.equal(route.status, "complete", `${level.id}/${f.id}`);
      assertClear(canStand, start, route.points);
      count++;
    }
  }
  assert.equal(count, 69);
});
