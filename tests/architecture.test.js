import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  stoneBlockGeometry,
  carvedPanelGeometry,
  templePlan,
} from "../src/temple-architecture.js";
import { LEVELS, createMap } from "../src/campaign.js";

test("chamfered masonry is closed, reproducible, outward facing, and bounded at 44 triangles per block", () => {
  for (const dimensions of [
    [2, 0.55, 1.5],
    [0.35, 0.28, 0.26],
    [3.2, 0.13, 4.8],
  ]) {
    const g = stoneBlockGeometry(...dimensions, 42),
      copy = stoneBlockGeometry(...dimensions, 42),
      p = g.attributes.position,
      n = g.attributes.normal;
    assert.equal(p.count / 3, 44);
    assert.deepEqual(p.array, copy.attributes.position.array);
    const edges = new Map(),
      key = (i) =>
        [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(5)).join(",");
    for (let i = 0; i < p.count; i += 3) {
      const center = new THREE.Vector3();
      for (let k = 0; k < 3; k++)
        center.add(new THREE.Vector3().fromBufferAttribute(p, i + k));
      assert.ok(
        center.dot(new THREE.Vector3().fromBufferAttribute(n, i)) > 0,
        "face points out of the block",
      );
      for (let k = 0; k < 3; k++) {
        const edge = [key(i + k), key(i + ((k + 1) % 3))].sort().join("|");
        edges.set(edge, (edges.get(edge) || 0) + 1);
      }
    }
    assert.ok(
      [...edges.values()].every((v) => v === 2),
      "every geometric edge belongs to two triangles",
    );
    assert.ok(p.array.every(Number.isFinite));
    g.dispose();
    copy.dispose();
  }
});
test("carved panels have actual relief depth, finite normals, and three distinct rosette patterns", () => {
  const shapes = Array.from({ length: 3 }, (_, i) =>
    carvedPanelGeometry(1.4, 3.4, i),
  );
  for (const g of shapes) {
    g.computeBoundingBox();
    assert.ok(g.boundingBox.max.z - g.boundingBox.min.z > 0.13);
    assert.ok(g.attributes.normal.array.every(Number.isFinite));
  }
  assert.notDeepEqual(
    shapes[0].attributes.position.array,
    shapes[1].attributes.position.array,
  );
  assert.notDeepEqual(
    shapes[1].attributes.position.array,
    shapes[2].attributes.position.array,
  );
});
test("all nine jungle sanctuaries retain a central passage and distinct wings without covering stations", () => {
  const map = createMap(LEVELS[0]);
  const variants = new Set();
  for (const room of map.rooms) {
    const plan = templePlan(room);
    variants.add(
      JSON.stringify({
        wings: plan.wings,
        roof: plan.spans.map((s) => s.roof),
      }),
    );
    assert.ok(
      plan.piers.every((p) => Math.abs(p.x) > 3),
      "the central north/south approach stays open",
    );
    assert.ok(
      plan.piers.every((p) => Math.abs(p.z) > 3),
      "the central east/west approach stays open",
    );
    for (const f of map.features)
      for (const p of plan.piers) {
        const dx = f.x * 7 - (room.x * 7 + p.x),
          dz = f.z * 7 - (room.z * 7 + p.z);
        assert.ok(
          Math.abs(dx) > p.width / 2 + 2 || Math.abs(dz) > p.width / 2 + 2,
          `${f.id}: station access overlaps a pier`,
        );
      }
    assert.ok(
      plan.spans.every(
        (s) => Math.hypot(s.a.x - s.b.x, s.a.z - s.b.z) - 2.9 >= 3.5,
      ),
      "arcade passages retain walking clearance",
    );
  }
  assert.ok(variants.size >= 5);
});

import { safeArrival } from "../src/character-motion.js";
import { Adventure } from "../src/game.js";
test("an older save inside new masonry recovers nearby while a valid elevated save stays on its ledge", () => {
  const game = Object.assign(Object.create(Adventure.prototype), {
    groundHeight: () => 3,
    walkable: () => true,
    obstacles: [
      { x: 10, z: 10, w: 1.5, d: 1.5, h: 9 },
      { x: 20, z: 20, w: 2, d: 2, h: 5.6, climbable: true },
    ],
  });
  const saved = { x: 10, y: 3, z: 10 },
    arrival = safeArrival(game, saved);
  assert.ok(arrival);
  assert.ok(Math.hypot(arrival.x - saved.x, arrival.z - saved.z) <= 2.25);
  assert.equal(arrival.y, 3);
  assert.ok(game.canMove(arrival.x, arrival.z, 0));
  const elevated = { x: 20, y: 8.6, z: 20 };
  assert.deepEqual(safeArrival(game, elevated), elevated);
  game.walkable = () => false;
  assert.equal(safeArrival(game, saved), null);
});
