import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import {
  buildGuardian,
  updateGuardians,
  hitGuardian,
  startDodge,
} from "../src/combat.js";
import {
  canCrouch,
  toggleCrouch,
  updateCrouch,
  playerNoise,
  playerFootstep,
  guardianSight,
  stealthState,
} from "../src/stealth.js";
import { setAim } from "../src/aiming.js";
import { LEVELS, createMap } from "../src/campaign.js";

function fixture() {
  const game = Object.assign(Object.create(Adventure.prototype), {
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    world: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(),
    stoneMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    groundHeight: () => 0,
    canMove: () => true,
    walkable: () => true,
    obstacles: [],
    rng: () => 0.5,
    audio: { tone() {}, noiseHit() {} },
    cb: {},
    save() {},
    keys: new Set(),
    touchMove: { x: 0, z: 0 },
    yaw: 0,
    elapsed: 0,
    grounded: true,
    stamina: 100,
    health: 100,
    jumpY: 0,
    progress: { defeated: [] },
    enemies: [],
    projectiles: [],
  });
  const enemy = buildGuardian(game, { id: "guardian-0", x: 0, z: 0 });
  game.enemies.push(enemy);
  game.player.position.set(0, 0, 12);
  return { game, enemy };
}
function advance(game, seconds) {
  for (let t = 0; t < seconds - 0.001; t += 0.05) {
    game.elapsed += 0.05;
    updateGuardians(game, 0.05);
  }
}

test("facing and distance govern sight; a crouched head is concealed by low cover", () => {
  const { game, enemy } = fixture();
  assert(guardianSight(game, enemy) > 0);
  game.player.position.z = -8;
  assert.equal(guardianSight(game, enemy), 0);
  game.player.position.z = -1;
  assert(guardianSight(game, enemy) > 0, "touching a guardian is noticeable");
  game.player.position.z = 10;
  game.obstacles = [{ x: 0, z: 8, w: 3, d: 0.5, h: 1.5 }];
  assert(guardianSight(game, enemy) > 0, "standing head clears the wall");
  game.crouching = true;
  assert.equal(guardianSight(game, enemy), 0, "wall hides the lower head");
  game.obstacles = [];
  game.player.position.z = 24;
  assert.equal(guardianSight(game, enemy), 0);
  game.progress.torch = true;
  assert(
    guardianSight(game, enemy) > 0,
    "a lit torch exposes a distant crouch",
  );
});

test("crouching gives a longer visible reaction window without granting invisibility", () => {
  const standing = fixture(),
    crouched = fixture();
  crouched.game.crouching = true;
  advance(standing.game, 0.85);
  advance(crouched.game, 0.85);
  assert.equal(stealthState(standing.game).state, "detected");
  assert.equal(stealthState(crouched.game).state, "suspicious");
  assert(crouched.enemy.awareness < 0.8);
  advance(crouched.game, 2.5);
  assert.equal(stealthState(crouched.game).state, "detected");
});

test("quiet rear footsteps pass unnoticed; walking starts a bounded search of the sound origin", () => {
  const { game, enemy } = fixture();
  game.player.position.z = -8;
  game.crouching = true;
  const heardGains = [];
  game.audio.footstep = (...args) => heardGains.push(args[3]);
  playerFootstep(game, "stone", false, game.player.position);
  advance(game, 0.1);
  assert.equal(enemy.state, "idle");
  game.crouching = false;
  playerFootstep(game, "stone", false, game.player.position);
  advance(game, 0.1);
  assert.equal(enemy.state, "investigate");
  assert.deepEqual(heardGains, [0.3, 1]);
  assert.equal(
    enemy.lastSeen,
    -Infinity,
    "hearing does not claim visual contact",
  );
  const remembered = enemy.lastKnown.clone();
  game.player.position.set(50, 0, -40);
  advance(game, 3);
  assert(enemy.lastKnown.equals(remembered), "unseen player is not followed");
  assert(enemy.group.position.z < -1, "guardian investigates the rear sound");
  advance(game, 20);
  assert.equal(enemy.state, "idle");
  assert(enemy.group.position.distanceTo(enemy.home) < 0.8);
  assert.equal(game.health, 100);
  assert.equal(game.playerNoises.length, 0);
});

test("gunfire is heard through nearby cover with reduced range and never authorizes a blind strike", () => {
  const { game, enemy } = fixture();
  game.lineOfSight = () => false;
  playerNoise(game, 36, "shot");
  advance(game, 0.1);
  assert.equal(enemy.state, "investigate");
  assert.equal(enemy.lastKnown.z, 12);
  assert.equal(enemy.lastSeen, -Infinity);
  advance(game, 5);
  assert.equal(game.health, 100);
  assert(!["windup", "rush"].includes(enemy.state));
  const distant = fixture();
  distant.game.lineOfSight = () => false;
  distant.game.player.position.z = 20;
  playerNoise(distant.game, 36, "shot");
  advance(distant.game, 0.1);
  assert.equal(distant.enemy.state, "idle");
});

test("hearing is independent of audio output, ignores old sounds, and freezes on pause", () => {
  const { game, enemy } = fixture();
  game.player.position.z = -15;
  playerNoise(game, 20, "footstep");
  game.paused = true;
  const before = enemy.group.position.clone();
  updateGuardians(game, 1);
  assert.equal(enemy.state, "idle");
  assert(enemy.group.position.equals(before));
  game.paused = false;
  advance(game, 0.1);
  assert.equal(enemy.state, "investigate");
  const stale = fixture();
  stale.game.player.position.z = -15;
  playerNoise(stale.game, 20, "footstep");
  stale.game.elapsed = 2;
  advance(stale.game, 0.1);
  assert.equal(stale.enemy.state, "idle");
});

test("the suspicion arrow points toward the guardian and a direct hit alerts an unaware target", () => {
  const { game, enemy } = fixture();
  enemy.awareness = 0.5;
  enemy.state = "investigate";
  assert.equal(stealthState(game).bearing, 0);
  game.yaw = Math.PI / 2;
  assert.equal(stealthState(game).bearing, Math.PI / 2);
  enemy.state = "search";
  hitGuardian(game, enemy);
  assert.equal(stealthState(game).state, "detected");
  enemy.hp = 0;
  assert.equal(stealthState(game).active, false);
});

test("crouch transitions safely into aiming, jumping and dodging and rejects occupied hands", () => {
  const { game } = fixture();
  assert.equal(toggleCrouch(game), true);
  setAim(game, "toggle", true);
  assert.equal(game.crouching, false);
  setAim(game, "toggle", false);
  game.aimUntil = 0;
  assert.equal(toggleCrouch(game), true);
  game.keys.add("Space");
  updateCrouch(game);
  assert.equal(game.crouching, false);
  game.keys.clear();
  assert.equal(toggleCrouch(game), true);
  assert.equal(startDodge(game), true);
  assert.equal(game.crouching, false);
  game.dodge = null;
  for (const field of [
    "carrying",
    "blockGrip",
    "swimming",
    "climb",
    "ropeRide",
    "zipRide",
  ]) {
    game[field] = true;
    assert.equal(canCrouch(game), false, field);
    game[field] = false;
  }
});

test("all eight chapters place watchful guardians facing their preceding approach", () => {
  for (const level of LEVELS) {
    const map = createMap(level);
    for (const spawn of map.enemies) {
      assert(Number.isFinite(spawn.yaw));
      const { game } = fixture();
      const enemy = buildGuardian(game, spawn);
      assert.equal(enemy.homeYaw, spawn.yaw);
      assert.equal(enemy.group.rotation.y, spawn.yaw);
    }
  }
});
