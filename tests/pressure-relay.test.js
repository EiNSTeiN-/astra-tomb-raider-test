import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  advancePressureWheel,
  pressureWheelStance,
} from "../src/pressure-motion.js";
import { canAim } from "../src/aiming.js";
import { canCrouch } from "../src/stealth.js";
import { torchHandsBusy } from "../src/torch.js";
import { Adventure } from "../src/game.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { advanceCharacter, supportAt } from "../src/character-motion.js";
import { restoreTraversal } from "../src/traversal.js";
import { RELAY_RAM_LENGTH, RELAY_CABLE_TOP } from "../src/pressure-art.js";
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
  restorePressureArrival,
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
    flames: [],
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
    if (!g.paused && !advancePressureWheel(g, 1 / 60, v))
      advanceCharacter(g, v, 1 / 60, jump && i === 0);
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
  if (h.operation) pressureWait(g, () => !h.operation);
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
  if (h.operation) pressureWait(g, () => !h.operation);
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
  if (h.operation) pressureWait(g, () => !h.operation);
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
  if (h.operation) pressureWait(g, () => !h.operation);
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

test("pressure valves commit once at the detent, cancel with movement and freeze silently on pause", () => {
  const g = pressureFixture(),
    h = g.pressureRelay,
    c = h.controls[0];
  pressureTick(g);
  g.player.position.copy(pressureWheelStance(c));
  const tones = [];
  g.audio.tone = (name) => tones.push(name);
  pressureInteract(g);
  const op = h.operation;
  assert(op);
  assert.equal(canAim(g), false);
  assert.equal(canCrouch(g), false);
  assert.equal(torchHandsBusy(g), true);
  g.attack();
  assert.deepEqual(tones, []);
  pressureTick(g, 42);
  assert(op.turn > 0 && op.turn < 1);
  assert(c.source.activity > 0);
  assert.equal(h.saved.opened, 0);
  g.save();
  const unfinished = structuredClone(g.progress);
  pressureInteract(g);
  assert.equal(h.operation, op, "Use does not queue or restart an operation");
  const frozen = [op.time, c.wheel.rotation.z, ...g.player.position.toArray()];
  g.paused = true;
  pressureTick(g, 120);
  assert.deepEqual(
    [op.time, c.wheel.rotation.z, ...g.player.position.toArray()],
    frozen,
  );
  assert.equal(c.source.activity, 0);
  g.paused = false;
  pressureTick(g, 1, { x: 0.5, z: 0 });
  assert.equal(h.operation, null);
  pressureTick(g, 90);
  assert.equal(h.saved.opened, 0);
  assert(Math.abs(c.turn) < 0.001);
  assert.equal(c.source.activity, 0);
  const reload = pressureFixture(unfinished);
  assert.equal(reload.pressureRelay.operation, null);
  assert.equal(reload.pressureRelay.saved.opened, 0);
  assert.equal(reload.pressureRelay.controls[0].turn, 0);
  g.player.position.copy(pressureWheelStance(c));
  pressureInteract(g);
  pressureTick(g, 75);
  assert(h.operation.committed);
  assert.equal(h.saved.opened, 1);
  assert.deepEqual(tones, ["click"]);
  const committed = structuredClone(g.progress);
  g.keys.add("Space");
  pressureTick(g);
  g.keys.clear();
  assert.equal(h.operation, null);
  pressureTick(g, 90);
  pressureInteract(g);
  assert.equal(h.operation, null, "an open circuit cannot turn again");
  assert.equal(h.saved.opened, 1);
  assert.deepEqual(tones, ["click"]);
  const completed = pressureFixture(committed);
  assert.equal(completed.pressureRelay.saved.opened, 1);
  assert.equal(completed.pressureRelay.controls[0].turn, 1);
});

test("all valve approaches remain on clear gallery floors and reject the back of the pedestal", () => {
  const g = pressureFixture(),
    h = g.pressureRelay;
  pressureTick(g);
  for (const c of h.controls.filter((c) => c.kind === "valve")) {
    h.saved.opened = c.bank;
    h.saved.rest = h.anchor = c.bank;
    const stance = pressureWheelStance(c);
    assert(g.canMove(stance.x, stance.z, stance.y));
    assert.equal(supportAt(g, stance.x, stance.z, stance.y).height, stance.y);
    g.player.position.copy(c.position).add(new THREE.Vector3(0, 0, -1.65));
    pressureInteract(g);
    assert.equal(h.operation, null);
    g.player.position.copy(c.position).add(new THREE.Vector3(-0.9, 0, 0));
    pressureInteract(g);
    assert(h.operation);
    pressureTick(g, 150);
    assert.equal(h.saved.opened, c.bank + 1);
    assert.equal(h.operation, null);
    assert(g.player.position.distanceTo(stance) < 1e-8);
    assert.equal(g.health, 100);
    const source = c.wheel.getWorldPosition(new THREE.Vector3());
    assert(
      source.distanceTo(new THREE.Vector3(c.source.x, c.source.y, c.source.z)) <
        1e-8,
    );
  }
});

