import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { buildGuardian, hitGuardian } from "../src/combat.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { guardianRaycast, guardianRayParts } from "../src/guardian-ray.js";
import { animateGuardian } from "../src/guardian-art.js";
import {
  canAim,
  setAim,
  updateAim,
  clearAim,
  traceShot,
  sightline,
  aimedShot,
  addShotTrace,
  updateShotTraces,
} from "../src/aiming.js";

const v = (x, y, z) => new THREE.Vector3(x, y, z);
function fixture(kind = "warden") {
  const game = Object.assign(Object.create(Adventure.prototype), {
    world: new THREE.Group(),
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(58, 1.5, 0.1, 200),
    groundHeight: () => 0,
    canMove: () => true,
    walkable: () => true,
    stoneMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    obstacles: [],
    level: { biome: "jungle" },
    rng: () => 0.5,
    audio: { tone() {}, noiseHit() {} },
    cb: {},
    save() {},
    elapsed: 1,
    health: 100,
    grounded: true,
    yaw: 0,
    pitch: 0,
    progress: { defeated: [] },
    keys: new Set(),
    touchMove: { x: 0, z: 0 },
    enemies: [],
  });
  game.player.position.z = 15;
  game.camera.position.set(0, 2.3, 18);
  const enemy = buildGuardian(game, { id: "guardian-0", kind, x: 0, z: 0 });
  game.enemies.push(enemy);
  enemy.group.updateWorldMatrix(true, true);
  const core = enemy.core.getWorldPosition(new THREE.Vector3());
  game.camera.lookAt(core);
  return { game, enemy, core };
}

test("precision fire uses the posed guardian surface and misses beside or above it", () => {
  for (const kind of ["warden", "hunter", "sentry", "bulwark"]) {
    const { game, enemy, core } = fixture(kind);
    assert(sightline(game).target === enemy, kind);
    const shot = traceShot(game, v(0, core.y, 15), v(0, core.y, -2));
    assert(shot.target === enemy);
    assert(shot.point.z > -1 && shot.point.z < 2);
    assert.equal(
      traceShot(game, v(4, core.y, 15), v(4, core.y, -2)).target,
      null,
    );
    assert.equal(traceShot(game, v(0, 9, 15), v(0, 9, -2)).target, null);
    enemy.group.position.y = 8;
    assert.equal(
      traceShot(game, v(0, core.y, 15), v(0, core.y, -2)).target,
      null,
    );
    assert(
      traceShot(game, v(0, core.y + 8, 15), v(0, core.y + 8, -2)).target ===
        enemy,
    );
  }
});

test("nearer guardians intercept aimed shots and defeated or out-of-range guardians do not", () => {
  const { game, enemy, core } = fixture();
  const front = buildGuardian(game, {
    id: "guardian-1",
    kind: "warden",
    x: 0,
    z: 1,
  });
  game.enemies.push(front);
  assert(traceShot(game, v(0, core.y, 15), v(0, core.y, -40)).target === front);
  front.hp = 0;
  assert(traceShot(game, v(0, core.y, 15), v(0, core.y, -40)).target === enemy);
  enemy.group.position.z = -35;
  assert.equal(
    traceShot(game, v(0, core.y, 15), v(0, core.y, -40)).target,
    null,
  );
});

test("cover blocks precision fire, low walls permit higher shots, and moving gates reopen sightlines", () => {
  const { game, enemy, core } = fixture();
  game.obstacles = [{ x: 0, z: 7, w: 2, d: 0.05, h: 4 }];
  assert.equal(sightline(game).target, null);
  assert(sightline(game).cover);
  game.obstacles[0].h = 0.5;
  assert(sightline(game).target === enemy);
  game.obstacles = [];
  const surfaces = (game.cameraSurfaces = new CameraSurfaces(game.world)),
    door = new THREE.Group();
  door.userData.cameraDynamic = true;
  game.world.add(door);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(4, 5, 0.2),
    new THREE.MeshStandardMaterial(),
  );
  mesh.position.set(0, 2.5, 7);
  door.add(mesh);
  surfaces.capture(mesh);
  surfaces.rebuild();
  assert.equal(sightline(game).target, null);
  door.position.y = 8;
  assert(sightline(game).target === enemy);
  game.groundHeight = (x, z) => (z > 5 && z < 9 ? 4 : 0);
  assert.equal(sightline(game).target, null);
});

test("a clear camera cannot fire a blocked pistol or one protruding through cover", () => {
  const { game, enemy, core } = fixture();
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, core.y, 14.6);
  game.rig = { weapon: { muzzle } };
  game.camera.position.set(2.5, core.y, 16);
  game.camera.lookAt(core);
  game.obstacles = [{ x: 0, z: 13.5, w: 0.4, d: 0.1, h: 4 }];
  assert(sightline(game).target === enemy);
  assert.equal(aimedShot(game).target, null);
  assert(aimedShot(game).obstructed);
  game.obstacles[0].z = 14.8;
  assert(sightline(game).target === enemy);
  assert.equal(
    aimedShot(game).target,
    null,
    "body-to-muzzle segment catches a protruding barrel",
  );
});

