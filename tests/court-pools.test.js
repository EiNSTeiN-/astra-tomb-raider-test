import test from "node:test";
import assert from "node:assert/strict";
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
      groundHeight: (x, z) => profile.height(x, z),
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
      const depth = waterAt(g, s.x, s.z).depth;
      assert(
        depth > 1.2 && depth < 1.48,
        "Even the lower neighbouring terrace retains a swimming-depth centre",
      );
      const radii = [];
      for (let j = 0; j < 32; j++) {
        const a = (j * Math.PI) / 16;
        let radius = 0;
        for (let r = 0; r < 9; r += 0.05)
          if (waterAt(g, s.x + Math.cos(a) * r, s.z + Math.sin(a) * r))
            radius = r;
        assert(radius > 2 && radius < 8.5);
        radii.push(Math.round(radius * 100));
      }
      assert(Math.max(...radii) - Math.min(...radii) > 30);
      profiles.push(JSON.stringify(radii));
      assert(w.geometry.attributes.position.array.every(Number.isFinite));
      assert(w.geometry.attributes.bedHeight.array.every(Number.isFinite));
    }
    assert.equal(new Set(profiles).size, profiles.length);
  }
  assert.equal(pools, 14);
  assert.equal(samples, 5656);
});

test("pool reshaping leaves objective foundations intact and saved swimmers can reach each shallower bank", (t) => {
  let foundations = 0,
    exits = 0;
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
      g.player.position.set(x, g.groundHeight(x, z), z);
      restoreWaterArrival(g);
      assert.equal(g.swimming, true);
      assert.equal(g.player.position.y, w.position.y - 0.38);
      for (let i = 0; i < 240 && g.swimming; i++) {
        g.elapsed += 1 / 60;
        advanceSwimming(g, { x: 1, z: 0 }, 1 / 60, false);
      }
      assert.equal(g.swimming, false);
      assert(g.player.position.y >= g.groundHeight(g.player.position.x, z));
      assert(g.player.position.x > x + 2 && g.player.position.x < x + 8.5);
      exits++;
    }
  }
  assert(foundations > 1500);
  assert.equal(exits, 14);
});
