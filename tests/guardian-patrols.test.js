import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { buildGuardian, updateGuardians, hitGuardian } from "../src/combat.js";
import {
  prepareGuardianPatrols,
  guardianFooting,
} from "../src/guardian-patrols.js";
import { playerNoise, stealthState } from "../src/stealth.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { SaveStore } from "../src/storage.js";
import { clearSegment, findRoute } from "../src/navigation.js";

function fixture(kind = "warden") {
  const steps = [];
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
    audio: {
      tone() {},
      noiseHit: (gain, duration, frequency, position) => {
        if (frequency === 260) steps.push(position.clone());
      },
    },
    cb: {},
    save() {},
    elapsed: 0,
    health: 100,
    hitTimer: 0,
    stamina: 100,
    jumpY: 0,
    grounded: true,
    progress: { defeated: [], stage: 0, field: [] },
    enemies: [],
    projectiles: [],
    waterMeshes: [],
    level: LEVELS[0],
    soundSources: [],
    keys: new Set(),
    touchMove: { x: 0, z: 0 },
  });
  game.player.position.set(100, 0, 100);
  const enemy = buildGuardian(game, {
    id: "guardian-0",
    x: 0,
    z: 0,
    kind,
    patrolPlan: {
      pace: 0.52,
      initialWait: 0.6,
      stops: [
        { x: 0, z: 0, wait: 1, yaw: 0 },
        { x: 8, z: 0, wait: 1, yaw: -Math.PI / 2 },
        { x: 8, z: 6, wait: 1, yaw: Math.PI },
        { x: 0, z: 6, wait: 1, yaw: 0 },
      ],
    },
  });
  game.enemies.push(enemy);
  prepareGuardianPatrols(game);
  return { game, enemy, steps };
}
function advance(game, seconds, check = () => {}) {
  for (let t = 0; t < seconds - 0.001; t += 0.05) {
    game.elapsed += 0.05;
    game.hitTimer = Math.max(0, game.hitTimer - 0.05);
    updateGuardians(game, 0.05);
    check();
  }
}

test("guardians walk a repeatable circuit, pause to watch, turn smoothly and retain quiet exploration music", () => {
  const { game, enemy, steps } = fixture();
  game.player.position.set(0, 0, -10);
  game.lineOfSight = () => false;
  let idle = 0,
    moving = 0,
    maxTurn = 0,
    yaw = enemy.group.rotation.y;
  advance(game, 50, () => {
    const change = Math.atan2(
      Math.sin(enemy.group.rotation.y - yaw),
      Math.cos(enemy.group.rotation.y - yaw),
    );
    maxTurn = Math.max(maxTurn, Math.abs(change));
    yaw = enemy.group.rotation.y;
    if (enemy.state === "idle") idle++;
    if (enemy.state === "patrol") moving++;
    assert(
      guardianFooting(
        game,
        enemy,
        enemy.group.position.x,
        enemy.group.position.z,
      ),
    );
    assert.equal(enemy.awareness, 0);
  });
  assert(enemy.patrol.laps >= 2);
  assert.deepEqual(enemy.patrol.visited.slice(0, 4), [1, 2, 3, 0]);
  assert(idle > 50 && moving > 300);
  assert(maxTurn < 0.14);
  assert.equal(enemy.patrol.skipped, 0);
  assert(
    steps.length > 5,
    "actual planted feet make positional steps while patrolling",
  );
  const positions = steps;
  assert(positions.every((p) => p?.isVector3));
  assert(
    Math.max(...positions.map((p) => p.x)) -
      Math.min(...positions.map((p) => p.x)) >
      5,
  );
  game.player.position
    .copy(enemy.group.position)
    .add(new THREE.Vector3(0, 0, -6));
  assert.equal(stealthState(game).active, false);
  assert.equal(enemy.bar.visible, false);
  let danger;
  game.audio.update = (p, y, c) => (danger = c.danger);
  game.updateAudio();
  assert.equal(danger, false);
});

