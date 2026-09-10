import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { advanceCharacter, supportAt } from "../src/character-motion.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { finishFieldTask } from "../src/field-world.js";
import { buildHazards, updateHazards } from "../src/hazards.js";
import {
  buildEasternReflector,
  startEasternReflector,
  updateEasternReflector,
  reflectorObjective,
} from "../src/eastern-reflector.js";
import {
  normalizeEasternReflector,
  reflectorRampHeight,
  REFLECTOR_CLOSED,
} from "../src/eastern-reflector-rules.js";

function fixture(progress = { stage: 5 }) {
  const store = new SaveStore({
      getItem: () =>
        JSON.stringify({ version: 1, levels: { sands: progress } }),
      setItem() {},
    }),
    world = new THREE.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level: LEVELS[1],
    map: createMap(LEVELS[1]),
    progress: store.level("sands"),
    store,
    world,
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    cameraSurfaces: new CameraSurfaces(world),
    stoneMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    campMaterials: { wood: new THREE.MeshStandardMaterial() },
    groundHeight: () => 0,
    walkable: () => true,
    obstacles: [],
    traversalCourses: [],
    keys: new Set(),
    grounded: true,
    jumpY: 0,
    velocityY: 0,
    health: 100,
    elapsed: 0,
    explored: new Set(),
    audio: { tone() {} },
    cb: { toast() {} },
    save() {
      this.saves = (this.saves || 0) + 1;
    },
  });
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  try {
    buildEasternReflector(g);
  } finally {
    globalThis.document = previous;
  }
  g.cameraSurfaces.rebuild();
  place(g, 7, 0, 3);
  return g;
}
function place(g, x, y, z) {
  g.player.position.set(g.easternReflector.x + x, y, g.easternReflector.z + z);
  Object.assign(g, {
    jumpY: y,
    grounded: true,
    velocityY: 0,
    airVelocity: null,
    climb: null,
  });
}
function tick(g, n = 1, velocity = { x: 0, z: 0 }, jump = false) {
  for (let i = 0; i < n; i++) {
    updateEasternReflector(g, 1 / 60);
    if (!g.paused) advanceCharacter(g, velocity, 1 / 60, jump && i === 0);
  }
}
function walk(g, x, z, speed = 3) {
  x += g.easternReflector.x;
  z += g.easternReflector.z;
  for (let i = 0; i < 1200; i++) {
    const dx = x - g.player.position.x,
      dz = z - g.player.position.z,
      d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const v = Math.min(speed, d * 40);
    tick(g, 1, { x: (dx / d) * v, z: (dz / d) * v });
  }
  assert.fail(`blocked toward ${x},${z} at ${g.player.position.toArray()}`);
}

test("the reflector gallery fires from its east parapet at the upper pin's elevation", () => {
  const g = fixture();
  g.items = g.map.features;
  g.flames = [];
  buildHazards(g);
  const h = g.hazards.find((h) => h.stage === 5);
  assert.equal(h.fieldId, "field-5-1");
  assert.equal(h.y, 4.5);
  g.hazards = [h];
  g.elapsed = h.spec.warning + 0.01 - h.offset;
  updateHazards(g, 1 / 60);
  assert.equal(g.projectiles.length, 3);
  for (const bolt of g.projectiles) {
    assert.equal(bolt.mesh.position.x, h.x + 3.55);
    assert.ok(Math.abs(bolt.mesh.position.y - 5.7) < 1e-8);
    assert.ok(bolt.direction.x < -0.99);
    assert.ok(
      g.canMove(bolt.mesh.position.x - 0.25, bolt.mesh.position.z, 5.7),
    );
  }
  g.progress.field.push("field-5-1");
  updateHazards(g, 1 / 60);
  assert.equal(h.disabled, true);
});

test("reflector progress requires both releases and retains legacy completions independently of other chapters", () => {
  assert.deepEqual(
    normalizeEasternReflector({ raised: true }, { stage: 5, field: [] }),
    { raised: false },
  );
  assert.deepEqual(
    normalizeEasternReflector(
      { raised: true },
      { stage: 5, field: ["field-5-0", "field-5-1"] },
    ),
    { raised: true },
  );
  assert.deepEqual(
    normalizeEasternReflector(null, { stage: 5, field: ["field-5-2"] }),
    { raised: true },
  );
  assert.deepEqual(normalizeEasternReflector(null, { stage: 6, field: [] }), {
    raised: true,
  });
  const data = normalizeSave({
    version: 1,
    levels: {
      sands: { stage: 5.8 },
      frost: { easternReflector: { raised: true } },
    },
  });
  assert.equal(data.levels.sands.easternReflector.raised, false);
  assert.equal(data.levels.frost.easternReflector, null);
  const fields = createMap(LEVELS[1]).features.filter(
    (f) => f.type === "field" && f.stage === 5,
  );
  assert.deepEqual(
    fields.map((f) => f.reflectorHeight),
    [0, 4.5, 0],
  );
  assert.equal(fields[2].kind, "survey");
  assert(fields.every((f) => Number.isInteger(f.x) && Number.isInteger(f.z)));
  for (const l of LEVELS.filter((l) => l.id !== "sands"))
    assert.equal(createMap(l).easternReflector, undefined);
});

