import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { createCavernProfile } from "../src/cavern-profile.js";
import { Adventure } from "../src/game.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { advanceCharacter, supportAt } from "../src/character-motion.js";
import { finishFieldTask } from "../src/field-world.js";
import { buildCausewayStation } from "../src/echo-causeway-art.js";
import {
  buildEchoCauseway,
  updateEchoCauseway,
  soundCausewayRelay,
  causewayInteract,
  recoverCausewayFall,
} from "../src/echo-causeway.js";
import {
  CAUSEWAY_STONES,
  causewayStonePhase,
  causewayChannelDepth,
  causewayFoundationDistance,
  normalizeEchoCauseway,
  causewayAnchor,
  causewaySavePosition,
  restoreCausewayArrival,
  causewayBlocked,
  causewayOccludes,
} from "../src/echo-causeway-rules.js";
const level = LEVELS[6];
function fixture() {
  const map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    world = new THREE.Group();
  const store = new SaveStore({ getItem: () => null, setItem() {} }),
    progress = store.level("crystal");
  progress.stage = 3;
  const g = Object.assign(Object.create(Adventure.prototype), {
    map,
    level,
    terrainProfile,
    cavernProfile: createCavernProfile(map, terrainProfile),
    world,
    store,
    progress,
    groundHeight: (x, z) => terrainProfile.height(x, z),
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    cameraSurfaces: new CameraSurfaces(world),
    items: [],
    obstacles: [],
    traversalCourses: [],
    grounded: true,
    jumpY: 0,
    velocityY: 0,
    health: 100,
    elapsed: 0,
    keys: new Set(),
    explored: new Set(),
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    audio: { tone() {} },
    cb: { toast() {} },
    save() {
      this.saves = (this.saves || 0) + 1;
    },
    damage(n) {
      this.health -= n;
    },
  });
  const doc = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  try {
    for (const f of map.features.filter(
      (f) => f.causewayHeight !== undefined,
    )) {
      const group = new THREE.Group();
      group.position.set(f.x * 7, 0, f.z * 7);
      world.add(group);
      const item = { ...f, group };
      g.items.push(item);
      buildCausewayStation(g, item, group);
    }
    buildEchoCauseway(g);
  } finally {
    globalThis.document = doc;
  }
  g.cameraSurfaces.rebuild();
  return g;
}
function tick(g, n = 1, velocity = { x: 0, z: 0 }, jump = false) {
  for (let i = 0; i < n; i++) {
    updateEchoCauseway(g, 1 / 60);
    advanceCharacter(g, velocity, 1 / 60, jump && i === 0);
    recoverCausewayFall(g);
  }
}
function walk(g, x, z) {
  for (let i = 0; i < 600; i++) {
    const dx = x - g.player.position.x,
      dz = z - g.player.position.z,
      d = Math.hypot(dx, dz);
    if (d < 0.05 && g.grounded) return;
    const speed = Math.min(6, d * 60);
    tick(
      g,
      1,
      d ? { x: (dx / d) * speed, z: (dz / d) * speed } : { x: 0, z: 0 },
    );
  }
  assert.fail(`Cannot walk to ${x},${z}: ${g.player.position.toArray()}`);
}
function hop(g, x, z) {
  for (let i = 0; i < 90; i++) {
    tick(g, 1, { x: x * 6, z: z * 6 }, i === 0);
    if (i > 8 && g.grounded) return;
  }
  assert.fail(`No jump landing: ${g.player.position.toArray()}`);
}
const put = (g, x, z, height = 0) => {
  g.player.position.set(x, g.echoCauseway.base + height, z);
  g.jumpY = g.player.position.y - g.groundHeight(x, z);
  g.grounded = true;
  g.velocityY = 0;
};
test("echo waves raise four stones in order, warn before descent and remain held after the next relay", () => {
  for (let index = 0; index < 4; index++) {
    assert.equal(causewayStonePhase(null, index).amount, 0);
    assert.equal(causewayStonePhase(NaN, index).amount, 0);
    assert.equal(
      causewayStonePhase(0.6 + index * 0.9 + 0.5, index).phase,
      "rising",
    );
    assert(causewayStonePhase(0.6 + index * 0.9 + 1.1, index).amount > 0.999);
    assert(causewayStonePhase(0.6 + index * 0.9 + 5.9, index).warning > 0);
    assert.equal(causewayStonePhase(15, index).amount, 0);
    assert.equal(causewayStonePhase(null, index, true).amount, 1);
    let previous = 0;
    for (let t = -1; t < 15; t += 0.01) {
      const amount = causewayStonePhase(t, index).amount;
      assert(amount >= 0 && amount <= 1);
      assert(Math.abs(amount - previous) < 0.02);
      previous = amount;
    }
  }
  assert(causewayStonePhase(2, 0).amount > causewayStonePhase(2, 2).amount);
});
test("the southern stair and both timed crossings use real jumps before their return route is held", () => {
  const g = fixture(),
    h = g.echoCauseway;
  put(g, 217, 275);
  walk(g, 217, 260.8);
  assert(Math.abs(g.player.position.y - h.base - 4.2) < 1e-5);
  assert(finishFieldTask(g, g.items[0]));
  tick(g, 90);
  walk(g, 219.4, 259);
  hop(g, 1, 0);
  for (let i = 0; i < 4; i++) {
    const s = h.stones[i];
    assert.equal(
      supportAt(
        g,
        g.player.position.x,
        g.player.position.z,
        g.player.position.y,
      ).surface,
      s.deck,
    );
    walk(g, s.x + 1.1, 259);
    hop(g, 1, 0);
  }
  walk(g, 252, 260.5);
  assert.equal(g.health, 100);
  assert(finishFieldTask(g, g.items[1]));
  assert.equal(h.saved.anchor, 1);
  assert(h.stones.slice(0, 4).every((s) => s.phase.phase === "held"));
  tick(g, 78);
  walk(g, 252, 255.6);
  hop(g, 0, -1);
  for (let i = 4; i < 8; i++) {
    const s = h.stones[i];
    assert.equal(
      supportAt(
        g,
        g.player.position.x,
        g.player.position.z,
        g.player.position.y,
      ).surface,
      s.deck,
    );
    walk(g, 252, s.z - 1.1);
    hop(g, 0, -1);
  }
  walk(g, 252, 225.8);
  assert.equal(g.health, 100);
  assert(finishFieldTask(g, g.items[2]));
  assert.equal(h.saved.anchor, 2);
  assert(h.stones.every((s) => s.phase.phase === "held"));
  walk(g, 252, 227.4);
  hop(g, 0, 1);
  for (let i = 7; i >= 4; i--) {
    const s = h.stones[i];
    assert.equal(
      supportAt(
        g,
        g.player.position.x,
        g.player.position.z,
        g.player.position.y,
      ).surface,
      s.deck,
    );
    walk(g, 252, s.z + 1.1);
    hop(g, 0, 1);
  }
  walk(g, 248.6, 259);
  hop(g, -1, 0);
  for (let i = 3; i >= 0; i--) {
    const s = h.stones[i];
    assert.equal(
      supportAt(
        g,
        g.player.position.x,
        g.player.position.z,
        g.player.position.y,
      ).surface,
      s.deck,
    );
    walk(g, s.x - 1.1, 259);
    hop(g, -1, 0);
  }
  walk(g, 217, 261);
  walk(g, 217, 275);
  assert.equal(g.health, 100);
  assert(Math.abs(g.player.position.y - h.base) < 1e-5);
});
test("riders follow a rising stone, a jump detaches, and pause freezes the pulse and its emitters", () => {
  const g = fixture(),
    h = g.echoCauseway;
  g.progress.field = ["field-3-0"];
  soundCausewayRelay(g, 0);
  put(g, 225, 259, -2.2);
  const old = g.player.position.y;
  updateEchoCauseway(g, 0.9);
  assert(g.player.position.y > old);
  assert(Math.abs(g.player.position.y - h.stones[0].deck.y) < 1e-6);
  g.grounded = false;
  g.player.position.y += 1;
  const air = g.player.position.y;
  updateEchoCauseway(g, 0.1);
  assert.equal(g.player.position.y, air);
  g.paused = true;
  const before = h.stones.map((s) => s.deck.y),
    pulse = [...h.pulses];
  updateEchoCauseway(g, 1);
  assert.deepEqual(h.pulses, pulse);
  assert.deepEqual(
    h.stones.map((s) => s.deck.y),
    before,
  );
  assert(h.sources.every((s) => s.activity === 0));
  assert(!soundCausewayRelay(g, 0));
  assert(!causewayInteract(g));
});
test("securing a gallery recalls descended stones smoothly and keeps the sound above their inlays", () => {
  const g = fixture(),
    h = g.echoCauseway;
  const before = h.stones[0].deck.y;
  g.progress.field = ["field-3-0", "field-3-1"];
  updateEchoCauseway(g, 0);
  assert.equal(h.stones[0].deck.y, before);
  updateEchoCauseway(g, 0.5);
  assert(h.stones[0].deck.y > before);
  assert(h.stones[0].deck.y < h.base + 4.2);
  const middle = h.stones[0].deck.y;
  g.paused = true;
  updateEchoCauseway(g, 1);
  assert.equal(h.stones[0].deck.y, middle);
  g.paused = false;
  updateEchoCauseway(g, 0.5);
  assert.equal(h.stones[0].deck.y, h.base + 4.2);
  for (const s of h.stones) assert.equal(s.source.y, s.deck.y + 0.14);
});
test("missed stones return to the earned gallery, while saves never restore an expired moving support", () => {
  const g = fixture(),
    h = g.echoCauseway;
  g.progress.field = ["field-3-0", "field-3-1"];
  h.saved.anchor = 1;
  updateEchoCauseway(g, 0);
  put(g, 252, 244, 5.4);
  g.grounded = false;
  const anchor = causewayAnchor(g);
  assert.deepEqual(causewaySavePosition(g), anchor);
  g.player.position.y = h.base - 2;
  assert(recoverCausewayFall(g));
  assert.deepEqual(g.player.position.toArray(), [anchor.x, anchor.y, anchor.z]);
  assert.equal(g.health, 92);
  put(g, 252, 244, 0);
  restoreCausewayArrival(g);
  assert.deepEqual(g.player.position.toArray(), [anchor.x, anchor.y, anchor.z]);
  put(g, 252, 260.8, 4.2);
  assert.equal(causewaySavePosition(g), null);
  const valid = g.player.position.toArray();
  restoreCausewayArrival(g);
  assert.deepEqual(g.player.position.toArray(), valid);
  put(g, 217, 275);
  const ground = g.player.position.toArray();
  restoreCausewayArrival(g);
  assert.deepEqual(g.player.position.toArray(), ground);
  assert.deepEqual(
    normalizeEchoCauseway({ anchor: 99 }, { stage: 3, field: ["field-3-0"] }),
    { anchor: 0 },
  );
  assert.deepEqual(
    normalizeEchoCauseway({ anchor: 2 }, { stage: 3, field: ["field-3-1"] }),
    { anchor: 1 },
  );
  assert.deepEqual(normalizeEchoCauseway(null, { stage: 4, field: [] }), {
    anchor: 2,
  });
  const value = normalizeSave({
    version: 1,
    levels: {
      crystal: {
        stage: 3,
        field: g.progress.field,
        echoCauseway: { anchor: 1 },
        position: { x: anchor.x, z: anchor.z, height: 4.2 },
      },
    },
  });
  assert.deepEqual(value.levels.crystal.echoCauseway, { anchor: 1 });
  assert.equal(value.levels.crystal.position.height, 4.2);
});
test("relays require their actual galleries and the stone structure blocks bodies and rays below its decks", () => {
  const g = fixture(),
    h = g.echoCauseway;
  put(g, 217, 259);
  assert(!finishFieldTask(g, g.items[0]));
  put(g, 217, 260.8, 4.2);
  assert(finishFieldTask(g, g.items[0]));
  assert(!finishFieldTask(g, g.items[2]));
  assert(causewayBlocked(g, 252, 259, h.base + 3));
  assert(!causewayBlocked(g, 252, 259, h.base + 4.2));
  assert(
    causewayOccludes(
      g,
      { x: 252, y: h.base + 3, z: 259 },
      { x: 252, y: h.base + 5, z: 259 },
    ),
  );
  assert(
    !causewayOccludes(
      g,
      { x: 251, y: h.base + 6, z: 259 },
      { x: 253, y: h.base + 6, z: 259 },
    ),
  );
  assert.equal(
    g.map.features.filter((f) => f.causewayHeight !== undefined).length,
    3,
  );
  assert.equal(createMap(LEVELS[0]).echoCauseway, undefined);
});
test("the recessed chamber has headroom and preserves foundations for every other field station and discovery", () => {
  const map = createMap(level),
    p = createTerrainProfile(map, level),
    reference = createTerrainProfile({ ...map, echoCauseway: null }, level),
    roof = createCavernProfile(map, p);
  for (const f of map.features.filter((f) => f.causewayHeight === undefined))
    assert.equal(
      p.height(f.x * 7, f.z * 7),
      reference.height(f.x * 7, f.z * 7),
      f.id,
    );
  for (const s of CAUSEWAY_STONES) {
    assert(causewayChannelDepth(s.x, s.z) > 6);
    assert(roof.height(s.x, s.z) > p.causewayY + s.height + 4);
  }
  for (let z = 211; z <= 282; z += 1.2)
    for (let x = 207; x <= 269; x += 1.3) {
      assert(Number.isFinite(p.height(x, z)));
      // Bilinear height queries can include a modified vertex up to one
      // diagonal terrain cell beyond the four-metre blending boundary.
      if (causewayFoundationDistance(x, z) > 4 + p.step * Math.SQRT2)
        assert.equal(p.height(x, z), reference.height(x, z));
    }
});
