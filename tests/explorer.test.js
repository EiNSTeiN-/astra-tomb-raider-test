import test from "node:test";
import { poseCounterweight } from "../src/counterweights.js";
import assert from "node:assert/strict";
import { NodeIO } from "@gltf-transform/core";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";
import { animateExplorer, explorerGait } from "../src/explorer.js";
import { resetTraversal } from "../src/traversal.js";

async function actor() {
  const io = new NodeIO(),
    document = await io.read(
      new URL("../public/assets/characters/vesper.glb", import.meta.url)
        .pathname,
    );
  // Geometry and animation tests do not require browser image decoding.
  for (const texture of document.getRoot().listTextures()) texture.dispose();
  const bytes = await io.writeBinary(document);
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
}
test("the delivered explorer has normalized skin weights, finite normals, a complete rig, and three locomotion clips", async () => {
  const { scene, animations } = await actor();
  assert.deepEqual(animations.map((a) => a.name).sort(), [
    "Idle",
    "Run",
    "Walk",
  ]);
  let triangles = 0,
    meshes = 0;
  scene.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    meshes++;
    const { position, normal, skinIndex, skinWeight } =
      mesh.geometry.attributes;
    triangles += mesh.geometry.index.count / 3;
    for (let i = 0; i < position.count; i++) {
      const n = new THREE.Vector3().fromBufferAttribute(normal, i);
      assert.ok(
        Number.isFinite(n.length()) && n.length() > 0.98 && n.length() < 1.02,
      );
      let sum = 0;
      for (let j = 0; j < 4; j++) {
        const w = skinWeight.getComponent(i, j),
          bone = skinIndex.getComponent(i, j);
        assert.ok(w >= 0 && w <= 1);
        assert.ok(bone < mesh.skeleton.bones.length);
        sum += w;
      }
      assert.ok(Math.abs(sum - 1) < 0.00001);
    }
  });
  assert.ok(meshes >= 7 && triangles < 50000);
  for (const side of ["Left", "Right"])
    for (const part of ["Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot"])
      assert.ok(scene.getObjectByName(`mixamorig${side}${part}`));
  assert.equal(scene.getObjectByName("helper-tights"), undefined);
});
test("retargeted walking, running and idle keep a shoe on the ground without root translation", async () => {
  const { scene, animations } = await actor(),
    mixer = new THREE.AnimationMixer(scene),
    shoe = scene.getObjectByName("shoes04"),
    hips = scene.getObjectByName("mixamorigHips");
  for (const clip of animations) {
    mixer.stopAllAction();
    const action = mixer.clipAction(clip).play();
    let first;
    for (let frame = 0; frame <= 20; frame++) {
      mixer.setTime((clip.duration * frame) / 20);
      scene.updateMatrixWorld(true);
      shoe.skeleton.update();
      let lowest = Infinity;
      for (let i = 0; i < shoe.geometry.attributes.position.count; i++) {
        const p = shoe
          .getVertexPosition(i, new THREE.Vector3())
          .applyMatrix4(shoe.matrixWorld);
        lowest = Math.min(lowest, p.y);
      }
      assert.ok(
        Math.abs(lowest) < 0.025,
        `${clip.name}: floating/sunken shoe at ${lowest}`,
      );
      const p = hips.getWorldPosition(new THREE.Vector3());
      first ??= p;
      assert.ok(
        Math.abs(p.x - first.x) < 0.00001 && Math.abs(p.z - first.z) < 0.00001,
      );
    }
    action.stop();
  }
});
test("human swim, rope and aim poses retain hand alignment and clear visual offsets on recovery", async () => {
  const { scene, animations } = await actor(),
    player = new THREE.Group(),
    avatar = new THREE.Group();
  player.add(avatar);
  avatar.add(scene);
  const mixer = new THREE.AnimationMixer(scene),
    actions = {};
  for (const clip of animations) actions[clip.name] = mixer.clipAction(clip);
  actions.Idle.play();
  const game = {
    player,
    avatar,
    rig: {
      model: scene,
      mixer,
      actions,
      state: "Idle",
      weapon: { group: new THREE.Group() },
    },
    grounded: true,
    elapsed: 3,
    yaw: 0,
  };
  const hand = (side) =>
    scene
      .getObjectByName(`mixamorig${side}Hand`)
      .getWorldPosition(new THREE.Vector3());
  for (const yaw of [0, Math.PI / 2, Math.PI]) {
    avatar.rotation.y = yaw;
    game.swimming = true;
    game.grounded = false;
    animateExplorer(game, 0.3, false, false);
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    assert.ok(
      avatar.position.dot(forward) < -0.64,
      "swimming body offset follows facing",
    );
    assert.ok(hand("Left").toArray().every(Number.isFinite));
  }
  game.swimming = false;
  game.ropeRide = {};
  avatar.rotation.y = 0;
  animateExplorer(game, 0.3, false, false);
  for (const [side, x] of [
    ["Left", 0.055],
    ["Right", -0.055],
  ])
    assert.ok(
      hand(side).distanceTo(new THREE.Vector3(x, 2.15, 0)) < 0.05,
      `${side} hand misses rope: ${hand(side).toArray()}`,
    );
  game.ropeRide = null;
  game.grounded = true;
  game.aimUntil = 10;
  game.aimYaw = 0;
  game.lastShot = 2;
  animateExplorer(game, 0.3, false, false);
  assert.equal(game.rig.weapon.group.visible, true);
  assert.ok(
    hand("Right").distanceTo(game.rig.weapon.group.position) < 0.04,
    "firing hand reaches the sidearm grip",
  );
  game.dodge = {};
  animateExplorer(game, 0.1, true, true);
  assert.equal(game.rig.weapon.group.visible, false);
  game.avatar.position.set(0.3, 0.2, 0.4);
  resetTraversal(game);
  assert.equal(game.avatar.position.length(), 0);
  assert.equal(game.aimUntil, 0);
});
test("locomotion selects a jog at travel speed, a faster sprint, and a quiet pose while swimming", () => {
  const g = { grounded: true, moveVelocity: { x: 6, z: 0 } };
  assert.deepEqual(explorerGait(g, true, false), { name: "Run", rate: 1 });
  assert.deepEqual(explorerGait(g, true, true), { name: "Run", rate: 1.5 });
  g.moveVelocity.x = 2.4;
  assert.deepEqual(explorerGait(g, true, false), { name: "Walk", rate: 1 });
  g.swimming = true;
  assert.deepEqual(explorerGait(g, true, true), { name: "Idle", rate: 1 });
});

