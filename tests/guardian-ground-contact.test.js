import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildGuardian } from "../src/combat.js";
import { animateGuardian } from "../src/guardian-art.js";
import { LEVELS } from "../src/campaign.js";

function fixture(kind, floor, yaw, distant = false) {
  const game = {
    world: new THREE.Group(),
    stoneMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    groundHeight: floor,
    rng: () => 0.5,
    player: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(),
    elapsed: 0,
    audio: { noiseHit() {} },
    store: { data: { settings: { quality: "high" } } },
    level: LEVELS[5],
  };
  const enemy = buildGuardian(game, { id: "sole", kind, x: 4 / 7, z: -3 / 7 });
  enemy.group.rotation.y = yaw;
  game.camera.position.copy(enemy.group.position).z += distant ? 60 : 10;
  animateGuardian(game, enemy, 0);
  return { game, enemy };
}

// Inspect delivered foot vertices after updating the same skin matrices used
// by rendering. Ankle targets alone cannot prove a rigid sole clears a slope.
function soles(enemy, floor) {
  enemy.group.updateWorldMatrix(true, false);
  enemy.group.updateMatrixWorld(true);
  enemy.art.skeleton.update();
  return enemy.art.legs.map((leg) => {
    const id = enemy.art.skeleton.bones.indexOf(leg[2]);
    let minimum = Infinity,
      count = 0;
    const point = new THREE.Vector3();
    for (const mesh of enemy.art.skins) {
      const { position, skinIndex } = mesh.geometry.attributes;
      for (let i = 0; i < position.count; i++) {
        if (skinIndex.getX(i) !== id) continue;
        mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
        assert(point.toArray().every(Number.isFinite));
        minimum = Math.min(minimum, point.y - floor(point.x, point.z));
        count++;
      }
    }
    assert(count > 100);
    return minimum;
  });
}

const kinds = ["warden", "hunter", "sentry", "bulwark"];
const floors = [
  () => 2,
  (x, z) => 2 + (x - 4) * 0.08 + (z + 3) * 0.06,
  (x, z) => 2 - (x - 4) * 0.22 + (z + 3) * 0.18,
  (x, z) => 2 + (x > 4.1 && z < -2.5 ? 0.18 : 0),
  (x, z) => 2 + (z > -2.68 ? 0.18 : 0),
];

test("both delivered guardian tiers plant their actual soles on slopes and paving edges", () => {
  for (const kind of kinds)
    for (const distant of [false, true])
      for (const yaw of [0, 1.1, -2.2])
        for (const [floorIndex, floor] of floors.entries()) {
          const { enemy } = fixture(kind, floor, yaw, distant);
          for (const gap of soles(enemy, floor)) {
            const label = `${kind} floor ${floorIndex} yaw ${yaw} distant ${distant}`;
            assert(gap >= -0.015, `${label} embedded sole ${gap}`);
            assert(gap <= 0.02, `${label} floating planted sole ${gap}`);
          }
        }
});

test("rendered soles clear sloping ground during turning steps and retain planted contact", () => {
  const floor = (x, z) => 2 + x * 0.08 + z * 0.06;
  for (const kind of kinds) {
    const { game, enemy } = fixture(kind, floor, 0);
    for (let frame = 0; frame < 120; frame++) {
      const angle = frame / 60,
        x = 4 + Math.sin(angle) * 3,
        z = -3 + (1 - Math.cos(angle)) * 3;
      enemy.group.position.set(x, floor(x, z), z);
      enemy.group.rotation.y = Math.PI / 2 - angle;
      enemy.state = "pursue";
      game.elapsed += 1 / 30;
      game.camera.position.copy(enemy.group.position).z += 10;
      animateGuardian(game, enemy, 1 / 30);
      if (frame % 3) continue;
      for (const [i, gap] of soles(enemy, floor).entries()) {
        assert(gap >= -0.015, `${kind} moving sole ${gap} at ${frame}`);
        if (enemy.art.step?.index !== i)
          assert(gap < 0.02, `${kind} planted foot hovered ${gap}`);
      }
    }
  }
});

test("a guardian returning from distance culling replants at its current patrol position", () => {
  const floor = (x, z) => 2 + x * 0.08 + z * 0.06;
  for (const kind of kinds) {
    const { game, enemy } = fixture(kind, floor, 0);
    game.camera.position.set(0, 0, 1000);
    for (let frame = 0; frame < 150; frame++) {
      enemy.group.position.z += 0.1;
      enemy.group.position.y = floor(
        enemy.group.position.x,
        enemy.group.position.z,
      );
      game.elapsed += 1 / 30;
      animateGuardian(game, enemy, 1 / 30);
    }
    assert.equal(enemy.body.visible, false);
    game.camera.position.copy(enemy.group.position).z += 10;
    animateGuardian(game, enemy, 0);
    assert.equal(enemy.body.visible, true);
    for (const gap of soles(enemy, floor)) {
      assert(gap >= -0.015, `${kind} reappeared inside the ground: ${gap}`);
      assert(gap < 0.02, `${kind} reappeared above the ground: ${gap}`);
    }
  }
});

test("a patrol can begin walking while its torso is still turning toward travel", () => {
  const floor = (x, z) => 2 + x * 0.08 + z * 0.06;
  for (const kind of kinds) {
    const { game, enemy } = fixture(kind, floor, 0);
    for (let frame = 0; frame < 120; frame++) {
      enemy.group.position.z -= 0.06;
      enemy.group.position.y = floor(
        enemy.group.position.x,
        enemy.group.position.z,
      );
      enemy.group.rotation.y = Math.min(Math.PI, (frame * 1.3) / 30);
      enemy.state = "patrol";
      game.elapsed += 1 / 30;
      game.camera.position.copy(enemy.group.position).z += 10;
      animateGuardian(game, enemy, 1 / 30);
      if (frame % 3) continue;
      for (const [i, gap] of soles(enemy, floor).entries()) {
        assert(gap >= -0.015, `${kind} turning sole ${gap} at ${frame}`);
        if (enemy.art.step?.index !== i)
          assert(gap < 0.02, `${kind} turning planted foot hovered ${gap}`);
      }
    }
  }
});
