import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile, buildTerrainSurface } from "../src/terrain.js";
import { coastalBankDrop } from "../src/coastal-banks.js";

const level = LEVELS[3],
  map = createMap(level),
  profile = createTerrainProfile(map, level),
  digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("coastal shoulders retain the complete shipped walking and reservoir footprints", () => {
  const walking = new Set(),
    water = new Set(),
    { width, step, heights } = profile;
  // Every corner of every triangle supporting a walking cell, including its
  // outer boundary. Recorded from 97a6ecb before changing the coastal banks.
  for (let z = 0; z < map.size; z++)
    for (let x = 0; x < map.size; x++) {
      if (!map.grid[z]?.[x]) continue;
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const ix = x * 4 + dx,
            iz = z * 4 + dz;
          if (ix >= 0 && iz >= 0 && ix < width && iz < width)
            walking.add(iz * width + ix);
        }
    }
  // Include the enclosing sample cells of every rendered basin, beyond its
  // analytic excavation edge, so interpolation at its margins is also retained.
  for (const basin of profile.waters)
    for (
      let z = Math.floor((basin.z - basin.length / 2) / step);
      z <= Math.ceil((basin.z + basin.length / 2) / step);
      z++
    )
      for (
        let x = Math.floor((basin.x - basin.width / 2) / step);
        x <= Math.ceil((basin.x + basin.width / 2) / step);
        x++
      )
        water.add(z * width + x);
  const hash = (indices) =>
    digest(
      Buffer.from(
        new Float32Array(
          [...indices].sort((a, b) => a - b).map((i) => heights[i]),
        ).buffer,
      ),
    );
  assert.equal(walking.size, 35341);
  assert.equal(
    hash(walking),
    "24f665c1cc2dcadfb72c4a6aab6e5d1c5183e3bd61a0951a6a0ab772e2eacabc",
  );
  assert.equal(water.size, 956);
  assert.equal(
    hash(water),
    "36775bdcf8b3ff8db5864ae16795a6918443300ebc42e1532cc3235fdfe733c6",
  );
  assert.equal(
    digest(JSON.stringify(profile.waters)),
    "ac62625399d0193994017d2280853ce0974456e08b96b77923af3b3e6ed2031e",
  );
});

test("the reproduced coastal lip uses a shallow delivered triangle instead of a grid cliff", async (t) => {
  t.mock.method(THREE.TextureLoader.prototype, "load", (url, onLoad) => {
    const texture = new THREE.Texture();
    queueMicrotask(() => onLoad?.(texture));
    return texture;
  });
  const game = {
    level,
    map,
    terrainProfile: profile,
    world: new THREE.Group(),
  };
  t.after(() => {
    const materials = new Set(),
      textures = new Set();
    game.world.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) materials.add(o.material);
    });
    for (const material of materials) {
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
      for (const texture of material.userData.additionalTextures || [])
        textures.add(texture);
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
  });
  buildTerrainSurface(game);
  await game.terrainTexturesReady;
  game.world.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const [x, z] of [
    [349.05561841378983, 94.68399706370708],
    [351.42892853835446, 94.612881707769],
    [351.60523463241105, 94.81902457182704],
  ]) {
    ray.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(game.terrainMeshes)[0];
    assert(hit, `Missing bank triangle at ${x},${z}`);
    const n = hit.face.normal,
      grade = Math.hypot(n.x, n.z) / Math.abs(n.y);
    // The recorded delivered faces were 2.924–2.930 m/m before this repair.
    assert(grade < 0.35, `Abrupt bank face at ${x},${z}: ${grade}`);
    assert(Math.abs(hit.point.y - profile.surfaceHeight(x, z)) < 1e-7);
  }
});

test("coastal shoulders vary along the shore and retain the distant seabed", () => {
  const profiles = new Set();
  for (const [x, z] of [
    [50, 60],
    [150, 160],
    [250, 260],
    [350, 360],
  ]) {
    assert.equal(coastalBankDrop(x, z, 0, level.seed), 0);
    let previous = 0;
    for (let d = 0; d <= 36; d += 0.25) {
      const drop = coastalBankDrop(x, z, d, level.seed);
      assert(Number.isFinite(drop) && drop >= previous && drop <= 7);
      previous = drop;
    }
    assert(coastalBankDrop(x, z, 18, level.seed) > 6.99);
    profiles.add(coastalBankDrop(x, z, 5, level.seed));
  }
  assert.equal(profiles.size, 4);
});
