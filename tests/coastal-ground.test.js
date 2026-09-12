import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile, buildTerrainSurface } from "../src/terrain.js";
import { coastalLayout } from "../src/coastal-layout.js";
import {
  coastalUniforms,
  updateCoastalWater,
} from "../src/coastal-material.js";
import {
  buildWaterSurfaces,
  updateWaterSurfaces,
} from "../src/water-surface.js";

const level = LEVELS[3],
  map = createMap(level),
  profile = createTerrainProfile(map, level);

test("coastal paving covers the ten arcade floors and actual causeway turns without extending the playable land", () => {
  const plan = coastalLayout(map);
  for (const room of map.rooms) {
    for (const [dx, dz] of [
      [0, -16],
      [14, 14],
      [-14, -14],
      [0, 19],
      [19, 0],
    ])
      assert.ok(
        plan.coverage(room.x * 7 + dx, room.z * 7 + dz) > 0.95,
        `court ${room.index}: ${dx}/${dz}`,
      );
    assert.equal(plan.nearest(room.x * 7, room.z * 7).index, room.index);
  }
  for (const path of map.paths)
    for (const p of path)
      assert.equal(
        plan.coverage(p.x * 7, p.z * 7),
        1,
        "route centers remain connected",
      );
  for (let z = 0; z < map.size; z++)
    for (let x = 0; x < map.size; x++) {
      const value = plan.coverage(x * 7, z * 7);
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
      if (!map.grid[z][x]) assert.equal(value, 0);
    }
});

test("material route coordinates do not change terrain, reservoirs or saved foundation heights", () => {
  const withoutRoutes = createTerrainProfile({ ...map, paths: [] }, level);
  assert.deepEqual(profile.heights, withoutRoutes.heights);
  assert.deepEqual(profile.waters, withoutRoutes.waters);
  assert.ok(
    profile.courts.some((v, i) => v !== withoutRoutes.courts[i]),
    "route plan affects visible paving",
  );
  for (const f of map.features)
    assert.equal(
      profile.foundationHeight(f.x * 7, f.z * 7),
      withoutRoutes.foundationHeight(f.x * 7, f.z * 7),
    );
  assert.equal(
    createTerrainProfile(createMap(LEVELS[2]), LEVELS[2]).coastal,
    null,
  );
});

function fixture(t) {
  t.mock.method(THREE.TextureLoader.prototype, "load", function (url, onLoad) {
    const texture = new THREE.Texture();
    queueMicrotask(() => onLoad?.(texture));
    return texture;
  });
  const game = {
    level,
    map,
    terrainProfile: profile,
    world: new THREE.Group(),
    waterMeshes: [],
    groundHeight: profile.height,
    elapsed: 0,
    progress: { stage: 0, field: [], completed: false },
  };
  buildTerrainSurface(game);
  buildWaterSurfaces(game);
  t.after(() => {
    const materials = new Set();
    game.world.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) materials.add(o.material);
    });
    for (const m of materials) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.userData.additionalTextures?.forEach((t) => t.dispose());
      m.dispose();
    }
  });
  return game;
}

test("chunk borders share material coordinates, terrain normals and ground contact", async (t) => {
  const game = fixture(t);
  await game.terrainTexturesReady;
  const seen = new Map();
  let duplicates = 0;
  for (const mesh of game.terrainMeshes) {
    const p = mesh.geometry.attributes.position,
      c = mesh.geometry.attributes.coast,
      n = mesh.geometry.attributes.normal;
    assert.equal(c.count, p.count);
    assert.ok(c.array.every(Number.isFinite));
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i)},${p.getZ(i)}`,
        value = [
          p.getY(i),
          c.getX(i),
          c.getY(i),
          c.getZ(i),
          n.getX(i),
          n.getY(i),
          n.getZ(i),
        ];
      const fx = p.getX(i) / profile.step,
        fz = p.getZ(i) / profile.step;
      const original =
        Math.abs(fx - Math.round(fx)) < 1e-7 &&
        Math.abs(fz - Math.round(fz)) < 1e-7;
      if (original)
        assert.ok(
          Math.abs(p.getY(i) - profile.height(p.getX(i), p.getZ(i))) < 0.000001,
        );
      else {
        // A bank cut interpolates the original rendered triangle. Bilinear
        // terrain sampling agrees at grid vertices, but differs inside a cell.
        const x = Math.floor(fx) * profile.step,
          z = Math.floor(fz) * profile.step,
          tx = fx - Math.floor(fx),
          tz = fz - Math.floor(fz);
        const a = profile.height(x, z),
          b = profile.height(x + profile.step, z),
          d = profile.height(x, z + profile.step),
          e = profile.height(x + profile.step, z + profile.step);
        const triangle =
          tx + tz <= 1
            ? a + (b - a) * tx + (d - a) * tz
            : e + (d - e) * (1 - tx) + (b - e) * (1 - tz);
        assert.ok(
          Math.abs(p.getY(i) - triangle) < 0.0001,
          "cut vertices stay on their source triangle",
        );
      }
      if (seen.has(key)) {
        if (original) assert.deepEqual(value, seen.get(key));
        else
          value.forEach((number, index) =>
            assert.ok(Math.abs(number - seen.get(key)[index]) < 0.00003),
          );
        duplicates++;
      } else seen.set(key, value);
    }
  }
  assert.ok(duplicates > 1000);
  assert.equal(game.terrainMeshes[0].material.defines.TERRAIN_COASTAL, 1);
});

test("damp terrain follows actual draining water, including waterfall basins sharing a reservoir", async (t) => {
  const game = fixture(t);
  await game.terrainTexturesReady;
  const h =
    game.terrainMeshes[0].material.userData.terrainUniforms.coastalWaterHeight
      .value;
  assert.equal(h.length, game.terrainProfile.waters.length);
  assert.equal(
    game.terrainMeshes[0].material.defines.COASTAL_BASIN_COUNT,
    h.length,
  );
  const index = (id) =>
    game.terrainProfile.waters.findIndex((w) => w.id === id);
  const well1 = index("reservoir-1"),
    well3 = index("reservoir-3"),
    well5 = index("reservoir-5"),
    well9 = index("reservoir-9"),
    fall0 = index("basin-0"),
    fall3 = index("basin-3"),
    fall9 = index("basin-9"),
    lock = index("arcade-lock");
  const original = Array.from(h);
  game.progress.stage = 3;
  updateWaterSurfaces(game, 100);
  assert.ok(Math.abs(h[well1] - (original[well1] - 1.8)) < 0.000001);
  assert.ok(Math.abs(h[well3] - (original[well3] - 1.8)) < 0.000001);
  assert.equal(
    h[fall3],
    h[well3],
    "the contained waterfall uses its reservoir level",
  );
  assert.equal(h[fall9], h[well9]);
  assert.equal(
    h[fall0],
    original[fall0],
    "independent first waterfall retains its water level",
  );
  assert.equal(h[well5], original[well5], "locked reservoir is not drained");
  game.progress.arcadeLock = { level: 0.6 };
  updateWaterSurfaces(game, 0);
  assert(
    Math.abs(h[lock] - original[lock] - 5.6 * 0.6) < 1e-6,
    "lock shoreline tracks its live flood level",
  );
  const saved = Array.from(h);
  updateWaterSurfaces(game, 0);
  assert.deepEqual(Array.from(h), saved);
  assert.doesNotThrow(() => updateCoastalWater({ terrainMeshes: [] }));
  const fresh = coastalUniforms(game);
  assert.notEqual(fresh.coastalWaterHeight.value, h);
});
