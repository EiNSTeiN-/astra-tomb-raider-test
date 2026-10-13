import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import {
  buildWaterSurfaces,
  updateWaterSurfaces,
} from "../src/water-surface.js";
import { waterAt } from "../src/hydrology.js";
import { restoreWaterArrival, advanceSwimming } from "../src/water-motion.js";

function fixture(t, index) {
  const level = LEVELS[index],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    game = {
      level,
      map,
      terrainProfile: profile,
      world: new THREE.Group(),
      waterMeshes: [],
      groundHeight: profile.surfaceHeight,
      player: new THREE.Group(),
      avatar: new THREE.Group(),
      progress: { stage: 0, field: [] },
      elapsed: 0,
      stamina: 100,
      audio: { noiseHit() {} },
      cb: { toast() {} },
      canMove: () => true,
    };
  buildWaterSurfaces(game);
  t.after(() =>
    game.world.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    }),
  );
  return game;
}

function drawnHeight(p, x, z) {
  const ix = Math.floor(x / p.step),
    iz = Math.floor(z / p.step),
    tx = x / p.step - ix,
    tz = z / p.step - iz,
    a = p.heights[iz * p.width + ix],
    b = p.heights[iz * p.width + ix + 1],
    c = p.heights[(iz + 1) * p.width + ix],
    d = p.heights[(iz + 1) * p.width + ix + 1];
  return tx + tz <= 1
    ? a + tx * (b - a) + tz * (c - a)
    : d + (1 - tx) * (c - d) + (1 - tz) * (b - d);
}

// Recorded after the 2c14f7d dry-instrument repair, using the actual delivered
// terrain planes. Short or absent rays belong to preserved crystal working
// ground; require their exact new profiles rather than loosening all pools.
const crystalShoreDigests = {
  "reservoir-1":
    "0b4aac8c7f6bafabfe3b6359c9798f2b1dff514cf7c0900e433eea07b1f561b5",
  "reservoir-3":
    "5af9e619345e6fe292bcbb0c7b74d91cc08602cd5fa73bdaa6714fa06cce25ec",
  "reservoir-5":
    "4380b9c8b83a73dab120dff9096acff6177b0158578ab691efa88a40a135205f",
  "reservoir-7":
    "aee9a9ab353b24d4fef2d06a23fb752b9ad82d657020cab6e3f7ed003a4bbde8",
};

function deepestWater(game, site) {
  let deepest;
  for (let x = site.x - site.width / 2; x <= site.x + site.width / 2; x += 0.5)
    for (
      let z = site.z - site.length / 2;
      z <= site.z + site.length / 2;
      z += 0.5
    ) {
      const sample = waterAt(game, x, z);
      if (sample && (!deepest || sample.depth > deepest.depth))
        deepest = { x, z, depth: sample.depth };
    }
  assert(deepest, `${game.level.id}/${site.id} retains water`);
  return deepest;
}

