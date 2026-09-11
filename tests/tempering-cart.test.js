import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTemperingCart,
  stepTemperingCart,
  temperingPose,
  cartLocal,
  temperingFoundationWeight,
  addTemperingCart,
} from "../src/tempering-cart-rules.js";
import { LEVELS, createMap } from "../src/campaign.js";

test("the freight cart accelerates, brakes and cannot cross an unturned junction", () => {
  const h = { saved: { turned: false }, distance: 0, velocity: 0, docked: 0 };
  stepTemperingCart(h, 1, 1);
  assert(h.distance > 1 && h.velocity > 2);
  const speed = h.velocity;
  stepTemperingCart(h, 0.25, 0);
  assert(h.velocity < speed / 2);
  stepTemperingCart(h, 30, 1);
  assert.equal(h.distance, 70);
  assert.equal(h.docked, 1);
  assert.equal(h.velocity, 0);
  h.saved.turned = true;
  stepTemperingCart(h, 30, 1);
  assert.equal(h.distance, 140);
  assert.equal(h.docked, 2);
  assert.deepEqual(h.pose, { x: 154, z: 336, angle: Math.PI / 2 });
  stepTemperingCart(h, 30, -1);
  assert.equal(h.distance, 70);
  assert.equal(h.docked, 1);
  h.saved.turned = false;
  stepTemperingCart(h, 30, -1);
  assert.equal(h.distance, 0);
  assert.equal(h.docked, 0);
});

test("cargo and safe landing normalization recover old missions and retain return trips", () => {
  assert.deepEqual(normalizeTemperingCart(null, { stage: 6, field: [] }), {
    loaded: false,
    stop: 0,
    turned: false,
  });
  assert.deepEqual(
    normalizeTemperingCart(null, {
      stage: 6,
      field: ["field-6-0", "field-6-1"],
    }),
    { loaded: true, stop: 1, turned: false },
  );
  assert.deepEqual(normalizeTemperingCart(null, { stage: 7, field: [] }), {
    loaded: true,
    stop: 2,
    turned: true,
  });
  assert.deepEqual(
    normalizeTemperingCart(
      { stop: 0, turned: true, loaded: true },
      { stage: 7, field: [] },
    ),
    { loaded: true, stop: 0, turned: false },
  );
  assert.deepEqual(
    normalizeTemperingCart(
      { stop: NaN, turned: "yes", loaded: "yes" },
      { stage: 6, field: ["field-6-0"] },
    ),
    { loaded: false, stop: 0, turned: false },
  );
  assert.equal(
    normalizeTemperingCart({ stop: 2 }, { stage: 6, field: ["field-6-0"] })
      .stop,
    0,
  );
});

test("the turntable pose preserves local rider positions and confines its foundation", () => {
  for (const distance of [0, 35, 70, 105, 140]) {
    const pose = temperingPose(distance, true),
      c = Math.cos(pose.angle),
      s = Math.sin(pose.angle);
    const q = cartLocal(
      { pose },
      pose.x - 0.8 * c - 1.1 * s,
      pose.z + 0.8 * s - 1.1 * c,
    );
    assert(Math.abs(q.x + 0.8) < 1e-9 && Math.abs(q.z + 1.1) < 1e-9);
  }
  assert.equal(temperingFoundationWeight(120, 406), 1);
  assert.equal(temperingFoundationWeight(154, 360), 1);
  assert.equal(temperingFoundationWeight(250, 350), 0);
  assert.equal(temperingFoundationWeight(175, 392), 0);
  const map = createMap(LEVELS[4]);
  const oldSites = JSON.stringify(map.fieldSites);
  addTemperingCart(map, LEVELS[4]);
  assert.equal(JSON.stringify(map.fieldSites), oldSites);
  const fields = map.features.filter(
    (f) => f.type === "field" && f.stage === 6,
  );
  assert.deepEqual(
    fields.map((f) => [f.x, f.z, f.cartHeight]),
    [
      [12, 57, 1.2],
      [21, 56, 5.4],
      [21, 48, 1.2],
    ],
  );
  for (const f of fields) assert(map.grid[f.z][f.x]);
  for (const level of LEVELS.filter((l) => l.id !== "embers")) {
    const other = createMap(level);
    addTemperingCart(other, level);
    assert.equal(other.temperingCart, undefined);
  }
});

