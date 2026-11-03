import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { buildCaverns } from "../src/caverns.js";
import { dripGroundUniforms } from "../src/cavern-drip-ground.js";
import { terrainMaterial } from "../src/terrain-material.js";
import { pavingMaterial } from "../src/station-yards.js";

test("all nine floor deposits match their assembled dripping impacts", (t) => {
  t.mock.method(T.TextureLoader.prototype, "load", () => new T.Texture());
  const level = LEVELS[6],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    game = Object.assign(Object.create(Adventure.prototype), {
      level,
      map,
      terrainProfile: profile,
      world: new T.Group(),
      obstacles: [],
      progress: { stage: 0, field: [] },
      jumpY: 0,
    });
  try {
    buildCaverns(game);
    const uniforms = dripGroundUniforms(map, profile),
      sites = uniforms.dripGroundSites.value;
    assert.equal(sites.length, game.cavernDrips.sites.length);
    assert.equal(sites.length, 9);
    for (const [i, site] of sites.entries()) {
      const impact = game.cavernDrips.sites[i];
      assert.equal(site.x, impact.x);
      assert.equal(site.y, impact.z);
      assert(site.toArray().every(Number.isFinite));
      assert(Math.abs(Math.hypot(site.z, site.w) - 1) < 1e-8);
    }
  } finally {
    const resources = new Set();
    game.world.traverse((o) => {
      if (o.geometry) resources.add(o.geometry);
      for (const m of [o.material].flat().filter(Boolean)) {
        resources.add(m);
        for (const v of Object.values(m)) if (v?.isTexture) resources.add(v);
      }
    });
    for (const r of resources) r.dispose();
  }
});

test("terrain supplies downhill bearings to existing shared paving references without mutating chapter data", () => {
  const map = createMap(LEVELS[6]),
    before = JSON.stringify(map),
    uniforms = dripGroundUniforms(map),
    references = uniforms.dripGroundSites.value.slice(),
    slope = { surfaceHeight: (x, z) => 20 + x * 0.2 - z * 0.1 };
  assert.equal(dripGroundUniforms(map, slope), uniforms);
  for (const [i, site] of uniforms.dripGroundSites.value.entries()) {
    assert.equal(site, references[i]);
    assert(site.z * 0.2 - site.w * 0.1 < -0.22);
  }
  assert.equal(JSON.stringify(map), before);
  const other = dripGroundUniforms(structuredClone(map));
  assert.notEqual(other.dripGroundStrength, uniforms.dripGroundStrength);
  uniforms.dripGroundStrength.value = 0;
  assert.equal(other.dripGroundStrength.value, 1);
  assert.equal(dripGroundUniforms(map).dripGroundStrength.value, 0);
});

test("floor and paving share the deposit switch while the other seven chapters have no new texture or uniform", async (t) => {
  const requests = [];
  t.mock.method(T.TextureLoader.prototype, "load", (url, done) => {
    requests.push(url);
    const texture = new T.Texture();
    queueMicrotask(() => done?.(texture));
    return texture;
  });
  for (const level of LEVELS) {
    const map = createMap(level),
      g = { level, map, terrainProfile: createTerrainProfile(map, level) },
      material = terrainMaterial(g),
      paving = pavingMaterial(level.biome, map),
      copy = paving.clone();
    copy.onBeforeCompile = paving.onBeforeCompile;
    copy.customProgramCacheKey = paving.customProgramCacheKey;
    await g.terrainTexturesReady;
    for (const m of [material, paving, copy]) {
      const shader = {
        uniforms: {},
        vertexShader: T.ShaderLib.standard.vertexShader,
        fragmentShader: T.ShaderLib.standard.fragmentShader,
      };
      m.onBeforeCompile(shader);
      if (level.biome === "crystal") {
        const shared = dripGroundUniforms(map);
        assert.equal(
          shader.uniforms.dripGroundStrength,
          shared.dripGroundStrength,
        );
        assert.equal(shader.uniforms.dripGroundSites, shared.dripGroundSites);
      } else assert.equal(shader.uniforms.dripGroundStrength, undefined);
    }
    const resources = new Set([material, paving, copy]);
    for (const m of [material, paving, copy])
      for (const value of Object.values(m))
        if (value?.isTexture) resources.add(value);
    for (const resource of resources) resource.dispose();
  }
  assert(!requests.some((url) => /drip|calcite/.test(url)));
});