test("all fourteen regional court pools bury their mesh boundaries below both ground surfaces and retain distinct shores", (t) => {
  let pools = 0,
    samples = 0;
  for (const index of [1, 6, 7]) {
    const g = fixture(t, index),
      p = g.terrainProfile,
      profiles = [];
    for (const w of g.waterMeshes.filter((w) => w.userData.shore)) {
      const s = w.userData;
      pools++;
      for (let i = 0; i <= 100; i++)
        for (const [x, z] of [
          [s.x - s.width / 2, s.z + s.length * (i / 100 - 0.5)],
          [s.x + s.width / 2, s.z + s.length * (i / 100 - 0.5)],
          [s.x + s.width * (i / 100 - 0.5), s.z - s.length / 2],
          [s.x + s.width * (i / 100 - 0.5), s.z + s.length / 2],
        ]) {
          assert(
            p.height(x, z) > w.position.y + 0.06,
            `${g.level.id}/${s.id} walking surface border`,
          );
          assert(
            drawnHeight(p, x, z) > w.position.y + 0.06,
            `${g.level.id}/${s.id} rendered border`,
          );
          assert.equal(waterAt(g, x, z), null);
          samples++;
        }
      if (g.level.biome !== "crystal") {
        const depth = waterAt(g, s.x, s.z).depth;
        assert(depth > 1.2 && depth < 1.48, "unchanged swimming-depth centre");
      } else {
        // The mirrored and heart pads deliberately occupy two old centres.
        // The final retained pocket is shallow; none should be excavated again
        // merely to satisfy an obsolete circular swimming-pool assumption.
        const deepest = deepestWater(g, s);
        assert(deepest.depth > 0.35 && deepest.depth < 1.48);
      }
      const radii = [];
      for (let j = 0; j < 32; j++) {
        const a = (j * Math.PI) / 16;
        let radius = 0;
        for (let r = 0; r < 9; r += 0.05)
          if (waterAt(g, s.x + Math.cos(a) * r, s.z + Math.sin(a) * r))
            radius = r;
        assert(radius < 8.5, "water stays inside the buried mesh border");
        if (g.level.biome !== "crystal") assert(radius > 2);
        radii.push(Math.round(radius * 100));
      }
      assert(Math.max(...radii) - Math.min(...radii) > 30);
      if (g.level.biome === "crystal")
        assert.equal(
          createHash("sha256")
            .update(Buffer.from(new Uint16Array(radii).buffer))
            .digest("hex"),
          crystalShoreDigests[s.id],
          `${s.id} retains the recorded dry margins and varied wet bank`,
        );
      profiles.push(JSON.stringify(radii));
      assert(w.geometry.attributes.position.array.every(Number.isFinite));
      assert(w.geometry.attributes.bedHeight.array.every(Number.isFinite));
    }
    assert.equal(new Set(profiles).size, profiles.length);
  }
  assert.equal(pools, 14);
  assert.equal(samples, 5656);
});

test("pool reshaping retains objective foundations, dry legacy arrivals and swimming exits from each retained deep pocket", (t) => {
  let foundations = 0,
    exits = 0,
    shallow = 0,
    dryCentres = 0;
  for (const index of [1, 6, 7]) {
    const g = fixture(t, index),
      p = g.terrainProfile;
    for (const f of g.map.features)
      for (const dx of [-0.8, 0, 0.8])
        for (const dz of [-0.8, 0, 0.8]) {
          const x = f.x * 7 + dx,
            z = f.z * 7 + dz;
          assert(
            Math.abs(p.height(x, z) - p.foundationHeight(x, z)) < 1e-5,
            `${g.level.id}/${f.id} foundation`,
          );
          foundations++;
        }
    for (const w of g.waterMeshes.filter((w) => w.userData.shore)) {
      const { x, z } = w.position,
        level = w.position.y;
      g.progress = JSON.parse(JSON.stringify({ stage: 12, field: [] }));
      updateWaterSurfaces(g, 100);
      assert.equal(w.position.y, level);
      // Ground-relative legacy saves at newly dry centres remain on that floor.
      if (g.level.biome === "crystal" && !waterAt(g, x, z)) {
        g.player.position.set(x, g.groundHeight(x, z), z);
        const saved = g.player.position.clone();
        restoreWaterArrival(g);
        assert.equal(g.swimming, false);
        assert(g.player.position.equals(saved));
        dryCentres++;
      }
      const start = deepestWater(g, w.userData);
      g.player.position.set(start.x, g.groundHeight(start.x, start.z), start.z);
      restoreWaterArrival(g);
      if (start.depth <= 1.15) {
        assert.equal(g.swimming, false);
        assert.equal(g.player.position.y, g.groundHeight(start.x, start.z));
        assert.equal(g.level.biome, "crystal");
        assert.equal(w.userData.id, "reservoir-7");
        shallow++;
        continue;
      }
      assert.equal(g.swimming, true);
      assert.equal(g.player.position.y, w.position.y - 0.38);
      for (let i = 0; i < 240 && g.swimming; i++) {
        g.elapsed += 1 / 60;
        advanceSwimming(g, { x: 1, z: 0 }, 1 / 60, false);
      }
      assert.equal(g.swimming, false);
      assert(
        g.player.position.y >= g.groundHeight(g.player.position.x, start.z),
      );
      assert(
        g.player.position.x > start.x,
        "swimmer moves to a shallower bank",
      );
      assert(g.player.position.x <= x + w.userData.width / 2);
      assert((waterAt(g, g.player.position.x, start.z)?.depth || 0) < 1.1);
      exits++;
    }
  }
  assert(foundations > 1500);
  assert.equal(exits, 13);
  assert.equal(shallow, 1);
  assert.equal(dryCentres, 2);
});
