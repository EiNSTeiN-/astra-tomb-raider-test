import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { FoliageFraming } from "../src/foliage-framing.js";
import {
  projectedRing,
  updateGroundCues,
  disposeGroundCues,
} from "../src/ground-cues.js";

function fixture(t) {
  const world = new THREE.Group(),
    game = { world, enemies: [], hazards: [] },
    surface = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial(),
    );
  surface.rotation.x = -Math.PI / 2;
  world.add(surface);
  t.after(() => {
    disposeGroundCues(game);
    world.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
  });
  return { game, surface };
}

test("cue packets preserve world centres, radii, colors and fading through parent transforms and hidden phases", (t) => {
  const { game } = fixture(t),
    parent = new THREE.Group();
  parent.position.set(30, 5, 40);
  game.world.add(parent);
  const marker = projectedRing(
    0.88,
    1,
    new THREE.MeshBasicMaterial({ color: 0xd59de3, opacity: 0.65 }),
    0.08,
  );
  marker.position.set(2, 0.08, 3);
  marker.scale.setScalar(4.2);
  parent.add(marker);
  game.enemies.push({ id: "keeper", hp: 8, warning: marker });
  updateGroundCues(game);
  const r = game.groundCues.records[0];
  assert.deepEqual(
    [r.x, r.z, r.outer, r.inner, r.minY, r.maxY],
    [32, 43, 4.2, 0.88 * 4.2, 2.4, 7.6],
  );
  assert.deepEqual(r.color, marker.material.color.toArray());
  assert.equal(r.opacity, 0.65);
  assert.equal(
    marker.geometry.attributes.position.count,
    0,
    "no flat surface can bridge or embed in terrain",
  );
  marker.material.opacity = 0.3;
  updateGroundCues(game);
  assert.equal(game.groundCues.records[0].opacity, 0.3);
  for (const hide of [
    () => (marker.visible = false),
    () => {
      marker.visible = true;
      parent.visible = false;
    },
    () => {
      parent.visible = true;
      game.enemies[0].hp = 0;
    },
  ]) {
    hide();
    updateGroundCues(game);
    assert.equal(game.groundCues.uniforms.groundCueCount.value, 0);
  }
});

test("warnings and moving pulses retain their separate ranges and stop on disabled traps or hidden effects", (t) => {
  const { game } = fixture(t),
    root = new THREE.Group(),
    fx = new THREE.Group();
  root.position.set(10, 2, 20);
  root.add(fx);
  game.world.add(root);
  const marker = projectedRing(6.8, 7, new THREE.MeshBasicMaterial()),
    wave = projectedRing(0.91, 1, new THREE.MeshBasicMaterial(), 0.25);
  marker.position.y = 0.07;
  wave.position.y = 0.25;
  wave.scale.setScalar(3.5);
  root.add(marker);
  fx.add(wave);
  const h = { id: "pulse", root, marker, wave };
  game.hazards.push(h);
  updateGroundCues(game);
  assert.deepEqual(
    game.groundCues.records.map((r) => [r.id, r.outer, r.inner]),
    [
      ["pulse", 7, 6.8],
      ["pulse-pulse", 3.5, 0.91 * 3.5],
    ],
  );
  assert.equal(game.groundCues.records[1].maxY, 3.3);
  wave.scale.setScalar(6.9);
  updateGroundCues(game);
  assert.equal(game.groundCues.records[1].outer, 6.9);
  fx.visible = false;
  updateGroundCues(game);
  assert.equal(game.groundCues.records.length, 1);
  h.disabled = true;
  updateGroundCues(game);
  assert.equal(game.groundCues.records.length, 0);
});

test("locked ranged warnings remain visible at a swimming or raised target instead of the buried ground below it", (t) => {
  const { game } = fixture(t),
    warning = projectedRing(0.88, 1, new THREE.MeshBasicMaterial(), 0.08);
  warning.position.set(2, 0.08, 3);
  game.world.add(warning);
  const enemy = {
    id: "sentry",
    kind: "sentry",
    hp: 4,
    warning,
    aim: new THREE.Vector3(2, 8, 3),
    group: new THREE.Group(),
  };
  game.enemies.push(enemy);
  updateGroundCues(game);
  const region = game.groundCues.records[0];
  assert(
    7.8 > region.minY && 7.8 < region.maxY,
    "water or platform at the actual locked target receives the warning",
  );
  assert(
    0 < region.minY,
    "the buried ground below is not marked as the target surface",
  );
  enemy.group.position.y = 2;
  updateGroundCues(game);
  assert.deepEqual(
    game.groundCues.records[0],
    region,
    "caster motion does not change the locked target height",
  );
});

