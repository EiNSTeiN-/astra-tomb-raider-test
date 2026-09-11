import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { advanceCharacter, supportAt } from "../src/character-motion.js";
import { finishFieldTask, buildFieldStation } from "../src/field-world.js";
import { advanceShutterTurn } from "../src/shutter-motion.js";
import { canAim } from "../src/aiming.js";
import { canCrouch } from "../src/stealth.js";
import { torchHandsBusy } from "../src/torch.js";
import {
  buildShutterHouse,
  updateShutterHouse,
  startShutterTurn,
} from "../src/shutter-house.js";
import {
  SHUTTER_SPANS,
  SHUTTER_STATIONS,
  shutterGust,
  shutterWindVelocity,
  shutterSavePosition,
  normalizeShutterHouse,
  shutterAnchor,
  restoreShutterArrival,
} from "../src/shutter-house-rules.js";
const map = createMap(LEVELS[2]),
  terrain = createTerrainProfile(map, LEVELS[2]);
function fixture(progress = { stage: 5 }) {
  const store = new SaveStore({
      getItem: () =>
        JSON.stringify({ version: 1, levels: { frost: progress } }),
      setItem() {},
    }),
    world = new THREE.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level: LEVELS[2],
    map: structuredClone(map),
    terrainProfile: terrain,
    store,
    progress: store.level("frost"),
    world,
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    cameraSurfaces: new CameraSurfaces(world),
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    groundHeight: terrain.height,
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
    damage(n) {
      this.health -= n;
    },
  });
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  try {
    g.items = g.map.features.filter((f) => f.shutterHeight !== undefined);
    for (const f of g.items) {
      f.group = new THREE.Group();
      f.group.position.set(f.x * 7, 0, f.z * 7);
      g.world.add(f.group);
      buildFieldStation(g, f, f.group);
    }
    buildShutterHouse(g);
  } finally {
    globalThis.document = old;
  }
  g.cameraSurfaces.rebuild();
  place(g, -12, 0, 15);
  return g;
}
function place(g, x, y, z) {
  const h = g.shutterHouse;
  g.player.position.set(h.x + x, h.y + y, h.z + z);
  g.jumpY = y;
  g.grounded = true;
  g.velocityY = 0;
  g.airVelocity = null;
  g.shutterHouse.fallFrom = null;
}
function tick(g, n = 1, v = { x: 0, z: 0 }, jump = false) {
  for (let i = 0; i < n; i++) {
    updateShutterHouse(g, 1 / 60);
    if (!g.paused && !advanceShutterTurn(g, 1 / 60, v))
      advanceCharacter(g, shutterWindVelocity(g, v), 1 / 60, jump && i === 0);
  }
}
function move(g, x, z) {
  x += g.shutterHouse.x;
  z += g.shutterHouse.z;
  for (let i = 0; i < 1500; i++) {
    const dx = x - g.player.position.x,
      dz = z - g.player.position.z,
      d = Math.hypot(dx, dz);
    if (d < 0.07) return;
    const speed = Math.min(4, d * 30);
    tick(g, 1, { x: (dx / d) * speed, z: (dz / d) * speed });
  }
  assert.fail(`Blocked at ${g.player.position.toArray()} toward ${x},${z}`);
}
function cross(g, index) {
  const s = SHUTTER_SPANS[index],
    dir = index === 1 ? -1 : 1;
  g.crouching = true;
  move(g, s.gap - dir * 1.7, s.z);
  g.crouching = false;
  g.shutterHouse.time = 8 - index * 1.7;
  tick(g, 48, { x: dir * 4.7, z: 0 }, true);
  tick(g, 6);
  assert(g.grounded);
  assert(Math.abs(g.player.position.y - g.shutterHouse.y - s.height) < 0.01);
  g.crouching = true;
  move(g, SHUTTER_STATIONS[index].x, s.z + 1);
  g.crouching = false;
}
function close(g, index) {
  for (let i = 0; i < 3; i++) {
    assert(startShutterTurn(g, index));
    tick(g, 110);
  }
  assert(g.progress.field.includes(`field-5-${index}`));
}
test("the shutter house replaces three scattered controls with ordered elevated stations and chapter-local saved catches", () => {
  assert.equal(
    map.features.filter((f) => f.shutterHeight !== undefined).length,
    3,
  );
  for (const l of LEVELS.filter((l) => l.id !== "frost"))
    assert.equal(createMap(l).shutterHouse, undefined);
  assert.deepEqual(
    normalizeShutterHouse({ turns: [2.9, 3, 99] }, { stage: 5, field: [] })
      .turns,
    [2, 0, 0],
  );
  assert.deepEqual(
    normalizeShutterHouse(null, { stage: 5, field: ["field-5-0"] }).turns,
    [3, 0, 0],
  );
  assert.deepEqual(normalizeShutterHouse(null, { stage: 6 }).turns, [3, 3, 3]);
  const save = normalizeSave({
    version: 1,
    levels: {
      frost: { stage: 5, shutterHouse: { turns: [2, 2, 2] } },
      verdant: { shutterHouse: { turns: [3, 3, 3] } },
    },
  });
  assert.deepEqual(save.levels.frost.shutterHouse.turns, [2, 0, 0]);
  assert.equal(save.levels.verdant.shutterHouse, null);
});
test("every shutter catch weakens its own gust; warning precedes force, reversing wind alternates and crouching braces", () => {
  assert(shutterGust(0, 1.8).warning > 0.5);
  assert.equal(shutterGust(0, 1.8).force, 0);
  const peak = shutterGust(0, 4).force;
  assert(peak > 2);
  assert(Math.abs(shutterGust(0, 4, 1).force / peak - 2 / 3) < 1e-9);
  assert.equal(shutterGust(0, 4, 3).force, 0);
  assert.equal(shutterGust(2, 4).direction, -shutterGust(2, 14.5).direction);
  // A reversal belongs to the next pulse, after the previous force has fallen
  // to zero. The third walk must never reverse halfway through an active gust.
  let previous = shutterGust(2, 0).force;
  for (let t = 0.01; t < 42; t += 0.01) {
    const force = shutterGust(2, t).force;
    if (Math.abs(previous) > 0.1 && Math.abs(force) > 0.1)
      assert(previous * force > 0);
    previous = force;
  }
  const g = fixture();
  place(g, -5, 3.6, 4);
  g.shutterHouse.time = 4;
  const v = shutterWindVelocity(g, { x: 1, z: 0 });
  assert(v.z > 2);
  g.crouching = true;
  assert(
    Math.abs(shutterWindVelocity(g, { x: 1, z: 0 }).z / v.z - 0.035) < 1e-9,
  );
  place(g, 12, 3.6, 4);
  assert.deepEqual(shutterWindVelocity(g, { x: 1, z: 0 }), { x: 1, z: 0 });
});
test("turning requires the current landing, cancels on leaving, pauses and saves only fully seated catches", () => {
  const g = fixture();
  assert(!startShutterTurn(g, 0));
  place(g, 12, 3.6, 5);
  assert(!startShutterTurn(g, 1));
  assert(!finishFieldTask(g, g.items[2]));
  assert(startShutterTurn(g, 0));
  tick(g, 25);
  const angle = g.shutterHouse.louvers[0][0].rotation.x;
  g.paused = true;
  tick(g, 100);
  assert.equal(g.shutterHouse.louvers[0][0].rotation.x, angle);
  assert(g.shutterHouse.sources.every((s) => s.activity === 0));
  g.paused = false;
  place(g, 8, 3.6, 4);
  tick(g);
  assert.equal(g.shutterHouse.turn, null);
  assert.equal(g.shutterHouse.saved.turns[0], 0);
  place(g, 12, 3.6, 5);
  assert(startShutterTurn(g, 0));
  tick(g, 110);
  assert.equal(g.shutterHouse.saved.turns[0], 1);
  assert.equal(g.saves, 1);
  assert(!g.progress.field.includes("field-5-0"));
  assert.equal(
    normalizeShutterHouse(g.shutterHouse.saved, g.progress).turns[0],
    1,
  );
});
test("the complete three-tier route requires its gaps and returns by the released service stair", () => {
  const g = fixture(),
    h = g.shutterHouse;
  move(g, -12, 4);
  assert(Math.abs(g.player.position.y - h.y - 3.6) < 0.01);
  cross(g, 0);
  close(g, 0);
  move(g, 12, -8);
  assert(Math.abs(g.player.position.y - h.y - 6.6) < 0.01);
  cross(g, 1);
  close(g, 1);
  move(g, -12, -20);
  assert(Math.abs(g.player.position.y - h.y - 9.6) < 0.01);
  cross(g, 2);
  close(g, 2);
  move(g, 18, -20);
  move(g, 18, 15);
  assert(
    Math.abs(
      g.player.position.y -
        g.groundHeight(g.player.position.x, g.player.position.z),
    ) < 0.07,
  );
  assert.equal(g.health, 100);
  assert.deepEqual(h.saved.turns, [3, 3, 3]);
  assert(h.returnDeck.enabled);
  assert(h.sources.every((s) => s.activity === 0));
});
test("missed jumps and airborne saves return to the last secured shutter; gaps have no invisible support", () => {
  const g = fixture({ stage: 5, field: ["field-5-0"] }),
    h = g.shutterHouse;
  place(g, 4.85, 6.6, -8);
  tick(g);
  const fallFrom = h.fallFrom;
  g.paused = true;
  tick(g, 60);
  assert.equal(h.fallFrom, fallFrom);
  g.paused = false;
  assert(supportAt(g, h.x + 3.5, h.z - 8, h.y + 6.6).height < h.y + 1);
  for (let i = 0; i < 70 && g.health === 100; i++) tick(g, 1, { x: -4, z: 0 });
  assert.equal(g.health, 92);
  assert(Math.abs(g.player.position.x - h.x - 12) < 0.1);
  place(g, 0, 7, -8);
  g.grounded = false;
  assert.deepEqual(shutterSavePosition(g), shutterAnchor(g));
  place(g, 12, 3.6, 5);
  assert.equal(shutterSavePosition(g), null);
  // Reproduce the actual loader: general traversal recovery has already put
  // an invalid elevated save on the floor when the chapter hook is reached.
  place(g, 0, 0, 4);
  g.progress.position = { x: h.x, z: h.z + 4, height: 4.3 };
  restoreShutterArrival(g);
  const anchor = shutterAnchor(g);
  assert.deepEqual(g.player.position.toArray(), [anchor.x, anchor.y, anchor.z]);
  place(g, 12, 0, 5);
  g.progress.position = { x: h.x + 12, z: h.z + 5, height: 3.6 };
  restoreShutterArrival(g);
  assert(Math.abs(g.player.position.y - h.y - 3.6) < 1e-9);
});
test("shutter platforms preserve undercroft headroom, obstruct sight at their elevation and clear runtime state on another chapter", () => {
  const g = fixture(),
    h = g.shutterHouse;
  assert(g.canMove(h.x - 12, h.z + 4, 0));
  assert(!g.canMove(h.x - 12, h.z + 4, 3));
  assert(
    !g.lineOfSight(
      new THREE.Vector3(h.x - 12, h.y + 5, h.z + 4),
      new THREE.Vector3(h.x - 12, h.y, h.z + 4),
      0,
      0,
    ),
  );
  const root = h.root,
    resources = new Set();
  root.traverse((o) => {
    if (o.geometry) resources.add(o.geometry);
  });
  assert(resources.size > 5);
  g.map = createMap(LEVELS[0]);
  buildShutterHouse(g);
  assert.equal(g.shutterHouse, null);
  assert.equal(g.shutterWind, null);
});

