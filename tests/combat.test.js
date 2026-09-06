import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import {
  buildGuardian,
  updateGuardians,
  hitGuardian,
  spawnBolt,
  updateProjectiles,
  startDodge,
  updateDodge,
  isEvading,
  navigateGuardian,
} from "../src/combat.js";
import { clearSegment } from "../src/navigation.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { ENEMY_TYPES } from "../src/encounters.js";
import { SaveStore } from "../src/storage.js";

function fixture(kind = "warden") {
  const game = Object.assign(Object.create(Adventure.prototype), {
    world: new THREE.Group(),
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(),
    stoneMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    groundHeight: () => 0,
    canMove: () => true,
    lineOfSight: () => true,
    rng: () => 0.5,
    audio: { tone() {}, noiseHit() {} },
    cb: {},
    save() {},
    elapsed: 0,
    health: 100,
    hitTimer: 0,
    stamina: 100,
    jumpY: 0,
    grounded: true,
    dodgeCooldown: 0,
    keys: new Set(),
    touchMove: { x: 0, z: 0 },
    yaw: 0,
    progress: { defeated: [] },
    enemies: [],
    projectiles: [],
  });
  game.player.position.set(0, 0, 2.8);
  const enemy = buildGuardian(game, {
    id: "guardian-0",
    kind,
    x: 0,
    z: 0,
    hp: ENEMY_TYPES[kind].hp,
  });
  game.enemies.push(enemy);
  return { game, enemy };
}
function advance(game, seconds) {
  for (let t = 0; t < seconds - 0.001; t += 0.05) {
    game.elapsed += 0.05;
    game.hitTimer = Math.max(0, game.hitTimer - 0.05);
    updateGuardians(game, 0.05);
  }
}

test("the score's danger cue follows an active encounter and releases after losing the player", () => {
  const { game, enemy } = fixture();
  let danger;
  Object.assign(game, {
    level: LEVELS[0],
    soundSources: [],
    waterMeshes: [],
    paused: false,
  });
  Object.assign(game.progress, { stage: 0, field: [] });
  game.audio.update = (position, yaw, context) => {
    danger = context.danger;
  };
  game.updateAudio();
  assert.equal(danger, false);
  enemy.state = "pursue";
  enemy.lastSeen = 0;
  game.updateAudio();
  assert.equal(danger, true);
  game.elapsed = 9;
  game.updateAudio();
  assert.equal(danger, false);
  enemy.lastSeen = 9;
  game.paused = true;
  game.updateAudio();
  assert.equal(danger, false);
});

test("a pursuing guardian travels around cover to the last seen position and eventually returns home", () => {
  const { game, enemy } = fixture();
  game.canMove = (x, z) => !(Math.abs(x) < 0.8 && Math.abs(z) < 2);
  game.lineOfSight = (a, b) => clearSegment(game.canMove, a, b);
  enemy.group.position.set(-3, 0, 0);
  enemy.home.copy(enemy.group.position);
  game.player.position.set(3, 0, 0);
  enemy.state = "pursue";
  enemy.lastSeen = 0;
  enemy.lastKnown.copy(game.player.position);
  advance(game, 4);
  assert.ok(enemy.group.position.x > 0, "guardian passed around the wall");
  assert.ok(game.lineOfSight(enemy.group.position, game.player.position));
  assert.ok(["windup", "recover"].includes(enemy.state));
  assert.ok(game.canMove(enemy.group.position.x, enemy.group.position.z));
  game.player.position.set(90, 0, 90);
  const remembered = enemy.lastKnown.clone();
  advance(game, 1);
  assert.ok(
    enemy.lastKnown.equals(remembered),
    "unseen movement is not tracked",
  );
  advance(game, 18);
  assert.equal(enemy.state, "idle");
  assert.ok(enemy.group.position.distanceTo(enemy.home) < 0.8);
});
test("a guardian replans when a gate closes across its existing route", () => {
  const { game, enemy } = fixture();
  enemy.group.position.set(-5, 0, 0);
  const target = { x: 5, z: 0 };
  navigateGuardian(game, enemy, target, 0.05);
  game.canMove = (x, z) => !(Math.abs(x) < 0.8 && Math.abs(z) < 3);
  for (let i = 0; i < 200; i++) {
    game.navPlansThisFrame = 0;
    navigateGuardian(game, enemy, target, 0.05);
  }
  assert.ok(enemy.group.position.x > 4.5);
  assert.ok(game.navigationStats.plans > 0);
});

test("guardians telegraph before striking and the locked direction can be evaded", () => {
  const { game, enemy } = fixture();
  advance(game, 1);
  assert.equal(enemy.state, "windup");
  assert.equal(game.health, 100);
  assert.equal(enemy.warning.visible, true);
  game.player.position.set(0, 0, -2.8);
  advance(game, 1);
  assert.equal(enemy.state, "recover");
  assert.equal(game.health, 100);
  assert.equal(enemy.warning.visible, false);
});
test("remaining in a warden's attack takes damage after the warning window", () => {
  const { game, enemy } = fixture();
  advance(game, 1);
  assert.equal(game.health, 100);
  advance(game, 1);
  assert.equal(game.health, 100 - enemy.spec.damage);
});
test("a shield blocks frontal fire and exposes a damage window after its strike", () => {
  const { game, enemy } = fixture("bulwark");
  const initial = enemy.hp;
  assert.equal(hitGuardian(game, enemy), false);
  assert.equal(enemy.hp, initial);
  enemy.state = "recover";
  assert.equal(hitGuardian(game, enemy), true);
  assert.equal(enemy.hp, initial - 1);
  enemy.state = "pursue";
  game.player.position.z = -3;
  assert.equal(hitGuardian(game, enemy), true);
  assert.equal(enemy.hp, initial - 2);
});
test("repeated shots cannot continually cancel an attack windup", () => {
  const { game, enemy } = fixture();
  enemy.state = "windup";
  enemy.timer = 0.6;
  enemy.warning.visible = true;
  hitGuardian(game, enemy);
  assert.equal(enemy.state, "windup");
  assert.equal(enemy.timer, 0.6);
});

