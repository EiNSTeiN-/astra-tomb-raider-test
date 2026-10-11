import test from "node:test";
import assert from "node:assert/strict";
import { NodeIO } from "@gltf-transform/core";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { animateExplorer } from "../src/explorer.js";
import { advanceCharacter } from "../src/character-motion.js";
import { inspectExplorerTerrain } from "../scripts/inspect-explorer-terrain-browser.js";
import { terrainTriangleReader } from "../scripts/inspect-desert-groundcover-browser.js";

async function actorAndTerrain() {
  const level = LEVELS[1],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    io = new NodeIO(),
    document = await io.read(
      new URL("../public/assets/characters/vesper.glb", import.meta.url)
        .pathname,
    );
  for (const texture of document.getRoot().listTextures()) texture.dispose();
  const bytes = await io.writeBinary(document),
    { scene, animations } = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    ),
    player = new THREE.Group(),
    avatar = new THREE.Group(),
    extent = (profile.width - 1) * profile.step,
    geometry = new THREE.PlaneGeometry(
      extent,
      extent,
      profile.width - 1,
      profile.width - 1,
    );
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(extent / 2, 0, extent / 2);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setY(i, profile.height(p.getX(i), p.getZ(i)));
  const terrain = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()),
    floor = terrainTriangleReader([terrain]),
    mixer = new THREE.AnimationMixer(scene),
    actions = {};
  for (const clip of animations) actions[clip.name] = mixer.clipAction(clip);
  actions.Idle.play();
  player.add(avatar);
  avatar.add(scene);
  const game = {
    player,
    avatar,
    level,
    map,
    terrainProfile: profile,
    terrainMeshes: [terrain],
    obstacles: [],
    grounded: true,
    elapsed: 0,
    actualMoveSpeed: 0,
    moveVelocity: { x: 0, z: 0 },
    canMove: () => true,
    audio: { tone() {} },
    rig: {
      model: scene,
      mixer,
      actions,
      state: "Idle",
      weapon: { group: new THREE.Group() },
    },
  };
  game.groundHeight = Adventure.prototype.groundHeight.bind(game);
  return {
    game,
    floor,
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      const resources = new Set();
      for (const root of [scene, terrain])
        root.traverse((mesh) => {
          if (mesh.geometry) resources.add(mesh.geometry);
          if (mesh.skeleton) resources.add(mesh.skeleton);
          for (const m of Array.isArray(mesh.material)
            ? mesh.material
            : mesh.material
              ? [mesh.material]
              : [])
            resources.add(m);
        });
      for (const resource of resources) resource.dispose();
    },
  };
}

test("all delivered clothing and boot vertices clear the five recorded desert crouching slopes", async () => {
  const s = await actorAndTerrain(),
    g = s.game;
  let samples = 0;
  try {
    for (const [x, z, yaw] of [
      [180, 240, 0],
      [187, 79, Math.PI],
      [380, 75, Math.PI / 2],
      [380, 75, Math.PI],
      [376, 44, Math.PI],
    ]) {
      g.rig.mixer.stopAllAction();
      g.rig.actions.Idle.reset().play();
      g.rig.grounding = undefined;
      g.rig.crouchBlend = 0;
      g.crouching = true;
      g.player.position.set(x, g.groundHeight(x, z), z);
      g.avatar.rotation.set(0, yaw, 0);
      g.avatar.position.set(0, 0, 0);
      for (let frame = 0; frame < 60; frame++)
        animateExplorer(g, 1 / 60, false, false);
      const report = inspectExplorerTerrain(g, s.floor);
      assert(report.samples > 48000);
      assert.equal(report.invalid, 0);
      assert.equal(report.missing, 0);
      assert.equal(report.embedded, 0, JSON.stringify(report.witnesses));
      samples += report.samples;
    }
    assert(samples > 240000);
  } finally {
    s.dispose();
  }
});

test("the recorded desert bank descent clears every delivered body vertex on every controller update", async () => {
  const s = await actorAndTerrain(),
    g = s.game;
  let samples = 0;
  try {
    g.player.position.set(373, g.groundHeight(373, 75), 75);
    g.avatar.rotation.set(0, 0, 0);
    for (let i = 0; i < 60; i++) animateExplorer(g, 1 / 60, false, false);
    g.moveVelocity = { x: 0, z: 6 };
    for (let frame = 0; frame < 120; frame++) {
      const before = g.player.position.clone();
      advanceCharacter(g, g.moveVelocity, 1 / 60);
      g.elapsed += 1 / 60;
      g.actualMoveSpeed =
        Math.hypot(
          g.player.position.x - before.x,
          g.player.position.z - before.z,
        ) /
        (1 / 60);
      animateExplorer(g, 1 / 60, true, false);
      const report = inspectExplorerTerrain(g, s.floor);
      assert(report.samples > 48000);
      assert.equal(report.invalid, 0);
      assert.equal(report.missing, 0);
      assert.equal(
        report.embedded,
        0,
        `Frame ${frame}: ${JSON.stringify(report.witnesses)}`,
      );
      assert(g.grounded);
      samples += report.samples;
    }
    assert(Math.abs(g.player.position.z - 87) < 1e-6);
    assert(samples > 5700000);
  } finally {
    s.dispose();
  }
});
