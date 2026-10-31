import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { terrainMaterial } from "../src/terrain-material.js";
import { forgeFloorUniforms } from "../src/forge-floor-material.js";

test("foundry floor compositions stay inside separate courts without changing campaign data", () => {
  const map = createMap(LEVELS[4]),
    original = JSON.stringify(map),
    sites = forgeFloorUniforms(map).forgeFloorSites.value;
  assert.equal(sites.length, 9);
  assert.equal(new Set(sites.map((s) => s.w)).size, 9);
  for (const [i, site] of sites.entries()) {
    assert(site.toArray().every(Number.isFinite));
    assert(site.z > 0 && site.z <= 18.5);
    assert.equal(site.x, map.rooms[i].x * 7);
    assert.equal(site.y, map.rooms[i].z * 7 + 12);
    for (const other of sites.slice(i + 1))
      assert(Math.hypot(site.x - other.x, site.y - other.y) > site.z + other.z);
  }
  assert.equal(JSON.stringify(map), original);
  const advanced = structuredClone(map);
  advanced.features.forEach((f) => (f.completed = true));
  assert.deepEqual(forgeFloorUniforms(advanced).forgeFloorSites.value, sites);

  const close = forgeFloorUniforms({
    rooms: [
      { x: 1, z: 1, index: 0 },
      { x: 3, z: 1, index: 1 },
    ],
  }).forgeFloorSites.value;
  assert(close[0].z + close[1].z < 14);
});

test("floor layers share their chapter's uniforms without retaining other chapter maps", () => {
  for (const map of [
    undefined,
    {},
    { rooms: [] },
    { rooms: [{ x: 4, z: 3 }] },
  ]) {
    const uniforms = forgeFloorUniforms(map),
      sites = uniforms.forgeFloorSites.value;
    assert.equal(sites.length, 1);
    assert(sites[0].toArray().every(Number.isFinite));
    assert(sites[0].z >= 0);
    if (map) assert.equal(forgeFloorUniforms(map), uniforms);
    uniforms.forgeFloorStrength.value = 0;
    assert(
      forgeFloorUniforms(structuredClone(map)).forgeFloorStrength.value > 0,
    );
  }
});

test("floor uniforms are volcanic-only and retain existing terrain texture ownership", async (t) => {
  const requests = [];
  t.mock.method(THREE.TextureLoader.prototype, "load", (url, loaded) => {
    requests.push(url);
    const texture = new THREE.Texture();
    queueMicrotask(() => loaded?.(texture));
    return texture;
  });
  for (const level of LEVELS) {
    const map = createMap(level),
      game = { level, map, terrainProfile: createTerrainProfile(map, level) };
    requests.length = 0;
    const material = terrainMaterial(game);
    await game.terrainTexturesReady;
    const uniforms = material.userData.terrainUniforms;
    if (level.biome === "volcano") {
      assert.equal(material.defines.FORGE_FLOOR_COUNT, map.rooms.length);
      assert.equal(uniforms.forgeFloorSites.value.length, map.rooms.length);
      assert.equal(requests.length, 9);
      assert.equal(material.userData.additionalTextures.length, 6);
    } else {
      assert.equal(material.defines?.FORGE_FLOOR_COUNT, undefined);
      assert.equal(uniforms.forgeFloorSites, undefined);
      assert.equal(uniforms.forgeFloorStrength, undefined);
    }
    const textures = new Set(material.userData.additionalTextures);
    for (const value of Object.values(material))
      if (value?.isTexture) textures.add(value);
    textures.forEach((texture) => texture.dispose());
    material.dispose();
  }
});
