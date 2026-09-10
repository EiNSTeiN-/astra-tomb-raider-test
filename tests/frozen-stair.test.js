import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { advanceCharacter, supportAt } from "../src/character-motion.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { finishFieldTask } from "../src/field-world.js";
import {
  buildFrozenStair,
  updateFrozenStair,
  startFrozenStair,
  frozenStairObjective,
} from "../src/frozen-stair.js";
import { normalizeFrozenStair, STAIR_RISE } from "../src/frozen-stair-rules.js";

function fixture(progress = { stage: 3 }) {
  const store = new SaveStore({
    getItem: () => JSON.stringify({ version: 1, levels: { frost: progress } }),
    setItem() {},
  });
  const world = new THREE.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level: LEVELS[2],
    map: createMap(LEVELS[2]),
    progress: store.level("frost"),
    store,
    world,
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    cameraSurfaces: new CameraSurfaces(world),
    stoneMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
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
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  try {
    buildFrozenStair(g);
  } finally {
    globalThis.document = old;
  }
  g.cameraSurfaces.rebuild();
  g.player.position.set(131, 0, 227);
  return g;
}
function tick(g, n = 1, v = { x: 0, z: 0 }, jump = false) {
  for (let i = 0; i < n; i++) {
    updateFrozenStair(g, 1 / 60);
    if (!g.paused) advanceCharacter(g, v, 1 / 60, jump && i === 0);
  }
}
function place(g, x, y, z) {
  g.player.position.set(g.frozenStair.x + x, y, g.frozenStair.z + z);
  Object.assign(g, {
    jumpY: y,
    grounded: true,
    velocityY: 0,
    climb: null,
    airVelocity: null,
  });
}
function walk(g, x, z, speed = 3) {
  x += g.frozenStair.x;
  z += g.frozenStair.z;
  for (let i = 0; i < 1200; i++) {
    const dx = x - g.player.position.x,
      dz = z - g.player.position.z,
      d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const s = Math.min(speed, d * 40);
    tick(g, 1, { x: (dx / d) * s, z: (dz / d) * s });
  }
  assert.fail(`blocked toward ${x},${z} at ${g.player.position.toArray()}`);
}

test("the frozen stair groups its existing field objectives in a connected clearing without adding a fourth field task", () => {
  const m = createMap(LEVELS[2]);
  const fields = m.features.filter((f) => f.type === "field" && f.stage === 3);
  assert.equal(fields.length, 3);
  assert.deepEqual(
    fields.map((f) => f.stairHeight),
    [0, 2.8, 6],
  );
  for (const f of fields) assert(m.grid[f.z][f.x]);
  assert.equal(fields[2].kind, "survey");
  for (const level of LEVELS.filter((l) => l.id !== "frost"))
    assert.equal(createMap(level).frozenStair, undefined);
});

test("stair progress respects both locks, restores legacy completions and normalizes independently by chapter", () => {
  assert.deepEqual(
    normalizeFrozenStair({ restored: true }, { stage: 3, field: [] }),
    { restored: false },
  );
  assert.deepEqual(
    normalizeFrozenStair(
      { restored: true },
      { stage: 3, field: ["field-3-0", "field-3-1"] },
    ),
    { restored: true },
  );
  assert.deepEqual(
    normalizeFrozenStair(null, { stage: 3, field: ["field-3-2"] }),
    { restored: true },
  );
  assert.deepEqual(normalizeFrozenStair(null, { stage: 4, field: [] }), {
    restored: true,
  });
  const data = normalizeSave({
    version: 1,
    levels: {
      frost: { stage: 3.5 },
      verdant: { frozenStair: { restored: true } },
    },
  });
  assert.equal(data.levels.frost.frozenStair.restored, false);
  assert.equal(data.levels.verdant.frozenStair, null);
});

