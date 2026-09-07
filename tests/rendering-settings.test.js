import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { SolidContactPass } from "../src/rendering.js";

test("contact depth draws suppress duplicate shadows and preserve pending updates, including failures", () => {
  for (const enabled of [false, true])
    for (const autoUpdate of [false, true])
      for (const needsUpdate of [false, true])
        for (const fail of [false, true]) {
          const scene = new THREE.Scene();
          const pass = Object.assign(
            Object.create(SolidContactPass.prototype),
            {
              scene,
              camera: new THREE.PerspectiveCamera(),
              _originalClearColor: new THREE.Color(),
            },
          );
          const normal = new THREE.MeshNormalMaterial();
          const target = {};
          let draws = 0;
          const renderer = {
            shadowMap: { enabled, autoUpdate, needsUpdate },
            autoClear: true,
            getClearColor(color) {
              return color.set(0);
            },
            getClearAlpha() {
              return 1;
            },
            setClearColor() {},
            setClearAlpha() {},
            clear() {},
            setRenderTarget(value) {
              assert.equal(value, target);
            },
            render(value, camera) {
              draws++;
              assert.equal(value, scene);
              assert.equal(camera, pass.camera);
              assert.equal(scene.overrideMaterial, normal);
              assert.equal(
                this.shadowMap.enabled,
                enabled,
                "retain shader variants",
              );
              assert.equal(
                this.shadowMap.autoUpdate || this.shadowMap.needsUpdate,
                false,
              );
              if (fail) throw new Error("lost context");
            },
          };
          const draw = () =>
            pass._renderOverride(renderer, normal, target, 0x7777ff, 1);
          if (fail) assert.throws(draw, /lost context/);
          else {
            draw();
            assert.equal(scene.overrideMaterial, null);
            assert.equal(renderer.autoClear, true);
          }
          assert.equal(draws, 1, "normals and depth still render");
          assert.deepEqual(renderer.shadowMap, {
            enabled,
            autoUpdate,
            needsUpdate,
          });
          normal.dispose();
        }
});

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