test("a patrol investigates a remembered sound, searches, returns to its post and resumes its circuit without following unseen movement", () => {
  const { game, enemy } = fixture();
  advance(game, 3);
  assert.equal(enemy.state, "patrol");
  game.lineOfSight = () => false;
  game.player.position
    .copy(enemy.group.position)
    .add(new THREE.Vector3(0, 0, -8));
  playerNoise(game, 36, "shot");
  advance(game, 0.1);
  assert.equal(enemy.state, "investigate");
  const heard = enemy.lastKnown.clone();
  assert.equal(enemy.lastSeen, -Infinity);
  game.player.position.set(100, 0, 100);
  advance(game, 3);
  assert(enemy.lastKnown.equals(heard));
  assert(enemy.group.position.distanceTo(heard) < 8);
  assert.equal(game.health, 100);
  advance(game, 55);
  assert(enemy.patrol.laps >= 1);
  assert(["idle", "patrol"].includes(enemy.state));
  assert.equal(enemy.patrol.skipped, 0);
  assert.equal(enemy.awareness, 0);
});

test("a patrol detects a visible approach and uses the existing telegraph before dealing damage", () => {
  const { game, enemy } = fixture();
  advance(game, 3);
  const yaw = enemy.group.rotation.y;
  game.player.position
    .copy(enemy.group.position)
    .add(new THREE.Vector3(Math.sin(yaw) * 2.8, 0, Math.cos(yaw) * 2.8));
  advance(game, 0.6);
  assert.equal(enemy.state, "windup");
  assert(enemy.warning.visible);
  assert.equal(game.health, 100);
  advance(game, 1.1);
  assert(game.health < 100);
  assert.equal(stealthState(game).state, "detected");
});

test("patrol navigation routes around new cover and refuses deep water, hot lava and abrupt terrain edges", () => {
  const { game, enemy } = fixture();
  const water = new THREE.Mesh();
  water.position.set(4, 0.8, 0);
  water.userData = { kind: "water", width: 2, length: 5 };
  game.waterMeshes.push(water);
  assert.equal(guardianFooting(game, enemy, 4, 0), false);
  let minWetDistance = Infinity;
  advance(game, 30, () => {
    const p = enemy.group.position;
    assert(guardianFooting(game, enemy, p.x, p.z));
    minWetDistance = Math.min(
      minWetDistance,
      Math.max(Math.abs(p.x - 4) - 1, Math.abs(p.z) - 2.5),
    );
  });
  assert(enemy.patrol.laps >= 1);
  assert(minWetDistance >= 0);
  water.userData.kind = "lava";
  assert.equal(guardianFooting(game, enemy, 4, 0), false);
  water.userData.cooled = true;
  assert.equal(guardianFooting(game, enemy, 4, 0), true);
  game.waterMeshes = [];
  game.groundHeight = (x, z) =>
    Math.abs(x - 4) < 0.5 && Math.abs(z) < 2.5 ? -6 : 0;
  assert.equal(guardianFooting(game, enemy, 3.6, 0), false);
  advance(game, 30, () => assert.equal(enemy.group.position.y, 0));
  game.groundHeight = () => 0;
  game.canMove = (x, z) => !(Math.abs(x - 4) < 0.6 && Math.abs(z) < 2.5);
  advance(game, 30, () =>
    assert(game.canMove(enemy.group.position.x, enemy.group.position.z)),
  );
  assert(enemy.patrol.laps >= 3);
});