test("surface projection chains existing shaders and cache variants without changing geometry or actor and foliage materials", (t) => {
  const { game, surface } = fixture(t),
    geometry = surface.geometry.clone(),
    original = surface.geometry.attributes.position.array.slice();
  const actor = new THREE.Group();
  actor.userData.actor = true;
  const actorMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()),
    leaf = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ alphaTest: 0.35 }),
    );
  actor.add(actorMesh);
  game.world.add(actor, leaf);
  const actorHook = actorMesh.material.onBeforeCompile,
    leafHook = leaf.material.onBeforeCompile;
  let called = 0,
    variant = "high";
  surface.material.onBeforeCompile = (shader) => {
    called++;
    shader.uniforms.existing = { value: 7 };
  };
  surface.material.customProgramCacheKey = () => variant;
  updateGroundCues(game);
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  surface.material.onBeforeCompile(shader, {});
  assert.equal(called, 1);
  assert.equal(shader.uniforms.existing.value, 7);
  assert.equal(shader.uniforms.groundCueData.value, game.groundCues.texture);
  assert(shader.vertexShader.includes("instanceMatrix * groundCueWorld"));
  assert(shader.fragmentShader.includes("nonPerturbedNormal"));
  assert(surface.material.customProgramCacheKey().startsWith("high|"));
  variant = "low";
  assert(surface.material.customProgramCacheKey().startsWith("low|"));
  assert.equal(actorMesh.material.onBeforeCompile, actorHook);
  assert.equal(leaf.material.onBeforeCompile, leafHook);
  assert.deepEqual(surface.geometry.attributes.position.array, original);
});

test("one reused cue texture and material hooks release exactly once, including after late visual readiness", async (t) => {
  const { game, surface } = fixture(t);
  let ready;
  game.visualsReady = new Promise((resolve) => (ready = resolve));
  const originalHook = surface.material.onBeforeCompile,
    originalKey = surface.material.customProgramCacheKey;
  updateGroundCues(game);
  const state = game.groundCues,
    texture = state.texture;
  let disposals = 0;
  texture.addEventListener("dispose", () => disposals++);
  for (let frame = 0; frame < 120; frame++) updateGroundCues(game);
  assert.equal(game.groundCues.texture, texture);
  assert.equal(game.groundCues.materials.size, 1);
  disposeGroundCues(game);
  disposeGroundCues(game);
  ready();
  await Promise.resolve();
  assert.equal(disposals, 1);
  assert.equal(game.groundCues, null);
  assert.equal(state.materials.size, 0);
  assert.equal(surface.material.onBeforeCompile, originalHook);
  assert.equal(surface.material.customProgramCacheKey, originalKey);
});

test("a later foliage wrapper survives projection retirement and rebuilding without duplicate shader declarations", (t) => {
  const { game, surface } = fixture(t),
    framing = new FoliageFraming();
  updateGroundCues(game);
  framing.material(surface.material);
  const oldKey = surface.material.customProgramCacheKey();
  disposeGroundCues(game);
  assert.notEqual(surface.material.customProgramCacheKey(), oldKey);
  const shader = () => ({
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  });
  const retired = shader();
  surface.material.onBeforeCompile(retired, {});
  assert(!retired.vertexShader.includes("varying vec3 vGroundCueWorld"));
  assert(retired.vertexShader.includes("foliageFocusEnabled"));
  updateGroundCues(game);
  const rebuilt = shader();
  surface.material.onBeforeCompile(rebuilt, {});
  assert.equal(
    rebuilt.vertexShader.split("varying vec3 vGroundCueWorld").length - 1,
    1,
  );
  assert.equal(
    rebuilt.fragmentShader.split("uniform sampler2D groundCueData").length - 1,
    1,
  );
  assert(rebuilt.vertexShader.includes("foliageFocusEnabled"));
});

test("opaque noncontact ground cover retains its own material instead of receiving a ground warning", (t) => {
  const { game } = fixture(t),
    plant = new THREE.Mesh(
      new THREE.PlaneGeometry(),
      new THREE.MeshStandardMaterial(),
    );
  plant.userData.excludeContact = true;
  game.world.add(plant);
  const original = plant.material.onBeforeCompile;
  updateGroundCues(game);
  assert.equal(plant.material.onBeforeCompile, original);
  assert(!game.groundCues.materials.has(plant.material));
});
