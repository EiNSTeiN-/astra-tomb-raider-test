import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { advanceCharacter } from "../src/character-motion.js";
import { SaveStore } from "../src/storage.js";
import { finishFieldTask } from "../src/field-world.js";
import {
  buildRainGarden,
  updateRainGarden,
  turnGardenChannel,
  startGardenLift,
} from "../src/rain-garden.js";
import {
  CHANNEL_INITIAL,
  CHANNEL_SOLUTION,
  traceGarden,
  normalizeRainGarden,
  gardenSavePosition,
  GARDEN_FLOOR,
  GARDEN_UPPER,
} from "../src/rain-garden-rules.js";
function fixture(progress = { stage: 2 }) {
  const store = new SaveStore({
      getItem: () =>
        JSON.stringify({ version: 1, levels: { verdant: progress } }),
      setItem() {},
    }),
    world = new THREE.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level: LEVELS[0],
    map: createMap(LEVELS[0]),
    progress: store.level("verdant"),
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
    buildRainGarden(g);
  } finally {
    globalThis.document = previous;
  }
  g.cameraSurfaces.rebuild();
  place(g, 7, 0, 3);
  return g;
}
function place(g, x, y, z) {
  g.player.position.set(g.rainGarden.x + x, y, g.rainGarden.z + z);
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
    updateRainGarden(g, 1 / 60);
    if (!g.paused) advanceCharacter(g, velocity, 1 / 60, jump && i === 0);
  }
}
function walk(g, x, z, speed = 3) {
  x += g.rainGarden.x;
  z += g.rainGarden.z;
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

test("channel flow follows reciprocal open ends and stops at leaks and moving stones", () => {
  assert.equal(traceGarden(CHANNEL_INITIAL).complete, false);
  const solution = traceGarden(CHANNEL_SOLUTION);
  assert(solution.complete);
  assert.deepEqual(
    solution.path.map((p) => p.index),
    [3, 6, 7, 4, 1, 2],
  );
  for (const index of [3, 6, 7, 4, 1, 2])
    assert.equal(traceGarden(CHANNEL_SOLUTION, index).complete, false);
  const wrong = [...CHANNEL_SOLUTION];
  wrong[7] = 1;
  assert.equal(traceGarden(wrong).complete, false);
});
test("saved channel turns and lift stops normalize older and partial jungle progress", () => {
  assert.deepEqual(normalizeRainGarden(null, { stage: 2, field: [] }), {
    rotations: CHANNEL_INITIAL,
    stop: 0,
  });
  assert.equal(
    normalizeRainGarden({ stop: 1 }, { stage: 2, field: [] }).stop,
    0,
  );
  const old = normalizeRainGarden(null, {
    stage: 2,
    field: ["field-2-0", "field-2-1"],
  });
  assert(traceGarden(old.rotations).complete);
  assert.equal(old.stop, 0);
  const done = normalizeRainGarden(null, { stage: 3, field: [] });
  assert.equal(done.stop, 1);
  assert(traceGarden(done.rotations).complete);
  const altered = [...CHANNEL_SOLUTION];
  altered[0] = 2;
  assert.deepEqual(
    normalizeRainGarden(
      { rotations: altered, stop: 0 },
      { stage: 3, field: [] },
    ),
    { rotations: altered, stop: 0 },
  );
  assert.equal(
    normalizeRainGarden(null, { stage: 2, field: ["field-2-2"] }).stop,
    1,
  );
  const m = createMap(LEVELS[0]),
    fields = m.features.filter((f) => f.type === "field" && f.stage === 2);
  assert.deepEqual(
    fields.map((f) => f.gardenHeight),
    [0, 5.6, 9],
  );
  assert(fields.every((f) => Number.isInteger(f.x) && Number.isInteger(f.z)));
  for (const level of LEVELS.slice(1))
    assert.equal(createMap(level).rainGarden, undefined);
});
test("the channel control requires a connected spring route and only seated turns persist", () => {
  const g = fixture(),
    r = g.rainGarden,
    fields = g.map.features.filter((f) => f.type === "field" && f.stage === 2);
  assert(finishFieldTask(g, fields[0]));
  assert.equal(finishFieldTask(g, fields[1]), false);
  assert.equal(startGardenLift(g, 1), false);
  assert(turnGardenChannel(g, 3));
  tick(g, 8);
  const angle = r.channels[3].pivot.rotation.y,
    saves = g.saves;
  g.paused = true;
  tick(g, 50);
  assert.equal(r.channels[3].pivot.rotation.y, angle);
  assert.equal(g.saves, saves);
  assert.deepEqual(r.saved.rotations, CHANNEL_INITIAL);
  g.paused = false;
  tick(g, 30);
  assert.equal(r.saved.rotations[3], 0);
  assert.equal(g.saves, saves + 1);
  for (let i = 0; i < 9; i++)
    while (r.saved.rotations[i] !== CHANNEL_SOLUTION[i]) {
      assert(turnGardenChannel(g, i));
      tick(g, 25);
    }
  assert(r.flow.complete);
  assert(finishFieldTask(g, fields[1]));
  assert.equal(turnGardenChannel(g, 0), false);
  assert(startGardenLift(g, 1));
});
test("the west stair, irrigation terrace and water lift form a complete returnable route", () => {
  const g = fixture(),
    r = g.rainGarden;
  place(g, -9, 0, 11.5);
  walk(g, -9, 0);
  assert(Math.abs(g.player.position.y - GARDEN_FLOOR) < 0.001);
  walk(g, -6, 0);
  walk(g, 0, 7);
  r.saved.rotations = [...CHANNEL_SOLUTION];
  g.progress.field = ["field-2-0", "field-2-1"];
  walk(g, 6.7, 1);
  walk(g, 9, 0);
  assert.equal(g.player.position.y, GARDEN_FLOOR);
  assert(startGardenLift(g, 1));
  tick(g, 90);
  const position = gardenSavePosition(g);
  assert.equal(position.y, GARDEN_FLOOR);
  assert(g.player.position.y > GARDEN_FLOOR);
  assert(g.player.position.y < GARDEN_UPPER);
  const height = g.player.position.y;
  g.paused = true;
  tick(g, 50);
  assert.equal(g.player.position.y, height);
  assert(r.sources.every((s) => s.activity === 0));
  g.paused = false;
  tick(g, 120);
  assert.equal(g.player.position.y, GARDEN_UPPER);
  assert(g.grounded);
  assert.equal(gardenSavePosition(g), null);
  walk(g, 9, -7);
  walk(g, 7, -7);
  walk(g, 9, -7);
  walk(g, 9, 0);
  assert(startGardenLift(g, 0));
  tick(g, 210);
  walk(g, 6, 0);
  walk(g, -9, 0);
  walk(g, -9, 11.5);
  assert.equal(g.player.position.y, 0);
  assert(g.grounded);
});

test("rendered treads and channel pads match footing and the lift rail follows its stop", () => {
  const game = fixture(),
    g = game.rainGarden,
    ray = new THREE.Raycaster();
  game.world.updateMatrixWorld(true);
  ray.far = 0.4;
  const contacts = g.decks
    .filter((d) => d.x === g.x - 9)
    .map((d) => ({ x: d.x, y: d.y, z: d.z }));
  for (let i = 0; i < 9; i++)
    contacts.push({
      x: g.x + ((i % 3) - 1) * 3.5 + 1.45,
      y: GARDEN_FLOOR + 0.13,
      z: g.z + (Math.floor(i / 3) - 1) * 3.5 + 1.45,
    });
  for (const p of contacts) {
    ray.set(
      new THREE.Vector3(p.x, p.y + 0.2, p.z),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = ray.intersectObject(g.root, true)[0];
    assert(hit);
    assert(Math.abs(hit.point.y - p.y) < 0.035);
  }
  assert.equal(contacts.length, 45);
  assert.equal(
    game.canMove(g.carDeck.x, g.carDeck.z + 1.45, GARDEN_FLOOR),
    false,
  );
  g.saved.stop = 1;
  g.car.position.y = GARDEN_UPPER;
  g.carDeck.y = GARDEN_UPPER;
  updateRainGarden(game, 0, true);
  assert.equal(
    game.canMove(g.carDeck.x, g.carDeck.z + 1.45, GARDEN_UPPER),
    false,
  );
  assert.equal(
    game.canMove(g.carDeck.x, g.carDeck.z + 1.45, GARDEN_FLOOR),
    true,
  );
});
