import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import {
  skyPavingUniforms,
  SKY_PAVING_STYLES,
  skyPavingPlantClear,
} from "../src/sky-paving.js";
import { terrainMaterial } from "../src/terrain-material.js";
import { createTerrainProfile } from "../src/terrain.js";

test("paving sites follow all ten authored courts without mutating maps or sharing mutable review strength", () => {
  const map = createMap(LEVELS[5]),
    before = JSON.stringify(map),
    first = skyPavingUniforms(map),
    second = skyPavingUniforms(map);
  assert.equal(first.skyPavingCourts.value.length, 10);
  assert.equal(new Set(SKY_PAVING_STYLES).size, 10);
  for (const [i, room] of map.rooms.entries()) {
    assert.deepEqual(first.skyPavingCourts.value[i].toArray(), [
      room.x * 7,
      room.z * 7,
      room.index,
    ]);
    assert.notEqual(
      first.skyPavingCourts.value[i],
      second.skyPavingCourts.value[i],
    );
  }
  first.skyPavingStrength.value = 0;
  assert.equal(second.skyPavingStrength.value, 1);
  assert.equal(JSON.stringify(map), before);
  const empty = skyPavingUniforms();
  assert.deepEqual(
    empty.skyPavingCourts.value.map((v) => v.toArray()),
    [[0, 0, -1]],
  );
});

test("plant reservation includes the complete feathered paving edge and leaning reach", () => {
  const map = { rooms: [{ x: 10, z: 12, index: 0 }] };
  // This court's rectangle is x50..90, z64..110; the shader's maximum
  // weathered reach extends another 3.5m. Probe independently stated edges.
  for (const [x, z] of [
    [70, 87],
    [46.6, 87],
    [93.4, 87],
    [70, 60.6],
    [70, 113.4],
  ])
    assert.equal(skyPavingPlantClear(map, x, z), false);
  for (const [x, z] of [
    [46.4, 87],
    [93.6, 87],
    [70, 60.4],
    [70, 113.6],
  ]) {
    assert.equal(skyPavingPlantClear(map, x, z), true);
    assert.equal(skyPavingPlantClear(map, x, z, 0.3), false);
  }
  assert.equal(skyPavingPlantClear(undefined, 70, 87), true);
});

test("unpainted steep banks retain meadow while the flat stone and bank-to-floor joins stay clear", () => {
  const map = { rooms: [{ x: 10, z: 12, index: 0 }] };
  const flat = { height: (x) => x * 0.1 },
    steep = { height: (x) => x },
    join = { height: (x) => Math.max(0, x - 70) };
  assert.equal(skyPavingPlantClear(map, 70, 87, 0.7, flat), false);
  assert.equal(skyPavingPlantClear(map, 70, 87, 0.7, steep), true);
  assert.equal(skyPavingPlantClear(map, 70.1, 87, 0.7, join), false);
  assert.equal(skyPavingPlantClear(map, 72, 87, 0.7, join), true);
});

test("terrain binds independent paving data only in the sky and retains its existing eleven texture requests", async (t) => {
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
    if (level.biome === "sky") {
      assert.equal(material.defines.SKY_PAVING_COUNT, g.map.rooms.length);
      assert.equal(shader.uniforms.skyPavingCourts, data.skyPavingCourts);
      assert.equal(shader.uniforms.skyPavingStrength, data.skyPavingStrength);
      assert.equal(urls.length - start, 11);
      assert.equal(material.userData.additionalTextures.length, 8);
    } else {
      assert.equal(data.skyPavingCourts, undefined);
      assert.equal(shader.uniforms.skyPavingStrength, undefined);
      assert.equal(material.defines?.SKY_PAVING_COUNT, undefined);
    }
    const textures = new Set(material.userData.additionalTextures);
    for (const v of Object.values(material)) if (v?.isTexture) textures.add(v);
    material.dispose();
    textures.forEach((texture) => texture.dispose());
  }
});
