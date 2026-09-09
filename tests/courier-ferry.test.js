import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { advanceCharacter } from "../src/character-motion.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { canAim } from "../src/aiming.js";
import { canCrouch } from "../src/stealth.js";
import {
  COURIER_STOPS,
  normalizeCourier,
  courierWind,
  stepCourier,
  courierDeckAt,
  courierSavePosition,
  restoreCourierArrival,
} from "../src/courier-rules.js";
import {
  buildCourierFerry,
  updateCourierFerry,
  controlCourier,
  interactCourier,
  recoverCourierFall,
  courierOccludes,
} from "../src/courier-ferry.js";

const level = LEVELS[5],
  map = createMap(level),
  profile = createTerrainProfile(map, level);
function fixture() {
  const world = new THREE.Group();
  const store = new SaveStore({ getItem: () => null, setItem() {} });
  const g = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile: profile,
    groundHeight: profile.height,
    world,
    store,
    progress: store.level("sky"),
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    obstacles: [],
    cameraSurfaces: new CameraSurfaces(world),
    goldMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    health: 100,
    grounded: true,
    velocityY: 0,
    jumpY: 0,
    keys: new Set(),
    audio: { tone() {} },
    cb: { toast() {}, courierGuide() {}, courierFragment() {} },
    save() {
      this.saveCount = (this.saveCount || 0) + 1;
    },
  });
  const old = globalThis.document,
    load = THREE.TextureLoader.prototype.load;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  THREE.TextureLoader.prototype.load = () => new THREE.Texture();
  try {
    buildCourierFerry(g);
  } finally {
    globalThis.document = old;
    THREE.TextureLoader.prototype.load = load;
  }
  g.player.position.set(126, g.courierFerry.y, 21);
  return g;
}
function walk(g, x, z, jump = false) {
  if (jump) g.jumpBuffer = 0.15;
  let ticks = 0;
  while (ticks++ < 600) {
    const p = g.player.position,
      dx = x - p.x,
      dz = z - p.z,
      d = Math.hypot(dx, dz);
    if (d < 0.04) break;
    advanceCharacter(
      g,
      { x: (dx / d) * 6, z: (dz / d) * 6 },
      Math.min(1 / 60, d / 6),
    );
  }
  return Math.hypot(g.player.position.x - x, g.player.position.z - z);
}

