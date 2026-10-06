import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Adventure } from "../src/game.js";
import { mantleEdge, mantlePoint } from "../src/mantle-motion.js";
import { strideSoles, sampleStrideSoles } from "../scripts/inspect-stride.js";

test("mantles lift outside the wall before crossing its roof, with exact endpoints and continuous velocity", () => {
  for (const rise of [0.3, 1.3, 2.485, 2.8, 3.085, 3.6]) {
    const start = new THREE.Vector3(0, 11, 4),
      end = new THREE.Vector3(0, 11 + rise, 1.5);
    assert.deepEqual(mantlePoint(start, end, -1).toArray(), start.toArray());
    assert.deepEqual(mantlePoint(start, end, 2).toArray(), end.toArray());
    for (let i = 0; i <= 1000; i++) {
      const p = mantlePoint(start, end, i / 1000);
      if (p.z <= 3)
        assert(p.y >= end.y, "feet clear the roof before entering stone");
      assert(p.z <= start.z && p.z >= end.z);
    }
    for (const join of [0, 0.5, 0.52, 1]) {
      const before = mantlePoint(start, end, join - 1e-6),
        at = mantlePoint(start, end, join),
        after = mantlePoint(start, end, join + 1e-6);
      assert(
        before.distanceTo(at) < 1e-5 && after.distanceTo(at) < 1e-5,
        "no position jump",
      );
      if (join > 0 && join < 1)
        assert(
          at.clone().sub(before).distanceTo(after.clone().sub(at)) < 1e-8,
          "no abrupt velocity change",
        );
    }
  }
});

test("hand targets meet the first physical roof boundary from all faces and a diagonal approach", () => {
  const platform = { x: 5, z: 8, w: 3, d: 1 },
    end = new THREE.Vector3(5, 7, 8);
  for (const [x, z, expectedX, expectedZ] of [
    [0, 8, 2, 8],
    [10, 8, 8, 8],
    [5, 5, 5, 7],
    [5, 11, 5, 9],
    [0, 3, 4, 7],
  ]) {
    const edge = mantleEdge(new THREE.Vector3(x, 4, z), end, platform);
    assert(Math.abs(edge.x - expectedX) < 1e-8);
    assert(Math.abs(edge.z - expectedZ) < 1e-8);
    assert.equal(edge.y, end.y + 0.045);
  }
});

test("the delivered explorer's animated soles clear cover, course, bell and wind roofs through the full native climb", async (t) => {
  const io = new NodeIO(),
    doc = await io.read(
      new URL("../public/assets/characters/vesper.glb", import.meta.url)
        .pathname,
    );
  for (const texture of doc.getRoot().listTextures()) texture.dispose();
  const bytes = await io.writeBinary(doc),
    { scene, animations } = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  const world = new THREE.Group(),
    player = new THREE.Group(),
    avatar = new THREE.Group(),
    mixer = new THREE.AnimationMixer(scene),
    actions = {};
  for (const clip of animations) actions[clip.name] = mixer.clipAction(clip);
  actions.Idle.play();
  world.add(player);
  player.add(avatar);
  avatar.add(scene);
  const game = Object.assign(Object.create(Adventure.prototype), {
      world,
      player,
      avatar,
      groundHeight: () => 0,
      walkable: () => true,
      audio: { tone() {} },
      obstacles: [],
      items: [],
      waterMeshes: [],
      skyBridges: [],
      rig: {
        model: scene,
        mixer,
        actions,
        state: "Idle",
        weapon: { group: new THREE.Group() },
      },
      moveVelocity: { x: 0, z: 0 },
      actualMoveSpeed: 0,
      jumpY: 0,
      yaw: 0,
      elapsed: 0,
    }),
    feet = strideSoles(scene);
  const cases = [
    { name: "court cover", w: 3.8, d: 1, h: 1.3, startY: 0 },
    { name: "course lower", w: 2.2, d: 2.2, h: 2.8, startY: 0 },
    { name: "course upper", w: 2.2, d: 2.2, h: 5.6, startY: 2.8 },
    { name: "course summit", w: 2.5, d: 2.5, h: 8.4, startY: 5.6 },
    { name: "bell platform", w: 3.8, d: 3, h: 3.1, startY: 0.315 },
    ...[2.8, 3.1, 3.4].map((h) => ({
      name: "wind terrace " + h,
      w: 3,
      d: 3,
      h,
      startY: 0.315,
    })),
  ];
  let frames = 0;
  for (const c of cases)
    for (let turn = 0; turn < 4; turn++) {
      const platform = { x: 0, z: 0, w: c.w, d: c.d, h: c.h, climbable: true };
      game.obstacles = [platform];
      game.climb = null;
      game.rig.grounding = undefined;
      game.yaw = (turn * Math.PI) / 2;
      const normal = new THREE.Vector3(
          Math.sin(game.yaw),
          0,
          Math.cos(game.yaw),
        ),
        half = turn % 2 ? c.w : c.d;
      player.position.copy(normal).multiplyScalar(half + 1);
      player.position.y = c.startY;
      game.grounded = true;
      game.jumpY = c.startY;
      assert(game.tryClimb(0, -1), c.name + " face " + turn);
      const accepted = game.climb.end.clone();
      for (let frame = 0; frame < 52; frame++) {
        if (game.climb) game.updateClimb(1 / 60);
        world.updateMatrixWorld(true);
        scene.traverse((o) => o.skeleton?.update());
        for (const p of sampleStrideSoles(feet).flat()) {
          const inRoof =
            Math.abs(p.x) < c.w - 0.01 && Math.abs(p.z) < c.d - 0.01;
          assert(
            !(inRoof && p.y > 0.05 && p.y < c.h - 0.015),
            c.name +
              " embedded boot on face " +
              turn +
              ", frame " +
              frame +
              ", depth " +
              (c.h - p.y),
          );
        }
        frames++;
      }
      assert.equal(game.climb, null);
      assert(game.grounded);
      assert.equal(game.velocityY, 0);
      assert(player.position.distanceTo(accepted) < 1e-8);
    }
  assert.equal(frames, 1664);
  t.after(() => {
    scene.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    mixer.stopAllAction();
  });
});
