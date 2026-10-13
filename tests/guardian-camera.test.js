import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildGuardian } from "../src/combat.js";
import { animateGuardian } from "../src/guardian-art.js";
import {
  guardianCameraBounds,
  guardianCameraSurfaces,
} from "../src/guardian-camera.js";
import { CameraSurfaces, constrainCamera } from "../src/camera-collision.js";
import { followClearCamera } from "../src/camera-follow.js";
import { LEVELS } from "../src/campaign.js";

function fixture(t, kind = "warden") {
  const world = new THREE.Group(),
    camera = new THREE.PerspectiveCamera(58, 1.6, 0.1, 100);
  const game = {
    world,
    camera,
    stoneMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    groundHeight: () => 0,
    rng: () => 0.5,
    player: new THREE.Group(),
    elapsed: 0,
    audio: { noiseHit() {} },
    level: LEVELS[0],
    store: { data: { settings: { quality: "high" } } },
    cameraSurfaces: new CameraSurfaces(world),
    yaw: 0,
    pitch: 0.13,
    grounded: true,
  };
  camera.position.set(0, 3, 5);
  const enemy = buildGuardian(game, {
    id: "camera-guardian",
    kind,
    x: 0,
    z: 0.5,
  });
  game.enemies = [enemy];
  game.cameraSurfaces.rebuild();
  animateGuardian(game, enemy, 0);
  t.after(() => {
    const materials = new Set([game.stoneMat, game.goldMat]);
    world.traverse((o) => {
      for (const m of [o.material].flat()) if (m) materials.add(m);
    });
    for (const m of materials) m.dispose();
  });
  return { game, enemy };
}

test("camera bounds enclose delivered rigid guardian vertices in both tiers and moving attack poses", (t) => {
  let vertices = 0,
    poses = 0;
  for (const kind of ["warden", "hunter", "bulwark", "sentry"]) {
    const { game, enemy } = fixture(t, kind),
      rig = enemy.art;
    enemy.group.position.set(3, 1.25, 4);
    enemy.group.rotation.y = 0.8;
    for (const state of ["idle", "windup", "recover", "rush"]) {
      enemy.state = state;
      enemy.timer =
        (state === "windup" ? enemy.spec.windup : enemy.spec.recovery) * 0.35;
      animateGuardian(game, enemy, 1 / 60);
      game.world.updateMatrixWorld(true);
      rig.skeleton.update();
      const byBone = new Map(
        guardianCameraBounds(rig).map(({ bone, box }) => [bone, box]),
      );
      for (const [tier, geometries] of rig.tiers.entries())
        for (const [i, geometry] of geometries.entries()) {
          const mesh = rig.skins[i],
            saved = mesh.geometry;
          mesh.geometry = geometry;
          try {
            for (
              let vertex = 0;
              vertex < geometry.attributes.position.count;
              vertex++
            ) {
              const point = mesh
                .getVertexPosition(vertex, new THREE.Vector3())
                .applyMatrix4(mesh.matrixWorld);
              const bone =
                rig.skeleton.bones[geometry.attributes.skinIndex.getX(vertex)];
              const local = point.applyMatrix4(
                new THREE.Matrix4().copy(bone.matrixWorld).invert(),
              );
              assert(
                byBone
                  .get(bone)
                  .clone()
                  .expandByScalar(1e-5)
                  .containsPoint(local),
                `${kind}/${state}/${tier}/${i}/${vertex}`,
              );
              vertices++;
            }
          } finally {
            mesh.geometry = saved;
          }
        }
      poses++;
    }
  }
  t.diagnostic(
    `${poses} posed guardians; ${vertices} delivered high/low vertex records`,
  );
});

test("a guardian obstructs the camera arm while ordinary world rays and openings stay unchanged", (t) => {
  const { game, enemy } = fixture(t),
    start = new THREE.Vector3(0, 2, 0),
    end = new THREE.Vector3(0, 2, 5.3);
  assert.equal(game.cameraSurfaces.entry(start, end), 1);
  const view = guardianCameraSurfaces(game);
  view.withSnapshot(() => {
    const stop = view.entry(start, end);
    assert(stop > 0 && stop < 1);
    const chest = guardianCameraBounds(enemy.art).find(
      ({ bone }) => bone.name === "chest",
    );
    const inside = chest.box
      .getCenter(new THREE.Vector3())
      .applyMatrix4(chest.bone.matrixWorld);
    assert.equal(
      view.entry(inside, inside),
      0,
      "a close target cannot leave the lens inside armor",
    );
    const safe = constrainCamera(start, end, view, () => true);
    assert(
      safe.distanceTo(start) > 0 &&
        safe.distanceTo(start) < end.distanceTo(start),
    );
    assert.equal(
      view.entry(new THREE.Vector3(1.8, 2, 0), new THREE.Vector3(1.8, 2, 5.3)),
      1,
      "open side beside the guardian",
    );
  });
  assert.equal(
    game.cameraSurfaces.entry(start, end),
    1,
    "actor camera proxies changed a sight/sound surface query",
  );
  enemy.group.position.x = 4;
  view.withSnapshot(() =>
    assert.equal(view.entry(start, end), 1, "moved actor keeps stale bounds"),
  );
  enemy.group.position.x = 0;
  enemy.group.visible = false;
  view.withSnapshot(() =>
    assert.equal(view.entry(start, end), 1, "hidden actor blocks the camera"),
  );
});

test("ordinary camera recovery avoids a guardian without changing chosen look or hiding its body", (t) => {
  const { game, enemy } = fixture(t),
    target = new THREE.Vector3(0, 1.3, 0),
    desired = new THREE.Vector3(0, 2.187, 5.255);
  game.camera.position.copy(desired);
  const original = { yaw: game.yaw, pitch: game.pitch };
  for (let frame = 0; frame < 30; frame++) {
    game.camera.position.copy(
      followClearCamera(game, target, desired, 1 / 60, () => true),
    );
    game.cameraFollowTarget = target.clone();
  }
  const view = guardianCameraSurfaces(game);
  view.withSnapshot(() =>
    assert.equal(view.entry(target, game.camera.position), 1),
  );
  assert(game.camera.position.distanceTo(target) >= 2.2);
  assert.deepEqual({ yaw: game.yaw, pitch: game.pitch }, original);
  assert(enemy.group.visible && enemy.art.model.visible);
});

test("guardian snapshots update transforms once per solve and release after an exception", (t) => {
  const { game, enemy } = fixture(t),
    view = guardianCameraSurfaces(game),
    start = new THREE.Vector3(0, 2, 0),
    end = new THREE.Vector3(0, 2, 5.3);
  const update = enemy.art.model.updateWorldMatrix;
  let updates = 0;
  t.mock.method(enemy.art.model, "updateWorldMatrix", function (...args) {
    updates++;
    return update.apply(this, args);
  });
  view.withSnapshot(() => {
    const expected = view.entry(start, end);
    for (let i = 0; i < 100; i++)
      assert.equal(view.entry(start, end), expected);
  });
  assert.equal(updates, 1);
  assert.throws(
    () =>
      view.withSnapshot(() => {
        throw Error("failed solve");
      }),
    /failed solve/,
  );
  enemy.group.position.x = 4;
  assert.equal(view.entry(start, end), 1);
});
