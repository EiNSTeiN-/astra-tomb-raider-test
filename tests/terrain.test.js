import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { mergeArchitecture } from "../src/visuals.js";
import { Adventure } from "../src/game.js";

const worlds = LEVELS.map((level) => {
  const map = createMap(level);
  return { level, map, profile: createTerrainProfile(map, level) };
});

test("all eight terrain profiles are finite, continuous at sample boundaries, and keep field towers on level ground", () => {
  for (const { level, map, profile } of worlds) {
    assert.ok(profile.heights.every(Number.isFinite), level.id);
    assert.ok(
      profile.courts.every((n) => Number.isFinite(n) && n >= 0 && n <= 1),
    );
    for (const feature of map.features.filter(
      (f) => f.type === "field" && f.kind === "climb",
    )) {
      const x = feature.x * 7,
        z = feature.z * 7,
        y = profile.height(x, z);
      for (const dx of [-6.2, -3.8, 0, 2.2])
        for (const dz of [-2.2, 0, 2.2])
          assert.ok(
            Math.abs(profile.height(x + dx, z + dz) - y) < 0.02,
            `${level.id} ${feature.id}: unsupported tower pad`,
          );
    }
    for (let i = 2; i < profile.width - 2; i += 11) {
      const x = i * profile.step,
        z = (profile.width - i) * profile.step;
      assert.ok(
        Math.abs(
          profile.height(x - 0.0001, z) - profile.height(x + 0.0001, z),
        ) < 0.01,
      );
      assert.ok(
        Math.abs(
          profile.height(x, z - 0.0001) - profile.height(x, z + 0.0001),
        ) < 0.01,
      );
    }
    assert.ok(Number.isFinite(profile.height(-20, profile.extent + 20)));
  }
});

test("terrain survives regeneration and mountain chapters have a substantial ascent", () => {
  const first = worlds[0];
  assert.deepEqual(
    createTerrainProfile(createMap(first.level), first.level).heights,
    first.profile.heights,
  );
  for (const id of ["frost", "sky"]) {
    const { map, profile } = worlds.find((w) => w.level.id === id);
    const elevations = map.rooms.map((r) => profile.height(r.x * 7, r.z * 7));
    assert.ok(Math.max(...elevations) - Math.min(...elevations) > 30, id);
  }
});

test("line of sight clears open ground, stops at a ridge, and clears the ridge from above", () => {
  const game = Object.assign(Object.create(Adventure.prototype), {
    canMove: () => true,
    groundHeight: () => 0,
  });
  const a = new THREE.Vector3(0, 0, 0),
    b = new THREE.Vector3(20, 0, 0);
  assert.equal(game.lineOfSight(a, b), true);
  game.groundHeight = (x) => (x >= 8 && x <= 12 ? 4 : 0);
  assert.equal(game.lineOfSight(a, b), false);
  a.y = b.y = 5;
  assert.equal(game.lineOfSight(a, b), true);
});

test("a thin wall blocks sight and audio occlusion even between terrain samples, while a raised gate clears", () => {
  const game = Object.assign(Object.create(Adventure.prototype), {
    canMove: () => true,
    groundHeight: () => 0,
    obstacles: [{ x: 5, z: 0, w: 0.1, d: 3, h: 7 }],
  });
  const a = new THREE.Vector3(0, 0, 0),
    b = new THREE.Vector3(20, 0, 0);
  assert.equal(game.lineOfSight(a, b), false);
  game.obstacles[0].h = 0;
  assert.equal(game.lineOfSight(a, b), true);
  game.obstacles[0].h = 7;
  a.y = b.y = 8;
  assert.equal(game.lineOfSight(a, b), true);
});

test("beveled and indexed architecture batches together without dropping geometry or animated objects", () => {
  const world = new THREE.Group(),
    material = new THREE.MeshStandardMaterial();
  const shapes = [
    new RoundedBoxGeometry(2, 3, 2, 1, 0.1),
    new THREE.CylinderGeometry(1, 1, 3, 8),
    new THREE.BoxGeometry(2, 2, 2),
  ];
  const triangleCount = shapes.reduce(
    (n, g) => n + (g.index?.count ?? g.attributes.position.count) / 3,
    0,
  );
  shapes.forEach((g, i) => {
    const mesh = new THREE.Mesh(g, material);
    mesh.position.x = i * 5;
    world.add(mesh);
  });
  const animated = new THREE.Mesh(new THREE.BoxGeometry(), material);
  animated.userData.animated = true;
  world.add(animated);
  mergeArchitecture(world);
  assert.equal(world.children.length, 2);
  assert.ok(world.children.includes(animated));
  const merged = world.children.find((m) => m !== animated);
  assert.equal(merged.geometry.attributes.position.count / 3, triangleCount);
  merged.geometry.computeBoundingBox();
  assert.equal(merged.geometry.boundingBox.max.x, 11);
  for (const mesh of world.children) mesh.geometry.dispose();
  material.dispose();
});