test("both field locks precede hauling; lowering blocks entry, pauses quietly and saves only its seated stop", () => {
  const g = fixture(),
    s = g.frozenStair,
    fields = g.map.features.filter((f) => f.stage === 3 && f.type === "field");
  assert.equal(startFrozenStair(g), false);
  assert.equal(finishFieldTask(g, fields[1]), false);
  assert.equal(finishFieldTask(g, fields[0]), true);
  assert.equal(startFrozenStair(g), false);
  assert.equal(finishFieldTask(g, fields[1]), true);
  assert.equal(finishFieldTask(g, fields[2]), false);
  assert(frozenStairObjective(g).text.includes("Haul"));
  assert.equal(startFrozenStair(g), true);
  assert.equal(startFrozenStair(g), false);
  tick(g, 45);
  const angle = s.flight.rotation.x,
    saveCount = g.saves;
  assert(angle > -Math.PI / 2 && angle < 0);
  assert(s.sources.every((x) => x.activity === 1));
  assert.equal(g.canMove(s.x, s.z + 6, 0), false);
  g.paused = true;
  tick(g, 90);
  assert.equal(s.flight.rotation.x, angle);
  assert(s.sources.every((x) => x.activity === 0));
  assert.equal(s.saved.restored, false);
  g.paused = false;
  tick(g, 180);
  assert.equal(s.saved.restored, true);
  assert.equal(s.motion, null);
  assert(Math.abs(s.flight.rotation.x) < 1e-9);
  assert.equal(g.saves, saveCount + 1);
  assert(s.sources.every((x) => x.activity === 0));
  assert.equal(startFrozenStair(g), false);
  assert.equal(finishFieldTask(g, fields[2]), true);
  assert.equal(frozenStairObjective(g), null);
});

test("the west gallery requires crossing its gap, and the restored stair supports a full ascent and descent", () => {
  const g = fixture();
  // The two entry ledges use the existing mantle controller; continue from its
  // supported 2.8 m arrival to exercise the distinct gallery gap.
  place(g, -7, 2.8, 5.5);
  walk(g, -7, 2.2);
  const before = g.player.position.clone();
  tick(g, 52, { x: 0, z: -4 }, true);
  assert(g.player.position.z < g.frozenStair.z);
  assert.equal(g.grounded, true);
  assert(Math.abs(g.player.position.y - 2.8) < 0.01);
  walk(g, -7, -6);
  place(g, -7, 2.8, 2.2);
  tick(g, 15, { x: 0, z: -3 });
  assert.equal(g.grounded, false);
  assert(g.player.position.y < before.y);
  g.progress.field = ["field-3-0", "field-3-1"];
  place(g, 5, 0, 3);
  assert(startFrozenStair(g));
  tick(g, 200);
  place(g, 0, 0, 10);
  walk(g, 0, -7, 6);
  assert(Math.abs(g.player.position.y - STAIR_RISE) < 0.01);
  assert.equal(
    g.canMove(g.frozenStair.x + 1.78, g.frozenStair.z + 2, 3.4),
    false,
    "the stair handrail blocks walking through its edge",
  );
  walk(g, 0, 10, 6);
  assert.equal(g.player.position.y, 0);
});

test("the upper deck preserves headroom and blocks sight through its slab; restored steps survive a new game", () => {
  const g = fixture({
      stage: 3,
      field: ["field-3-0", "field-3-1"],
      frozenStair: { restored: true },
    }),
    s = g.frozenStair;
  assert.equal(s.open, 1);
  assert.equal(g.canMove(s.x, s.z - 7, 0), true);
  assert.equal(g.canMove(s.x, s.z - 7, 5), false);
  assert.equal(
    g.lineOfSight(
      new THREE.Vector3(s.x, 7, s.z - 7),
      new THREE.Vector3(s.x, 0, s.z - 7),
      0,
      0,
    ),
    false,
  );
  assert.equal(supportAt(g, s.x, s.z - 7, 6).height, 6);
  const fresh = fixture({ stage: 4, field: [] });
  assert(fresh.frozenStair.saved.restored);
  assert.equal(
    supportAt(fresh, fresh.frozenStair.x, fresh.frozenStair.z - 7, 6).height,
    6,
  );
});