test("standing jumps stop below all six actual windbreak roofs and keep the exposed jump arc", () => {
  const g = fixture(),
    h = g.shutterHouse;
  g.world.updateMatrixWorld(true);
  for (const s of SHUTTER_SPANS)
    for (const x of [-12, 12]) {
      place(g, x, s.height, s.z + 1);
      assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
      const base = g.player.position.y;
      const ray = new THREE.Raycaster(
        g.player.position.clone().add(new THREE.Vector3(0, 1.8, 0)),
        new THREE.Vector3(0, 1, 0),
        0,
        2,
      );
      const roof = ray.intersectObject(h.root, true)[0];
      assert(roof, `No roof at ${x},${s.z}`);
      let peak = base;
      for (let i = 0; i < 90; i++) {
        tick(g, 1, { x: 0, z: 0 }, i === 0);
        peak = Math.max(peak, g.player.position.y);
        assert(g.player.position.y + 1.8 < roof.point.y + 0.001);
      }
      assert(peak > base + 0.15);
      assert(g.grounded);
      assert(Math.abs(g.player.position.y - base) < 0.01);
      assert.equal(g.health, 100);
    }
  place(g, 0, 0, 15);
  let peak = h.y;
  for (let i = 0; i < 90; i++) {
    tick(g, 1, { x: 0, z: 0 }, i === 0);
    peak = Math.max(peak, g.player.position.y);
  }
  assert(peak - h.y > 1.5);
});

