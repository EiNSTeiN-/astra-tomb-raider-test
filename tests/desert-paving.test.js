import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import {
  desertPavingUniforms,
  DESERT_PAVING_STYLES,
} from "../src/desert-paving.js";
import { terrainMaterial } from "../src/terrain-material.js";
import { createTerrainProfile } from "../src/terrain.js";

test("paving sites follow all ten authored courts without mutating maps or sharing mutable review strength", () => {
  const map = createMap(LEVELS[1]),
    before = JSON.stringify(map),
    first = desertPavingUniforms(map),
    second = desertPavingUniforms(map);
  assert.equal(first.desertPavingCourts.value.length, 10);
  assert.equal(new Set(DESERT_PAVING_STYLES).size, 10);
  for (const [i, room] of map.rooms.entries()) {
    assert.deepEqual(first.desertPavingCourts.value[i].toArray(), [
      room.x * 7,
      room.z * 7,
      room.index,
    ]);
    assert.notEqual(
      first.desertPavingCourts.value[i],
      second.desertPavingCourts.value[i],
    );
  }
  first.desertPavingStrength.value = 0;
  assert.equal(second.desertPavingStrength.value, 1);
  assert.equal(JSON.stringify(map), before);
  const empty = desertPavingUniforms();
  assert.deepEqual(
    empty.desertPavingCourts.value.map((v) => v.toArray()),
    [[0, 0, -1]],
  );
});

test("terrain binds independent paving data only in the desert and retains its existing nine texture requests", async (t) => {
  const urls = [];
  t.mock.method(THREE.TextureLoader.prototype, "load", (url, done) => {
    urls.push(url);
    const texture = new THREE.Texture();
    queueMicrotask(() => done?.(texture));
    return texture;
  });
  for (const level of LEVELS) {
    const map = createMap(level),
      g = { level, map, terrainProfile: createTerrainProfile(map, level) },
      start = urls.length,
      material = terrainMaterial(g);
    await g.terrainTexturesReady;
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    material.onBeforeCompile(shader);
    const data = material.userData.terrainUniforms;
    if (level.biome === "desert") {
      assert.equal(material.defines.DESERT_PAVING_COUNT, g.map.rooms.length);
      assert.equal(shader.uniforms.desertPavingCourts, data.desertPavingCourts);
      assert.equal(
        shader.uniforms.desertPavingStrength,
        data.desertPavingStrength,
      );
      assert.equal(urls.length - start, 9);
      assert.equal(material.userData.additionalTextures.length, 6);
    } else {
      assert.equal(data.desertPavingCourts, undefined);
      assert.equal(shader.uniforms.desertPavingStrength, undefined);
      assert.equal(material.defines?.DESERT_PAVING_COUNT, undefined);
    }
    const textures = new Set(material.userData.additionalTextures);
    for (const v of Object.values(material)) if (v?.isTexture) textures.add(v);
    material.dispose();
    textures.forEach((texture) => texture.dispose());
  }
});