import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { advanceCharacter, supportAt } from "../src/character-motion.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { finishFieldTask } from "../src/field-world.js";
import { carryingComponent } from "../src/expeditions.js";
import {
  buildTemperingCart,
  updateTemperingCart,
  controlTemperingCart,
  interactTemperingCart,
  startCartTurn,
} from "../src/tempering-cart.js";
import {
  cartSavePosition,
  cartBlocked,
  cartDeckAt,
} from "../src/tempering-cart-rules.js";
function fixture() {
  const store = new SaveStore({
    getItem: () =>
      JSON.stringify({ version: 1, levels: { embers: { stage: 6 } } }),
    setItem() {},
  });
  const world = new THREE.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level: LEVELS[4],
    map: createMap(LEVELS[4]),
    progress: store.level("embers"),
    store,
    world,
    terrainProfile: { temperingY: 0 },
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    cameraSurfaces: new CameraSurfaces(world),
    stoneMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
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
  const doc = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  try {
    buildTemperingCart(g);
  } finally {
    globalThis.document = doc;
  }
  g.cameraSurfaces.rebuild();
  return g;
}
function place(g, x, z, y = 1.2) {
  g.player.position.set(x, y, z);
  Object.assign(g, {
    grounded: true,
    jumpY: y,
    velocityY: 0,
    airVelocity: null,
    climb: null,
  });
}
function ticks(g, n, input = 0) {
  for (let i = 0; i < n; i++) {
    if (g.temperingCart.drive) controlTemperingCart(g, 1 / 60, input);
    updateTemperingCart(g, 1 / 60);
  }
}

test("the key mission requires cargo, an inspected turntable and a seated cart at the cradle", () => {
  const g = fixture(),
    h = g.temperingCart,
    fields = g.map.features.filter((f) => f.type === "field" && f.stage === 6);
  assert(finishFieldTask(g, fields[0]));
  assert(carryingComponent(g.level, g.progress));
  assert.equal(finishFieldTask(g, fields[1]), false);
  place(g, 83.2, 406);
  assert(interactTemperingCart(g));
  assert(h.saved.loaded && h.drive);
  assert.equal(carryingComponent(g.level, g.progress), false);
  ticks(g, 300, 1);
  assert(h.distance > 20 && h.distance < 70);
  assert.deepEqual(cartSavePosition(g), { x: 82, z: 400, y: 1.2 });
  g.paused = true;
  const d = h.distance;
  ticks(g, 120, 1);
  assert.equal(h.distance, d);
  assert(h.sources.every((s) => s.activity === 0));
  g.paused = false;
  ticks(g, 700, 1);
  assert.equal(h.docked, 1);
  assert.equal(h.saved.stop, 1);
  assert.equal(finishFieldTask(g, fields[2]), false);
  interactTemperingCart(g);
  assert.equal(startCartTurn(g), false);
  place(g, 147, 392, 5.4);
  assert(finishFieldTask(g, fields[1]));
  assert(startCartTurn(g));
  ticks(g, 60);
  assert.equal(h.saved.turned, false);
  assert.equal(h.bridgeDeck.enabled, false);
  ticks(g, 90);
  assert.equal(h.saved.turned, true);
  assert.equal(h.bridgeDeck.enabled, true);
  place(g, 154, 406.8);
  interactTemperingCart(g);
  ticks(g, 1000, 1);
  assert.equal(h.docked, 2);
  assert(Math.abs(g.player.position.z - 336.8) < 1e-6);
  interactTemperingCart(g);
  place(g, 147, 336);
  assert(finishFieldTask(g, fields[2]));
  ticks(g, 1);
  assert.equal(h.cargo.visible, false);
  const normalized = normalizeSave({
    version: 1,
    levels: { embers: g.progress },
  }).levels.embers;
  assert.deepEqual(normalized.temperingCart, h.saved);
});