test("the wheel aligns only across supported clear ground and releases occupied hands without losing a seated catch", () => {
  const g = fixture(),
    h = g.shutterHouse;
  place(g, 12, 3.6, 3);
  assert(!startShutterTurn(g, 0), "approach from behind rejected");
  place(g, 11, 3.6, 5.5);
  h.solids.push({
    x: h.x + 11.5,
    z: h.z + 5,
    w: 0.2,
    d: 0.2,
    bottom: h.y + 3.6,
    top: h.y + 5.6,
  });
  assert(!startShutterTurn(g, 0), "blocked alignment rejected");
  h.solids.pop();
  assert(startShutterTurn(g, 0));
  assert(!canAim(g));
  assert(!canCrouch(g));
  assert(torchHandsBusy(g));
  tick(g, 90);
  assert.equal(h.saved.turns[0], 1);
  assert(h.turn?.committed, "catch persists before release finishes");
  const position = g.player.position.clone();
  tick(g, 1, { x: -3, z: 0 });
  assert.equal(h.turn, null);
  assert(
    g.player.position.x < position.x,
    "movement resumes on cancellation frame",
  );
  assert.equal(h.saved.turns[0], 1);
  assert(canAim(g));
  assert(canCrouch(g));
  assert(!torchHandsBusy(g));
  tick(g, 30);
  assert(h.wheelTurn[0] < 0.001);
  assert(Math.abs(h.louverAmount[0] - 1 / 3) < 0.001);
  assert.equal(g.health, 100);
});
