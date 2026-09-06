import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";

test("quality switches refresh shadow receivers once, including hidden and shared materials", (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "devicePixelRatio",
  );
  Object.defineProperty(globalThis, "devicePixelRatio", {
    configurable: true,
    value: 2,
  });
  t.after(() => {
    if (descriptor)
      Object.defineProperty(globalThis, "devicePixelRatio", descriptor);
    else delete globalThis.devicePixelRatio;
  });
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  const stone = new THREE.MeshStandardMaterial(),
    leaves = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(geometry, stone));
  scene.add(new THREE.Mesh(geometry, [stone, leaves]));
  const distant = new THREE.Mesh(geometry, leaves);
  distant.visible = false;
  scene.add(distant);
  const game = {
    scene,
    renderer: {
      shadowMap: { enabled: false },
      setPixelRatio(value) {
        this.ratio = value;
      },
    },
    store: {
      data: { settings: { quality: "high", volume: 45, muted: false } },
    },
    audio: { setMix() {}, setVolume() {} },
    cinematic: { configure() {} },
  };
  Adventure.prototype.applySettings.call(game);
  assert.equal(game.renderer.shadowMap.enabled, true);
  assert.equal(game.renderer.shadowMap.needsUpdate, true);
  assert.equal(game.renderer.ratio, 1.75);
  assert.equal(stone.version, 1);
  assert.equal(leaves.version, 1);
  Adventure.prototype.applySettings.call(game);
  game.store.data.settings.quality = "medium";
  Adventure.prototype.applySettings.call(game);
  assert.equal(game.renderer.ratio, 1);
  assert.equal(
    stone.version,
    1,
    "mix adjustments and High/Balanced changes must not recompile unchanged shadow variants",
  );
  game.store.data.settings.quality = "low";
  Adventure.prototype.applySettings.call(game);
  assert.equal(game.renderer.shadowMap.enabled, false);
  assert.equal(stone.version, 2);
  assert.equal(leaves.version, 2);
  geometry.dispose();
  stone.dispose();
  leaves.dispose();
});
