import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { monasteryRoofGeometry } from "../src/monastery-roof.js";
import {
  stationMeshSolid,
  stationBlocked,
} from "../src/field-station-solids.js";
import { safeArrival, supportAt } from "../src/character-motion.js";

function fixture(t, { flat = false } = {}) {
  const world = new T.Group(),
    material = new T.MeshBasicMaterial(),
    g = { obstacles: [], groundHeight: () => 0 },
    roof = new T.Mesh(
      flat
        ? new T.BoxGeometry(8, 0.24, 8)
        : monasteryRoofGeometry({
            width: 8,
            depth: 8,
            rise: 3,
            profile: "pavilion",
          }),
      material,
    );
  roof.position.y = flat ? 19.88 : 17;
  world.add(roof);
  const floor = stationMeshSolid(g, { id: "roof" }, roof, {
      supportRadius: 0,
      groundingSlope: true,
    }),
    prop = new T.Mesh(new T.BoxGeometry(0.8, 1.5, 0.8), material);
  prop.position.y = 20.9;
  world.add(prop);
  stationMeshSolid(g, { id: "new-prop" }, prop, {
    bodySupport: false,
    supportRadius: 0,
  });
  g.canMove = (x, z, y) =>
    Math.abs(x) < 5 &&
    Math.abs(z) < 5 &&
    !g.obstacles.some((o) => stationBlocked(o, x, y, z));
  t.after(() => {
    world.traverse((m) => m.geometry?.dispose());
    material.dispose();
  });
  return { g, floor, world, material };
}

test("arrival preserves a steep supporting roof when a new prop blocks its peak", (t) => {
  const { g, floor } = fixture(t),
    saved = { x: 0, y: 20, z: 0 },
    p = safeArrival(g, saved);
  assert(p);
  assert(Math.hypot(p.x, p.z) > 0.9 && Math.hypot(p.x, p.z) <= 3);
  assert(p.y > 17 && p.y < 19.7);
  assert(g.canMove(p.x, p.z, p.y));
  assert.equal(supportAt(g, p.x, p.z, p.y, 0.4).surface, floor);
  assert.deepEqual(saved, { x: 0, y: 20, z: 0 });
});
test("arrival still prefers an unchanged elevation before a sloping-roof fallback", (t) => {
  const { g } = fixture(t, { flat: true }),
    p = safeArrival(g, { x: 0, y: 20, z: 0 });
  assert(p);
  assert(Math.abs(p.y - 20) < 1e-5);
  assert(g.canMove(p.x, p.z, p.y));
});
test("arrival does not transfer the sloping-roof exception to a different support", (t) => {
  const { g, floor, world, material } = fixture(t);
  floor.supportable = false;
  const center = new T.Mesh(new T.BoxGeometry(0.5, 0.24, 0.5), material);
  center.position.y = 19.88;
  world.add(center);
  stationMeshSolid(g, { id: "small-source" }, center, {
    groundingSlope: true,
    supportRadius: 0,
  });
  const other = new T.Mesh(new T.BoxGeometry(7, 0.24, 7), material);
  other.position.y = 17.88;
  world.add(other);
  stationMeshSolid(g, { id: "different-roof" }, other, {
    groundingSlope: true,
    supportRadius: 0,
  });
  const p = safeArrival(g, { x: 0, y: 20, z: 0 });
  assert(p);
  assert.equal(p.y, 0);
});
test("arrival retains the existing ground fallback when a save does not match the source roof height", (t) => {
  const { g } = fixture(t),
    p = safeArrival(g, { x: 0, y: 21, z: 0 });
  assert(p);
  assert.equal(p.y, 0);
});
