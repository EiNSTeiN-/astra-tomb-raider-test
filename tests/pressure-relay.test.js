import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { advanceCharacter, supportAt } from "../src/character-motion.js";
import { restoreTraversal } from "../src/traversal.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import {
  buildPressureRelay,
  updatePressureRelay,
  pressureInteract,
  pressureControl,
  pressureObjective,
} from "../src/pressure-relay.js";
import {
  PRESSURE_PISTONS,
  normalizePressure,
  pistonHeight,
  pressureSavePosition,
  pressureBlocked,
  pressureOccludes,
} from "../src/pressure-rules.js";

export function pressureFixture(progress = null) {
  let saved = null;
  const store = new SaveStore({
      getItem: () => saved,
      setItem: (_k, v) => (saved = v),
    }),
    world = new THREE.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level: LEVELS[4],
    map: { pressureRelay: { x: 0, z: 0 } },
    world,
    store,
    progress: store.level("embers"),
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    darkMat: new THREE.MeshStandardMaterial({ vertexColors: true }),
    cameraSurfaces: new CameraSurfaces(world),
    obstacles: [],
    traversalCourses: [],
    groundHeight: () => 0,
    walkable: () => true,
    grounded: true,
    health: 100,
    hitTimer: 0,
    explored: new Set(),
    keys: new Set(),
    jumpY: 0.18,
    elapsed: 0,
    velocityY: 0,
    moveVelocity: { x: 0, z: 0 },
    audio: { tone() {} },
    cb: {
      toast() {},
      pressureRecord() {
        g.records++;
      },
    },
    records: 0,
    checkpoint: { x: 30, z: 10 },
  });
  const old = globalThis.document;
  if (progress) Object.assign(g.progress, progress);
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  try {
    buildPressureRelay(g);
  } finally {
    globalThis.document = old;
  }
  g.cameraSurfaces.rebuild();
  g.player.position.set(14, 0.18, 10);
  return g;
}
export function pressureTick(g, n = 1, v = { x: 0, z: 0 }, jump = false) {
  for (let i = 0; i < n; i++) {
    g.elapsed += 1 / 60;
    updatePressureRelay(g, 1 / 60);
    if (!g.paused) advanceCharacter(g, v, 1 / 60, jump && i === 0);
    g.hitTimer = Math.max(0, g.hitTimer - 1 / 60);
  }
}
export function pressureWalk(g, x, z) {
  for (let i = 0; i < 1000; i++) {
    const dx = x - g.player.position.x,
      dz = z - g.player.position.z,
      d = Math.hypot(dx, dz);
    if (d < 0.025) return;
    const speed = Math.min(6, d * 45);
    pressureTick(g, 1, { x: (dx / d) * speed, z: (dz / d) * speed });
  }
  assert.fail(`blocked walk to ${x},${z}: ${g.player.position.toArray()}`);
}
export function pressureWait(g, predicate) {
  for (let i = 0; i < 2000; i++) {
    if (predicate()) return;
    pressureTick(g);
  }
  assert.fail("pressure alignment never arrived");
}
export function pressureJump(g, x, z, height) {
  const start = g.player.position.clone();
  pressureTick(g, 1, { x: 0, z: 0 }, true);
  for (let i = 0; i < 180; i++) {
    const dx = x - g.player.position.x,
      dz = z - g.player.position.z,
      d = Math.hypot(dx, dz),
      speed = Math.min(6, d * 45);
    pressureTick(
      g,
      1,
      d > 0.01 ? { x: (dx / d) * speed, z: (dz / d) * speed } : { x: 0, z: 0 },
    );
    if (g.grounded) {
      assert(
        Math.abs(g.player.position.y - height) < 0.3,
        `bad landing from ${start.toArray()} to ${x},${z}: ${g.player.position.toArray()}`,
      );
      assert(d < 0.3);
      return;
    }
  }
  assert.fail("jump never landed");
}
export function climbPressureRoute(g) {
  const h = g.pressureRelay;
  pressureTick(g);
  assert.equal(pressureControl(g)?.bank, 0);
  pressureInteract(g);
  pressureWalk(g, 8.7, 6.6);
  pressureWait(g, () => h.pistons[0].deck.y < 0.22);
  pressureWalk(g, 7, 5);
  pressureWalk(g, 5.2, 5);
  pressureWait(
    g,
    () => h.pistons[0].deck.y > 4.19 && h.pistons[1].deck.y < 4.21,
  );
  pressureJump(g, 1.5, 5, 4.2);
  pressureWalk(g, -1.8, 5);
  pressureWait(g, () => h.pistons[1].deck.y > 8.19);
  pressureJump(g, -5.5, 5, 8.2);
  pressureWalk(g, -7, 5);
  pressureTick(g);
  assert.equal(h.saved.rest, 1);
  pressureInteract(g);
  pressureWalk(g, -7, 1.55);
  pressureWait(g, () => h.pistons[2].deck.y < 8.22);
  pressureJump(g, -7, -0.9, 8.2);
  pressureWalk(g, -7, -3.8);
  pressureWait(
    g,
    () => h.pistons[2].deck.y > 12.19 && h.pistons[3].deck.y < 12.21,
  );
  pressureJump(g, -7, -7.5, 12.2);
  pressureWalk(g, -7, -10.8);
  pressureWait(g, () => h.pistons[3].deck.y > 16.19);
  pressureJump(g, -7, -14.5, 16.2);
  pressureWalk(g, -7, -16);
  pressureTick(g);
  assert.equal(h.saved.rest, 2);
  pressureInteract(g);
  pressureWalk(g, -3.55, -16);
  pressureWait(g, () => h.pistons[4].deck.y < 16.22);
  pressureJump(g, -1.2, -16, 16.2);
  pressureWalk(g, 1.8, -16);
  pressureWait(
    g,
    () => h.pistons[4].deck.y > 20.19 && h.pistons[5].deck.y < 20.21,
  );
  pressureJump(g, 5.5, -16, 20.2);
  pressureWalk(g, 8.8, -16);
  pressureWait(g, () => h.pistons[5].deck.y > 24.19);
  pressureJump(g, 11.5, -16, 24.2);
  pressureWalk(g, 14, -16);
  pressureTick(g);
  assert.equal(h.saved.rest, 3);
  pressureInteract(g);
  assert(h.saved.recovered);
}