test("precision input releases for traversal, carrying and pause, with independent mouse/toggle sources", () => {
  const { game } = fixture();
  assert(setAim(game, "mouse", true));
  assert(setAim(game, "toggle", true));
  assert(setAim(game, "mouse", false));
  assert.equal(setAim(game, "toggle", false), false);
  for (const key of [
    "paused",
    "swimming",
    "diving",
    "carrying",
    "blockGrip",
    "climb",
    "ropeRide",
    "zipRide",
    "dodge",
  ]) {
    setAim(game, "toggle", true);
    game[key] = true;
    updateAim(game);
    assert.equal(game.aiming, false, key);
    assert.equal(game.aimSources.size, 0);
    assert.equal(canAim(game), false);
    game[key] = false;
  }
  game.grounded = false;
  assert.equal(setAim(game, "mouse", true), false);
  game.grounded = true;
  setAim(game, "toggle", true);
  clearAim(game);
  assert.equal(game.aimUntil, 0);
});

test("native attack logic preserves shield windows and saved defeats in precision mode", () => {
  const { game, enemy, core } = fixture("bulwark");
  game.aiming = true;
  const initial = enemy.hp;
  game.attack();
  assert.equal(enemy.hp, initial);
  assert.equal(game.aimFeedback.kind, "shield");
  enemy.state = "recover";
  enemy.hp = 1;
  game.attackCooldown = 0;
  game.attack();
  assert.equal(enemy.hp, 0);
  assert.deepEqual(game.progress.defeated, [enemy.id]);
  assert.equal(game.aimFeedback.kind, "hit");
  const count = game.shotTraces.length;
  game.paused = true;
  game.attackCooldown = 0;
  game.attack();
  assert.equal(game.shotTraces.length, count);
});

test("shot effects fade in simulation time and release both GPU resources", () => {
  const { game } = fixture();
  addShotTrace(game, v(0, 2, 2), v(0, 2, 0), "hit");
  const trace = game.shotTraces[0];
  let disposed = 0;
  trace.line.geometry.addEventListener("dispose", () => disposed++);
  trace.line.material.addEventListener("dispose", () => disposed++);
  updateShotTraces(game, 0.05);
  assert(trace.line.material.opacity > 0);
  assert.equal(disposed, 0);
  updateShotTraces(game, 0.06);
  assert.equal(disposed, 2);
  assert.equal(game.shotTraces.length, 0);
});

test("shoulder camera narrows smoothly and its lateral shift stays on the player's side of a wall", () => {
  const { game } = fixture();
  game.sun = new THREE.DirectionalLight();
  setAim(game, "toggle", true);
  for (let i = 0; i < 90; i++) game.updateCamera(1 / 60);
  assert(Math.abs(game.camera.fov - 46) < 0.01);
  assert(Math.abs(game.camera.position.x - 0.7) < 0.01);
  game.camera.aspect = 390 / 844;
  game.camera.updateProjectionMatrix();
  for (let i = 0; i < 90; i++) game.updateCamera(1 / 60);
  assert(game.camera.position.x > 0.28 && game.camera.position.x < 0.31);
  const surfaces = (game.cameraSurfaces = new CameraSurfaces(game.world));
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 8, 14),
    new THREE.MeshStandardMaterial(),
  );
  wall.position.set(0.55, 4, 15);
  game.world.add(wall);
  surfaces.capture(wall);
  surfaces.rebuild();
  for (let i = 0; i < 10; i++) game.updateCamera(1 / 60);
  assert(
    game.camera.position.x < 0.2,
    "shoulder shift cannot start beyond the wall",
  );
  clearAim(game);
  for (let i = 0; i < 90; i++) game.updateCamera(1 / 60);
  assert(Math.abs(game.camera.fov - 58) < 0.01);
});

test("bone-part ray queries match the original posed triangles in both guardian detail tiers", () => {
  let checks = 0;
  for (const kind of ["warden", "hunter", "sentry", "bulwark"]) {
    const { game, enemy } = fixture(kind);
    enemy.group.position.set(5, 2, -4);
    for (const tier of [0, 1])
      for (const state of ["idle", "windup", "recover"]) {
        enemy.state = state;
        enemy.timer = 0.4;
        game.elapsed = 2;
        animateGuardian(game, enemy, 0);
        enemy.art.skins.forEach(
          (mesh, i) => (mesh.geometry = enemy.art.tiers[tier][i]),
        );
        enemy.group.rotation.y = 0.7;
        enemy.group.updateMatrixWorld(true);
        for (const x of [-0.7, 0, 0.7])
          for (const y of [1.2, 2.3, 3.3]) {
            const origin = enemy.group.position.clone().add(v(x, y, 12));
            const ray = new THREE.Raycaster(origin, v(0, 0, -1), 0, 30);
          for (const mesh of enemy.art.skins) {
            assert(guardianRayParts(mesh.geometry)?.length > 0);
              const expected = ray.intersectObject(mesh, false)[0];
              const actual = guardianRaycast(mesh, ray);
              assert.equal(
                !!actual,
                !!expected,
                `${kind}/${tier}/${state}/${x}/${y}`,
              );
              if (expected)
                assert(actual.point.distanceTo(expected.point) < 1e-5);
              checks++;
            }
          }
      }
  }
  assert.equal(checks, 648);
});