test("dressed gallery and piston panels retain supported contact through every transfer phase", () => {
  const g = pressureFixture(),
    h = g.pressureRelay;
  h.saved.opened = 3;
  const ray = new THREE.Raycaster(
    new THREE.Vector3(),
    new THREE.Vector3(0, -1, 0),
    0,
    0.4,
  );
  for (const phase of [0, 3, 6, 9]) {
    h.time.fill(phase);
    updatePressureRelay(g, 0);
    g.world.updateMatrixWorld(true);
    for (const d of h.decks)
      for (const [dx, dz] of [
        [0, 0],
        [-0.8, -0.7],
        [0.8, 0.7],
        [d.w - 0.12, 0],
      ]) {
        ray.ray.origin.set(d.x + dx, d.y + 0.08, d.z + dz);
        const hit = ray
          .intersectObject(h.root, true)
          .find((hit) => hit.object.isMesh && !hit.object.material.transparent);
        assert(hit, `missing deck at ${phase}: ${d.x + dx},${d.z + dz}`);
        assert(
          Math.abs(hit.point.y - d.y) < 0.025,
          `deck/support gap at ${phase}: ${d.x + dx},${d.z + dz}: ${hit.point.y - d.y}`,
        );
        assert.equal(supportAt(g, d.x + dx, d.z + dz, d.y).height, d.y);
      }
    for (const { mesh, car, fixedTop } of h.art.rams) {
      const bounds = new THREE.Box3().setFromObject(mesh);
      assert(Math.abs(bounds.max.y - bounds.min.y - RELAY_RAM_LENGTH) < 1e-6);
      assert(
        bounds.min.y < fixedTop - 0.1,
        "the sliding ram must remain inside its pressure housing",
      );
      assert(Math.abs(bounds.max.y - (h.pistons[car].deck.y - 0.55)) < 1e-6);
    }
  }
  let triangles = 0;
  const cargoBounds = new THREE.Box3().setFromObject(h.art.cargo);
  for (const flame of g.flames) {
    const p = flame.getWorldPosition(new THREE.Vector3());
    const lampBounds = new THREE.Box3(
      p.clone().add(new THREE.Vector3(-0.15, -2, -0.15)),
      p.clone().add(new THREE.Vector3(0.15, -0.3, 0.15)),
    );
    assert(
      !cargoBounds.intersectsBox(lampBounds),
      "the water cargo must clear the gallery lamp supports",
    );
  }
  h.root.traverse((o) => {
    if (!o.isMesh) return;
    assert(o.geometry.attributes.position.array.every(Number.isFinite));
    assert(o.geometry.attributes.normal.array.every(Number.isFinite));
    triangles +=
      (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
  });
  assert(triangles < 130000, `chamber geometry budget exceeded: ${triangles}`);
});

test("return-cable ends, guide rollers and moving posts track the car and freeze with it", () => {
  const g = pressureFixture(),
    h = g.pressureRelay;
  h.saved.visited = true;
  h.saved.opened = 3;
  h.saved.rest = 3;
  h.saved.recovered = true;
  h.motion = { time: 0, from: 24.2, to: 0.18 };
  const snapshot = () => ({
    cable: h.art.cable.position.toArray(),
    scale: h.art.cable.scale.y,
    rotor: h.art.rotor.rotation.z,
    rollers: h.art.rollers.map((r) => r.root.rotation.z),
  });
  for (let frame = 0; frame < 490; frame++) {
    updatePressureRelay(g, 1 / 60);
    const y = h.lift.root.position.y,
      cable = h.art.cable;
    assert(
      Math.abs(cable.position.y + cable.scale.y / 2 - RELAY_CABLE_TOP) < 1e-8,
    );
    assert(Math.abs(cable.position.y - cable.scale.y / 2 - y - 2.8) < 1e-8);
    for (const m of h.art.movingSolids) assert.equal(m.collider.bottom, y);
    for (const roller of h.art.rollers)
      assert(
        Math.abs(Math.abs(roller.root.position.x) + 0.2 - (2.5 - 0.12)) < 1e-8,
      );
  }
  const before = snapshot();
  g.paused = true;
  updatePressureRelay(g, 4);
  assert.deepEqual(snapshot(), before);
});

test("older gallery saves occupied by new cargo recover on the same supported floor", () => {
  for (const [x, z, height, rest] of [
    [18.1, 12.7, 0.18, 0],
    [12.2, -18.15, 24.2, 3],
  ]) {
    const g = pressureFixture({
      pressureRelay: {
        visited: true,
        opened: 3,
        rest,
        recovered: rest === 3,
        lift: 1,
      },
      position: { x, z, height },
    });
    assert(!g.canMove(x, z, height));
    g.player.position.set(x, 0, z);
    restoreTraversal(g);
    restorePressureArrival(g);
    assert.equal(g.player.position.y, height);
    assert(g.canMove(g.player.position.x, g.player.position.z, height));
    pressureTick(g, 30);
    assert.equal(g.health, 100);
    assert.equal(g.player.position.y, height);
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
  if (h.operation) pressureWait(g, () => !h.operation);
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
  if (h.operation) pressureWait(g, () => !h.operation);
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
  if (h.operation) pressureWait(g, () => !h.operation);
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
  if (h.operation) pressureWait(g, () => !h.operation);
  assert.equal(h.motion, null); // The car is already at this landing.
  g.player.position.set(19, 0, -6.5);
  const waiting = g.player.position.clone();
  assert.equal(pressureControl(g)?.stop, 0);
  pressureInteract(g);
  if (h.operation) pressureWait(g, () => !h.operation);
  pressureTick(g, 120);
  assert(h.motion);
  assert(g.player.position.equals(waiting));
  pressureTick(g, 380);
  assert.equal(h.saved.lift, 0);
  assert(g.player.position.equals(waiting));
  g.player.position.set(16, 24.2, -14);
  pressureInteract(g);
  if (h.operation) pressureWait(g, () => !h.operation);
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
  if (h.operation) pressureWait(g, () => !h.operation);
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
