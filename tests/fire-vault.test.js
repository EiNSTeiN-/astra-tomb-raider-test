import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import {
  VAULT_CELLS,
  VAULT_FIRES,
  VAULT_START,
  vaultPorts,
  vaultReachable,
  normalizeFireVault,
  vaultDeckAt,
} from "../src/fire-vault-rules.js";
import {
  buildFireVault,
  updateFireVault,
  fireVaultInteract,
} from "../src/fire-vault.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { advanceCharacter } from "../src/character-motion.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { torchFireSource } from "../src/torch.js";
import {
  advanceCausewayWheel,
  wheelStance,
  beginCausewayWheel,
} from "../src/fire-vault-motion.js";

function fixture() {
  const world = new THREE.Group(),
    store = new SaveStore({
      getItem() {
        return null;
      },
      setItem() {},
    });
  const g = Object.assign(Object.create(Adventure.prototype), {
    world,
    store,
    level: LEVELS[0],
    map: { fireVault: { x: 0, z: 0 } },
    progress: store.level("verdant"),
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    obstacles: [],
    flames: [],
    items: [],
    stoneMat: new THREE.MeshStandardMaterial({ vertexColors: true }),
    cameraSurfaces: new CameraSurfaces(world),
    groundHeight: () => 0,
    walkable: () => true,
    grounded: true,
    health: 100,
    keys: new Set(),
    jumpY: 1.92,
    elapsed: 0,
    velocityY: 0,
    audio: { tone() {} },
    cb: { toast() {} },
    savedCount: 0,
    save() {
      this.savedCount++;
    },
  });
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  try {
    buildFireVault(g);
  } finally {
    globalThis.document = old;
  }
  g.cameraSurfaces.rebuild();
  g.player.position.set(-8, 1.92, -25);
  return g;
}
function settle(g) {
  for (let i = 0; i < 140; i++) {
    g.elapsed += 1 / 60;
    advanceCausewayWheel(g, 1 / 60, { x: 0, z: 0 });
    updateFireVault(g, 1 / 60);
  }
}
test("a handwheel saves at its detent, supports cancellation on both sides of it, and freezes while paused", () => {
  const g = fixture(),
    v = g.fireVault,
    c = v.controls[1];
  const tick = (count) => {
    for (let i = 0; i < count; i++) {
      g.elapsed += 1 / 60;
      advanceCausewayWheel(g, 1 / 60, { x: 0, z: 0 });
      updateFireVault(g, 1 / 60);
    }
  };
  g.player.position.copy(wheelStance(c));
  v.saved.visited = true;
  g.progress.torch = true;
  assert(beginCausewayWheel(g, c));
  assert.equal(g.progress.torch, false, "turning frees both hands");
  const saves = g.savedCount;
  tick(42);
  assert(v.operation.turn > 0 && v.operation.turn < 1);
  assert.equal(v.saved.turns[1], VAULT_START[1]);
  assert.equal(g.savedCount, saves);
  assert.equal(normalizeFireVault(v.saved).turns[1], VAULT_START[1]);
  assert.equal(
    beginCausewayWheel(g, c),
    false,
    "repeated E does not queue a turn",
  );
  const snapshot = [v.operation.time, v.rotors[1].angle, c.handle.rotation.z];
  g.paused = true;
  advanceCausewayWheel(g, 5, { x: 0, z: 0 });
  updateFireVault(g, 5);
  assert.deepEqual(
    [v.operation.time, v.rotors[1].angle, c.handle.rotation.z],
    snapshot,
  );
  assert.equal(v.rotors[1].source.activity, 0);
  g.paused = false;
  assert.equal(advanceCausewayWheel(g, 1 / 60, { x: 1, z: 0 }), false);
  assert.equal(v.operation, null);
  settle(g);
  assert.equal(v.saved.turns[1], VAULT_START[1]);
  assert.equal(v.rotors[1].angle, 0);
  assert(beginCausewayWheel(g, c));
  tick(75);
  assert(v.operation.committed);
  assert.equal(v.saved.turns[1], 1);
  assert.equal(g.savedCount, saves + 1);
  g.keys.add("Space");
  advanceCausewayWheel(g, 1 / 60, { x: 0, z: 0 });
  g.keys.clear();
  assert.equal(v.operation, null);
  settle(g);
  assert.equal(v.saved.turns[1], 1);
  assert.equal(v.rotors[1].angle, Math.PI / 2);
});

test("every wheel has a supported stance, rejects a path through its pedestal, and returns its grips for the next turn", () => {
  const g = fixture(),
    v = g.fireVault;
  for (const c of v.controls.filter((c) => c.kind === "turn")) {
    const target = wheelStance(c);
    assert(g.canMove(target.x, target.z, 1.92));
    assert.equal(g.canMove(c.position.x, c.position.z, 1.92), false);
    g.player.position.copy(c.position).add(new THREE.Vector3(0, 0, -0.4));
    assert.equal(beginCausewayWheel(g, c), false);
    g.player.position.copy(target).add(new THREE.Vector3(-0.15, 0, -0.1));
    const start = v.saved.turns[c.index];
    for (let turn = 0; turn < 4; turn++) {
      assert(beginCausewayWheel(g, c));
      settle(g);
      assert.equal(v.operation, null);
      assert(g.player.position.distanceTo(target) < 1e-7);
      assert.equal(v.saved.turns[c.index], (start + turn + 1) % 4);
      assert(Math.abs(c.handle.rotation.z - Math.PI / 4) < 0.002);
      assert.equal(v.rotors[c.index].source.activity, 0);
    }
  }
});

