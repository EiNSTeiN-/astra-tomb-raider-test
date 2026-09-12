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
import {
  buildArcadeLock,
  updateArcadeLock,
  arcadeInteract,
  advanceArcadeTurn,
  tryArcadeClimb,
} from "../src/arcade-lock.js";
import {
  normalizeArcadeLock,
  arcadeSavePosition,
  restoreArcadeArrival,
  arcadeBlocked,
  arcadeDeckAt,
  arcadeCeiling,
  arcadeOccludes,
} from "../src/arcade-lock-rules.js";
const map = createMap(LEVELS[3]),
  terrain = createTerrainProfile(map, LEVELS[3]);
function fixture(progress = { stage: 5 }) {
  const store = new SaveStore({
      getItem: () =>
        JSON.stringify({ version: 1, levels: { tides: progress } }),
      setItem() {},
    }),
    world = new THREE.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level: LEVELS[3],
    map: structuredClone(map),
    terrainProfile: terrain,
    store,
    progress: store.level("tides"),
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
    waterMeshes: [],
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
    createElementNS: () => ({
      addEventListener() {},
      removeEventListener() {},
      set src(value) {},
    }),
  };
  try {
    g.items = g.map.features.filter((f) => f.arcadeHeight !== undefined);
    for (const f of g.items) {
      f.group = new THREE.Group();
      f.group.position.set(f.x * 7, 0, f.z * 7);
      g.world.add(f.group);
      buildFieldStation(g, f, f.group);
    }
    buildArcadeLock(g);
  } finally {
    globalThis.document = old;
  }
  g.cameraSurfaces.rebuild();
  place(g, 84, 1.2, 217.78);
  return g;
}
function place(g, x, y, z) {
  const h = g.arcadeLock;
  g.player.position.set(x, h.y + y, z);
  g.jumpY = y;
  g.grounded = true;
  g.velocityY = 0;
  g.airVelocity = null;
}

function tick(g, n = 1) {
  for (let i = 0; i < n; i++) {
    updateArcadeLock(g, 1 / 60);
    advanceArcadeTurn(g, 1 / 60, { x: 0, z: 0 });
  }
}
function use(g) {
  assert(arcadeInteract(g));
  tick(g, 240);
}
test("ordered handwheels open inspection and enable the flood circuit", () => {
  const g = fixture();
  use(g);
  assert(g.progress.field.includes("field-5-0"));
  assert.equal(g.arcadeLock.inspection, 1);
  place(g, 42, 0.4, 202.78);
  use(g);
  assert(g.progress.field.includes("field-5-1"));
  place(g, 68, 0.9, 217.28);
  use(g);
  tick(g, 900);
  assert.equal(g.arcadeLock.saved.level, 1);
  assert(Math.abs(g.player.position.y - g.arcadeLock.y - 6.5) < 1e-5);
  place(g, 28, 8.8, 217.78);
  use(g);
  tick(g, 180);
  assert.equal(g.arcadeLock.exit, 1);
  assert.equal(g.progress.field.length, 3);
});

