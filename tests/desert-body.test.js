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
import { buildDesertForecourts } from "../src/desert-forecourts.js";
import {
  closedMeshReader,
  inspectExplorerSolids,
} from "../scripts/inspect-explorer-solids-browser.js";

async function actorAndTerrain(t, forecourts = false) {
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
  if (forecourts) {
    t.mock.method(
      THREE.TextureLoader.prototype,
      "load",
      () => new THREE.Texture(),
    );
    game.world = new THREE.Group();
    game.world.add(terrain);
    game.items = [];
    game.fieldGates = [];
    game.traversalCourses = [];
    game.jumpY = 0;
    game.velocityY = 0;
    game.health = 100;
    game.walkable = Adventure.prototype.walkable.bind(game);
    game.canMove = Adventure.prototype.canMove.bind(game);
    buildDesertForecourts(game);
  }
  return {
    game,
    floor,
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      const resources = new Set();
      for (const root of [scene, terrain, game.world].filter(Boolean))
        root.traverse((mesh) => {
          if (mesh.geometry) resources.add(mesh.geometry);
          if (mesh.skeleton) resources.add(mesh.skeleton);
          for (const m of Array.isArray(mesh.material)
            ? mesh.material
            : mesh.material
              ? [mesh.material]
              : []) {
            resources.add(m);
            for (const value of Object.values(m))
              if (value?.isTexture) resources.add(value);
          }
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

test("the four recorded forecourt knee contacts clear delivered masonry after normal movement presses against it", async (t) => {
  const s = await actorAndTerrain(t, true),
    g = s.game,
    read = closedMeshReader(
      g.desertForecourts.flatMap((c) =>
        c.root.children.filter(
          (m) => m.isMesh && m.material.name !== "Forecourt relief faces",
        ),
      ),
    );
  let samples = 0;
  try {
    for (const [room, side] of [
      [1, 1],
      [2, -1],
      [4, -1],
      [9, -1],
    ]) {
      const court = g.desertForecourts.find((c) => c.room === room),
        wall = court.walls.find(
          (w) => w.height < 1.3 && Math.max(w.w, w.d) > 2,
        ),
        alongZ = wall.w > wall.d;
      const start = [2.4, 1.8, 3]
        .map((distance) => ({
          x: wall.worldX + (alongZ ? 0 : side * distance),
          z: wall.worldZ + (alongZ ? side * distance : 0),
        }))
        .find((p) => g.canMove(p.x, p.z, 0));
      assert(start);
      const yaw = Math.atan2(start.x - wall.worldX, start.z - wall.worldZ);
      g.player.position.set(start.x, g.groundHeight(start.x, start.z), start.z);
      g.jumpY = g.velocityY = 0;
      g.grounded = true;
      g.crouching = false;
      g.rig.crouchBlend = 0;
      g.rig.grounding = undefined;
      g.rig.mixer.stopAllAction();
      g.rig.actions.Idle.reset().play();
      g.rig.state = "Idle";
      g.avatar.rotation.set(0, yaw + Math.PI, 0);
      for (let frame = 0; frame < 60; frame++)
        animateExplorer(g, 1 / 60, false, false);
      for (let frame = 0; frame < 90; frame++) {
        if (frame === 60) g.crouching = true;
        const before = g.player.position.clone(),
          velocity = { x: -Math.sin(yaw) * 6, z: -Math.cos(yaw) * 6 };
        advanceCharacter(g, velocity, 1 / 60);
        g.elapsed += 1 / 60;
        g.actualMoveSpeed =
          Math.hypot(
            g.player.position.x - before.x,
            g.player.position.z - before.z,
          ) * 60;
        animateExplorer(g, 1 / 60, g.actualMoveSpeed > 0.1, false);
        if (![74, 89].includes(frame)) continue;
        const r = inspectExplorerSolids(g, read);
        assert(r.samples > 48000);
        assert.equal(r.invalid, 0);
        assert.equal(r.embedded, 0, JSON.stringify(r.witnesses));
        samples += r.samples;
      }
    }
    assert(samples > 380000);
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

test("the two recorded empty cap-edge positions fall to soil without trapping or embedding the delivered body", async (t) => {
  const s = await actorAndTerrain(t, true),
    g = s.game,
    read = closedMeshReader(
      g.desertForecourts.flatMap((c) =>
        c.root.children.filter(
          (m) => m.isMesh && m.material.name !== "Forecourt relief faces",
        ),
      ),
    );
  try {
    for (const [x, y, z] of [
      [357.5, -0.08849723190069195, 245.2],
      [62.5, 5.455498982965946, 248.1],
    ]) {
      g.player.position.set(x, y, z);
      g.avatar.rotation.set(0, Math.PI, 0);
      g.rig.grounding = undefined;
      g.rig.crouchBlend = 0;
      g.crouching = false;
      g.grounded = true;
      g.velocityY = 0;
      g.coyote = g.jumpBuffer = 0;
      for (let frame = 0; frame < 120; frame++) {
        advanceCharacter(g, { x: 0, z: 0 }, 1 / 60);
        animateExplorer(g, 1 / 60, false, false);
        assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
        if (frame % 10 === 0 || frame === 119) {
          const body = inspectExplorerSolids(g, read);
          assert.equal(body.embedded, 0, JSON.stringify(body.witnesses));
          assert.equal(body.invalid, 0);
        }
      }
      assert(
        g.grounded && g.jumpY === 0,
        "the root cannot stand on an empty support margin",
      );
      const terrain = inspectExplorerTerrain(g, s.floor);
      assert.equal(terrain.embedded, 0, JSON.stringify(terrain.witnesses));
    }
  } finally {
    s.dispose();
  }
});
