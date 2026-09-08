import test from "node:test";
import assert from "node:assert/strict";
import { createMap, LEVELS } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import {
  woodlandLayout,
  understoryLayout,
  trailSampler,
} from "../src/habitat.js";

test("denser jungle woodland remains reproducible and leaves all routes and objective approaches clear", () => {
  const level = LEVELS[0],
    map = createMap(level),
    profile = createTerrainProfile(map, level);
  const trees = woodlandLayout(map, level, profile.height);
  assert.deepEqual(trees, woodlandLayout(map, level, profile.height));
  assert.ok(trees.length > 700 && trees.length < 1000);
  assert.equal(new Set(trees.map((t) => t.variant)).size, 2);
  for (const tree of trees) {
    assert.ok(Number.isFinite(tree.y));
    for (const [dx, dz] of [
      [0, 0],
      [-1.1, 0],
      [1.1, 0],
      [0, -1.1],
      [0, 1.1],
    ])
      assert.equal(
        !!map.grid[Math.round((tree.z + dz) / 7)]?.[
          Math.round((tree.x + dx) / 7)
        ],
        false,
      );
    assert.ok(
      map.features.every(
        (f) => Math.hypot(tree.x - f.x * 7, tree.z - f.z * 7) >= 6,
      ),
    );
  }
  // The causeway replaces the woodland immediately south of camp. Check the
  // canopy framing the expanded clearing, including its outer banks.
  assert.ok(
    trees.filter(
      (t) => Math.hypot(t.x - map.spawn.x * 7, t.z - map.spawn.z * 7) < 50,
    ).length >= 20,
  );
});
test("forest-floor trails follow connected map segments and fade continuously toward the undergrowth", () => {
  const sample = trailSampler({
    paths: [
      [
        { x: 1, z: 1 },
        { x: 2, z: 1 },
        { x: 2, z: 2 },
      ],
    ],
  });
  assert.equal(sample(10, 7), 1);
  assert.equal(sample(14, 10), 1);
  assert.equal(sample(10, 12), 0);
  assert.ok(sample(10, 9) > sample(10, 10));
  for (let x = 0; x < 25; x += 0.13)
    for (let z = 0; z < 25; z += 0.31) {
      const value = sample(x, z);
      assert.ok(value >= 0 && value <= 1);
      assert.ok(Math.abs(value - sample(x + 0.01, z)) < 0.02);
    }
});
test("understory clusters preserve station working space, paving, and worn trails", () => {
  const level = LEVELS[0],
    map = createMap(level),
    profile = createTerrainProfile(map, level);
  const trees = woodlandLayout(map, level, profile.height),
    plants = understoryLayout(map, level, profile, trees);
  assert.ok(plants.length > 4000 && plants.length < 8000);
  assert.deepEqual(plants, understoryLayout(map, level, profile, trees));
  for (const plant of plants) {
    assert.ok(profile.trail(plant.x, plant.z) <= 0.48);
    assert.ok(profile.court(plant.x, plant.z) <= 0.6);
    assert.ok(
      map.features.every(
        (f) => Math.hypot(plant.x - f.x * 7, plant.z - f.z * 7) >= 4.5,
      ),
    );
  }
});
