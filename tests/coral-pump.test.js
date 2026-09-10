import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { advanceCharacter } from "../src/character-motion.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { carryingComponent, fieldComplete } from "../src/expeditions.js";
import { finishFieldTask } from "../src/field-world.js";
import {
  buildCoralPump,
  updateCoralPump,
  coralPumpInteract,
  coralPumpObjective,
  coralPumpBlocked,
  coralPumpOccludes,
} from "../src/coral-pump.js";
import {
  normalizeCoralPump,
  pumpPressureTarget,
  advancePump,
  PUMP_SETTLE_SECONDS,
} from "../src/coral-pump-rules.js";

function fixture(progress = { stage: 2, field: ["field-2-0", "field-2-1"] }) {
  const store = new SaveStore({
    getItem: () => JSON.stringify({ version: 1, levels: { tides: progress } }),
    setItem() {},
  });
  const world = new THREE.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level: LEVELS[3],
    map: createMap(LEVELS[3]),
    progress: store.level("tides"),
    store,
    world,
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    cameraSurfaces: new CameraSurfaces(world),
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
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
  g.items = g.map.features.map((f) => ({ ...f, group: new THREE.Group() }));
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  try {
    buildCoralPump(g);
  } finally {
    globalThis.document = old;
  }
  g.cameraSurfaces.rebuild();
  g.player.position.copy(g.coralPump.controls.seat);
  return g;
}
function at(g, key) {
  g.player.position.copy(g.coralPump.controls[key]);
}
function tick(g, n, dt = 1 / 60) {
  for (let i = 0; i < n; i++) updateCoralPump(g, dt);
}

test("the pump requires recovered parts and inspection, releases the carrying restriction only when seated, and cannot be completed by generic delivery", () => {
  const g = fixture({ stage: 2, field: [] }),
    p = g.coralPump;
  assert.equal(coralPumpInteract(g), true);
  assert.equal(p.saved.installed, false);
  g.progress.field.push("field-2-0");
  assert(carryingComponent(g.level, g.progress));
  coralPumpInteract(g);
  assert.equal(p.saved.installed, false);
  g.progress.field.push("field-2-1");
  assert.equal(finishFieldTask(g, p.feature), false);
  coralPumpInteract(g);
  assert(p.saved.installed);
  assert.equal(carryingComponent(g.level, g.progress), false);
  assert.equal(fieldComplete(g.level, g.progress), false);
  assert.equal(finishFieldTask(g, p.feature), false);
  at(g, "intake");
  coralPumpInteract(g);
  coralPumpInteract(g);
  at(g, "bypass");
  coralPumpInteract(g);
  tick(g, 600);
  assert.equal(fieldComplete(g.level, g.progress), true);
  assert.equal(g.progress.field.filter((id) => id === "field-2-2").length, 1);
  const saves = g.saves;
  tick(g, 120);
  assert.equal(g.saves, saves);
  assert.equal(coralPumpObjective(g), null);
  assert.equal(p.repeaters.length, 2);
  assert(p.repeaters.every((n) => n.rotation.z === p.needle.rotation.z));
});

test("both viable valve settings require a settled five-second band; pressure sweeps, underfeeding and pauses do not count", () => {
  for (const dt of [1 / 20, 1 / 30, 1 / 60]) {
    for (const [intake, bypass] of [
      [2, 0],
      [3, 2],
    ]) {
      const p = {
        saved: { installed: true, intake, bypass },
        pressure: 0,
        stable: 0,
      };
      let t = 0;
      while (t < 20 && !advancePump(p, dt)) t += dt;
      assert(t > 5 && t < 12, `${intake}/${bypass} settles at ${dt}`);
    }
    for (const [intake, bypass] of [
      [1, 0],
      [2, 1],
      [3, 0],
      [3, 1],
      [0, 0],
    ]) {
      const p = {
        saved: { installed: true, intake, bypass },
        pressure: 44,
        stable: 4.9,
      };
      for (let i = 0; i < 20 / dt; i++) assert.equal(advancePump(p, dt), false);
      assert.equal(p.stable, 0);
    }
  }
  const g = fixture();
  coralPumpInteract(g);
  at(g, "intake");
  coralPumpInteract(g);
  coralPumpInteract(g);
  at(g, "bypass");
  coralPumpInteract(g);
  tick(g, 240);
  assert(g.coralPump.stable > 0 && g.coralPump.stable < PUMP_SETTLE_SECONDS);
  const before = [
    g.coralPump.pressure,
    g.coralPump.stable,
    g.coralPump.rotor.rotation.z,
  ];
  g.paused = true;
  tick(g, 600);
  assert.deepEqual(
    [g.coralPump.pressure, g.coralPump.stable, g.coralPump.rotor.rotation.z],
    before,
  );
  assert(g.coralPump.sources.every((s) => s.activity === 0));
  g.paused = false;
  coralPumpInteract(g);
  assert.equal(g.coralPump.stable, 0);
});

