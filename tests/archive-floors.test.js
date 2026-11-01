import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { terrainMaterial } from "../src/terrain-material.js";
import { pavingMaterial } from "../src/station-yards.js";
import { crystalFloorUniforms } from "../src/crystal-floor-material.js";
import { RESONANCE_TRIALS } from "../src/resonance-rules.js";

const compile = (material) => {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  material.onBeforeCompile(shader);
  return shader;
};

test("archive floor plans cover the complete tuning arrays and retain chapter data", () => {
  const map = createMap(LEVELS[6]),
    before = JSON.stringify(map),
    uniforms = crystalFloorUniforms(map),
    sites = uniforms.crystalFloorSites.value;
  assert.equal(sites.length, 8);
  assert.equal(crystalFloorUniforms(map), uniforms);
  for (const [stage, site] of sites.entries()) {
    const f = map.features.find(
      (f) => f.type === "mechanism" && f.stage === stage,
    );
    assert.equal(site.x, f.x * 7);
    assert.equal(site.y, f.z * 7);
    assert(site.toArray().every(Number.isFinite));
    for (const [x, z] of RESONANCE_TRIALS[stage].positions) {
      assert(site.z >= Math.abs(x) + 5);
      assert(site.w >= z + 7);
    }
    assert(site.z <= 15 && site.w <= 28);
  }
  assert.equal(JSON.stringify(map), before);
  const other = structuredClone(map);
  other.features.forEach((f) => (f.completed = true));
  assert.deepEqual(crystalFloorUniforms(other).crystalFloorSites.value, sites);
  assert.notEqual(crystalFloorUniforms(other), uniforms);
});

test("terrain, worn paving and copied hooks use one floor strength while other chapters remain isolated", async (t) => {
  const requested = [];
  t.mock.method(THREE.TextureLoader.prototype, "load", (url, done) => {
    requested.push(url);
    const tex = new THREE.Texture();
    queueMicrotask(() => done?.(tex));
    return tex;
  });
  for (const level of LEVELS) {
    const requestStart = requested.length;
    const map = createMap(level),
      g = { level, map, terrainProfile: createTerrainProfile(map, level) },
      terrain = terrainMaterial(g);
    await g.terrainTexturesReady;
    if (level.biome === "crystal") {
      assert.equal(
        requested.length - requestStart,
        3,
        "one limestone texture set",
      );
      assert.deepEqual(terrain.userData.additionalTextures, []);
      const shared = terrain.userData.terrainUniforms;
      for (const prefix of ["paving", "cliff"]) {
        assert.equal(shared[prefix + "Map"].value, terrain.map);
        assert.equal(shared[prefix + "Normal"].value, terrain.normalMap);
        assert.equal(shared[prefix + "Roughness"].value, terrain.roughnessMap);
      }
    }
    const paving = pavingMaterial(level.biome, map),
      copy = paving.clone();
    copy.onBeforeCompile = paving.onBeforeCompile;
    copy.customProgramCacheKey = paving.customProgramCacheKey;
    const shaders = [terrain, paving, copy].map(compile),
      uniforms = crystalFloorUniforms(map);
    if (level.biome === "crystal") {
      for (const s of shaders) {
        assert.equal(
          s.uniforms.crystalFloorStrength,
          uniforms.crystalFloorStrength,
        );
        assert.equal(s.uniforms.crystalFloorSites, uniforms.crystalFloorSites);
        assert(s.fragmentShader.includes("archiveStoneColor"));
      }
      uniforms.crystalFloorStrength.value = 0;
      assert(shaders.every((s) => s.uniforms.crystalFloorStrength.value === 0));
      assert.equal(
        crystalFloorUniforms(structuredClone(map)).crystalFloorStrength.value,
        0.97,
      );
      assert(terrain.customProgramCacheKey().includes("archive-floors-2"));
      assert(paving.customProgramCacheKey().includes("archive-floors-2"));
      assert.equal(
        copy.customProgramCacheKey(),
        paving.customProgramCacheKey(),
      );
    } else
      for (const s of shaders) {
        assert.equal(s.uniforms.crystalFloorStrength, undefined);
        assert.equal(s.uniforms.crystalFloorSites, undefined);
      }
    const textures = new Set();
    for (const m of [terrain, paving, copy]) {
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
      for (const v of m.userData.additionalTextures || []) textures.add(v);
      m.dispose();
    }
    for (const tex of textures) tex.dispose();
  }
  assert(requested.every((url) => url.startsWith("/assets/textures/")));
});

test("missing chapter features keep finite inactive floor entries", () => {
  for (const map of [undefined, {}, { features: [] }]) {
    const uniforms = crystalFloorUniforms(map);
    assert.equal(uniforms.crystalFloorSites.value.length, 8);
    for (const s of uniforms.crystalFloorSites.value) {
      assert(s.toArray().every(Number.isFinite));
      assert(s.x > 1e4 && s.y > 1e4);
    }
  }
});
