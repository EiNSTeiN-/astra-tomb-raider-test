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
  buildSunBridge,
  updateSunBridge,
  sunInteract,
  advanceSunTurn,
  recoverSunFall,
} from "../src/sun-bridge.js";
import {
  normalizeSunBridge,
  sunLocal,
  sunWorld,
  sunDeckAt,
  sunBlocked,
  sunCeiling,
  sunOccludes,
  sunAnchor,
  sunSavePosition,
  restoreSunArrival,
} from "../src/sun-bridge-rules.js";
import { canAim } from "../src/aiming.js";
import { canCrouch } from "../src/stealth.js";
import { torchHandsBusy } from "../src/torch.js";
import { distanceGain } from "../src/audio.js";
const map = createMap(LEVELS[0]),
  terrain = createTerrainProfile(map, LEVELS[0]);
function fixture(progress = { stage: 5 }) {
  const store = new SaveStore({
      getItem: () =>
        JSON.stringify({ version: 1, levels: { verdant: progress } }),
      setItem() {},
    }),
    world = new THREE.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level: LEVELS[0],
    map: structuredClone(map),
    terrainProfile: terrain,
    store,
    progress: store.level("verdant"),
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
    createElementNS: () => ({
      addEventListener() {},
      removeEventListener() {},
      set src(value) {},
    }),
  };
  try {
    g.items = g.map.features.filter((f) => f.sunHeight !== undefined);
    for (const f of g.items) {
      f.group = new THREE.Group();
      f.group.position.set(f.x * 7, 0, f.z * 7);
      g.world.add(f.group);
      buildFieldStation(g, f, f.group);
    }
    buildSunBridge(g);
  } finally {
    globalThis.document = old;
  }
  g.cameraSurfaces.rebuild();
  place(g, -24, 0, 18);
  return g;
}
function place(g, x, y, z) {
  const h = g.sunBridge;
  g.player.position.set(h.x + x, h.y + y, h.z + z);
  g.jumpY = y;
  g.grounded = true;
  g.velocityY = 0;
  g.airVelocity = null;
  g.sunBridge.fallFrom = null;
}