test("shot tracers meet the shield when blocked and the visible core during recovery", () => {
  const { game, enemy } = fixture("bulwark");
  game.player.position.z = 5;
  for (const state of ["pursue", "recover"]) {
    enemy.state = state;
    game.attackCooldown = 0;
    const hp = enemy.hp;
    game.attack();
    const line = game.world.children.filter((o) => o.isLine).at(-1);
    const endpoint = new THREE.Vector3().fromBufferAttribute(
      line.geometry.attributes.position,
      1,
    );
    const expected = (
      state === "recover" ? enemy.core : enemy.shield
    ).getWorldPosition(new THREE.Vector3());
    assert.ok(endpoint.distanceTo(expected) < 1e-6);
    assert.equal(enemy.hp, hp - (state === "recover" ? 1 : 0));
  }
});
test("a sentry bolt sweeps against cover instead of tunneling through it", () => {
  const { game, enemy } = fixture("sentry");
  game.player.position.set(0, 0, 12);
  enemy.aim.copy(game.player.position);
  spawnBolt(game, enemy);
  game.canMove = (x, z) => z < 5 || z > 6;
  updateProjectiles(game, 1);
  assert.equal(game.health, 100);
  assert.equal(game.projectiles.length, 0);
});
test("a sentry bolt hits the player and retires when the route is unobstructed", () => {
  const { game, enemy } = fixture("sentry");
  game.player.position.set(0, 0, 12);
  enemy.aim.copy(game.player.position);
  spawnBolt(game, enemy);
  updateProjectiles(game, 1);
  assert.equal(game.health, 100 - enemy.spec.damage);
  assert.equal(game.projectiles.length, 0);
});
test("dodge costs stamina, has a bounded evasion window, and respects walls", () => {
  const { game } = fixture();
  game.keys.add("KeyD");
  assert.equal(startDodge(game), true);
  assert.equal(game.stamina, 72);
  assert.equal(isEvading(game), false);
  updateDodge(game, 0.1);
  assert.equal(isEvading(game), true);
  game.damage(20);
  assert.equal(game.health, 100);
  game.canMove = () => false;
  const position = game.player.position.clone();
  updateDodge(game, 0.2);
  assert.ok(game.player.position.equals(position));
  updateDodge(game, 0.35);
  assert.equal(game.dodge, null);
  assert.equal(isEvading(game), false);
  assert.equal(game.avatar.rotation.x, 0);
  assert.equal(startDodge(game), false);
});
test("dodge is unavailable with insufficient stamina, in the air, or while carrying", () => {
  const { game } = fixture();
  game.stamina = 27;
  assert.equal(startDodge(game), false);
  game.stamina = 100;
  game.grounded = false;
  assert.equal(startDodge(game), false);
  game.grounded = true;
  game.carrying = true;
  assert.equal(startDodge(game), false);
});

test("death during traversal clears the old motion and gives a brief checkpoint recovery window", () => {
  const { game } = fixture();
  game.health = 5;
  game.checkpoint = { x: 12, z: 9 };
  game.progress.medkits = 0;
  game.climb = { time: 0.2 };
  game.dodge = { time: 0.01 };
  game.avatar.position.y = -0.4;
  game.avatar.rotation.x = -0.5;
  game.grounded = false;
  game.damage(18);
  assert.equal(game.health, 100);
  assert.equal(game.climb, null);
  assert.equal(game.dodge, null);
  assert.equal(game.grounded, true);
  assert.deepEqual(game.player.position.toArray(), [12, 0, 9]);
  assert.equal(game.avatar.position.y, 0);
  assert.equal(game.avatar.rotation.x, 0);
  game.damage(18);
  assert.equal(game.health, 100);
});

test("play time records active wall time even when a slow frame limits the simulation step", () => {
  const { game } = fixture();
  let simulated = 0;
  Object.assign(game, {
    clock: { getDelta: () => 1.25 },
    active: true,
    scene: {},
    paused: false,
    lastSave: 0,
    updatePlayer: (dt) => (simulated = dt),
    updateEnemies() {},
    updateCamera() {},
    updateDecorations() {},
    updateAudio() {},
    renderScene() {},
  });
  game.progress.time = 0;
  game.frame();
  assert.equal(simulated, 0.05);
  assert.equal(game.progress.time, 1.25);
  assert.equal(game.lastSave, 1.25);
  game.paused = true;
  game.frame();
  assert.equal(game.progress.time, 1.25);
  assert.equal(game.lastSave, 1.25);
});
test("every chapter has varied two-guardian encounters and expanded defeat IDs survive saves", () => {
  const memory = new Map(),
    store = new SaveStore({
      getItem: (k) => memory.get(k) || null,
      setItem: (k, v) => memory.set(k, v),
    });
  const patterns = new Set();
  for (const level of LEVELS) {
    const map = createMap(level);
    assert.equal(map.enemies.length, (level.mechanisms - 1) * 2);
    assert.ok(new Set(map.enemies.map((e) => e.kind)).size >= 2);
    patterns.add(map.enemies.map((e) => e.kind).join(","));
    const ids = map.enemies.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
    store.level(level.id).defeated = ids;
  }
  assert.equal(patterns.size, 8);
  const imported = new SaveStore({ getItem: () => null, setItem() {} });
  imported.import(store.export());
  for (const level of LEVELS)
    assert.deepEqual(
      imported.level(level.id).defeated,
      store.level(level.id).defeated,
    );
});