test("pause and defeat freeze patrols, chapter preparation is deterministic, and transient routes never enter player saves", () => {
  const { game, enemy, steps } = fixture();
  advance(game, 3);
  const before = {
    position: enemy.group.position.clone(),
    yaw: enemy.group.rotation.y,
    patrol: structuredClone(enemy.patrol),
    steps: steps.length,
  };
  game.paused = true;
  advance(game, 3);
  assert(enemy.group.position.equals(before.position));
  assert.equal(enemy.group.rotation.y, before.yaw);
  assert.deepEqual(enemy.patrol, before.patrol);
  assert.equal(steps.length, before.steps);
  game.paused = false;
  enemy.state = "recover";
  while (enemy.hp > 0) hitGuardian(game, enemy);
  advance(game, 4);
  assert(enemy.group.position.equals(before.position));
  assert.deepEqual(game.progress.defeated, ["guardian-0"]);
  const store = new SaveStore(null),
    p = store.level(LEVELS[0]);
  p.defeated = ["guardian-0"];
  store.save();
  assert(!JSON.stringify(store.data).includes("patrol"));
  assert.deepEqual(p.defeated, ["guardian-0"]);
  const a = fixture(),
    b = fixture();
  assert.deepEqual(a.enemy.patrol, b.enemy.patrol);
});

test("all campaign encounters carry deterministic regional routes, opposing flanks, and unchanged save identifiers", () => {
  const shapes = new Set();
  let count = 0;
  for (const level of LEVELS) {
    const map = createMap(level),
      again = createMap(level);
    assert.deepEqual(map.enemies, again.enemies);
    const ids = new Set();
    for (const e of map.enemies) {
      count++;
      assert(!ids.has(e.id));
      ids.add(e.id);
      assert(/^guardian-[0-8](?:-1)?$/.test(e.id));
      assert(e.patrolPlan.stops.length >= 3);
      assert.equal(e.patrolPlan.stops[0].x, e.x * 7);
      assert.equal(e.patrolPlan.stops[0].z, e.z * 7);
      for (const p of e.patrolPlan.stops) {
        assert(Number.isFinite(p.x + p.z + p.yaw));
        assert(p.wait >= 2 && p.wait <= 5);
        assert(Math.hypot(p.x - e.x * 7, p.z - e.z * 7) < 24);
      }
    }
    const e = map.enemies[0];
    shapes.add(
      JSON.stringify(
        e.patrolPlan.stops.map((p) => [p.x - e.x * 7, p.z - e.z * 7]),
      ),
    );
  }
  assert.equal(shapes.size, 8);
  assert.equal(count, 122);
});

test("a post obstructed by completed architecture resolves before play with the full swept endpoint clearance", () => {
  const { game, enemy } = fixture();
  game.canMove = (x, z) => !(Math.abs(x) < 1.4 && Math.abs(z) < 1.4);
  prepareGuardianPatrols(game);
  const foot = (x, z) => guardianFooting(game, enemy, x, z);
  assert(
    enemy.home.length() > 2.8,
    "a nominally clear point 0.1 m outside the block cannot receive a swept route",
  );
  assert(enemy.group.position.equals(enemy.home));
  assert(clearSegment(foot, enemy.home, enemy.home));
  assert.equal(findRoute(foot, { x: 8, z: 6 }, enemy.home).status, "complete");
  const start = enemy.group.position.clone();
  advance(game, 30, () => {
    assert(enemy.group.position.distanceTo(start) < 12);
    assert(foot(enemy.group.position.x, enemy.group.position.z));
  });
  assert(enemy.patrol.laps > 0);
  assert.equal(enemy.patrol.skipped, 0);
});

test("pursuit and hunter charges retain dry footing instead of wading through a basin after leaving patrol", () => {
  for (const kind of ["warden", "hunter"]) {
    const { game, enemy } = fixture(kind);
    const water = new THREE.Mesh();
    water.position.set(4, 0.8, 0);
    water.userData = { kind: "water", width: 2, length: 5 };
    game.waterMeshes.push(water);
    enemy.state = "pursue";
    enemy.awareness = 1;
    enemy.group.rotation.y = Math.PI / 2;
    game.player.position.set(8, 0, 0);
    enemy.lastKnown.copy(game.player.position);
    advance(game, 8, () =>
      assert(
        guardianFooting(
          game,
          enemy,
          enemy.group.position.x,
          enemy.group.position.z,
        ),
      ),
    );
    assert(
      enemy.group.position.x > 5,
      "the guardian takes a dry route around the basin",
    );
  }
});