function tick(g, n = 1, v = { x: 0, z: 0 }, jump = false) {
  for (let i = 0; i < n; i++) {
    updateSunBridge(g, 1 / 60);
    if (!g.paused && !advanceSunTurn(g, 1 / 60, v)) {
      advanceCharacter(g, v, 1 / 60, jump && i === 0);
      recoverSunFall(g);
    }
  }
}
function move(g, x, z) {
  x += g.sunBridge.x;
  z += g.sunBridge.z;
  for (let i = 0; i < 1500; i++) {
    const dx = x - g.player.position.x,
      dz = z - g.player.position.z,
      d = Math.hypot(dx, dz);
    if (d < 0.07 && g.grounded) return;
    const speed = Math.min(5.1, d * 30);
    tick(g, 1, { x: (dx / d) * speed, z: (dz / d) * speed });
  }
  assert.fail(`Blocked at ${g.player.position.toArray()} toward ${x},${z}`);
}
const completed = { stage: 5, field: ["field-5-0", "field-5-1", "field-5-2"] };
test("sun stops and recovery anchors migrate only with earned jungle progress", () => {
  assert.deepEqual(
    normalizeSunBridge({ stops: [1, 1], anchor: 3 }, { stage: 5 }),
    { stops: [0, 0], anchor: 0 },
  );
  assert.deepEqual(
    normalizeSunBridge(
      { stops: [1, 1], anchor: 3 },
      { stage: 5, field: ["field-5-0"] },
    ),
    { stops: [1, 0], anchor: 2 },
  );
  assert.deepEqual(
    normalizeSunBridge({ stops: [1, 1], anchor: 3 }, { stage: 6 }),
    { stops: [1, 1], anchor: 3 },
  );
  assert.deepEqual(
    normalizeSunBridge({ stops: [NaN, 99], anchor: 9 }, completed),
    { stops: [0, 0], anchor: 0 },
  );
  const save = normalizeSave({
    version: 1,
    levels: {
      verdant: completed,
      frost: { sunBridge: { stops: [1, 1], anchor: 3 } },
    },
  });
  assert.deepEqual(save.levels.verdant.sunBridge, { stops: [0, 0], anchor: 0 });
  assert.equal(save.levels.frost.sunBridge, null);
  for (const l of LEVELS.slice(1))
    assert.equal(createMap(l).sunBridge, undefined);
});
test("southern stair supports a complete walk up and down without jumping or damage", () => {
  const g = fixture();
  move(g, -24, 1.2);
  assert(
    Math.abs(g.player.position.y - g.sunBridge.y - 6) < 1e-8,
    JSON.stringify({
      p: g.player.position.toArray(),
      jump: g.jumpY,
      base: g.sunBridge.y,
    }),
  );
  move(g, -24, 18);
  assert.equal(g.jumpY, 0);
  assert.equal(g.health, 100);
});
test("rotating spans carry riders in local coordinates, leave central piers fixed, and freeze on pause", () => {
  const g = fixture(completed),
    h = g.sunBridge,
    b = h.bridges[0];
  place(g, -4, 6, 0.3);
  b.motion = { from: 0, to: Math.PI / 2, time: 0 };
  h.saved.stops[0] = 1;
  tick(g, 90);
  const local = sunLocal(b, g.player.position.x, g.player.position.z);
  assert(Math.abs(local.x - 6) < 1e-8);
  assert(Math.abs(local.z - 0.3) < 1e-8);
  assert.equal(g.health, 100);
  const paused = g.player.position.clone(),
    angle = b.angle;
  g.paused = true;
  tick(g, 180);
  assert(g.player.position.equals(paused));
  assert.equal(b.angle, angle);
  assert(h.sources.every((s) => s.activity === 0));
  g.paused = false;
  tick(g, 151);
  assert.equal(b.angle, Math.PI / 2);
  assert(g.grounded);
  const world = sunWorld(b, 6, 0.3);
  assert(
    Math.hypot(world.x - g.player.position.x, world.z - g.player.position.z) <
      1e-8,
  );
  place(g, -10, 6, 1);
  const center = g.player.position.clone();
  b.motion = { from: Math.PI / 2, to: 0, time: 0 };
  tick(g, 241);
  assert(g.player.position.equals(center));
});
test("span sides, undersides and rotating rails obstruct the character and sight at their real heights", () => {
  const g = fixture(completed),
    h = g.sunBridge,
    b = h.bridges[0];
  b.angle = Math.PI / 2;
  updateSunBridge(g, 0);
  assert.equal(sunDeckAt(g, h.x - 10, h.z - 8, h.y + 6).height, h.y + 6);
  assert.equal(sunDeckAt(g, h.x - 18, h.z, h.y + 6), null);
  assert(sunBlocked(g, h.x - 11.5, h.z - 8, h.y + 6));
  assert(!sunBlocked(g, h.x - 10, h.z - 8, h.y + 6));
  assert(sunBlocked(g, h.x - 10, h.z - 8, h.y + 5));
  assert(sunCeiling(g, h.x - 10, h.z - 8, h.y + 3, h.y + 5) < h.y + 4);
  assert(
    sunOccludes(
      g,
      { x: h.x - 10, y: h.y + 3, z: h.z - 8 },
      { x: h.x - 10, y: h.y + 8, z: h.z - 8 },
    ),
  );
});
test("airborne saves and failed crossings return to a clear earned landing without replaying progress", () => {
  const g = fixture({ ...completed, sunBridge: { stops: [1, 1], anchor: 3 } }),
    h = g.sunBridge;
  place(g, 16, 6, -7);
  g.grounded = false;
  assert.deepEqual(sunSavePosition(g), sunAnchor(g));
  h.fallFrom = h.y + 6;
  g.player.position.y = h.y + 3;
  assert(recoverSunFall(g));
  assert.equal(g.health, 92);
  assert(g.grounded);
  assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
  g.progress.position = { x: h.x - 4, z: h.z, height: 6 };
  place(g, -4, 0, 0);
  restoreSunArrival(g);
  assert.deepEqual(g.player.position.toArray(), [
    sunAnchor(g).x,
    sunAnchor(g).y,
    sunAnchor(g).z,
  ]);
  for (const anchor of [0, 1, 2, 3]) {
    h.saved.anchor = anchor;
    const a = sunAnchor(g);
    assert(g.canMove(a.x, a.z, a.y - g.groundHeight(a.x, a.z)));
    assert.equal(supportAt(g, a.x, a.z, a.y).height, a.y);
  }
});
test("hoists follow the moving supports, stay silent at rest and attenuate over distance", () => {
  const g = fixture({ stage: 5, field: ["field-5-0"] }),
    h = g.sunBridge;
  g.progress.field.push("field-5-1");
  tick(g, 60);
  assert(h.lift > 0 && h.lift < 1);
  assert(h.bridges[1].source.activity > 0);
  assert(h.weightSource.activity > 0);
  assert.equal(h.bridges[1].source.y, h.bridges[1].y - 0.15);
  tick(g, 241);
  assert(h.sources.every((s) => s.activity === 0));
  g.progress.field.push("field-5-2");
  tick(g, 60);
  assert(h.returnSource.activity > 0);
  assert.equal(h.returnSource.y, h.returnDeck.y);
  for (const s of h.sources) {
    assert.equal(distanceGain(s.near, s.near, s.range), 1);
    assert.equal(distanceGain((s.near + s.range) / 2, s.near, s.range), 0.5);
    assert.equal(distanceGain(s.range + 1, s.near, s.range), 0);
  }
  tick(g, 181);
  assert(h.sources.every((s) => s.activity === 0));
  assert.equal(h.returnDeck.y, h.y + 6);
});
test("pivot turns require an earned cable, commit once, cancel before the detent and reserve both hands", () => {
  const g = fixture(),
    h = g.sunBridge;
  place(g, -10, 6, 0.7);
  assert(sunInteract(g));
  assert.equal(h.turn, null);
  g.progress.field.push("field-5-0");
  assert(sunInteract(g));
  assert(h.turn);
  assert(!canAim(g));
  assert(!canCrouch(g));
  assert(torchHandsBusy(g));
  tick(g, 20);
  tick(g, 1, { x: 1, z: 0 });
  assert.equal(h.turn, null);
  assert.equal(h.saved.stops[0], 0);
  assert.equal(g.saves, undefined);
  place(g, -10, 6, 0.7);
  assert(sunInteract(g));
  tick(g, 160);
  assert.equal(h.saved.stops[0], 1);
  assert.equal(g.saves, 1);
  assert(h.bridges[0].motion);
});

