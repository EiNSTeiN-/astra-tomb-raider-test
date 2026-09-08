import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import {
  stoneShape,
  stoneFootprint,
  seatStone,
} from "../src/stone-grounding.js";
import {
  natureRockAllowed,
  placeNatureRock,
  rockGroundHeight,
} from "../src/nature-rocks.js";
import { LEVELS, createMap, random } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";

const doc = await new NodeIO().read(
  new URL(
    "../public/assets/models/rock_moss_set_01/optimized.glb",
    import.meta.url,
  ).pathname,
);
const shapes = doc
  .getRoot()
  .listNodes()
  .filter((n) => n.getMesh())
  .map((n) => {
    const p = n.getMesh().listPrimitives()[0],
      geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        p.getAttribute("POSITION").getArray().slice(),
        3,
      ),
    );
    geometry.setIndex(
      new THREE.BufferAttribute(p.getIndices().getArray().slice(), 1),
    );
    const normalized = stoneShape(
      geometry,
      new THREE.Matrix4().fromArray(n.getWorldMatrix()),
    );
    normalized.geometry.scale(2.6, 2.6, 2.6);
    geometry.dispose();
    return stoneFootprint(normalized.geometry);
  });
function gaps(shape, matrix, profile) {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(shape.geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(matrix);
  mesh.updateMatrixWorld(true);
  const box = shape.bounds.clone().applyMatrix4(matrix),
    ray = new THREE.Raycaster(),
    samples = [];
  // Independent world-space rays do not repeat the local grid used for fitting.
  for (let iz = 1; iz < 6; iz++)
    for (let ix = 1; ix < 6; ix++) {
      const x = THREE.MathUtils.lerp(box.min.x, box.max.x, ix / 6),
        z = THREE.MathUtils.lerp(box.min.z, box.max.z, iz / 6);
      ray.set(
        new THREE.Vector3(x, box.min.y - 5, z),
        new THREE.Vector3(0, 1, 0),
      );
      const hit = ray.intersectObject(mesh)[0];
      if (hit) samples.push(hit.point.y - profile.height(x, z));
    }
  material.dispose();
  return samples;
}

test("the six delivered rock undersides fit shallow slopes without altering their source geometry", () => {
  assert.equal(shapes.length, 6);
  for (const shape of shapes) {
    const positions = shape.geometry.attributes.position.array.slice(),
      index = shape.geometry.index.array.slice();
    for (const slope of [0, 0.12, -0.12])
      for (const yaw of [0, 0.7, 2.8]) {
        const profile = { height: (x, z) => 4 + x * slope + z * 0.04 };
        const placed = seatStone(profile, shape, {
          x: 5,
          z: 7,
          size: 1.1,
          yaw,
        });
        assert(placed);
        const samples = gaps(shape, placed.matrix, profile);
        assert(Math.min(...samples) < 0, "stone must make contact");
        assert(
          samples.filter((y) => y <= 0.03).length / samples.length > 0.8,
          "most of the underside must be embedded",
        );
        assert(placed.exposed > 0.1, "fitting must not hide the stone");
        assert(placed.matrix.elements.every(Number.isFinite));
      }
    assert.deepEqual(shape.geometry.attributes.position.array, positions);
    assert.deepEqual(shape.geometry.index.array, index);
    assert.equal(
      seatStone({ height: (x) => (x < 0 ? 0 : 8) }, shape, {
        x: 0,
        z: 0,
        size: 1,
        yaw: 0,
      }),
      null,
    );
  }
});

test("decorative stone footprints leave space around game features, guardians, structures, water and map edges", () => {
  const game = {
    map: {
      size: 100,
      features: [{ x: 10, z: 10 }],
      enemies: [{ x: 20, z: 20 }],
      spawn: { x: 5, z: 5 },
    },
    obstacles: [{ x: 210, z: 210, w: 2, d: 3 }],
    terrainProfile: {
      height: () => 0,
      waters: [{ x: 280, z: 280, width: 10, length: 12 }],
    },
  };
  const before = JSON.stringify(game);
  for (const [x, z] of [
    [0.5, 10],
    [699.5, 10],
    [70, 70],
    [73.7, 70],
    [140, 140],
    [142.9, 140],
    [35, 35],
    [212.9, 210],
    [285.9, 280],
  ]) {
    assert(!natureRockAllowed(game, x, z, 1), `${x},${z}`);
    assert.equal(
      placeNatureRock(game, shapes[0], { x, z, size: 1, yaw: 0.4 }).reason,
      "reserved",
    );
  }
  assert(natureRockAllowed(game, 350, 350, 1));
  assert(
    placeNatureRock(game, shapes[0], { x: 350, z: 350, size: 1, yaw: 0.4 })
      .matrix,
  );
  assert.equal(
    JSON.stringify(game),
    before,
    "placement must not mutate gameplay state",
  );
});

test("rock fitting stays deterministic across the seven affected chapter terrains", (t) => {
  const counts = [];
  for (const level of LEVELS.filter((l) => l.biome !== "desert")) {
    const map = createMap(level),
      terrainProfile = createTerrainProfile(map, level),
      game = { level, map, terrainProfile, obstacles: [] },
      rng = random(level.seed + 921),
      placed = [];
    for (let i = 0; i < 1500 && placed.length < 24; i++) {
      const room = map.rooms[i % map.rooms.length],
        a = rng() * Math.PI * 2,
        r = 9 + rng() * 13,
        options = {
          x: room.x * 7 + Math.cos(a) * r,
          z: room.z * 7 + Math.sin(a) * r,
          size: 0.6 + rng() * 0.8,
          yaw: rng() * Math.PI * 2,
        },
        shape = shapes[i % shapes.length];
      const stone = placeNatureRock(game, shape, options);
      assert.deepEqual(placeNatureRock(game, shape, options), stone);
      if (stone.reason) continue;
      const sample = gaps(shape, stone.matrix, terrainProfile);
      assert(Math.min(...sample) < 0.03, `${level.id}: unsupported stone`);
      assert(
        sample.filter((y) => y <= 0.03).length / sample.length > 0.65,
        `${level.id}: mostly hanging underside`,
      );
      placed.push(stone);
    }
    assert.equal(
      placed.length,
      24,
      `${level.id}: insufficient usable stone sites`,
    );
    counts.push({ biome: level.biome, placed: placed.length });
  }
  t.diagnostic(JSON.stringify(counts));
});

test("rock support respects visible terrain triangles at a non-planar coastal bank corner", () => {
  const profile = { step: 1, height: (x, z) => 4 * x * z },
    geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0.5, 0, 0.5);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++)
    position.setY(i, profile.height(position.getX(i), position.getZ(i)));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(geometry, material),
    ray = new THREE.Raycaster();
  for (const [x, z] of [
    [0.2, 0.2],
    [0.4, 0.5],
    [0.7, 0.4],
    [0.8, 0.9],
  ]) {
    ray.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh)[0];
    assert(hit);
    assert(
      Math.abs(
        rockGroundHeight(profile, x, z) -
          Math.min(profile.height(x, z), hit.point.y),
      ) < 1e-6,
    );
  }
  assert.equal(rockGroundHeight(profile, 0.5, 0.5), 0);
  assert.equal(profile.height(0.5, 0.5), 1);
  geometry.dispose();
  material.dispose();
});
