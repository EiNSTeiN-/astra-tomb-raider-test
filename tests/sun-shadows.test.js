import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { configureSunShadow, stabilizeSunShadow } from "../src/sun-shadows.js";

test("shadow quality changes release obsolete maps, respect device limits and preserve the light", () => {
  const sun = new THREE.DirectionalLight(),
    game = {
      sun,
      renderer: { capabilities: { maxTextureSize: 8192 } },
      store: { data: { settings: { quality: "high" } } },
    };
  sun.position.set(-70, 55, 45);
  const position = sun.position.clone(),
    target = sun.target.position.clone();
  configureSunShadow(game);
  assert.equal(sun.shadow.mapSize.x, 4096);
  assert.equal(
    sun.shadow.map,
    null,
    "configuration does not allocate a GPU map",
  );
  assert(Math.abs(sun.shadow.bias * 299.5 + 0.024) < 1e-12);
  let released = 0;
  const map = new THREE.WebGLRenderTarget(4096, 4096);
  map.addEventListener("dispose", () => released++);
  sun.shadow.map = map;
  configureSunShadow(game);
  assert.equal(sun.shadow.map, map);
  assert.equal(released, 0, "mix-only changes reuse the map");
  game.store.data.settings.quality = "medium";
  configureSunShadow(game);
  assert.equal(released, 1);
  assert.equal(sun.shadow.mapSize.x, 2048);
  assert.equal(sun.shadow.map, null);
  assert.equal(sun.shadow.needsUpdate, true);
  const medium = new THREE.WebGLRenderTarget(2048, 2048);
  medium.addEventListener("dispose", () => released++);
  sun.shadow.map = medium;
  game.store.data.settings.quality = "low";
  configureSunShadow(game);
  configureSunShadow(game);
  assert.equal(released, 2, "Performance releases the existing map once");
  assert.equal(sun.shadow.map, null);
  game.store.data.settings.quality = "high";
  game.renderer.capabilities.maxTextureSize = 1024;
  configureSunShadow(game);
  assert.equal(sun.shadow.mapSize.x, 1024);
  assert.equal(sun.shadow.mapSize.y, 1024);
  assert.deepEqual(sun.position, position);
  assert.deepEqual(sun.target.position, target);
});

test("moving shadow windows retain a fixed world texel phase through travel and elevation changes", () => {
  for (const size of [1024, 2048, 4096])
    for (const offset of [
      [-48, 72, 32],
      [-70, 55, 45],
      [-80, 42, 55],
      [-80, 88, -65],
      [-48, 50, -95],
    ]) {
      const sun = new THREE.DirectionalLight();
      sun.shadow.mapSize.set(size, size);
      sun.shadow.camera.near = 0.5;
      sun.shadow.camera.far = 300;
      const origin = new THREE.Vector3(-323, 24, 419),
        point = origin.clone().add(new THREE.Vector3(3, -1, -4)),
        direction = new THREE.Vector3(...offset);
      let previous;
      let moved = 0;
      for (let step = 0; step < 200; step++) {
        const target = origin
          .clone()
          .add(new THREE.Vector3(step * 0.017, step * 0.009, -step * 0.011));
        sun.target.position.copy(target);
        sun.position.copy(target).add(direction);
        const originalPosition = sun.position.clone();
        stabilizeSunShadow(sun);
        sun.shadow.updateMatrices(sun);
        const projected = point.clone().applyMatrix4(sun.shadow.matrix);
        const raster = new THREE.Vector2(
          projected.x * size,
          projected.y * size,
        );
        assert.deepEqual(sun.position, originalPosition);
        assert.deepEqual(sun.target.position, target);
        assert(
          Math.abs(sun.shadow.camera.right - sun.shadow.camera.left - 110) <
            1e-10,
        );
        assert(
          Math.abs(sun.shadow.camera.top - sun.shadow.camera.bottom - 110) <
            1e-10,
        );
        assert(
          Math.abs((sun.shadow.camera.right + sun.shadow.camera.left) / 2) <=
            55 / size + 1e-10,
        );
        assert(
          Math.abs((sun.shadow.camera.top + sun.shadow.camera.bottom) / 2) <=
            55 / size + 1e-10,
        );
        if (previous) {
          const delta = raster.clone().sub(previous);
          for (const value of [delta.x, delta.y])
            assert(
              Math.abs(value - Math.round(value)) < 1e-8,
              "shadow crawls between world texels",
            );
          moved += delta.length();
        }
        previous = raster;
      }
      assert(moved > 5, "the window must continue to follow the traveller");
    }
});