test("the braced reflector must be released before hauling, blocks its sweep, pauses quietly and saves the raised stop", () => {
  const g = fixture(),
    r = g.easternReflector,
    fields = g.map.features.filter((f) => f.type === "field" && f.stage === 5);
  assert.equal(startEasternReflector(g), false);
  assert.equal(finishFieldTask(g, fields[1]), false);
  assert(finishFieldTask(g, fields[0]));
  assert.equal(startEasternReflector(g), false);
  assert(finishFieldTask(g, fields[1]));
  assert.equal(finishFieldTask(g, fields[2]), false);
  assert(reflectorObjective(g).text.includes("hauling"));
  assert(startEasternReflector(g));
  assert.equal(startEasternReflector(g), false);
  tick(g, 75);
  assert(r.panel.rotation.x > 0 && r.panel.rotation.x < REFLECTOR_CLOSED);
  assert(r.sources.every((s) => s.activity === 1));
  assert.equal(g.canMove(r.x, r.z + 3.9, 0), false);
  const angle = r.panel.rotation.x,
    saves = g.saves;
  g.paused = true;
  tick(g, 90);
  assert.equal(r.panel.rotation.x, angle);
  assert(r.sources.every((s) => s.activity === 0));
  assert.equal(r.saved.raised, false);
  assert.equal(g.saves, saves);
  g.paused = false;
  tick(g, 210);
  assert(r.saved.raised);
  assert.equal(r.motion, null);
  assert.equal(r.panel.rotation.x, 0);
  assert.equal(g.saves, saves + 1);
  assert(r.sources.every((s) => s.activity === 0));
  assert(finishFieldTask(g, fields[2]));
  assert.equal(reflectorObjective(g), null);
});

test("the fallen timber back supports an ascent, gallery jump, westward descent and raised threshold crossing", () => {
  const g = fixture(),
    r = g.easternReflector;
  place(g, 0, 0, 4);
  walk(g, 0, -3.3, 4);
  assert(g.player.position.y > 3.9 && g.grounded);
  tick(g, 50, { x: 0, z: -4 }, true);
  assert.equal(g.grounded, true);
  assert(Math.abs(g.player.position.y - 4.5) < 0.01);
  walk(g, 0, -7);
  walk(g, -3.2, -7);
  tick(g, 57, { x: -4, z: 0 }, true);
  tick(g, 8);
  assert.equal(g.grounded, true);
  assert(Math.abs(g.player.position.y - 3) < 0.01);
  walk(g, -7, -3.3);
  walk(g, -7, 0.4);
  walk(g, -7, 4.2);
  walk(g, 7, 4.2);
  walk(g, 7, 3);
  assert.equal(g.player.position.y, 0);
  g.progress.field = ["field-5-0", "field-5-1"];
  assert(startEasternReflector(g));
  tick(g, 270);
  walk(g, 7, 5);
  walk(g, 0, 5);
  walk(g, 0, -7);
  assert.equal(g.player.position.y, 0);
  assert(g.grounded);
  assert.equal(
    supportAt(g, r.x, r.z, 0).height,
    0,
    "raised mirror no longer supports the old ramp",
  );
});

test("rendered timber agrees with ramp support and dynamic camera bounds clear the raised opening", () => {
  const g = fixture(),
    r = g.easternReflector,
    ray = new THREE.Raycaster();
  g.world.updateMatrixWorld(true);
  for (const dx of [-3, -1, 1, 3])
    for (const dz of [-3, -1, 1, 2.5]) {
      const h = reflectorRampHeight(r, r.z + dz);
      ray.set(
        new THREE.Vector3(r.x + dx, h + 0.2, r.z + dz),
        new THREE.Vector3(0, -1, 0),
      );
      ray.far = 0.4;
      const hit = ray.intersectObject(r.panel, true)[0];
      assert(hit);
      assert(Math.abs(hit.point.y - h) < 0.035);
    }
  const a = new THREE.Vector3(r.x, 1.4, r.z + 5),
    b = new THREE.Vector3(r.x, 1.4, r.z - 8);
  assert(g.cameraSurfaces.entry(a, b) < 1);
  assert.equal(g.lineOfSight(a, b, 0, 0), false);
  r.saved.raised = true;
  r.open = 1;
  updateEasternReflector(g, 0, true);
  assert.equal(g.cameraSurfaces.entry(a, b), 1);
  assert.equal(g.lineOfSight(a, b, 0, 0), true);
  const fresh = fixture({ stage: 6, field: [] });
  assert(fresh.easternReflector.saved.raised);
});
