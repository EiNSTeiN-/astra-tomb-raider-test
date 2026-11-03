import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { cavernPoolUniforms } from "../src/cavern-pool-material.js";
import { terrainMaterial } from "../src/terrain-material.js";
import { pavingMaterial } from "../src/station-yards.js";

test("pool planes update early paving references in place and leave the delivered chapter unchanged", () => {
  const map = createMap(LEVELS[6]),
    profile = createTerrainProfile(map, LEVELS[6]),
    beforeMap = JSON.stringify(map),
    beforeHeights = profile.heights.slice(),
    beforeWater = structuredClone(profile.waters),
    u = cavernPoolUniforms(map),
    sites = u.cavernPoolSites.value.slice(),
    bounds = u.cavernPoolBounds.value.slice();
  assert(sites.every((v) => v.x === 1e5 && v.y === 1e5));
  assert.equal(cavernPoolUniforms(map, profile), u);
  const pools = profile.waters.filter((s) => s.shore === "crystal");
  assert.equal(pools.length, 4);
  for (const [i, s] of pools.entries()) {
    assert.equal(u.cavernPoolSites.value[i], sites[i]);
    assert.equal(u.cavernPoolBounds.value[i], bounds[i]);
    assert.deepEqual(sites[i].toArray(), [s.x, s.z, s.baseY, i]);
    assert.deepEqual(bounds[i].toArray(), [s.width / 2, s.length / 2]);
    assert(sites[i].toArray().every(Number.isFinite));
  }
  assert.equal(JSON.stringify(map), beforeMap);
  assert.deepEqual(profile.heights, beforeHeights);
  assert.deepEqual(profile.waters, beforeWater);
  const other = cavernPoolUniforms(structuredClone(map), profile);
  assert.notEqual(other.cavernPoolStrength, u.cavernPoolStrength);
  u.cavernPoolStrength.value = 0;
  assert.equal(other.cavernPoolStrength.value, 1);
  assert.equal(cavernPoolUniforms(map).cavernPoolStrength.value, 0);
  cavernPoolUniforms(map, { waters: [] });
  assert(sites.every((v) => v.x === 1e5 && v.y === 1e5));
  assert(bounds.every((v) => v.length() === 0));
  assert.equal(cavernPoolUniforms(map, profile), u);
  assert.equal(u.cavernPoolSites.value[0], sites[0]);
});

test("the live terrain and paving hooks share wet-bed erosion without new textures in any chapter", async (t) => {
  const urls = [];
  t.mock.method(T.TextureLoader.prototype, "load", (url, done) => {
    urls.push(url);
    const texture = new T.Texture();
    queueMicrotask(() => done?.(texture));
    return texture;
  });
  for (const level of LEVELS) {
    const map = createMap(level),
      profile = createTerrainProfile(map, level),
      paving = pavingMaterial(level.biome, map),
      copy = paving.clone();
    copy.onBeforeCompile = paving.onBeforeCompile;
    copy.customProgramCacheKey = paving.customProgramCacheKey;
    const g = { level, map, terrainProfile: profile },
      ground = terrainMaterial(g);
    await g.terrainTexturesReady;
    const shaders = [ground, paving, copy].map((m) => {
      const shader = {
        uniforms: {},
        vertexShader: T.ShaderLib.standard.vertexShader,
        fragmentShader: T.ShaderLib.standard.fragmentShader,
      };
      m.onBeforeCompile(shader);
      return shader;
    });
    if (level.biome === "crystal") {
      const u = cavernPoolUniforms(map);
      for (const shader of shaders)
        for (const [key, value] of Object.entries(u))
          assert.equal(shader.uniforms[key], value);
      assert(
        shaders[0].fragmentShader.indexOf("CavePool poolGround=") >
          shaders[0].fragmentShader.indexOf("terrainAlbedo=dripGroundColor"),
      );
      assert(
        shaders[0].fragmentShader.includes(
          "terrainN=karstNormal(terrainN,poolGround.relief)",
        ),
      );
      assert(
        shaders[1].fragmentShader.includes(
          "diffuseColor.a*=1.-inlayPool.coverage",
        ),
      );
      assert(ground.customProgramCacheKey().includes("pool-beds-1"));
      assert(paving.customProgramCacheKey().includes("pool-beds-1"));
      u.cavernPoolStrength.value = 0;
      assert(shaders.every((s) => s.uniforms.cavernPoolStrength.value === 0));
    } else {
      assert(shaders.every((s) => !s.uniforms.cavernPoolStrength));
      assert(!ground.customProgramCacheKey().includes("pool-beds-1"));
      assert(!paving.customProgramCacheKey().includes("pool-beds-1"));
    }
    assert(
      shaders.every((s) => !s.vertexShader.includes("cavernPool")),
      "the treatment leaves vertex positions and their sampler contract alone",
    );
    const textures = new Set();
    for (const m of [ground, paving, copy]) {
      for (const value of Object.values(m))
        if (value?.isTexture) textures.add(value);
      for (const value of m.userData.additionalTextures || [])
        textures.add(value);
      m.dispose();
    }
    for (const tex of textures) tex.dispose();
  }
  assert(urls.length > 0);
  assert(
    urls.every((url) => !url.includes("pool")),
    "only the already-delivered texture sets are requested",
  );
});