test("pressure pistons have paired transfer windows and bounded periodic travel", () => {
  for (let bank = 0; bank < 3; bank++) {
    const i = bank * 2;
    for (let j = 0; j < 1200; j++) {
      const time = j / 50;
      for (const k of [i, i + 1]) {
        const p = PRESSURE_PISTONS[k],
          y = pistonHeight(k, time, 3);
        assert(y >= p.low && y <= p.high);
        assert(Math.abs(y - pistonHeight(k, time + 12, 3)) < 1e-12);
      }
    }
    assert.equal(pistonHeight(i, 6, 3), pistonHeight(i + 1, 6, 3));
    assert.equal(pistonHeight(i, 6, bank), PRESSURE_PISTONS[i].low);
  }
});
test("the continuous pressure route crosses all six crowns, records each gallery, retrieves the ledger and returns by lift", () => {
  const g = pressureFixture(),
    h = g.pressureRelay;
  climbPressureRoute(g);
  assert.equal(g.health, 100);
  assert.equal(g.records, 1);
  pressureWalk(g, 16, -13.35);
  pressureJump(g, 16, -9.3, 24.2);
  pressureWalk(g, 16, -8);
  assert.equal(pressureControl(g)?.kind, "lift");
  pressureInteract(g);
  pressureTick(g, 500);
  assert.equal(h.saved.lift, 0);
  assert(Math.abs(g.player.position.y - 0.18) < 1e-8);
  pressureWalk(g, 16, 10);
  pressureWalk(g, 26, 10);
  assert.equal(g.health, 100);
  assert.equal(pressureObjective(g), null);
  g.save();
  const restored = normalizeSave(JSON.parse(g.store.export()));
  assert.deepEqual(restored.levels.embers.pressureRelay, h.saved);
  assert.equal(restored.levels.embers.stage, 0);
});
test("riders freeze on pause, jumps release the piston, hot-floor falls recover safely and transit saves use the last gallery", () => {
  const g = pressureFixture(),
    h = g.pressureRelay;
  pressureTick(g);
  pressureInteract(g);
  g.player.position.set(7, 0.18, 5);
  pressureTick(g, 200);
  assert.equal(g.player.position.y, h.pistons[0].deck.y);
  assert(h.pistons[0].drive.activity > 0);
  const position = g.player.position.clone();
  const plume = { time: h.visualTime.value, amount: h.pistons[0].amount.value };
  g.paused = true;
  pressureTick(g, 120);
  assert(g.player.position.equals(position));
  assert.equal(h.pistons[0].drive.activity, 0);
  assert.deepEqual(
    { time: h.visualTime.value, amount: h.pistons[0].amount.value },
    plume,
  );
  g.paused = false;
  assert.deepEqual(pressureSavePosition(g), { x: 14, y: 0.18, z: 10 });
  g.save();
  assert.deepEqual(g.progress.position, { x: 14, z: 10, height: 0.18 });
  pressureTick(g, 1, { x: 0, z: 0 }, true);
  assert(!g.grounded);
  assert(g.player.position.y > h.pistons[0].deck.y + 0.05);
  g.player.position.set(-3, 0, 0);
  g.grounded = true;
  pressureTick(g);
  assert.equal(g.health, 88);
  assert(g.player.position.distanceTo(new THREE.Vector3(14, 0.18, 10)) < 0.01);
});
test("moving crowns and foundry walls block bodies, cameras and sound while supported feet remain free", () => {
  const g = pressureFixture(),
    h = g.pressureRelay;
  pressureTick(g);
  pressureInteract(g);
  pressureTick(g, 360);
  const p = h.pistons[0].deck;
  assert.equal(supportAt(g, p.x, p.z).height, p.y);
  assert(!pressureBlocked(g, p.x, p.z, p.y));
  assert(pressureBlocked(g, p.x, p.z, p.y - 1));
  g.world.updateMatrixWorld(true);
  const a = new THREE.Vector3(p.x - 4, p.y - 0.2, p.z),
    b = new THREE.Vector3(p.x + 4, p.y - 0.2, p.z);
  assert(pressureOccludes(g, a, b));
  assert(g.cameraSurfaces.entry(a, b) < 1);
  assert(pressureBlocked(g, -22, 0, 2));
  assert(!pressureBlocked(g, 22, 10, 0.18));
});
test("the optional site connects to Black Glass and malformed saves cannot skip its circuits", () => {
  const m = createMap(LEVELS[4]),
    t = createTerrainProfile(m, LEVELS[4]);
  assert(m.pressureRelay);
  for (let x = 14; x <= 19; x++) assert(m.grid[9][x]);
  const base = t.height(70, 49);
  for (const d of [...PRESSURE_PISTONS, ...[{ x: 22, z: 10 }]])
    assert(Math.abs(t.height(70 + d.x, 49 + d.z) - base) < 0.001);
  assert.deepEqual(
    normalizePressure({ visited: false, opened: 3, rest: 3, recovered: true }),
    normalizePressure(null),
  );
  assert.equal(
    normalizePressure({ visited: true, opened: 1, rest: 3, recovered: true })
      .recovered,
    false,
  );
  assert.equal(
    normalizeSave({ version: 1, levels: { embers: {} } }).levels.embers
      .pressureRelay.opened,
    0,
  );
  for (const l of LEVELS.filter((l) => l.id !== "embers"))
    assert(!createMap(l).pressureRelay);
});

