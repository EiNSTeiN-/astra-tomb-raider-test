import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildGuardian, spawnBolt } from "../src/combat.js";
import { animateGuardian, GUARDIAN_PALETTES } from "../src/guardian-art.js";
import { ENEMY_TYPES } from "../src/encounters.js";
import { LEVELS } from "../src/campaign.js";

function fixture(kind = "warden", groundHeight = () => 0) {
  const game = {
    world: new THREE.Group(),
    stoneMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    groundHeight,
    rng: () => 0.5,
    player: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(),
    elapsed: 0,
    audio: { noiseHit() {} },
    store: { data: { settings: { quality: "high" } } },
    level: LEVELS[0],
  };
  game.camera.position.set(0, 4, 10);
  const enemy = buildGuardian(game, { id: "art-test", kind, x: 0, z: 0 });
  animateGuardian(game, enemy, 0);
  return { game, enemy };
}

test("guardian delivery has bounded geometry, rigid normalized skinning, shared joints, and substantial distant detail reduction", () => {
  const silhouettes = new Set();
  for (const kind of Object.keys(ENEMY_TYPES)) {
    const { enemy } = fixture(kind),
      rig = enemy.art;
    assert.equal(rig.skins.length, 3);
    assert.ok(rig.skins.every((m) => m.skeleton === rig.skeleton));
    const totals = rig.tiers.map((tier) =>
      tier.reduce((sum, g) => sum + g.attributes.position.count / 3, 0),
    );
    assert.ok(totals[0] < 24000 && totals[1] < totals[0] * 0.35);
    silhouettes.add(totals[0]);
    for (const tier of rig.tiers)
      for (const geometry of tier) {
        const { position, normal, color, skinIndex, skinWeight } =
          geometry.attributes;
        for (const attribute of [position, normal, color, skinWeight])
          assert.ok(attribute.array.every(Number.isFinite));
        for (let i = 0; i < position.count; i++) {
          assert.ok(skinIndex.getX(i) < rig.skeleton.bones.length);
          assert.equal(skinWeight.getX(i), 1);
          assert.equal(
            skinWeight.getY(i) + skinWeight.getZ(i) + skinWeight.getW(i),
            0,
          );
          assert.ok(
            geometry.boundingSphere.containsPoint(
              new THREE.Vector3().fromBufferAttribute(position, i),
            ),
          );
        }
      }
  }
  assert.equal(silhouettes.size, 4);
  assert.equal(
    new Set(Object.values(GUARDIAN_PALETTES).map((p) => p.join())).size,
    8,
  );
});

test("walking guardians alternate lifted feet while planted ankles stay on their terrain targets", () => {
  for (const kind of Object.keys(ENEMY_TYPES)) {
    const { game, enemy } = fixture(kind),
      rig = enemy.art;
    const lifted = new Set();
    let maxError = 0;
    for (let frame = 0; frame < 360; frame++) {
      game.elapsed += 1 / 60;
      enemy.state = "pursue";
      enemy.group.position.z += enemy.spec.speed / 60;
      game.camera.position.z = enemy.group.position.z + 10;
      animateGuardian(game, enemy, 1 / 60);
      for (let i = 0; i < 2; i++) {
        const actual = rig.legs[i][2].getWorldPosition(new THREE.Vector3());
        maxError = Math.max(maxError, actual.distanceTo(rig.feet[i]));
        if (rig.step?.index === i && actual.y > 0.17 * rig.scale + 0.05)
          lifted.add(i);
        else if (rig.step?.index !== i)
          assert.ok(
            Math.abs(actual.y - 0.17 * rig.scale) < 0.045,
            `${kind} planted foot height ${actual.y}`,
          );
      }
    }
    assert.equal(lifted.size, 2, `${kind} alternates feet`);
    assert.ok(maxError < 0.045, `${kind} maximum ankle error ${maxError}`);
  }
});

