import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import {
  addMonasteryGardenMap,
  monasteryGardenPlan,
} from "../src/monastery-garden-layout.js";
import { buildMonasteryGardens } from "../src/monastery-gardens.js";
import { stationSupport, stationBlocked } from "../src/field-station-solids.js";

test("garden annexes keep existing authored data, add connected walking cells and vary all nine layouts", () => {
  const map = createMap(LEVELS[2]);
  assert.equal(map.monasteryGardenAnnexes.length, 18);
  assert.equal(
    new Set(map.rooms.map((r) => JSON.stringify(monasteryGardenPlan(r)))).size,
    9,
  );
  const queue = [map.spawn],
    visited = new Set([`${map.spawn.x},${map.spawn.z}`]);
  for (let i = 0; i < queue.length; i++)
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const x = queue[i].x + dx,
        z = queue[i].z + dz,
        key = `${x},${z}`;
      if (map.grid[z]?.[x] && !visited.has(key)) {
        visited.add(key);
        queue.push({ x, z });
      }
    }
  for (const annex of map.monasteryGardenAnnexes)
    for (const [x, z] of annex.cells)
      assert(visited.has(`${x},${z}`), `connected court ${annex.room}`);
  const before = structuredClone(map),
    metadata = JSON.stringify({
      ...map,
      grid: null,
      monasteryGardenAnnexes: null,
    });
  addMonasteryGardenMap(map, LEVELS[2]);
  assert.deepEqual(map, before, "reapplying the authored additions is stable");
  assert.equal(
    JSON.stringify({ ...map, grid: null, monasteryGardenAnnexes: null }),
    metadata,
  );
  for (const level of LEVELS.filter((l) => l.biome !== "snow")) {
    const other = createMap(level),
      copy = structuredClone(other);
    assert.equal(addMonasteryGardenMap(other, level), other);
    assert.deepEqual(other, copy);
  }
});

function fixture(t) {
  const level = LEVELS[2],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    world = new THREE.Group(),
    materials = Object.fromEntries(
      ["stone", "wood", "plaster", "snow", "bronze"].map((name) => [
        name,
        new THREE.MeshStandardMaterial(),
      ]),
    ),
    game = {
      level,
      map,
      terrainProfile: profile,
      world,
      obstacles: [],
      items: [],
      groundHeight: (x, z) => profile.height(x, z),
      monasteryMaterials: materials,
    };
  buildMonasteryGardens(game);
  world.updateMatrixWorld(true);
  t.after(() => {
    const geometries = new Set(),
      mats = new Set(Object.values(materials));
    world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) mats.add(o.material);
    });
    geometries.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
  });
  return game;
}

test("batched snow caps agree with physical point support and remain grounded across their whole footings", (t) => {
  const game = fixture(t),
    ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  let checks = 0;
  assert.equal(game.monasteryGardens.length, 9);
  assert(game.monasteryGardens.reduce((n, g) => n + g.walls.length, 0) > 30);
  for (const garden of game.monasteryGardens) {
    for (const mesh of garden.root.children) {
      for (const a of Object.values(mesh.geometry.attributes))
        assert(a.array.every(Number.isFinite));
    }
    for (const wall of garden.walls)
      for (const fx of [-0.49, -0.25, 0, 0.25, 0.49])
        for (const fz of [-0.49, 0, 0.49]) {
          const x = wall.worldX + wall.w * fx,
            z = wall.worldZ + wall.d * fz;
          ray.ray.origin.set(x, wall.top + 10, z);
          const hit = ray.intersectObjects(garden.root.children, false)[0];
          assert(hit);
          const support = Math.max(
            ...garden.feature.stationSolids.map(
              (s) => stationSupport(s, x, z) ?? -Infinity,
            ),
          );
          assert(
            Math.abs(hit.point.y - support) < 0.0001,
            "rendered and physical standing height",
          );
          assert(
            Math.abs(support - wall.top) < 0.0001,
            "snow is the standing surface",
          );
          assert(
            wall.bottom < game.groundHeight(x, z) - 0.15,
            "footing stays buried",
          );
          checks++;
        }
  }
  assert(checks > 450);
});

test("reliquary niches have real backs and side walls while their upper ledges have finite collision", (t) => {
  const game = fixture(t);
  let shrines = 0;
  for (const garden of game.monasteryGardens)
    for (const shrine of garden.shrines) {
      shrines++;
      const body = shrine.base + 0.92,
        solids = garden.feature.stationSolids,
        blocked = (x, y, z, clearance = 0) =>
          solids.some((s) => stationBlocked(s, x, y, z, clearance, 0));
      assert(
        !blocked(shrine.x, body + 0.7, shrine.z + 0.3),
        "actual recessed interior",
      );
      assert(
        blocked(shrine.x, body + 0.7, shrine.z - 0.82),
        "solid niche back",
      );
      assert(
        blocked(shrine.x + 0.76, body + 0.7, shrine.z),
        "solid niche cheek",
      );
      assert(
        !blocked(shrine.x, shrine.top + 1, shrine.z),
        "no column beyond the finial",
      );
    }
  assert(shrines >= 6);
});