const ready = { stage: 5, field: ["field-5-0", "field-5-1"] };
test("old and malformed saves cannot bypass the inspection or strand completed chapters", () => {
  assert.deepEqual(
    normalizeArcadeLock(
      { level: Infinity, target: 1, anchor: 2 },
      { stage: 5, field: [] },
    ),
    { level: 0, target: 0, anchor: 0 },
  );
  assert.deepEqual(
    normalizeArcadeLock({ level: 0.45, target: 1, anchor: 1 }, ready),
    { level: 0.45, target: 1, anchor: 1 },
  );
  assert.deepEqual(normalizeArcadeLock(null, { stage: 6, field: [] }), {
    level: 1,
    target: 1,
    anchor: 2,
  });
  const data = normalizeSave({ version: 1, levels: { tides: { stage: 6 } } });
  assert.equal(data.levels.tides.arcadeLock.level, 1);
  assert.equal(
    new SaveStore({ getItem: () => null, setItem() {} }).level("tides")
      .arcadeLock.target,
    0,
  );
});
test("the shutter seals before the water rises and reopens only after draining", () => {
  const g = fixture(ready),
    h = g.arcadeLock;
  h.saved.target = 1;
  updateArcadeLock(g, 1);
  assert.equal(h.saved.level, 0);
  assert(h.gate > 0 && h.gate < 1);
  tick(g, 720);
  assert(h.saved.level > 0.9);
  assert.equal(h.gate, 1);
  h.saved.target = 0;
  tick(g, 120);
  assert(h.saved.level > 0);
  assert.equal(h.gate, 1);
  tick(g, 800);
  assert.equal(h.saved.level, 0);
  assert.equal(h.gate, 0);
  assert(!arcadeBlocked(g, 74.05, 217, h.y + 1.2));
});
test("pause freezes mechanics, carries no passenger and silences machinery", () => {
  const g = fixture(ready),
    h = g.arcadeLock;
  place(g, 68, 0.9, 217.28);
  h.saved.target = 1;
  tick(g, 260);
  const before = { level: h.saved.level, y: g.player.position.y, gate: h.gate };
  assert(h.sources.some((s) => s.activity > 0));
  g.paused = true;
  tick(g, 120);
  assert.deepEqual(
    { level: h.saved.level, y: g.player.position.y, gate: h.gate },
    before,
  );
  assert(h.sources.every((s) => s.activity === 0));
  g.paused = false;
  tick(g, 60);
  assert(h.saved.level > before.level);
  assert(Math.abs(g.player.position.y - h.pontoonDeck.y) < 1e-6);
});
test("movement cancels a turn before its catch without advancing the field task", () => {
  const g = fixture();
  assert(arcadeInteract(g));
  tick(g, 25);
  advanceArcadeTurn(g, 0.02, { x: 1, z: 0 });
  assert.equal(g.arcadeLock.turn, null);
  assert.deepEqual(g.progress.field, []);
  place(g, 42, 0.4, 202.78);
  assert.equal(finishFieldTask(g, g.items[1]), false);
  assert.equal(g.arcadeLock.turn, null);
});
test("fixed landing calls retrieve the platform in either direction", () => {
  const g = fixture({
      ...ready,
      arcadeLock: { level: 1, target: 1, anchor: 1 },
    }),
    h = g.arcadeLock;
  place(g, 77, 1.2, 216.78);
  use(g);
  tick(g, 900);
  assert.equal(h.saved.level, 0);
  assert.equal(h.gate, 0);
  place(g, 60, 6.6, 216.78);
  use(g);
  tick(g, 900);
  assert.equal(h.saved.level, 1);
  assert.equal(h.gate, 1);
});
test("moving, airborne and swimming saves choose a clear fixed landing", () => {
  const g = fixture(ready),
    h = g.arcadeLock;
  place(g, 68, 0.9, 217.28);
  h.saved.target = 1;
  tick(g, 220);
  let saved = arcadeSavePosition(g);
  assert.equal(saved.x, 84);
  assert(!arcadeBlocked(g, saved.x, saved.z, saved.y));
  place(g, 60, 6.6, 217.8);
  tick(g);
  assert.equal(h.saved.anchor, 1);
  g.grounded = false;
  saved = arcadeSavePosition(g);
  assert.equal(saved.x, 60);
  assert(!arcadeBlocked(g, saved.x, saved.z, h.y + 6.6));
  g.player.position.y += 2;
  restoreArcadeArrival(g);
  assert.equal(g.player.position.y, h.y + 6.6);
  assert(g.grounded);
  g.swimming = true;
  assert.equal(arcadeSavePosition(g).x, 60);
});
test("pontoon and upper-bank mantles use open sides and reject rails and wrong directions", () => {
  const g = fixture(ready),
    h = g.arcadeLock;
  place(g, 71.4, -0.25, 217.2);
  g.swimming = true;
  g.grounded = false;
  assert(!tryArcadeClimb(g, new THREE.Vector3(1, 0, 0)));
  assert(tryArcadeClimb(g, new THREE.Vector3(-1, 0, 0)));
  assert.equal(g.climb.arcadePontoon, true);
  assert(!arcadeBlocked(g, g.climb.end.x, g.climb.end.z, g.climb.end.y));
  h.saved.target = 1;
  tick(g, 230);
  assert.equal(g.climb.end.y, h.pontoonDeck.y);
  g.climb = null;
  place(g, 68, -0.25, 220);
  g.swimming = true;
  assert(!tryArcadeClimb(g, new THREE.Vector3(0, 0, -1)));
  h.saved.level = 1;
  updateArcadeLock(g, 0);
  place(g, 64.8, 5.35, 217.4);
  g.swimming = true;
  g.grounded = false;
  assert(tryArcadeClimb(g, new THREE.Vector3(-1, 0, 0)));
  assert.equal(g.climb.arcadePontoon, false);
});
test("line of sight is occluded only by intersected masonry or a shut gate", () => {
  const g = fixture(),
    h = g.arcadeLock;
  assert(!arcadeOccludes(g, { x: 10, y: 2, z: 10 }, { x: 20, y: 2, z: 10 }));
  assert(
    arcadeOccludes(
      g,
      { x: 80, y: h.y + 1.8, z: 210 },
      { x: 60, y: h.y + 1.8, z: 210 },
    ),
  );
  const a = { x: 84, y: h.y + 1.5, z: 206 },
    b = { x: 84, y: h.y + 1.5, z: 203 };
  assert(arcadeOccludes(g, a, b));
  use(g);
  assert(!arcadeOccludes(g, a, b));
});
test("walkable steps, covered passage headroom and final return stay clear", () => {
  const g = fixture({ stage: 6 }),
    h = g.arcadeLock;
  assert(arcadeCeiling(g, 65, 202, h.y + 0.4, h.y + 2) < h.y + 2);
  assert(
    arcadeBlocked(g, 28, 230, h.y + 0.1),
    "solid masonry beneath the return stair",
  );
  for (let z = 218; z < 245; z += 0.1) {
    const d = arcadeDeckAt(g, 28, z);
    assert(d);
    assert(!arcadeBlocked(g, 28, z, d.height), `return blocked ${z}`);
  }
  for (let x = 42; x <= 84; x += 0.25)
    assert(!arcadeBlocked(g, x, 202.8, h.y + 0.4), `inspection blocked ${x}`);
  place(g, 91, 0, 217.78);
  for (let i = 0; i < 160; i++)
    advanceCharacter(g, { x: -3, z: 0 }, 1 / 60, false);
  assert(g.player.position.x < 84);
  assert(g.player.position.y >= h.y + 1.19);
});
test("only the coastal chapter receives the lock; its basin and feature pads are level", () => {
  for (const level of LEVELS) {
    const m = createMap(level);
    assert.equal(!!m.arcadeLock, level.id === "tides");
  }
  for (const f of map.features.filter((f) => f.arcadeHeight !== undefined))
    assert(Math.abs(terrain.height(f.x * 7, f.z * 7) - terrain.arcadeY) < 1e-5);
  assert(terrain.height(68, 217) < terrain.arcadeY - 3);
  assert.equal(
    map.features.filter((f) => f.arcadeHeight !== undefined).length,
    3,
  );
});