test("both hands stay on a counterweight handle through push and pull cycles", async () => {
  const { scene, animations } = await actor(),
    player = new THREE.Group(),
    avatar = new THREE.Group();
  player.add(avatar);
  avatar.add(scene);
  const mixer = new THREE.AnimationMixer(scene),
    actions = {};
  for (const clip of animations) actions[clip.name] = mixer.clipAction(clip);
  actions.Idle.play();
  const game = {
    player,
    avatar,
    grounded: true,
    elapsed: 0,
    rig: {
      model: scene,
      mixer,
      actions,
      state: "Idle",
      weapon: { group: new THREE.Group() },
    },
  };
  for (const axis of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ])
    for (const pull of [false, true]) {
      const block = new THREE.Group();
      block.position.set(axis[0] * 1.1, 0, axis[1] * 1.1);
      game.blockGrip = { axis, block: { group: block }, move: { pull } };
      game.moveVelocity = { x: axis[0] * 1.8, z: axis[1] * 1.8 };
      for (let frame = 0; frame < 30; frame++) {
        animateExplorer(game, 1 / 30, true, false);
        poseCounterweight(game);
        for (const [side, sign] of [
          ["Left", 1],
          ["Right", -1],
        ]) {
          const target = block.position
            .clone()
            .add(
              new THREE.Vector3(
                -axis[0] * 0.61 + axis[1] * 0.3 * sign,
                1.1,
                -axis[1] * 0.61 - axis[0] * 0.3 * sign,
              ),
            );
          const hand = scene
            .getObjectByName("mixamorig" + side + "Hand")
            .getWorldPosition(new THREE.Vector3());
          assert.ok(
            hand.distanceTo(target) < 0.05,
            `${side} misses ${pull ? "pull" : "push"} handle by ${hand.distanceTo(target)} m`,
          );
        }
      }
    }
});