test("attack and recovery poses keep their feet anchored and all skinned surfaces finite within their render bounds", () => {
  for (const kind of Object.keys(ENEMY_TYPES)) {
    const { game, enemy } = fixture(kind),
      rig = enemy.art;
    const feet = rig.feet.map((p) => p.clone());
    for (const state of ["windup", "recover", "stagger", "rush"]) {
      enemy.state = state;
      for (const fraction of [0, 0.5, 0.95]) {
        enemy.timer =
          (state === "windup" ? enemy.spec.windup : enemy.spec.recovery) *
          (1 - fraction);
        game.elapsed += 1 / 60;
        animateGuardian(game, enemy, 1 / 60);
        rig.skeleton.update();
        for (let i = 0; i < 2; i++)
          assert.ok(
            rig.legs[i][2]
              .getWorldPosition(new THREE.Vector3())
              .distanceTo(feet[i]) < 0.015,
          );
        for (const mesh of rig.skins) {
          const positions = mesh.geometry.attributes.position;
          for (let i = 0; i < positions.count; i += 17) {
            const p = mesh.applyBoneTransform(
              i,
              new THREE.Vector3().fromBufferAttribute(positions, i),
            );
            assert.ok(p.toArray().every(Number.isFinite));
            assert.ok(
              mesh.boundingSphere.containsPoint(p),
              `${kind} ${state} pose fits culling bounds`,
            );
          }
        }
      }
    }
  }
});

test("a sentry bolt starts at the visible staff lens after posing and turning", () => {
  const { game, enemy } = fixture("sentry");
  enemy.group.position.set(4, 0, 6);
  enemy.group.rotation.y = 1.1;
  enemy.state = "windup";
  enemy.timer = enemy.spec.windup * 0.1;
  enemy.aim.set(8, 0, 14);
  animateGuardian(game, enemy, 0.05);
  const origin = enemy.art.muzzle.getWorldPosition(new THREE.Vector3());
  spawnBolt(game, enemy);
  assert.ok(game.projectiles[0].mesh.position.distanceTo(origin) < 1e-8);
  assert.ok(game.projectiles[0].direction.toArray().every(Number.isFinite));
});

test("turning steps follow sloping ground and emit bounded positional footfalls", () => {
  for (const kind of Object.keys(ENEMY_TYPES)) {
    const { game, enemy } = fixture(kind, (x, z) => x * 0.08 + z * 0.06);
    const sounds = [];
    game.audio.noiseHit = (gain, length, frequency, position) =>
      sounds.push({ time: game.elapsed, position: position.clone() });
    for (let frame = 0; frame < 160; frame++) {
      const angle = (frame * 0.05 * enemy.spec.speed) / 6;
      enemy.group.position.set(
        6 * Math.sin(angle),
        0,
        6 * (1 - Math.cos(angle)),
      );
      enemy.group.position.y = game.groundHeight(
        enemy.group.position.x,
        enemy.group.position.z,
      );
      enemy.group.rotation.y = Math.PI / 2 - angle;
      game.camera.position
        .copy(enemy.group.position)
        .add(new THREE.Vector3(0, 4, 10));
      game.elapsed += 0.05;
      animateGuardian(game, enemy, 0.05);
      for (let i = 0; i < 2; i++) {
        const actual = enemy.art.legs[i][2].getWorldPosition(
          new THREE.Vector3(),
        );
        assert.ok(
          actual.distanceTo(enemy.art.feet[i]) < 0.07,
          `${kind} sloping foot contact`,
        );
      }
    }
    assert.ok(sounds.length > 5);
    sounds.forEach((sound, i) => {
      assert.ok(sound.position.toArray().every(Number.isFinite));
      assert.ok(
        Math.abs(
          sound.position.y -
            game.groundHeight(sound.position.x, sound.position.z) -
            0.17 * enemy.art.scale,
        ) < 1e-6,
      );
      if (i) assert.ok(sound.time - sounds[i - 1].time >= 0.12);
    });
  }
});

test("guardian detail switches have hysteresis and keep the same skeleton and materials", () => {
  const { game, enemy } = fixture();
  const rig = enemy.art;
  const materials = rig.skins.map((m) => m.material);
  const sample = (z) => {
    game.camera.position.set(0, 0, z);
    animateGuardian(game, enemy, 0);
    return rig.tier;
  };
  assert.equal(sample(48), 1);
  assert.equal(sample(40), 1);
  assert.equal(sample(36), 0);
  assert.equal(sample(44), 0);
  sample(130);
  assert.equal(enemy.body.visible, false);
  sample(10);
  assert.equal(enemy.body.visible, true);
  assert.ok(
    rig.skins.every(
      (m, i) => m.material === materials[i] && m.skeleton === rig.skeleton,
    ),
  );
});
