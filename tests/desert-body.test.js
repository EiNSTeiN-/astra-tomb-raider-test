import test from "node:test";
import assert from "node:assert/strict";
import { NodeIO } from "@gltf-transform/core";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { animateExplorer } from "../src/explorer.js";
import { advanceCharacter, safeArrival } from "../src/character-motion.js";
import { inspectExplorerTerrain } from "../scripts/inspect-explorer-terrain-browser.js";
import { terrainTriangleReader } from "../scripts/inspect-desert-groundcover-browser.js";
import { buildDesertForecourts } from "../src/desert-forecourts.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { followClearCamera } from "../src/camera-follow.js";
import { inspectExplorerCamera } from "../scripts/inspect-explorer-camera-browser.js";
import { CROUCH_DROP } from "../src/stealth.js";
import {
  closedMeshReader,
  inspectExplorerSolids,
} from "../scripts/inspect-explorer-solids-browser.js";

async function actorAndTerrain(
  t,
  forecourts = false,
  camera = false,
  chapter = 1,
) {
  const level = LEVELS[chapter],
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
    if (camera) game.cameraSurfaces = new CameraSurfaces(game.world);
    game.items = [];
    game.fieldGates = [];
    game.traversalCourses = [];
    game.jumpY = 0;
    game.velocityY = 0;
    game.health = 100;
    game.walkable = Adventure.prototype.walkable.bind(game);
    game.canMove = Adventure.prototype.canMove.bind(game);
    buildDesertForecourts(game);
    game.cameraSurfaces?.rebuild();
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

test("the delivered explorer stays on six crystal triangle slopes without crouched knees entering the floor", async () => {
  const s = await actorAndTerrain(undefined, false, false, 6),
    g = s.game;
  const pose = (x, z, crouch, heading = Math.PI) => {
    g.rig.mixer.stopAllAction();
    g.rig.actions.Idle.reset().play();
    g.rig.state = "Idle";
    g.rig.grounding = undefined;
    g.rig.crouchBlend = 0;
    g.crouching = crouch;
    g.player.position.set(x, g.groundHeight(x, z), z);
    g.avatar.rotation.set(0, heading, 0);
    g.avatar.position.set(0, 0, 0);
    const root = g.player.position.clone();
    for (let frame = 0; frame < 60; frame++)
      animateExplorer(g, 1 / 60, false, false);
    assert(g.player.position.equals(root), "fitting cannot move the player");
    assert(Math.abs(root.y - s.floor(x, z)) < 1e-5);
    assert(
      g.avatar.position.y <= 1e-9,
      "retain the standing movement envelope",
    );
    return inspectExplorerTerrain(g, s.floor);
  };
  let samples = 0;
  try {
    // Disable only the knee probes to reproduce the original bent trouser
    // penetration on a correct ground root; keep ankle IK and every body mesh.
    g.rig.terrainCrouch = { model: g.rig.model, probes: [] };
    const control = pose(46.23, 25.43, true);
    assert(control.embedded > 200 && control.minimumGap < -0.26);
    g.rig.terrainCrouch = undefined;
    for (const [x, z] of [
      [46.23, 25.43],
      [198.91, 306.93],
      [198.91, 299.93],
      [191.91, 308.59],
      [4.23, 25.43],
      [44.91, 23.83],
    ])
      for (const heading of [Math.PI, Math.PI / 2])
        for (const crouch of [false, true]) {
          const report = pose(x, z, crouch, heading);
          assert(report.samples > 48000);
          assert.equal(report.invalid, 0);
          assert.equal(report.missing, 0);
          assert.equal(report.embedded, 0, JSON.stringify(report.witnesses));
          samples += report.samples;
        }
    // Settled ankle targets alone missed the animated toe during a stance
    // change. Measure every delivered vertex through both complete transitions.
    for (const heading of [Math.PI, Math.PI / 2]) {
      pose(46.23, 25.43, false, heading);
      const root = g.player.position.clone();
      for (let frame = 0; frame < 120; frame++) {
        if (frame === 0) g.crouching = true;
        if (frame === 60) g.crouching = false;
        animateExplorer(g, 1 / 60, false, false);
        const report = inspectExplorerTerrain(g, s.floor);
        assert.equal(report.embedded, 0, JSON.stringify(report.witnesses));
        assert.equal(report.invalid, 0);
        assert.equal(report.missing, 0);
        assert(g.player.position.equals(root));
        assert(g.avatar.position.y <= 1e-9);
        samples += report.samples;
      }
    }
    assert(samples > 12672000);
  } finally {
    s.dispose();
  }
});

test("terrain banks stop the surrounding body, recover older arrivals and remain solid during sustained approaches", async () => {
  for (const [chapter, x, z] of [
    [0, 382.23, 275.83],
    [2, 338.91, 166.93],
    [3, 54.69, 380.83],
    [4, 156.91, 170.83],
    [5, 159.69, 98.59],
  ]) {
    const s = await actorAndTerrain(undefined, false, false, chapter),
      g = s.game;
    try {
      g.walkable = Adventure.prototype.walkable.bind(g);
      g.canMove = Adventure.prototype.canMove.bind(g);
      g.player.position.set(x, g.groundHeight(x, z), z);
      g.jumpY = g.velocityY = 0;
      g.health = 100;
      assert(g.walkable(x, z), "the centre-only control admits this map cell");
      assert.equal(
        g.canMove(x, z, 0),
        false,
        "the bank enters the body margin",
      );
      const arrival = safeArrival(g, g.player.position);
      assert(arrival, "the old stance has a nearby supported recovery");
      g.player.position.set(arrival.x, arrival.y, arrival.z);
      g.avatar.rotation.set(0, Math.atan2(arrival.x - x, arrival.z - z), 0);
      const direction = new THREE.Vector3(x - arrival.x, 0, z - arrival.z)
        .normalize()
        .multiplyScalar(3);
      for (let frame = 0; frame < 180; frame++) {
        const before = g.player.position.clone();
        advanceCharacter(g, direction, 1 / 60, false);
        g.actualMoveSpeed = before.distanceTo(g.player.position) * 60;
        animateExplorer(g, 1 / 60, g.actualMoveSpeed > 0.1, false);
        assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
        if (frame % 30 === 29) {
          const report = inspectExplorerTerrain(g, s.floor);
          assert.equal(report.embedded, 0, JSON.stringify(report.witnesses));
          assert.equal(report.invalid, 0);
        }
      }
      assert(
        Math.hypot(g.player.position.x - x, g.player.position.z - z) > 0.1,
      );
    } finally {
      s.dispose();
    }
  }
});

test("the recorded desert stance can take a shallow uphill step using its settled foot elevation", async () => {
  const s = await actorAndTerrain(),
    g = s.game;
  try {
    g.walkable = Adventure.prototype.walkable.bind(g);
    g.canMove = Adventure.prototype.canMove.bind(g);
    g.player.position.set(382.23, g.groundHeight(382.23, 235.43), 235.43);
    g.jumpY = g.velocityY = 0;
    g.avatar.rotation.set(0, Math.PI / 2, 0);
    assert(g.canMove(382.33, 235.43, 0));
    assert.equal(
      g.canMove(
        382.33,
        235.43,
        g.player.position.y - g.groundHeight(382.33, 235.43),
      ),
      false,
      "the old elevation reproduces the false obstruction",
    );
    const start = g.player.position.x;
    for (let frame = 0; frame < 4; frame++) {
      advanceCharacter(g, { x: 6, z: 0 }, 0.05, false);
      g.actualMoveSpeed = 6;
      animateExplorer(g, 0.05, true, false);
      assert(g.grounded);
      assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
      const report = inspectExplorerTerrain(g, s.floor);
      assert.equal(report.embedded, 0, JSON.stringify(report.witnesses));
    }
    assert(g.player.position.x - start > 1.1);
    assert(
      Math.abs(
        g.player.position.y - s.floor(g.player.position.x, g.player.position.z),
      ) < 1e-5,
    );
  } finally {
    s.dispose();
  }
});

test("the delivered crouched explorer clears the recorded gallery column without moving feet or changing look", async (t) => {
  const s = await actorAndTerrain(t, true, true),
    g = s.game;
  try {
    g.player.position.set(
      360.6000000000007,
      g.groundHeight(360.6000000000007, 242),
      242,
    );
    g.avatar.rotation.set(0, Math.PI / 2, 0);
    g.yaw = Math.PI;
    g.pitch = 0.18;
    for (let frame = 0; frame < 60; frame++)
      animateExplorer(g, 1 / 60, false, false);
    g.crouching = true;
    for (let frame = 0; frame < 18; frame++)
      animateExplorer(g, 1 / 60, false, false);
    const target = g.player.position
        .clone()
        .add(
          new THREE.Vector3(
            0,
            1.3 - CROUCH_DROP * (1 - Math.exp(-12 * 0.3)),
            0,
          ),
        ),
      desired = target
        .clone()
        .add(
          new THREE.Vector3(
            0,
            Math.sin(g.pitch) * 5.3 + 0.2,
            -Math.cos(g.pitch) * 5.3,
          ),
        ),
      meshes = g.desertForecourts.flatMap((c) =>
        c.root.children.filter((m) => m.isMesh),
      );
    g.camera = new THREE.PerspectiveCamera(58, 1.6, 0.1, 100);
    g.camera.position.set(
      360.15043464498575,
      0.12999271686325053,
      238.81354435945715,
    );
    g.camera.lookAt(target);
    g.cameraFollowTarget = target.clone();
    const feet = g.player.position.clone(),
      blocked = inspectExplorerCamera(g, meshes);
    assert(
      blocked.bodyRays > 100 && blocked.blocked > 20,
      "the delivered column must reproduce partial body occlusion",
    );
    assert.equal(
      g.cameraSurfaces.entry(target, g.camera.position),
      1,
      "the old central arm check misses the body",
    );
    assert(g.camera.position.distanceTo(target) >= 3.2);
    for (let frame = 0; frame < 120; frame++) {
      g.camera.position.copy(
        followClearCamera(g, target, desired, 1 / 60, () => true),
      );
      g.camera.lookAt(target);
    }
    const clear = inspectExplorerCamera(g, meshes);
    assert(clear.bodyRays > 100);
    assert.equal(clear.blocked, 0, JSON.stringify(clear.witnesses));
    assert.equal(clear.invalid, 0);
    assert(g.player.position.equals(feet));
    assert.equal(g.yaw, Math.PI);
    assert.equal(g.pitch, 0.18);
  } finally {
    s.dispose();
  }
});

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
