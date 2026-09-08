import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  advanceCharacter,
  supportAt,
  safeArrival,
} from "../src/character-motion.js";
import { restoreTraversal } from "../src/traversal.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import {
  buildBellHoist,
  updateBellHoist,
  startHoist,
  bellHoistInteract,
  bellHoistControl,
  bellHoistObjective,
} from "../src/bell-hoist.js";
import {
  HOIST_DECK,
  HOIST_RISE,
  hoistHeight,
  normalizeBellHoist,
} from "../src/bell-hoist-rules.js";

function fixture(data = null, offset = 0) {
  let saved = data && JSON.stringify(data);
  const store = new SaveStore({
    getItem: () => saved,
    setItem: (_key, value) => {
      saved = value;
    },
  });
  const world = new THREE.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    world,
    store,
    level: LEVELS[2],
    map: { bellHoist: { x: offset / 7, z: offset / 7 } },
    progress: store.level("frost"),
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    stoneMat: new THREE.MeshStandardMaterial({ vertexColors: true }),
    cameraSurfaces: new CameraSurfaces(world),
    obstacles: [],
    traversalCourses: [],
    groundHeight: () => 0,
    walkable: () => true,
    grounded: true,
    health: 100,
    explored: new Set(),
    keys: new Set(),
    jumpY: HOIST_DECK,
    elapsed: 0,
    velocityY: 0,
    audio: {
      tone() {},
      bell() {
        g.strikes++;
      },
    },
    cb: {
      toast() {},
      bellHoistRecord() {
        g.records++;
      },
    },
    strikes: 0,
    records: 0,
  });
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  try {
    buildBellHoist(g);
  } finally {
    globalThis.document = old;
  }
  g.cameraSurfaces.rebuild();
  g.player.position.set(offset - 7, HOIST_DECK, offset - 8);
  return g;
}
function tick(g, frames = 1, velocity = { x: 0, z: 0 }, jump = false) {
  for (let i = 0; i < frames; i++) {
    g.elapsed += 1 / 60;
    updateBellHoist(g, 1 / 60);
    if (!g.paused) advanceCharacter(g, velocity, 1 / 60, jump && i === 0);
  }
}
function walk(g, points, height = g.player.position.y) {
  for (const [x, z] of points) {
    let reached = false;
    for (let i = 0; i < 900; i++) {
      const dx = x - g.player.position.x,
        dz = z - g.player.position.z,
        d = Math.hypot(dx, dz);
      if (d < 0.05) {
        reached = true;
        break;
      }
      const speed = Math.min(4, d * 40);
      tick(g, 1, { x: (dx / d) * speed, z: (dz / d) * speed });
      assert(
        g.player.position.y >= height - 0.05,
        `fell en route to ${x},${z}: ${g.player.position.toArray()}`,
      );
    }
    assert(reached, `blocked to ${x},${z}: ${g.player.position.toArray()}`);
  }
}
test("paired lifts carry a rider continuously, freeze on pause and release a jumping rider", () => {
  const g = fixture(),
    h = g.bellHoist;
  for (const stop of [-1, 3, NaN, 1.5, "1"])
    assert.equal(startHoist(g, stop), false);
  assert(startHoist(g, 1));
  assert.equal(startHoist(g, 2), false);
  for (let i = 0; i < 90; i++) {
    tick(g);
    assert(Math.abs(g.player.position.y - h.cars[0].deck.y) < 1e-6);
    assert(
      Math.abs(
        h.cars[0].deck.y + h.cars[1].deck.y - 2 * (HOIST_DECK + HOIST_RISE),
      ) < 1e-6,
    );
  }
  assert.equal(h.saved.stop, 0);
  assert.equal(h.cars[0].source.activity, 1);
  const before = g.player.position.y;
  g.paused = true;
  tick(g, 100);
  assert.equal(g.player.position.y, before);
  assert.equal(h.cars[0].source.activity, 0);
  g.paused = false;
  tick(g, 90);
  assert.equal(h.saved.stop, 1);
  assert.equal(h.motion, null);
  assert.equal(h.cars[0].source.activity, 0);
  assert(startHoist(g, 2));
  tick(g, 15);
  tick(g, 1, { x: 0, z: 0 }, true);
  assert(!g.grounded);
  assert(g.player.position.y > h.cars[0].deck.y + 0.1);
  tick(g, 20, { x: 4, z: 0 });
  assert(g.player.position.x > -5.7);
});
test("the full bellkeepers route uses both lifts, the middle jump and opened upper crossing, then returns", () => {
  const g = fixture(),
    h = g.bellHoist,
    mid = HOIST_DECK + HOIST_RISE,
    upper = hoistHeight(2, 0);
  assert.equal(bellHoistControl(g)?.kind, "ride");
  assert(bellHoistInteract(g));
  tick(g, 170);
  assert.equal(h.saved.stop, 1);
  walk(
    g,
    [
      [-12, -8],
      [-13, 12],
      [-12, 13.3],
    ],
    mid,
  );
  assert.equal(bellHoistControl(g)?.kind, "clapper");
  assert(bellHoistInteract(g));
  assert(h.saved.clapper);
  walk(
    g,
    [
      [-10.8, 13.3],
      [-10.8, 15],
      [-1.5, 15],
    ],
    mid,
  );
  tick(g, 45, { x: 6, z: 0 }, true);
  assert(g.player.position.x > 2.5);
  tick(g, 10);
  assert(g.grounded);
  assert.equal(g.player.position.y, mid);
  walk(
    g,
    [
      [13, 15],
      [13, 10],
      [7, 10],
    ],
    mid,
  );
  assert.equal(bellHoistControl(g)?.kind, "ride");
  assert(bellHoistInteract(g));
  tick(g, 170);
  assert.equal(h.saved.stop, 0);
  assert.equal(g.player.position.y, upper);
  walk(
    g,
    [
      [12, 10],
      [13, 0],
      [12, -10.5],
    ],
    upper,
  );
  assert.equal(bellHoistControl(g)?.kind, "bell");
  assert(bellHoistInteract(g));
  tick(g, 160);
  assert.equal(g.strikes, 1);
  assert(h.saved.bell);
  assert(h.bridgeDeck.enabled);
  walk(
    g,
    [
      [12, -14.8],
      [-12, -14.8],
      [-12, -20],
    ],
    upper,
  );
  assert.equal(bellHoistControl(g)?.kind, "record");
  assert(bellHoistInteract(g));
  assert.equal(g.records, 1);
  assert.equal(bellHoistObjective(g).step, 3);
  assert.equal(h.record.visible, false);
  walk(
    g,
    [
      [-12, -14.8],
      [-12, -8],
    ],
    upper,
  );
  const call = h.controls.find(
    (c) => c.kind === "call" && c.car === 0 && c.stop === 2,
  );
  walk(g, [[call.position.x - 0.7, call.position.z]], upper);
  assert.equal(bellHoistControl(g)?.kind, "call");
  assert(bellHoistInteract(g));
  tick(g, 320);
  walk(
    g,
    [
      [-12, -8],
      [-7, -8],
    ],
    upper,
  );
  assert(bellHoistInteract(g));
  tick(g, 320);
  assert.equal(g.player.position.y, HOIST_DECK);
  walk(
    g,
    [
      [-7, -20],
      [0, -23],
      [0, -28],
    ],
    0,
  );
});
test("a mid-journey save restores the rider at the last completed stop; collected discoveries persist", () => {
  const g = fixture(null, 200);
  assert(startHoist(g, 1));
  tick(g, 170);
  assert(startHoist(g, 2));
  tick(g, 90);
  g.save();
  assert.equal(g.progress.position.height, hoistHeight(1, 0));
  const restored = fixture(normalizeSave(g.store.data), 200),
    p = restored.progress.position;
  restored.player.position.set(p.x, 0, p.z);
  restoreTraversal(restored);
  assert.equal(restored.player.position.y, hoistHeight(1, 0));
  assert.deepEqual(safeArrival(restored, restored.player.position), {
    x: p.x,
    y: hoistHeight(1, 0),
    z: p.z,
  });
  assert.equal(restored.bellHoist.motion, null);
  assert.equal(restored.bellHoist.saved.stop, 1);
  Object.assign(g.progress.bellHoist, {
    clapper: true,
    bell: true,
    recovered: true,
  });
  const complete = fixture(normalizeSave(g.store.data));
  assert(complete.bellHoist.bridgeDeck.enabled);
  assert.equal(complete.bellHoist.gateSolid.enabled, false);
  assert.equal(complete.bellHoist.record.visible, false);
  assert.equal(complete.bellHoist.clapper.visible, false);
});
test("thin walls and floors occlude sight while their open thresholds and space below balconies remain usable", () => {
  const g = fixture(),
    upper = hoistHeight(2, 0);
  assert.equal(g.canMove(-12, -17, upper), false);
  for (const x of [-8.7, 8.7]) assert.equal(g.canMove(x, -14.8, upper), false);
  assert.equal(
    g.lineOfSight(
      new THREE.Vector3(-12, upper, -15.9),
      new THREE.Vector3(-12, upper, -18.1),
    ),
    false,
  );
  assert(g.canMove(-13, 3, HOIST_DECK));
  assert.equal(g.canMove(-13, 3, HOIST_RISE - 1), false);
  assert.equal(supportAt(g, -13, 3, HOIST_DECK).height, HOIST_DECK);
  g.bellHoist.saved.bell = true;
  tick(g, 160);
  assert(g.canMove(-12, -17, upper));
  for (const x of [-8.7, 8.7]) assert(g.canMove(x, -14.8, upper));
  assert(
    g.lineOfSight(
      new THREE.Vector3(-12, upper, -15.9),
      new THREE.Vector3(-12, upper, -18.1),
    ),
  );
  for (const car of g.bellHoist.cars) {
    assert.equal(car.cable.parent, g.bellHoist.root);
    assert.equal(car.sheave.parent, g.bellHoist.root);
    assert.equal(car.source.y, g.bellHoist.y + 14.8);
  }
});
test("hoist save validation rejects impossible completions and belongs only to the mountain chapter", () => {
  assert.deepEqual(
    normalizeBellHoist({ stop: Infinity, bell: true, recovered: true }),
    { stop: 0, visited: false, clapper: false, bell: false, recovered: false },
  );
  const data = normalizeSave({
    version: 1,
    levels: {
      frost: { bellHoist: { stop: 2, clapper: true, bell: true } },
      verdant: { bellHoist: { stop: 1 } },
    },
  });
  assert.equal(data.levels.frost.bellHoist.stop, 2);
  assert.equal(data.levels.verdant.bellHoist, null);
  for (const level of LEVELS)
    assert.equal(!!createMap(level).bellHoist, level.id === "frost");
});
test("the new shelf joins the existing trail and keeps original objective foundations unchanged", () => {
  const level = LEVELS[2],
    map = createMap(level),
    old = structuredClone(map);
  delete old.bellHoist;
  for (let z = 48; z <= 56; z++)
    for (let x = 23; x <= 29; x++) old.grid[z][x] = 0;
  const profile = createTerrainProfile(map, level),
    baseline = createTerrainProfile(old, level);
  for (const f of [
    ...map.features,
    ...map.rooms,
    ...map.sideRooms,
    ...map.fieldSites,
  ]) {
    assert.equal(
      profile.height(f.x * 7, f.z * 7),
      baseline.height(f.x * 7, f.z * 7),
      `moved ${f.id || f.index}`,
    );
  }
  const seen = new Set(),
    queue = [map.spawn];
  for (let n = 0; n < queue.length; n++) {
    const { x, z } = queue[n],
      key = `${x},${z}`;
    if (seen.has(key) || !map.grid[z]?.[x]) continue;
    seen.add(key);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      queue.push({ x: x + dx, z: z + dz });
  }
  assert(seen.has("26,52"));
  const y = profile.height(182, 364);
  for (const dx of [-19, 0, 19])
    for (const dz of [-25, 0, 25])
      assert(Math.abs(profile.height(182 + dx, 364 + dz) - y) < 0.001);
});
