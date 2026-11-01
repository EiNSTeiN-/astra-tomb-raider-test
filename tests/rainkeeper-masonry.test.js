import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildFireVault } from "../src/fire-vault.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { rainkeeperReliefGeometry } from "../src/rainkeeper-masonry.js";
import { stationBlocked } from "../src/field-station-solids.js";
import { CameraSurfaces } from "../src/camera-collision.js";

function fixture() {
  const level = LEVELS[0],
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
    game = {
      world: new THREE.Group(),
      level,
      map,
      progress: {},
      stoneMat: material,
      groundHeight: (x, z) => terrain.surfaceHeight(x, z),
      obstacles: [],
      flames: [],
      items: [],
      elapsed: 0,
    },
    old = globalThis.document;
  game.cameraSurfaces = new CameraSurfaces(game.world);
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  try {
    buildFireVault(game);
  } finally {
    globalThis.document = old;
  }
  game.world.updateMatrixWorld(true);
  game.cameraSurfaces.rebuild();
  return game;
}
function dispose(game) {
  const resources = new Set();
  game.world.traverse((o) => {
    for (const r of [o.geometry, o.material].flat()) {
      if (r?.map) resources.add(r.map);
      if (r?.dispose) resources.add(r);
    }
  });
  for (const r of resources) r.dispose();
}
function verticalIntervals(game, x, z) {
  const v = game.fireVault,
    ray = new THREE.Raycaster(
      new THREE.Vector3(v.x + x, v.y + 20, v.z + z),
      new THREE.Vector3(0, -1, 0),
      0,
      50,
    ),
    hits = ray
      .intersectObject(v.root, true)
      .filter(
        (h) =>
          h.object.material === game.stoneMat &&
          Math.abs(h.face.normal.y) > 1e-6,
      );
  let depth = 0,
    top;
  const intervals = [];
  for (const hit of hits) {
    const before = depth;
    depth += hit.face.normal.y > 0 ? 1 : -1;
    if (!before && depth > 0) top = hit.point.y - v.y;
    if (before > 0 && !depth) intervals.push([hit.point.y - v.y, top]);
    assert(depth >= 0, "stone faces must have consistent outward winding");
  }
  assert.equal(depth, 0, "ray must leave a closed masonry union");
  return intervals;
}

test("batched causeway corbels remain joined to the chipped wall caps at every sampled bearing", () => {
  const game = fixture();
  try {
    for (const z of [-23, -7, 9, 25])
      for (const side of [-1, 1])
        for (const dx of [-0.55, -0.25, 0.05])
          for (const dz of [-0.41, -0.09, 0.29]) {
            const intervals = verticalIntervals(
              game,
              side * (21.5 + dx),
              z + dz,
            );
            assert(
              intervals.some(([lo, hi]) => lo < 5.95 && hi > 6.7),
              `broken bearing ${side},${z},${dx},${dz}: ${JSON.stringify(intervals)}`,
            );
          }
  } finally {
    dispose(game);
  }
});

test("the new pier plinths enter the actual jungle terrain across their footprints", () => {
  const game = fixture(),
    v = game.fireVault;
  try {
    for (const pier of v.masonry.piers)
      for (const u of [-0.38, 0, 0.38])
        for (const w of [-0.38, 0, 0.38]) {
          // Include the projecting plinth, where the old wall cannot hide a
          // detached pier base. These are inside its bevel, not just its centre.
          const dx = u * (pier.width + 0.34),
            dz = w * (pier.depth + 0.24);
          const x = pier.x + dx,
            z = pier.z + dz,
            ground = game.groundHeight(v.x + x, v.z + z) - v.y;
          assert(
            verticalIntervals(game, x, z).some(
              ([lo, hi]) => lo < ground && hi > 0.4,
            ),
            `unseated pier ${pier.x},${pier.z} at ${x},${z}`,
          );
        }
  } finally {
    dispose(game);
  }
});

test("masonry solids block their stone and leave the stair and water crossing clear", () => {
  const game = fixture(),
    v = game.fireVault,
    solids = v.masonry.solids.stationSolids,
    blocked = (x, y, z) =>
      solids.some((s) => stationBlocked(s, v.x + x, v.y + y, v.z + z));
  try {
    assert(blocked(21.5, 2, -23));
    assert(blocked(-12, 2, -28.7));
    assert(blocked(-8, 7, -28.18));
    for (const z of [-35, -32, -29, -25, -16, 0, 16, 26])
      assert.equal(blocked(-8, 1.92, z), false, `crossing at ${z}`);
    for (const x of [-16, -8, 0, 8, 16])
      assert.equal(blocked(x, 1.92, -25), false, `entrance bank at ${x}`);
    for (const z of [26, 29, 31.3]) assert.equal(blocked(0, 1.92, z), false);
  } finally {
    dispose(game);
  }
});

test("camera rays cannot enter the raised banks, stair treads or wheel platforms", () => {
  const game = fixture(),
    v = game.fireVault;
  try {
    for (const [x, z, height] of [
      [15, -25, 1.92],
      [-8, -16, 1.92],
      [8, 0, 1.92],
      [0, 26, 1.92],
      [-8, -33.5, 0.16],
      [0, 31.7, 1.92],
    ]) {
      const a = new THREE.Vector3(v.x + x, v.y + height + 1, v.z + z),
        b = new THREE.Vector3(v.x + x, v.y + height - 0.15, v.z + z);
      assert(
        game.cameraSurfaces.entry(a, b, 0.1) < 1,
        `unregistered floor ${x},${z}`,
      );
    }
    const a = new THREE.Vector3(v.x, v.y + 3.5, v.z - 25),
      b = new THREE.Vector3(v.x, v.y + 3.5, v.z + 24);
    assert.equal(
      game.cameraSurfaces.entry(a, b, 0.1),
      1,
      "the open hall remains visible",
    );
  } finally {
    dispose(game);
  }
});

test("exterior reliefs close behind their recessed carving with outward side faces", () => {
  const geometry = rainkeeperReliefGeometry(3.15, 3.9, 4),
    material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(geometry, material),
    ray = new THREE.Raycaster();
  mesh.updateMatrixWorld(true);
  try {
    for (const [origin, direction] of [
      [
        [-3, 2, -0.2],
        [1, 0, 0],
      ],
      [
        [3, 2, -0.2],
        [-1, 0, 0],
      ],
      [
        [0.1, -2, -0.2],
        [0, 1, 0],
      ],
      [
        [0.1, 6, -0.2],
        [0, -1, 0],
      ],
      [
        [0.1, 2, 2],
        [0, 0, -1],
      ],
    ]) {
      ray.set(new THREE.Vector3(...origin), new THREE.Vector3(...direction));
      const hits = ray.intersectObject(mesh);
      assert.equal(hits.length, 2);
      assert(
        hits[0].face.normal.dot(ray.ray.direction) < 0,
        "entry face points out",
      );
      assert(
        hits[1].face.normal.dot(ray.ray.direction) > 0,
        "exit face points out",
      );
    }
  } finally {
    geometry.dispose();
    material.dispose();
  }
});