test("installed parts and valve settings survive reload, partial settling restarts safely, legacy completions remain open and unrelated chapters discard pump data", () => {
  const g = fixture();
  coralPumpInteract(g);
  at(g, "intake");
  coralPumpInteract(g);
  coralPumpInteract(g);
  const normalized = normalizeSave({
    version: 1,
    levels: {
      tides: g.progress,
      verdant: { coralPump: { installed: true, intake: 3, bypass: 1 } },
    },
  });
  assert.deepEqual(normalized.levels.tides.coralPump, {
    installed: true,
    intake: 2,
    bypass: 3,
  });
  assert.equal(normalized.levels.verdant.coralPump, null);
  const reloaded = fixture(normalized.levels.tides);
  assert.equal(reloaded.coralPump.pressure, 0);
  assert.equal(reloaded.coralPump.stable, 0);
  assert.equal(carryingComponent(reloaded.level, reloaded.progress), false);
  for (const progress of [
    { stage: 3, field: [] },
    { stage: 2, field: ["field-2-2"] },
  ])
    assert.deepEqual(normalizeCoralPump(null, progress), {
      installed: true,
      intake: 2,
      bypass: 0,
    });
  assert.deepEqual(
    normalizeCoralPump({ installed: true, intake: 99, bypass: -2 }, g.progress),
    { installed: true, intake: 0, bypass: 3 },
  );
  assert.deepEqual(
    normalizeCoralPump(
      { installed: true, intake: 2, bypass: 0 },
      { stage: 2, field: [] },
    ),
    { installed: false, intake: 0, bypass: 3 },
  );
  assert.deepEqual(
    normalizeCoralPump(
      { installed: true, intake: 3, bypass: 2 },
      { stage: 2, field: ["field-2-2"] },
    ),
    { installed: true, intake: 3, bypass: 2 },
  );
  assert.equal(
    pumpPressureTarget({ installed: false, intake: 3, bypass: 0 }),
    0,
  );
});

test("the pump casing and cisterns stop walking and sight while both control aisles remain connected through character physics", () => {
  const g = fixture(),
    p = g.coralPump;
  assert(coralPumpBlocked(g, p.x, p.z, 0));
  assert(
    coralPumpOccludes(
      g,
      { x: p.x, y: 1.4, z: p.z + 3 },
      { x: p.x, y: 1.4, z: p.z - 3 },
    ),
  );
  const walk = (x, z) => {
    x += p.x;
    z += p.z;
    for (let i = 0; i < 1200; i++) {
      const dx = x - g.player.position.x,
        dz = z - g.player.position.z,
        d = Math.hypot(dx, dz);
      if (d < 0.06) return;
      const speed = Math.min(3, d * 40);
      advanceCharacter(
        g,
        { x: (dx / d) * speed, z: (dz / d) * speed },
        1 / 60,
        false,
      );
    }
    assert.fail(`blocked at ${g.player.position.toArray()} toward ${x},${z}`);
  };
  for (const point of [
    [0, 4],
    [-2.8, 4],
    [-2.8, 2.4],
    [-2.8, 4],
    [2.8, 4],
    [2.8, 2.4],
    [2.8, 6],
    [8.5, 6],
    [8.5, -5],
    [0, -5],
    [-8.5, -5],
    [-8.5, 6],
    [0, 6],
  ])
    walk(...point);
  assert.equal(g.health, 100);
  assert.equal(
    coralPumpOccludes(
      g,
      { x: p.x, y: 6, z: p.z + 5 },
      { x: p.x, y: 6, z: p.z - 5 },
    ),
    false,
  );
});
