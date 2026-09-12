import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { Adventure } from "../src/game.js";
import { EXPEDITIONS } from "../src/expeditions.js";
import { createTerrainProfile } from "../src/terrain.js";
import { hotLavaAt } from "../src/hydrology.js";
import {
  buildWaterSurfaces,
  updateWaterSurfaces,
} from "../src/water-surface.js";
import { guardianFooting } from "../src/guardian-patrols.js";
import {
  THERMAL_TRIALS,
  thermalCount,
  thermalPosition,
} from "../src/thermal-rules.js";

function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[4],
    map = createMap(level);
  const profile = createTerrainProfile(map, level);
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile: profile,
    world: new THREE.Group(),
    waterMeshes: [],
    elapsed: 0,
    progress: { stage: 0, field: [] },
    canMove: () => true,
  });
  buildWaterSurfaces(game);
  t.after(() =>
    game.world.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    }),
  );
  return game;
}

// Sample the triangles actually drawn for terrain, in addition to the
// bilinear movement surface. A mesh edge must be buried under both.
function drawnHeight(p, x, z) {
  const gx = x / p.step,
    gz = z / p.step;
  const ix = Math.floor(gx),
    iz = Math.floor(gz),
    tx = gx - ix,
    tz = gz - iz;
  const a = p.heights[iz * p.width + ix],
    b = p.heights[iz * p.width + ix + 1];
  const c = p.heights[(iz + 1) * p.width + ix],
    d = p.heights[(iz + 1) * p.width + ix + 1];
  return tx + tz <= 1
    ? a + tx * (b - a) + tz * (c - a)
    : d + (1 - tx) * (c - d) + (1 - tz) * (b - d);
}

test("all four slag pools have buried mesh borders and irregular shallow shores", (t) => {
  const g = fixture(t);
  let samples = 0;
  assert.equal(g.waterMeshes.length, 4);
  const profiles = [];
  for (const w of g.waterMeshes) {
    const s = w.userData;
    for (let i = 0; i <= 80; i++)
      for (const [dx, dz] of [
        [-s.width / 2, s.length * (i / 80 - 0.5)],
        [s.width / 2, s.length * (i / 80 - 0.5)],
        [s.width * (i / 80 - 0.5), -s.length / 2],
        [s.width * (i / 80 - 0.5), s.length / 2],
      ]) {
        const x = s.x + dx,
          z = s.z + dz;
        assert(g.groundHeight(x, z) > w.position.y + 0.06);
        assert(drawnHeight(g.terrainProfile, x, z) > w.position.y + 0.06);
        assert.equal(hotLavaAt(g, x, z), null);
        samples++;
      }
    const centerDepth = w.position.y - g.groundHeight(s.x, s.z);
    assert(centerDepth > 0.25 && centerDepth < 0.36);
    const radii = [];
    for (let j = 0; j < 32; j++) {
      let radius = 0;
      const a = (j * Math.PI) / 16;
      for (let r = 0; r < 8; r += 0.05)
        if (hotLavaAt(g, s.x + Math.cos(a) * r, s.z + Math.sin(a) * r))
          radius = r;
      assert(radius > 3 && radius < 7.5);
      radii.push(Math.round(radius * 100));
    }
    assert(Math.max(...radii) - Math.min(...radii) > 35);
    profiles.push(JSON.stringify(radii));
    assert(w.geometry.attributes.position.array.every(Number.isFinite));
    const uv = w.geometry.attributes.uv;
    assert(
      Math.abs(uv.getX(1) - uv.getX(0)) < 0.25,
      "basalt has a world scale",
    );
  }
  assert.equal(new Set(profiles).size, 4);
  assert.equal(samples, 1296);
});

test("slag excavations retain all field foundations and thermal working pads", (t) => {
  const g = fixture(t),
    p = g.terrainProfile;
  const points = g.map.features
    .filter((f) => f.type === "field")
    .map((f) => ({ x: f.x * 7, z: f.z * 7 }));
  for (const f of g.map.features.filter((f) => f.type === "mechanism")) {
    const trial = THERMAL_TRIALS[f.stage];
    if (!trial) continue;
    for (let i = 0; i < thermalCount(trial); i++) {
      const q = thermalPosition(trial, i);
      points.push({ x: f.x * 7 + q.x, z: f.z * 7 + q.z });
    }
  }
  assert.equal(points.length, 126);
  for (const q of points)
    for (const dx of [-0.8, 0, 0.8])
      for (const dz of [-0.8, 0, 0.8]) {
        const x = q.x + dx,
          z = q.z + dz;
        assert(Math.abs(p.height(x, z) - p.foundationHeight(x, z)) < 0.00001);
        assert.equal(hotLavaAt(g, x, z), null);
      }
});

test("lava hazards follow visible terrain intersections and shared guardian footing, then respect saved cooling", (t) => {
  const g = fixture(t),
    enemy = { art: { scale: 1 } };
  for (const w of g.waterMeshes) {
    const { x, z, stage } = w.userData;
    assert.equal(hotLavaAt(g, x, z), w);
    assert.equal(guardianFooting(g, enemy, x, z), false);
    for (const sign of [-1, 1]) {
      // These dry corners were inside the former fixed seven-meter damage box.
      assert.equal(hotLavaAt(g, x + sign * 6.7, z + 6.7), null);
      assert.equal(guardianFooting(g, enemy, x + sign * 6.7, z + 6.7), true);
    }
    g.progress = JSON.parse(
      JSON.stringify({
        stage,
        field: EXPEDITIONS.embers[stage].tasks.map((task) => task.id),
      }),
    );
    updateWaterSurfaces(g, 100);
    const shouldCool = [0, 2, 4].includes(stage);
    assert.equal(w.userData.cooled, shouldCool);
    assert.equal(hotLavaAt(g, x, z), shouldCool ? null : w);
    assert.equal(guardianFooting(g, enemy, x, z), shouldCool);
    assert.equal(
      w.material.userData.forgeUniforms.forgeHeat.value,
      shouldCool ? 0 : 1,
    );
    assert.equal(
      g.groundHeight(x, z),
      shouldCool ? w.position.y : g.terrainProfile.height(x, z),
    );
    g.progress = { stage: 0, field: [] };
    updateWaterSurfaces(g, 100);
  }
});