test("a legacy ground save inside the new basin restores above water on a fixed landing", () => {
  const g = fixture({
      ...ready,
      arcadeLock: { level: 1, target: 1, anchor: 1 },
    }),
    h = g.arcadeLock;
  g.player.position.set(68, g.groundHeight(68, 217), 217);
  restoreArcadeArrival(g);
  assert.equal(g.player.position.x, 60);
  assert.equal(g.player.position.y, h.y + 6.6);
  assert(!arcadeBlocked(g, 60, g.player.position.z, g.player.position.y));
});

test("the shared save writer stores finite recovery heights and survives serialization", () => {
  const g = fixture(ready),
    h = g.arcadeLock;
  place(g, 68, 0.9, 217.28);
  h.saved.target = 1;
  tick(g, 220);
  Adventure.prototype.save.call(g);
  const stored = JSON.parse(JSON.stringify(g.store.data)).levels.tides;
  assert.equal(stored.position.x, 84);
  assert(Number.isFinite(stored.position.height));
  assert(Math.abs(stored.position.height - 1.2) < 1e-6);
  const reloaded = normalizeSave({ version: 1, levels: { tides: stored } })
    .levels.tides;
  assert.deepEqual(reloaded.position, stored.position);
  assert.deepEqual(reloaded.arcadeLock, stored.arcadeLock);
});

test("every upper arch shaft has stone bearing beneath its full footprint", () => {
  const g = fixture({ stage: 6 }),
    h = g.arcadeLock;
  const shafts = h.solids.filter(
    (s) => Math.abs(s.top - s.bottom - 2.2) < 1e-6 && s.bottom > h.y + 6,
  );
  assert.equal(shafts.length, 8);
  for (const s of shafts)
    for (const dx of [-s.w * 0.95, s.w * 0.95])
      for (const dz of [-s.d * 0.95, s.d * 0.95]) {
        const d = arcadeDeckAt(g, s.x + dx, s.z + dz, s.bottom);
        assert(
          d && Math.abs(d.height - s.bottom) < 1e-6,
          `unsupported arch at ${s.x},${s.z}`,
        );
      }
});