test("the three stations require their ordered field action and pause preserves an unseated handwheel", () => {
  const g = fixture(),
    h = g.sunBridge;
  place(g, -17, 9.2, -23.1);
  assert(!finishFieldTask(g, g.items[1]));
  assert.equal(h.turn, null);
  place(g, -24, 6, 1.2);
  assert(!finishFieldTask(g, g.items[0]));
  assert(h.turn);
  tick(g, 25);
  const time = h.turn.time;
  g.paused = true;
  tick(g, 150);
  assert.equal(h.turn.time, time);
  assert.deepEqual(g.progress.field, []);
  g.paused = false;
  tick(g, 160);
  assert.deepEqual(g.progress.field, ["field-5-0"]);
  assert.equal(g.saves, 1);
  assert(!finishFieldTask(g, g.items[0]));
  assert.equal(g.saves, 1);
});

test("turning side rails sweep around the fixed pier without passing through its waiting area", () => {
  const g = fixture(completed),
    h = g.sunBridge,
    b = h.bridges[0];
  for (let angle = 0; angle <= Math.PI / 2; angle += 0.05) {
    b.angle = angle;
    updateSunBridge(g, 0);
    for (const [x, z] of [
      [2, 0],
      [-2, 0],
      [0, 2],
      [2.2, 2.2],
      [-2.2, 2.2],
      [2.2, -2.2],
      [-2.2, -2.2],
    ])
      assert(
        !sunBlocked(g, b.x + x, b.z + z, h.y + 6),
        `Rail crossed fixed pier at angle ${angle}, ${x}, ${z}`,
      );
  }
});

