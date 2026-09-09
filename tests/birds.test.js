import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { BIRD_PALETTES } from "../src/bird-geometry.js";
import {
  birdPerch,
  buildBird,
  updateBirds,
  disposeBirdTemplates,
} from "../src/birds.js";
import {
  buildSoundLandmarks,
  updateSoundLandmarks,
} from "../src/sound-landmarks.js";

function game(biome = "jungle") {
  return {
    level: { biome },
    world: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(),
    birds: [],
    elapsed: 0,
    paused: false,
    store: { data: { settings: { quality: "high" } } },
  };
}

test("regional bird tiers have finite, bounded anatomy and share reusable geometry without texture loads", (t) => {
  const budgets = {};
  for (const biome of Object.keys(BIRD_PALETTES)) {
    const g = game(biome),
      a = buildBird(g, 0, { x: 0, y: 0.18, z: 0 }),
      b = buildBird(g, 1, { x: 1, y: 0.18, z: 0 });
    budgets[biome] = g.birdKit.tiers.map((tier) =>
      Object.values(tier).reduce(
        (n, geo) => n + geo.attributes.position.count / 3,
        0,
      ),
    );
    assert(budgets[biome][0] < 11000 && budgets[biome][1] < 2300);
    for (const tier of g.birdKit.tiers)
      for (const geo of Object.values(tier)) {
        for (const attribute of Object.values(geo.attributes))
          assert(attribute.array.every(Number.isFinite));
        assert(geo.boundingSphere.radius < 0.5);
      }
    for (const { name, mesh } of a.meshes)
      assert.equal(
        mesh.geometry,
        b.meshes.find((m) => m.name === name).mesh.geometry,
      );
    assert.equal(a.meshes.length, 8);
    g.world.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(a.bird);
    assert(
      Math.abs(bounds.min.y) < 0.005,
      "toes touch surface at body anchor minus 0.18 m",
    );
    assert(bounds.max.y < 0.6 && bounds.max.z < 0.4 && bounds.min.z > -0.6);
    assert.equal(g.birdKit.materials.feathers.map, null);
    assert.equal(g.birdKit.materials.eyes.map, null);
  }
  t.diagnostic(JSON.stringify(budgets));
});

test("perch placement resolves masonry above a buried jungle anchor, excludes foliage, and preserves explicit cloud anchors", () => {
  const g = game(),
    root = new THREE.Group(),
    detail = new THREE.Group();
  const stone = new THREE.Mesh(
    new THREE.BoxGeometry(2, 1, 2),
    new THREE.MeshBasicMaterial(),
  );
  stone.position.set(3, 10, 5);
  root.add(stone, detail);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), stone.material);
  leaf.position.set(3, 12, 5);
  detail.add(leaf);
  g.world.add(root);
  g.templePatches = [{ root, detail }];
  assert.deepEqual(birdPerch(g, 0, 3, 9.7, 5), {
    x: 3,
    y: 10.68,
    z: 5,
    surfaceY: 10.5,
  });
  g.level.biome = "desert";
  g.desertBirdPerches = { 0: { x: 2, y: 8, z: 4 } };
  assert.deepEqual(birdPerch(g, 0, 0, 0, 0), {
    x: 2,
    y: 8.18,
    z: 4,
    surfaceY: 8,
  });
  g.level.biome = "water";
  g.palaceBirdPerches = { 0: { x: 2, y: 7, z: 4 } };
  assert.equal(birdPerch(g, 0, 0, 0, 0).y, 7.18);
  g.level.biome = "sky";
  g.skyBirdPerches = { 0: { x: 2, y: 9.18, z: 4, surfaceY: 9 } };
  assert.deepEqual(birdPerch(g, 0, 0, 0, 0), g.skyBirdPerches[0]);
});

test("perched motion holds feet and audio anchors, freezes on pause, and disposes both detail tiers once", () => {
  const g = Object.assign(game(), {
    map: { rooms: [{ x: 1, z: 2 }] },
    groundHeight: () => 0,
    flames: [],
    items: [],
    waterMeshes: [],
  });
  buildSoundLandmarks(g);
  const b = g.birds[0],
    source = g.soundSources.find((s) => s.id === "birds-0");
  assert.deepEqual([source.x, source.y, source.z], b.bird.position.toArray());
  const feet = b.meshes.find((m) => m.name === "feet").mesh;
  g.camera.position.copy(b.bird.position);
  updateSoundLandmarks(g);
  g.world.updateMatrixWorld(true);
  const planted = feet.matrixWorld.clone(),
    head = b.head.quaternion.clone();
  for (const time of [2, 14.7, 23.8, 5.78, 60]) {
    g.elapsed = time;
    updateBirds(g);
    g.world.updateMatrixWorld(true);
    assert(feet.matrixWorld.equals(planted));
    assert.deepEqual([source.x, source.y, source.z], b.bird.position.toArray());
    if (time === 23.8)
      for (const wing of b.wings) {
        const tip = new THREE.Vector3(0, 0, -0.15).applyMatrix4(
          wing.matrixWorld,
        );
        assert(
          Math.abs(tip.x - b.bird.position.x) > 0.16,
          "stretched wing points outside the torso",
        );
      }
  }
  assert(!b.head.quaternion.equals(head));
  const pose = b.head.quaternion.clone(),
    wing = b.wings[0].quaternion.clone();
  g.paused = true;
  g.elapsed = 90;
  updateBirds(g);
  assert.equal(b.time, 60);
  assert(b.head.quaternion.equals(pose));
  assert(b.wings[0].quaternion.equals(wing));
  g.camera.position.x += 30;
  updateBirds(g);
  assert.equal(b.tier, 1);
  for (const { name, mesh } of b.meshes)
    assert.equal(mesh.geometry, g.birdKit.tiers[1][name]);
  g.camera.position.x += 100;
  updateBirds(g);
  assert(!b.bird.visible);
  assert.deepEqual([source.x, source.y, source.z], b.bird.position.toArray());
  g.camera.position.copy(b.bird.position);
  updateBirds(g);
  assert(b.bird.visible);
  assert.equal(b.tier, 0);
  const geometries = new Set(),
    disposed = new Map();
  for (const tier of g.birdKit.tiers)
    for (const geo of Object.values(tier))
      geo.addEventListener("dispose", () =>
        disposed.set(geo, (disposed.get(geo) || 0) + 1),
      );
  disposeBirdTemplates(g, geometries);
  g.world.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
  });
  geometries.forEach((geo) => geo.dispose());
  assert.equal(disposed.size, 16);
  assert([...disposed.values()].every((n) => n === 1));
});
