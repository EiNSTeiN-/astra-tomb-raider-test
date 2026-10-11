import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import {
  buildDesertForecourts,
  desertForecourtAllowed,
} from "../src/desert-forecourts.js";
import {
  desertForecourtPlan,
  addDesertForecourtMap,
} from "../src/desert-forecourt-layout.js";
import { inspectDesertForecourts } from "../scripts/inspect-desert-forecourts-browser.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { CROUCH_DROP } from "../src/stealth.js";

function fixture(t, camera = false) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[1],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    world = new THREE.Group(),
    extent = (terrainProfile.width - 1) * terrainProfile.step,
    geometry = new THREE.PlaneGeometry(
      extent,
      extent,
      terrainProfile.width - 1,
      terrainProfile.width - 1,
    );
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(extent / 2, 0, extent / 2);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setY(i, terrainProfile.height(p.getX(i), p.getZ(i)));
  const terrain = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  world.add(terrain);
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile,
    world,
    obstacles: [],
    items: [],
    fieldGates: [],
    traversalCourses: [],
    terrainMeshes: [terrain],
  });
  if (camera) game.cameraSurfaces = new CameraSurfaces(world);
  buildDesertForecourts(game);
  game.cameraSurfaces?.rebuild();
  return {
    game,
    dispose() {
      const resources = new Set();
      world.traverse((m) => {
        if (m.geometry) resources.add(m.geometry);
        if (m.material) {
          resources.add(m.material);
          for (const v of Object.values(m.material))
            if (v?.isTexture) resources.add(v);
        }
      });
      for (const r of resources) r.dispose();
    },
  };
}

test("all desert annexes connect to the existing map and preserve objective metadata on repeated authoring", () => {
  const map = createMap(LEVELS[1]),
    before = structuredClone(map),
    visited = new Set([`${map.spawn.x},${map.spawn.z}`]),
    queue = [map.spawn];
  assert.equal(map.desertForecourtAnnexes.length, 20);
  assert.equal(
    new Set(map.rooms.map((r) => JSON.stringify(desertForecourtPlan(r)))).size,
    10,
  );
  for (let i = 0; i < queue.length; i++)
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = queue[i].x + dx,
        z = queue[i].z + dz,
        key = `${x},${z}`;
      if (map.grid[z]?.[x] && !visited.has(key)) {
        visited.add(key);
        queue.push({ x, z });
      }
    }
  for (const a of map.desertForecourtAnnexes)
    for (const [x, z] of a.cells) assert(visited.has(`${x},${z}`));
  addDesertForecourtMap(map, LEVELS[1]);
  assert.deepEqual(map, before);
  for (const level of LEVELS.filter((l) => l.biome !== "desert")) {
    const m = createMap(level),
      b = structuredClone(m);
    addDesertForecourtMap(m, level);
    assert.deepEqual(m, b);
  }
});

test("hollow cistern camera bounds catch the recorded rim obstruction and retain clear interior views", (t) => {
  const s = fixture(t, true),
    g = s.game,
    start = new THREE.Vector3(
      90.5,
      4.472544801802858 + 1.3 - CROUCH_DROP,
      345.4366666666667,
    ),
    end = new THREE.Vector3(
      94.37880683564634,
      5.559401741696938,
      342.35863504998093,
    );
  try {
    const ray = new THREE.Raycaster(
      start,
      end.clone().sub(start).normalize(),
      0,
      start.distanceTo(end),
    );
    assert(
      ray.intersectObjects(
        g.desertForecourts.flatMap((c) => c.root.children),
        false,
      ).length > 0,
      "the previously accepted camera arm crosses actual masonry",
    );
    assert(
      g.cameraSurfaces.entry(start, end) < 0.9,
      "the target inside the empty basin cannot cause the rim to be ignored",
    );
    for (const court of g.desertForecourts)
      for (const cistern of court.cisterns) {
        const x = court.root.position.x + cistern.x,
          z = court.root.position.z + cistern.z,
          y = g.groundHeight(x, z) + 0.5,
          a = new THREE.Vector3(x, y, z),
          b = new THREE.Vector3(x + 0.4, y, z + 0.4);
        assert.equal(
          g.cameraSurfaces.entry(a, b),
          1,
          "the hollow interior retains empty camera space",
        );
      }
    assert.equal(
      g.cameraSurfaces.pending.length,
      0,
      "temporary source meshes are released after capture",
    );
  } finally {
    s.dispose();
  }
});

test("final batched forecourt footings, roof caps and hollow cisterns agree with delivered terrain and finite physical surfaces", (t) => {
  const s = fixture(t);
  try {
    const r = inspectDesertForecourts(s.game);
    assert.equal(r.courts, 10);
    assert(r.walls > 40 && r.galleries >= 3 && r.cisterns >= 2);
    assert(
      r.footingQueries > 400 &&
        r.supportQueries > 200 &&
        r.headroomQueries >= 75 &&
        r.voidQueries >= 2,
    );
    assert.deepEqual(r.failures, [], JSON.stringify(r.failures.slice(0, 5)));
  } finally {
    s.dispose();
  }
});

test("independent delivered geometry detects a raised forecourt rather than accepting its placement records", (t) => {
  const s = fixture(t);
  try {
    const court = s.game.desertForecourts.find((r) => r.walls.length);
    court.root.position.y += 2;
    const r = inspectDesertForecourts(s.game);
    assert(r.failures.some((f) => f.kind === "exposed footing"));
    assert(r.failures.some((f) => f.kind === "support"));
  } finally {
    s.dispose();
  }
});

test("forecourt reservations reject optics, path centre lines, traversal and complete palm trunks", (t) => {
  const s = fixture(t);
  try {
    const g = s.game,
      r = g.map.rooms[1];
    assert(!desertForecourtAllowed(g, r.x * 7, r.z * 7 + 12, 2, 2));
    g.palmLayout = [{ x: 300, z: 200, scale: 1.2 }];
    assert(!desertForecourtAllowed(g, 300, 200, 2, 2));
  } finally {
    s.dispose();
  }
});