test("garden trusses remain under walking decks and construction surfaces retain finite coordinates through batching", () => {
  const g = fixture(completed),
    h = g.sunBridge;
  assert.equal(h.construction.piers.length, 12);
  assert.equal(h.construction.arches.length, 4);
  assert.equal(h.construction.trusses.length, 3);
  for (const b of h.bridges) assert.equal(b.deck.thickness, 1.2);
  assert.equal(h.returnDeck.thickness, 1.2);
  for (const root of [h.root, ...g.items.map((f) => f.group)])
    root.traverse((mesh) => {
      if (!mesh.geometry) return;
      for (const attribute of Object.values(mesh.geometry.attributes))
        assert([...attribute.array].every(Number.isFinite));
      if (mesh.material.userData.windMetal) {
        assert(mesh.geometry.attributes.windCoord);
        assert(mesh.geometry.attributes.windCavity);
      }
    });
  // Corbelled galleries and moving timber still leave ground-level headroom.
  assert(!sunBlocked(g, h.x - 4, h.z, h.y, 1.8));
  assert(sunCeiling(g, h.x - 4, h.z, h.y + 3, h.y + 5) <= h.y + 3.01);
});
test("winch construction keeps its calibrated handle axes and leaves a supported front approach", () => {
  const g = fixture(completed),
    h = g.sunBridge;
  const controls = [...h.controls, ...g.items.map((f) => f.sunControl)];
  for (const c of controls) {
    assert.deepEqual(c.wheel.position.toArray(), [0, 1.35, 0.12]);
    assert.equal(c.grips.length, 2);
    for (const [i, grip] of c.grips.entries())
      assert.deepEqual(grip.position.toArray(), [
        i === 0 ? -0.23 : 0.23,
        0,
        0.16,
      ]);
  }
  for (const [x, y, z] of [
    [-24, 6, 0.78],
    [-17, 9.2, -23.22],
    [16, 6, -13.22],
    [-10, 6, 0.28],
    [16, 6, 0.28],
    [-10, 6, -13.82],
  ]) {
    place(g, x, y, z);
    assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
    assert.equal(
      supportAt(
        g,
        g.player.position.x,
        g.player.position.z,
        g.player.position.y,
      ).height,
      g.player.position.y,
    );
  }
});

test("coursed shafts and individual arch stones still obstruct the following camera after batching", () => {
  const g = fixture(completed),
    h = g.sunBridge;
  for (const p of h.construction.piers) {
    const a = new THREE.Vector3(h.x + p.x - 3, h.y + p.base + 2, h.z + p.z),
      b = a.clone().add(new THREE.Vector3(6, 0, 0));
    assert(
      g.cameraSurfaces.entry(a, b, 0.03) < 1,
      `Camera missed shaft ${p.x},${p.z}`,
    );
  }
  for (const arch of h.construction.arches) {
    const a = new THREE.Vector3(h.x + arch.x, h.y + arch.y + 0.2, h.z + arch.z),
      b = a.clone();
    b.y = h.y + arch.y + arch.outer + 0.3;
    assert(
      g.cameraSurfaces.entry(a, b, 0.03) < 0.85,
      "Camera missed the underside of a masonry arch",
    );
  }
});
