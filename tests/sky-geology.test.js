import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile, buildTerrainSurface } from "../src/terrain.js";
import {
  skyErosion,
  skyRockNoise,
  skyGroundSupported,
} from "../src/sky-geology.js";
import { woodlandLayout } from "../src/habitat.js";

const level = LEVELS[5],
  map = createMap(level),
  profile = createTerrainProfile(map, level);

test("exposed terraces keep low vegetation on supported banks and omit trees rooted in cliffs", () => {
  assert.deepEqual(woodlandLayout(map, level, profile.height), []);
  const ground = (height, depth) => ({
    height,
    geology: { depth: () => depth },
  });
  assert.equal(
    skyGroundSupported(
      ground(() => 20, 0),
      5,
      5,
    ),
    true,
  );
  assert.equal(
    skyGroundSupported(
      ground(() => -20, 30),
      5,
      5,
    ),
    false,
  );
  assert.equal(
    skyGroundSupported(
      ground((x) => x * 2, 0),
      5,
      5,
    ),
    false,
  );
  assert.equal(
    skyGroundSupported(
      ground((x) => x, 0),
      5,
      5,
      true,
    ),
    true,
  );
  assert.equal(
    skyGroundSupported(
      ground((x) => (x < 5.5 ? 20 : -10), 0),
      5,
      5,
    ),
    false,
  );
  for (const bridge of profile.bridges)
    for (const [x, z] of [
      [bridge.ax, bridge.az],
      [bridge.bx, bridge.bz],
    ])
      assert.equal(skyGroundSupported(profile, x, z, true), false);
  for (const path of map.paths)
    for (const p of path)
      assert.equal(skyGroundSupported(profile, p.x * 7, p.z * 7, true), false);
  let supported = 0,
    rejected = 0;
  for (let z = 3; z < profile.extent; z += 3.7)
    for (let x = 2; x < profile.extent; x += 4.1) {
      if (skyGroundSupported(profile, x, z)) supported++;
      else rejected++;
    }
  assert.ok(supported > 2000);
  assert.ok(rejected > 5000);
});

test("cliff erosion is reproducible, bounded and cannot raise the ravine floor", () => {
  for (let z = -100; z < 500; z += 3.7)
    for (let x = -100; x < 500; x += 5.3) {
      const noise = skyRockNoise(x, z, level.seed);
      assert.ok(noise >= 0 && noise <= 1);
      const eroded = skyErosion(x, z, 30, 24, level.seed);
      assert.ok(eroded >= -5.6 && eroded <= 0);
      assert.equal(eroded, skyErosion(x, z, 30, 24, level.seed));
      assert.equal(skyErosion(x, z, 30, 4, level.seed), 0);
    }
  const again = createTerrainProfile(createMap(level), level);
  assert.deepEqual(again.heights, profile.heights);
  assert.deepEqual(again.waters, profile.waters);
  assert.deepEqual(again.bridges, profile.bridges);
});

test("refinement preserves exact uncut foundations while forming substantial exposed relief", () => {
  let changed = 0,
    protectedSamples = 0,
    largestCut = 0;
  for (let z = 0.13; z < profile.extent; z += 2.37)
    for (let x = 0.27; x < profile.extent; x += 2.51) {
      const old = profile.geology.originalHeight(x, z),
        depth = profile.geology.referenceHeight(x, z) - old,
        cut = old - profile.height(x, z);
      assert.ok(cut >= 0 && cut <= 5.6);
      if (depth <= 4) {
        assert.equal(profile.height(x, z), old);
        protectedSamples++;
      }
      if (cut > 0.1) changed++;
      largestCut = Math.max(largestCut, cut);
    }
  assert.ok(protectedSamples > 5000);
  assert.ok(changed > 10000);
  assert.ok(largestCut > 3);
  for (const f of map.features) {
    const x = f.x * 7,
      z = f.z * 7;
    assert.equal(
      profile.height(x, z),
      profile.geology.originalHeight(x, z),
      f.id,
    );
  }
  for (const path of map.paths)
    for (const p of path) assert.ok(profile.trail(p.x * 7, p.z * 7) > 0.9);
});

test("fine terrain chunks keep shared edges, upward normals and matching exposed-rock coordinates", async (t) => {
  t.mock.method(THREE.TextureLoader.prototype, "load", function (url, onLoad) {
    const texture = new THREE.Texture();
    queueMicrotask(() => onLoad?.(texture));
    return texture;
  });
  const game = { level, terrainProfile: profile, world: new THREE.Group() };
  buildTerrainSurface(game);
  await game.terrainTexturesReady;
  t.after(() => {
    game.terrainMeshes.forEach((mesh) => mesh.geometry.dispose());
    const material = game.terrainMeshes[0].material;
    for (const value of Object.values(material))
      if (value?.isTexture) value.dispose();
    material.userData.additionalTextures.forEach((texture) =>
      texture.dispose(),
    );
    material.dispose();
  });
  assert.equal(game.terrainMeshes.length, 81);
  assert.equal(
    game.terrainMeshes.reduce(
      (n, mesh) => n + mesh.geometry.index.count / 3,
      0,
    ),
    476288,
  );
  const seen = new Map();
  let shared = 0;
  for (const mesh of game.terrainMeshes) {
    const {
      position: p,
      normal: n,
      skyDepth: d,
      trail,
    } = mesh.geometry.attributes;
    assert.equal(d.count, p.count);
    assert.ok(d.array.every((value) => Number.isFinite(value) && value >= 0));
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i),
        key = `${x},${z}`;
      assert.equal(p.getY(i), Math.fround(profile.height(x, z)));
      assert.equal(d.getX(i), Math.fround(profile.geology.depth(x, z)));
      assert.ok(n.getY(i) > 0);
      assert.ok(
        Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 0.000001,
      );
      const attributes = [
        p.getY(i),
        n.getX(i),
        n.getY(i),
        n.getZ(i),
        d.getX(i),
        trail.getX(i),
      ];
      if (seen.has(key)) {
        assert.deepEqual(attributes, seen.get(key));
        shared++;
      } else seen.set(key, attributes);
    }
  }
  assert.ok(shared > 7000);
  const material = game.terrainMeshes[0].material;
  assert.equal(material.defines.TERRAIN_SKY, 1);
  assert.equal(material.userData.additionalTextures.length, 8);
});