test("landing controls recall the return lift without moving the waiting explorer", () => {
  const g = pressureFixture(),
    h = g.pressureRelay;
  climbPressureRoute(g);
  pressureWalk(g, 16, -13.35);
  assert.equal(pressureControl(g)?.kind, "call");
  pressureInteract(g);
  assert.equal(h.motion, null); // The car is already at this landing.
  g.player.position.set(19, 0, -6.5);
  const waiting = g.player.position.clone();
  assert.equal(pressureControl(g)?.stop, 0);
  pressureInteract(g);
  pressureTick(g, 120);
  assert(h.motion);
  assert(g.player.position.equals(waiting));
  pressureTick(g, 380);
  assert.equal(h.saved.lift, 0);
  assert(g.player.position.equals(waiting));
  g.player.position.set(16, 24.2, -14);
  pressureInteract(g);
  pressureTick(g, 500);
  assert.equal(h.saved.lift, 1);
  assert.equal(g.player.position.y, 24.2);
  assert.equal(g.health, 100);
});

test("a saved gallery and a mid-return save restore to supported landings with progress retained", () => {
  const g = pressureFixture(),
    h = g.pressureRelay;
  climbPressureRoute(g);
  g.save();
  const summit = structuredClone(g.progress);
  pressureWalk(g, 16, -13.35);
  pressureJump(g, 16, -9.3, 24.2);
  pressureWalk(g, 16, -8);
  pressureInteract(g);
  pressureTick(g, 180);
  assert(h.motion);
  g.save();
  const transit = structuredClone(g.progress);
  for (const progress of [summit, transit]) {
    const restored = pressureFixture(progress),
      p = progress.position;
    restored.player.position.set(p.x, 0, p.z);
    restoreTraversal(restored);
    assert.equal(restored.player.position.y, 24.2);
    assert.equal(supportAt(restored, p.x, p.z, 24.2).height, 24.2);
    assert(restored.canMove(p.x, p.z, 24.2));
    assert(restored.pressureRelay.saved.recovered);
    assert.equal(restored.pressureRelay.saved.lift, 1);
    assert.equal(restored.pressureRelay.motion, null);
    assert.deepEqual(restored.pressureRelay.time, [0, 0, 0]);
  }
});