test("courier landings have supported foundations and genuine chasms without moving main field stations", () => {
  assert.equal(LEVELS.filter((l) => createMap(l).courierFerry).length, 1);
  for (const x of COURIER_STOPS)
    for (const z of [20, 21, 25, 28])
      assert(Math.abs(profile.height(x, z) - profile.courierY) < 0.001);
  for (const x of [157.5, 220.5, 283.5])
    assert(profile.height(x, 14) < profile.courierY - 15);
  const before = { ...map, courierFerry: null };
  const base = createTerrainProfile(before, level);
  for (const f of [...map.features, ...map.fieldSites])
    assert(
      Math.abs(
        profile.height(f.x * 7, f.z * 7) - base.height(f.x * 7, f.z * 7),
      ) < 0.001,
    );
});
test("sail dynamics allow both directions through reversing winds, brake, latch and remain inside the cable ends", () => {
  for (const direction of [-1, 1]) {
    const h = {
      x: direction > 0 ? 126 : 315,
      velocity: 0,
      trim: direction,
      time: 0,
      recall: null,
      docked: null,
    };
    let ticks = 0;
    while (
      ticks++ < 18000 &&
      Math.abs(h.x - (direction > 0 ? 315 : 126)) > 0.1
    ) {
      h.trim = direction * Math.sign(courierWind(h.x, h.time) || 1);
      stepCourier(h, 1 / 60);
      assert(h.x >= 126 && h.x <= 315);
      assert(Math.abs(h.velocity) <= 3.8);
    }
    assert(ticks < 18000);
    h.trim = 0;
    for (let i = 0; i < 180; i++) stepCourier(h, 1 / 60);
    assert.equal(h.docked, direction > 0 ? 3 : 0);
    assert.equal(h.velocity, 0);
  }
  const h = {
    x: 188,
    velocity: 3.5,
    trim: 0,
    time: 0,
    docked: null,
    recall: null,
  };
  for (let i = 0; i < 180; i++) stepCourier(h, 1 / 60);
  assert.equal(h.x, 189);
  assert.equal(h.docked, 1);
});
test("boarding transports the rider, furling consumes Jump, and pause freezes the ferry and drive sources", () => {
  const g = fixture(),
    h = g.courierFerry;
  g.player.position.set(126, h.y, 15.5);
  assert(interactCourier(g));
  assert(h.helm);
  assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
  assert.equal(canAim(g), false);
  assert.equal(canCrouch(g), false);
  controlCourier(g, 1, 1);
  for (let i = 0; i < 120; i++) updateCourierFerry(g, 1 / 60);
  assert(h.x > 127);
  assert(Math.abs(g.player.position.x - h.x) < 0.001);
  const before = h.x;
  g.paused = true;
  updateCourierFerry(g, 3);
  assert.equal(h.x, before);
  assert(
    h.sources
      .filter((s) => ["courier-sail", "courier-rope"].includes(s.id))
      .every((s) => s.activity === 0),
  );
  g.paused = false;
  g.keys.add("Space");
  controlCourier(g, 1 / 60, 1);
  assert.equal(h.trim, 0);
  assert(!g.keys.has("Space"));
  assert.equal(g.jumpBuffer, 0);
  interactCourier(g);
  assert.equal(h.helm, false);
});
test("each broken stair is climbed using ordinary walking and a jump, with solid sides and a readable top", () => {
  for (let dock = 1; dock < 4; dock++) {
    const g = fixture(),
      h = g.courierFerry,
      x = COURIER_STOPS[dock];
    g.player.position.set(x - 6, h.y, 25);
    g.jumpY = h.y - g.groundHeight(x - 6, 25);
    assert(
      walk(g, x - 2.2, 25) < 0.05,
      `walk stair ${dock}: ${g.player.position.toArray()}`,
    );
    assert(Math.abs(g.player.position.y - h.y - 1.75) < 0.01);
    assert(
      walk(g, x + 3, 25, true) < 0.05,
      `jump stair ${dock}: ${g.player.position.toArray()}`,
    );
    assert(walk(g, x + 4.1, 25) < 0.05);
    for (let i = 0; i < 60; i++) advanceCharacter(g, { x: 0, z: 0 }, 1 / 60);
    assert(Math.abs(g.player.position.y - h.y - 4.2) < 0.01);
    assert.equal(
      g.canMove(x + 4.8, 25, 0),
      false,
      "cannot walk through raised platform",
    );
    assert(
      courierOccludes(
        g,
        new THREE.Vector3(x + 4.8, h.y + 1, 22),
        new THREE.Vector3(x + 4.8, h.y + 1, 28),
      ),
    );
  }
});
test("ordered dispatches and recovered register persist, and invalid or foreign chapter courier records normalize safely", () => {
  const g = fixture(),
    h = g.courierFerry;
  g.player.position.set(315 + 4.8, h.y + 4.2, 25.85);
  assert(interactCourier(g));
  assert.equal(h.saved.post, 0);
  for (let i = 1; i < 4; i++) {
    g.player.position.set(COURIER_STOPS[i] + 4.8, h.y + 4.2, 25.85);
    assert(interactCourier(g));
    assert.equal(h.saved.post, i);
  }
  g.player.position.set(120, h.y, 22.2);
  interactCourier(g);
  assert(h.saved.recovered);
  const save = normalizeSave({
    ...g.store.data,
    levels: { sky: g.progress, verdant: { courierFerry: h.saved } },
  });
  assert.deepEqual(save.levels.sky.courierFerry, h.saved);
  assert.equal(save.levels.verdant.courierFerry, null);
  assert.deepEqual(
    normalizeCourier({ visited: false, post: 3, dock: 3, recovered: true }),
    { visited: false, post: 0, dock: 0, recovered: false },
  );
  assert.equal(
    normalizeCourier({
      visited: true,
      post: Infinity,
      dock: NaN,
      recovered: true,
    }).recovered,
    false,
  );
});
test("transit and falling saves restore the last landing; supported elevated saves keep their height", () => {
  const g = fixture(),
    h = g.courierFerry;
  Object.assign(h.saved, { visited: true, dock: 1 });
  h.x = 220;
  g.player.position.set(220, h.y, 14);
  g.grounded = true;
  assert.deepEqual(courierSavePosition(g), { x: 189, y: h.y, z: 21 });
  g.progress.position = { x: 220, z: 14, height: 0 };
  restoreCourierArrival(g);
  assert.equal(g.player.position.x, 189);
  g.player.position.set(192.8, h.y + 4.2, 25);
  g.grounded = true;
  const elevated = courierSavePosition(g);
  assert.equal(elevated.y, h.y + 4.2);
  g.progress.position = {
    x: elevated.x,
    z: elevated.z,
    height: elevated.y - g.groundHeight(elevated.x, elevated.z),
  };
  g.player.position.y = g.groundHeight(elevated.x, elevated.z);
  restoreCourierArrival(g);
  assert(Math.abs(g.player.position.y - elevated.y) < 0.001);
  g.player.position.set(220, h.y - 10, 14);
  assert(recoverCourierFall(g));
  assert.equal(h.x, 189);
  assert.equal(g.player.position.x, 189);
  assert.equal(g.health, 100);
});
test("an abandoned empty car can be recalled and boarding cancels retrieval before it can carry a rider", () => {
  const g = fixture(),
    h = g.courierFerry;
  h.x = 230;
  h.docked = null;
  g.player.position.set(189 - 4.7, h.y, 21.2);
  assert(interactCourier(g));
  assert.equal(h.recall, 1);
  for (let i = 0; i < 900; i++) updateCourierFerry(g, 1 / 60);
  assert.equal(h.x, 189);
  assert.equal(h.docked, 1);
  assert.equal(h.recall, null);
  h.recall = 0;
  g.player.position.set(189, h.y, 15.5);
  updateCourierFerry(g, 1 / 60);
  assert.equal(h.recall, null);
  assert.equal(h.x, 189);
});

test("wind blends continuously across sector borders instead of flipping at a coordinate seam", () => {
  for (let time = 0; time < 80; time += 0.7)
    for (const x of [183, 189, 195, 246, 252, 258])
      assert(
        Math.abs(courierWind(x + 0.001, time) - courierWind(x - 0.001, time)) <
          0.001,
      );
});