function walk(g, to, minimum = 1.9) {
  let reached = false;
  for (let i = 0; i < 1200; i++) {
    const dx = to[0] - g.player.position.x,
      dz = to[1] - g.player.position.z,
      d = Math.hypot(dx, dz);
    if (d < 0.06) {
      reached = true;
      break;
    }
    const speed = Math.min(4, d * 40);
    advanceCharacter(g, { x: (dx / d) * speed, z: (dz / d) * speed }, 1 / 60);
    assert(
      g.player.position.y >= minimum,
      "a connected crossing must keep the torch above the pool",
    );
  }
  assert(reached, `blocked reaching ${to} at ${g.player.position.toArray()}`);
}

test("the entrance steps join the landing without a blocked riser", () => {
  const g = fixture();
  g.player.position.set(-8, 0, -35);
  g.jumpY = 0;
  walk(g, [-8, -25], 0);
  assert.equal(g.player.position.y, 1.92);
  walk(g, [-8, -35], 0);
  assert(g.player.position.y < 0.2);
});

test("the causeway has a reachable dry route to all lamps and the archive, with unfinished turns preserved", () => {
  let best = null;
  for (let mask = 0; mask < 4096; mask++) {
    const turns = Array.from({ length: 6 }, (_, i) => (mask >> (i * 2)) & 3);
    if (vaultReachable(turns).size !== 6 || !vaultPorts(turns, 4).includes(2))
      continue;
    const clicks = turns.reduce(
      (n, t, i) => n + ((t - VAULT_START[i] + 4) % 4),
      0,
    );
    if (!best || clicks < best.clicks) best = { turns, clicks };
  }
  assert(
    best && best.clicks >= 5,
    "initial configuration should require several deliberate turns",
  );
  const invalid = normalizeFireVault({
    turns: { 0: 2 },
    lit: [1, "3", 5, 99, 1],
    recovered: true,
  });
  assert.deepEqual(invalid.turns, VAULT_START);
  assert.deepEqual(invalid.lit, [1, 5]);
  assert.equal(invalid.recovered, false);
  const save = normalizeSave({
    version: 1,
    levels: {
      verdant: { fireVault: { turns: best.turns, lit: [1], visited: true } },
      sands: { fireVault: { lit: VAULT_FIRES, recovered: true } },
    },
  });
  assert.deepEqual(save.levels.verdant.fireVault.turns, best.turns);
  assert.equal(save.levels.sands.fireVault, null);
  const map = createMap(LEVELS[0]);
  assert.deepEqual(map.spawn, { x: 8, z: 10 });
  assert.equal(map.features.find((f) => f.id === "field-0-1").x, 29);
  assert.equal(map.features.find((f) => f.id === "field-0-1").z, 17);
});

test("real handwheel interactions lower the matching crossings, freeze on pause, and provide a continuous walking route", () => {
  const g = fixture(),
    v = g.fireVault;
  const target = [3, 2, 1, 3, 0, 2];
  assert.equal(
    vaultDeckAt(g, 0, -16, 1.92),
    null,
    "the first cross-pool route begins raised",
  );
  for (let i = 0; i < 6; i++)
    while (v.saved.turns[i] !== target[i]) {
      g.player.position.copy(wheelStance(v.controls[i]));
      assert(fireVaultInteract(g));
      updateFireVault(g, 0.1);
      g.paused = true;
      const angle = v.rotors[i].angle;
      updateFireVault(g, 5);
      assert.equal(v.rotors[i].angle, angle);
      assert.equal(v.rotors[i].source.activity, 0);
      g.paused = false;
      settle(g);
    }
  g.player.position.set(-8, 1.92, -25);
  g.grounded = true;
  g.jumpY = 1.92;
  for (const point of [
    [-8, -16],
    [8, -16],
    [8, 0],
    [-8, 0],
    [-8, 16],
    [8, 16],
    [-8, 16],
    [-8, 26],
    [0, 26],
  ])
    walk(g, point);
  assert.equal(vaultDeckAt(g, 0, -16, 1.92)?.height, 1.92);
  assert.equal(
    vaultDeckAt(g, 0, -16, 0.9),
    null,
    "swimmers under a crossing are not pulled onto its deck",
  );
  assert(g.savedCount >= 5);
});

test("lamps require carried fire, restored lamps supply it, and the record stays behind its physical grille until all three burn", () => {
  const g = fixture(),
    v = g.fireVault;
  assert.equal(
    v.record.parent,
    v.root,
    "the record must remain independently hideable after static batching",
  );
  g.player.position.set(0, 1.92, 31.3);
  fireVaultInteract(g);
  assert.equal(v.saved.recovered, false);
  assert.equal(g.canMove(0, 29, 1.92), false);
  for (const index of VAULT_FIRES) {
    const f = v.fires.find((f) => f.id === index);
    g.player.position.copy(f.position).add(new THREE.Vector3(-0.75, 0, 0));
    g.progress.torch = false;
    assert(fireVaultInteract(g));
    assert(!v.saved.lit.includes(index));
    g.progress.torch = true;
    assert(fireVaultInteract(g));
    assert(v.saved.lit.includes(index));
    settle(g);
    assert.equal(torchFireSource(g)?.id, index);
  }
  assert(g.canMove(0, 29, 1.92));
  assert(
    v.gate.position.y + 3.7 < 1.92,
    "the open grille clears the threshold below its floor",
  );
  g.player.position.set(0, 1.92, 31.3);
  assert(fireVaultInteract(g));
  assert(v.saved.recovered);
  assert.equal(v.record.visible, false);
  const restored = normalizeFireVault(v.saved);
  assert(restored.recovered);
  assert.deepEqual(restored.lit, VAULT_FIRES);
});
