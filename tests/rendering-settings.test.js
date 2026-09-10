import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { SolidContactPass } from "../src/rendering.js";
import { addQuarryDepth } from "../src/quarry-depth.js";

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

test("quarry depth shares exact triangles and transforms without adding color, shadows, normal surfaces or ray hits", () => {
  const scene = new THREE.Scene(),
    root = new THREE.Group(),
    material = new THREE.MeshStandardMaterial(),
    originals = [
      new THREE.BoxGeometry(3, 4, 2),
      new THREE.BoxGeometry(2, 5, 3),
    ].map((geometry, i) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(i * 5, i * 2, 0);
      mesh.rotation.set(0.1 * i, 0.3, 0);
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
      return mesh;
    });
  scene.add(root);
  scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 8),
      new THREE.Vector3(0, 0, -1),
    ),
    before = ray
      .intersectObject(root, true)
      .map((h) => ({ object: h.object, point: h.point.clone() })),
    geometries = originals.map((m) => m.geometry);
  assert(before.length > 0);
  addQuarryDepth(root);
  const depths = root.children.filter((m) => m.userData.quarryDepth);
  assert.equal(depths.length, originals.length);
  assert.equal(new Set(depths.map((m) => m.material)).size, 1);
  for (const [i, depth] of depths.entries()) {
    assert.equal(
      depth.geometry,
      geometries[i],
      "no copied or simplified buffers",
    );
    assert.equal(originals[i].material, material);
    assert(depth.renderOrder < originals[i].renderOrder);
    assert.equal(depth.material.colorWrite, false);
    assert.equal(depth.material.depthWrite, true);
    assert.equal(depth.material.depthTest, true);
    assert.equal(depth.material.depthFunc, THREE.LessEqualDepth);
    assert.equal(depth.castShadow || depth.receiveShadow, false);
  }
  scene.updateMatrixWorld(true);
  assert.deepEqual(
    ray
      .intersectObject(root, true)
      .map((h) => ({ object: h.object, point: h.point.clone() })),
    before,
  );
  root.position.set(203, -1.4, 217);
  root.rotation.y = 0.4;
  root.scale.set(1.2, 0.9, 1.1);
  scene.updateMatrixWorld(true);
  for (let i = 0; i < depths.length; i++)
    assert.deepEqual(depths[i].matrixWorld, originals[i].matrixWorld);
  const pass = Object.assign(Object.create(SolidContactPass.prototype), {
    scene,
    _visibilityCache: [],
  });
  for (const enabled of [false, true]) {
    depths.forEach((m) => (m.visible = enabled));
    pass._overrideVisibility();
    assert(depths.every((m) => !m.visible));
    assert(originals.every((m) => m.visible));
    pass._restoreVisibility();
    assert(depths.every((m) => m.visible === enabled));
  }
  geometries.forEach((g) => g.dispose());
  depths[0].material.dispose();
  material.dispose();
});
