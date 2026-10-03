import test from "node:test";
import assert from "node:assert/strict";
import {
  discoveryPlacement,
  discoverySiteClear,
} from "../src/discovery-placement.js";
import { stationBlocked, stationEntry } from "../src/field-station-solids.js";
import { discoveryReachable } from "../src/discovery-props.js";

function world() {
  return {
    terrainProfile: { step: 1.75, waters: [] },
    items: [],
    obstacles: [],
    traversalCourses: [],
    groundHeight: () => 10,
    canMove: () => true,
  };
}

test("a discovery beside a wall moves to clear ground without changing its logical identity", () => {
  const g = world(),
    f = { id: "note-4", x: 30, z: 26, type: "note" };
  g.obstacles.push({ x: 210, z: 182, w: 0.9, d: 7, h: 7.5 });
  assert.equal(discoverySiteClear(g, 210, 182), false);
  const p = discoveryPlacement(g, f);
  assert(p && p.distance > 0 && p.distance <= 28);
  assert(discoverySiteClear(g, p.x, p.z));
  assert.deepEqual(p.origin, { x: 210, z: 182 });
  assert.equal(f.id, "note-4");
  assert.deepEqual(discoveryPlacement(g, f), p);
});

test("hidden finite solids reserve the same discovery site as visible solids", () => {
  const g = world(),
    f = { id: "treasure-12", x: 20, z: 20, type: "treasure" },
    solid = {
      x: 140,
      z: 140,
      w: 1,
      d: 2,
      h: 2,
      node: { visible: false },
      bounds: { min: { y: 10 }, max: { y: 12 } },
    };
  g.obstacles.push(solid);
  const hidden = discoveryPlacement(g, f);
  solid.node.visible = true;
  assert.deepEqual(discoveryPlacement(g, f), hidden);
  assert(hidden.distance > 0);
});

test("placement avoids steep footing, water, traversal landings and active instruments", () => {
  for (const configure of [
    (g) => {
      g.groundHeight = (x) => 10 + x * 0.3;
    },
    (g) => {
      g.terrainProfile.waters.push({ x: 140, z: 140, width: 4, length: 4 });
    },
    (g) => {
      g.items.push({ type: "field", x: 20, z: 20 });
    },
    (g) => {
      g.traversalCourses.push({
        entry: { x: 135, z: 140 },
        ledges: [],
        launch: { x: 140, z: 140 },
        exit: { x: 145, z: 140 },
      });
    },
  ]) {
    const g = world();
    configure(g);
    assert.equal(discoverySiteClear(g, 140, 140), false);
  }
});

test("an empty stand retains physical bounds for walking and rays", () => {
  const solid = {
    x: 0,
    z: 0,
    w: 0.7,
    d: 0.5,
    bounds: {
      min: { x: -0.7, y: 0, z: -0.5 },
      max: { x: 0.7, y: 1.1, z: 0.5 },
    },
  };
  assert(stationBlocked(solid, 0, 0, 0));
  assert(!stationBlocked(solid, 2.4, 0, 0));
  assert(
    stationEntry(solid, { x: -2, y: 0.6, z: 0 }, { x: 2, y: 0.6, z: 0 }) !==
      null,
  );
  assert.equal(
    stationEntry(solid, { x: -2, y: 1.8, z: 0 }, { x: 2, y: 1.8, z: 0 }),
    null,
  );
});

test("collection cannot reach through a wall or from another elevation", () => {
  const f = { group: { position: { x: 0, y: 10, z: 0 } } },
    g = { lineOfSight: () => false };
  assert.equal(discoveryReachable(g, f, { x: 0, y: 10, z: 2.4 }), false);
  g.lineOfSight = () => true;
  assert.equal(discoveryReachable(g, f, { x: 0, y: 13, z: 2.4 }), false);
  assert.equal(discoveryReachable(g, f, { x: 0, y: 10, z: 2.4 }), true);
});