test("stairs, landing bridges, passenger deck and moving rails match walking collision", () => {
  const g = fixture(),
    h = g.temperingCart;
  function walk(x, z, y, vx, vz, frames) {
    place(g, x, z, y);
    for (let i = 0; i < frames; i++)
      advanceCharacter(g, { x: vx, z: vz }, 1 / 60);
    return g.player.position.clone();
  }
  let p = walk(84, 392.8, 0, 0, 2, 110);
  assert(p.z > 396 && Math.abs(p.y - 1.2) < 0.02, JSON.stringify(p));
  p = walk(83.2, 403.6, 1.2, 0, 1, 135);
  assert(p.z > 405.5 && Math.abs(p.y - 1.2) < 0.02, JSON.stringify(p));
  p = walk(147, 403.7, 1.2, 0, -2, 280);
  assert(p.z < 395 && Math.abs(p.y - 5.4) < 0.02, JSON.stringify(p));
  assert(cartBlocked(g, 84, 407.3, 1.2));
  assert(!cartBlocked(g, 83.2, 404.7, 1.2));
  assert.equal(cartDeckAt(g, 154, 406, 1.2), null);
  assert.equal(supportAt(g, 83.2, 406, 1.2).height, 1.2);
  h.distance = 70;
  h.docked = 1;
  h.saved.stop = 1;
  h.pose = temperingPose(70, false);
  ticks(g, 1);
  p = walk(153.2, 401.6, 1.2, 0, 1, 260);
  assert(p.z > 405.7 && Math.abs(p.y - 1.2) < 0.02, JSON.stringify(p));
});

test("empty-cart retrieval crosses the junction and recovered saves preserve a return journey", () => {
  const g = fixture(),
    h = g.temperingCart;
  g.progress.field = ["field-6-0", "field-6-1", "field-6-2"];
  Object.assign(h.saved, { loaded: true, stop: 2, turned: true });
  h.distance = 140;
  h.docked = 2;
  h.pose = temperingPose(140, true);
  place(g, 81, 402);
  interactTemperingCart(g);
  assert.equal(h.recall, 0);
  ticks(g, 2100);
  assert.equal(h.docked, 0);
  assert.equal(h.saved.turned, false);
  assert.deepEqual(normalizeTemperingCart(h.saved, g.progress), {
    loaded: true,
    stop: 0,
    turned: false,
  });
  place(g, 145, 339);
  interactTemperingCart(g);
  ticks(g, 2100);
  assert.equal(h.docked, 2);
  assert.equal(h.saved.turned, true);
});

import { natureRockAllowed } from "../src/nature-rocks.js";
import { cartOccludes } from "../src/tempering-cart-rules.js";
test("rail foundations exclude scanned rock footprints, while cart occlusion follows its rotation", () => {
  const g = fixture(),
    h = g.temperingCart;
  g.terrainProfile.waters = [];
  for (const [x, z] of [
    [120, 406],
    [154, 360],
    [147, 393],
    [159, 360],
  ])
    assert.equal(natureRockAllowed(g, x, z, 2), false);
  assert(natureRockAllowed(g, 180, 410, 1));
  assert(cartOccludes(g, { x: 84, y: 1.2, z: 407 }, { x: 84, y: 2.5, z: 408 }));
  assert(
    !cartOccludes(g, { x: 83.2, y: 2, z: 405 }, { x: 83.2, y: 2, z: 404 }),
  );
  h.pose = temperingPose(100, true);
  assert(
    cartOccludes(g, { x: 155, y: 1.2, z: 376 }, { x: 156, y: 2.5, z: 376 }),
  );
});

import { CART_ANCHORS } from "../src/tempering-cart-rules.js";
test("every saved landing is supported and the gallery connector is continuous", () => {
  const g = fixture();
  for (const a of CART_ANCHORS) {
    assert.equal(supportAt(g, a.x, a.z, 1.2).height, 1.2);
    assert(g.canMove(a.x, a.z, 1.2));
  }
  place(g, 153.2, 400);
  for (const [x, z] of [
    [150.4, 401.5],
    [149.4, 404],
    [147, 406],
  ]) {
    let reached = false;
    for (let i = 0; i < 700; i++) {
      const p = g.player.position,
        dx = x - p.x,
        dz = z - p.z,
        d = Math.hypot(dx, dz);
      if (d < 0.04) {
        reached = true;
        break;
      }
      const v = Math.min(2, d * 30);
      advanceCharacter(g, { x: (dx / d) * v, z: (dz / d) * v }, 1 / 60);
      assert(Math.abs(p.y - 1.2) < 0.02);
    }
    assert(reached, JSON.stringify(g.player.position));
  }
});
