import { cleftHandTargets } from "../src/cleft-pose.js";
import test from "node:test";
import { poseCounterweight } from "../src/counterweights.js";
import assert from "node:assert/strict";
import { NodeIO } from "@gltf-transform/core";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";
import { animateExplorer, explorerGait } from "../src/explorer.js";
import { restoreCrouchHands } from "../src/explorer-crouch.js";
import {
  strideSoles,
  sampleStrideSoles,
  soleSlip,
} from "../scripts/inspect-stride.js";
import { resetTraversal } from "../src/traversal.js";
import { supportAt } from "../src/character-motion.js";
import { handGeometry } from "../scripts/inspect-hand-geometry.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { coursePlan, hasTraversalCourse } from "../src/traversal-courses.js";
import { buildReturnCable, updateReturnCable } from "../src/return-cable.js";
import {
  buildSunkenGallery,
  updateSunkenGallery,
} from "../src/sunken-gallery.js";
import { beginGalleryWheel } from "../src/gallery-wheel.js";
import { galleryClear } from "../src/sunken-gallery-layout.js";
import { normalizeGallery } from "../src/sunken-gallery-record.js";
import { advanceSwimming } from "../src/water-motion.js";
import { poseCylinderGrip, restoreCableGrip } from "../src/hand-grip.js";
import { buildTorch } from "../src/torch.js";
import { buildFireVault, updateFireVault } from "../src/fire-vault.js";
import {
  beginCausewayWheel,
  advanceCausewayWheel,
  wheelStance,
  causewayPhase,
  CAUSEWAY_WHEEL,
} from "../src/fire-vault-motion.js";
import { normalizeFireVault } from "../src/fire-vault-rules.js";
import { Adventure } from "../src/game.js";
import { ExplorerContact } from "../src/explorer-contact.js";
import {
  buildShutterHouse,
  startShutterTurn,
  updateShutterHouse,
} from "../src/shutter-house.js";
import { buildShutterStation } from "../src/shutter-house-art.js";
import {
  advanceShutterTurn,
  shutterStance,
  shutterTurnPhase,
  SHUTTER_WHEEL,
} from "../src/shutter-motion.js";

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

async function groundedActor() {
  const { scene, animations } = await actor(),
    player = new THREE.Group(),
    avatar = new THREE.Group();
  player.add(avatar);
  avatar.add(scene);
  const mixer = new THREE.AnimationMixer(scene),
    actions = {};
  for (const clip of animations) actions[clip.name] = mixer.clipAction(clip);
  actions.Idle.play();
  return {
    player,
    avatar,
    obstacles: [],
    groundHeight: () => 0,
    grounded: true,
    level: { biome: "snow" },
    elapsed: 0,
    moveVelocity: { x: 0, z: 2.4 },
    rig: {
      model: scene,
      mixer,
      actions,
      state: "Idle",
      weapon: { group: new THREE.Group() },
    },
  };
}

test("causeway hand contact survives reach, turning and release on the delivered mesh without stretching bones", async (t) => {
  const game = await groundedActor();
  Object.assign(game, {
    level: LEVELS[0],
    map: { fireVault: { x: 0, z: 0 } },
    progress: {
      stage: 0,
      field: [],
      fireVault: normalizeFireVault(null),
      torch: false,
    },
    world: new THREE.Group(),
    stoneMat: new THREE.MeshStandardMaterial({ vertexColors: true }),
    flames: [],
    items: [],
    keys: new Set(),
    health: 100,
    jumpY: 1.92,
    audio: { tone() {} },
    cb: {},
    save() {},
    state() {
      return {};
    },
    walkable: () => true,
    canMove: Adventure.prototype.canMove,
  });
  game.world.add(game.player);
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  try {
    buildFireVault(game);
  } finally {
    globalThis.document = old;
  }
  const control = game.fireVault.controls[1],
    bones = [];
  game.player.position.copy(wheelStance(control));
  game.avatar.rotation.y = Math.PI;
  for (let i = 0; i < 90; i++) animateExplorer(game, 1 / 60, false, false);
  game.rig.model.traverse((bone) => {
    if (bone.isBone)
      bones.push({
        bone,
        position: bone.position.clone(),
        scale: bone.scale.clone(),
      });
  });
  assert(beginCausewayWheel(game, control));
  let minimum = Infinity,
    contactMaximum = 0,
    samples = 0;
  for (let i = 0; i < 145; i++) {
    game.elapsed += 1 / 60;
    advanceCausewayWheel(game, 1 / 60, { x: 0, z: 0 });
    animateExplorer(game, 1 / 60, false, false);
    updateFireVault(game, 1 / 60);
    const op = game.fireVault.operation,
      phase = op && causewayPhase(op);
    for (const { bone, position, scale } of bones) {
      if (/(?:Arm|ForeArm|Hand.*)$/.test(bone.name))
        assert(bone.position.distanceTo(position) < 1e-7, bone.name);
      assert(bone.scale.distanceTo(scale) < 1e-7, bone.name);
      assert(bone.quaternion.toArray().every(Number.isFinite), bone.name);
    }
    if (!op || i % 2) continue;
    samples++;
    const contact =
      phase >= CAUSEWAY_WHEEL.turnStart && phase <= CAUSEWAY_WHEEL.detent;
    for (const hand of handGeometry(game, {
      handles: control.grips,
      halfLength: 0.1,
    })) {
      for (const [name, measurement] of Object.entries(hand.fingers)) {
        minimum = Math.min(minimum, measurement.minimum);
        assert(
          measurement.minimum > -0.002,
          `${i}/${hand.side}/${name}: enters grip ${measurement.minimum}`,
        );
        if (contact) {
          assert(
            measurement.minimum < 0.004,
            `${i}/${hand.side}/${name}: loses grip ${measurement.minimum}`,
          );
          contactMaximum = Math.max(contactMaximum, measurement.minimum);
        }
      }
    }
  }
  assert(samples > 50);
  assert.equal(game.fireVault.operation, null);
  assert.equal(game.rig.gripBaseActive, false);
  assert.equal(game.fireVault.saved.turns[1], 1);
  t.diagnostic(JSON.stringify({ samples, minimum, contactMaximum }));
});

test("the delivered left hand grips the vertical torch while the right arm keeps its base motion", async () => {
  const game = await groundedActor();
  Object.assign(game, {
    level: LEVELS[0],
    progress: { stage: 0, field: [], torch: true },
    health: 100,
    world: new THREE.Group(),
    flames: [],
    soundSources: [],
  });
  game.world.add(game.player);
  buildTorch(game);
  const handle = new THREE.Object3D();
  handle.rotation.z = Math.PI / 2;
  game.torch.root.add(handle);
  const right = [];
  game.rig.model.traverse((b) => {
    if (b.isBone && /Right(Arm|ForeArm|Hand)/.test(b.name)) right.push(b);
  });
  const lengths = new Map();
  game.rig.model.traverse((b) => {
    if (b.isBone) lengths.set(b, b.position.clone());
  });
  for (const yaw of [0, Math.PI / 2, Math.PI])
    for (const crouching of [false, true])
      for (const moving of [false, true]) {
        game.avatar.rotation.y = yaw;
        game.crouching = crouching;
        game.rig.crouchBlend = Number(crouching);
        game.progress.torch = false;
        animateExplorer(game, 0.1, moving, false);
        const base = right.map((b) => b.quaternion.clone());
        for (const [bone, position] of lengths) position.copy(bone.position);
        game.progress.torch = true;
        animateExplorer(game, 0, moving, false);
        for (const [i, b] of right.entries())
          assert(
            Math.abs(
              b.quaternion.clone().normalize().dot(base[i].clone().normalize()),
            ) >
              1 - 1e-10,
            `right arm changed: ${b.name} ${b.quaternion.toArray()} / ${base[i].toArray()}`,
          );
        const hand = handGeometry(game, {
          handles: [handle, handle],
          halfLength: 0.26,
        })[0];
        for (const [name, f] of Object.entries(hand.fingers)) {
          assert(
            f.minimum > -0.002,
            `${name} penetrates the shaft: ${f.minimum}`,
          );
          assert(f.minimum < 0.004, `${name} misses its contact: ${f.minimum}`);
        }
        for (const [b, p] of lengths)
          assert(b.position.distanceTo(p) < 1e-9, b.name);
      }
  game.progress.torch = false;
  animateExplorer(game, 0.1, false, false);
  assert.equal(game.torch.root.visible, false);
  assert.equal(game.rig.gripBaseActive, false);
});

test("delivered hands remain fitted to the underwater wheel through its turn and release without changing bone lengths", async (t) => {
  const game = await groundedActor();
  game.level = LEVELS[3];
  game.map = createMap(game.level);
  game.terrainProfile = createTerrainProfile(game.map, game.level);
  game.groundHeight = game.terrainProfile.height;
  Object.assign(game, {
    world: new THREE.Group(),
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    soundSources: [],
    keys: new Set(),
    health: 100,
    diveAir: 32,
    progress: { gallery: normalizeGallery(null) },
    audio: { tone() {} },
    cb: {},
    save() {},
    state() {
      return {};
    },
  });
  game.world.add(game.player);
  game.waterMeshes = game.terrainProfile.waters.map((site) => {
    const mesh = new THREE.Mesh();
    mesh.position.set(site.x, site.baseY, site.z);
    Object.assign(mesh.userData, site);
    return mesh;
  });
  game.canMove = (x, z, height, clearance = 0.8) =>
    galleryClear(game, x, game.groundHeight(x, z) + height, z, clearance);
  buildSunkenGallery(game);
  game.swimming = game.diving = true;
  game.grounded = false;
  const w = game.sunkenGallery.profile.wheel;
  game.player.position.set(w.x + 0.1, w.y, w.z - 1.3);
  const bones = [];
  game.rig.model.traverse((bone) => {
    if (bone.isBone && /(?:Arm|ForeArm|Hand.*)$/.test(bone.name))
      bones.push({
        bone,
        position: bone.position.clone(),
        scale: bone.scale.clone(),
      });
  });
  assert(beginGalleryWheel(game));
  let samples = 0,
    minimum = Infinity,
    maximumContact = 0,
    supportClearance = Infinity;
  for (let i = 0; i < 120; i++) {
    game.elapsed += 1 / 60;
    advanceSwimming(game, { x: 0, z: 0 }, 1 / 60, false);
    animateExplorer(game, 1 / 60, false, false);
    updateSunkenGallery(game, 1 / 60);
    const turn = game.sunkenGallery.operation?.turn;
    if (!(turn > 0 && turn < 1) || i % 3) continue;
    samples++;
    for (const { bone, position, scale } of bones) {
      assert(bone.position.distanceTo(position) < 1e-7, bone.name);
      assert(bone.scale.distanceTo(scale) < 1e-7, bone.name);
      assert(bone.quaternion.toArray().every(Number.isFinite), bone.name);
    }
    for (const [index, hand] of handGeometry(game, {
      handles: game.sunkenGallery.handles,
      halfLength: 0.12,
    }).entries()) {
      for (const [name, measurement] of Object.entries(hand.fingers)) {
        assert(measurement.vertices > 200);
        assert(
          measurement.minimum >= -0.0006,
          `${i}/${hand.side}/${name}: enters grip ${measurement.minimum}`,
        );
        assert(
          measurement.minimum < 0.004,
          `${i}/${hand.side}/${name}: loses contact ${measurement.minimum}`,
        );
        minimum = Math.min(minimum, measurement.minimum);
        maximumContact = Math.max(maximumContact, measurement.minimum);
      }
      const center = game.sunkenGallery.handles[index].position.x;
      for (const { point } of hand.vertices) {
        const local = game.sunkenGallery.wheel.worldToLocal(point.clone());
        for (const end of [-1, 1]) {
          const x = center + end * 0.135;
          const segment = new THREE.Line3(
            new THREE.Vector3(x, 0, 0),
            new THREE.Vector3(x, 0, -0.16),
          );
          const distance = segment
            .closestPointToPoint(local, true, new THREE.Vector3())
            .distanceTo(local);
          assert(distance > 0.026, "hand clears the grip's capped supports");
          supportClearance = Math.min(supportClearance, distance - 0.026);
        }
      }
    }
  }
  assert(samples >= 10);
  assert.equal(game.progress.gallery.opened, true);
  assert.equal(game.sunkenGallery.operation, null);
  assert.equal(game.rig.gripBaseActive, false);
  assert.equal(game.rig.wheelBrace, 0);
  const handles = game.sunkenGallery.handles.map((h) =>
      h.getWorldPosition(new THREE.Vector3()),
    ),
    rotation = game.sunkenGallery.wheel.getWorldQuaternion(
      new THREE.Quaternion(),
    ),
    axis = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation),
    distal = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
  poseCylinderGrip(game, handles, axis, distal);
  const blended = game.rig.gripBase.map(({ bone, rotation: base }) => ({
    bone,
    base: base.clone(),
    full: bone.quaternion.clone(),
  }));
  restoreCableGrip(game);
  poseCylinderGrip(game, handles, axis, distal, 0.5);
  for (const { bone, base, full } of blended)
    assert(
      bone.quaternion
        .clone()
        .normalize()
        .angleTo(base.clone().slerp(full, 0.5).normalize()) < 1e-6,
      `${bone.name} blends reach and release`,
    );
  assert(blended.some(({ bone, base }) => bone.quaternion.angleTo(base) > 0.1));
  restoreCableGrip(game);
  t.diagnostic(
    JSON.stringify({ samples, minimum, maximumContact, supportClearance }),
  );
});

test("delivered palms and fingers fit every cable grip without stretching bones or entering the handle struts", async (t) => {
  const game = await groundedActor(),
    materials = {
      stone: new THREE.MeshStandardMaterial(),
      timber: new THREE.MeshStandardMaterial(),
      metal: new THREE.MeshStandardMaterial(),
    };
  game.world = new THREE.Group();
  game.world.add(game.player);
  let samples = 0,
    minimum = Infinity,
    maximumContact = 0,
    vertices = 0,
    strutClearance = Infinity;
  const bones = [];
  game.rig.model.traverse((bone) => {
    if (bone.isBone && /(?:Arm|ForeArm|Hand.*)$/.test(bone.name))
      bones.push({
        bone,
        position: bone.position.clone(),
        scale: bone.scale.clone(),
      });
  });
  for (const level of LEVELS) {
    game.level = level;
    const map = createMap(level),
      terrain = createTerrainProfile(map, level);
    game.groundHeight = terrain.height;
    for (const f of map.features.filter(
      (f) => f.type === "field" && hasTraversalCourse(level, f),
    )) {
      const plan = coursePlan(level, f),
        base = terrain.height(f.x * 7, f.z * 7),
        course = {
          ...plan,
          root: new THREE.Group(),
          zip: new THREE.Mesh(),
          launch: new THREE.Vector3(
            plan.launchPoint.x,
            base + 8.4,
            plan.launchPoint.z,
          ),
          exit: new THREE.Vector3(
            plan.exitPoint.x,
            terrain.height(plan.exitPoint.x, plan.exitPoint.z),
            plan.exitPoint.z,
          ),
        };
      game.world.add(course.root);
      buildReturnCable(game, course, materials);
      game.zipRide = { course, approach: false };
      game.grounded = false;
      game.avatar.rotation.y = Math.atan2(
        course.exit.x - course.launch.x,
        course.exit.z - course.launch.z,
      );
      for (const travel of [0.1, 0.5, 0.9]) {
        game.player.position.copy(course.launch).lerp(course.exit, travel);
        updateReturnCable(game, course, 0);
        for (let i = 0; i < 24; i++) {
          animateExplorer(game, 1 / 60, false, false);
          for (const { bone, position, scale } of bones) {
            assert.ok(bone.position.distanceTo(position) < 1e-7, bone.name);
            assert.ok(bone.scale.distanceTo(scale) < 1e-7, bone.name);
            assert.ok(
              bone.quaternion.toArray().every(Number.isFinite),
              bone.name,
            );
          }
          if (![0, 12, 23].includes(i)) continue;
          for (const hand of handGeometry(game)) {
            for (const [finger, measurement] of Object.entries(hand.fingers)) {
              const label = `${level.id}/${f.id}/${travel}/${i}/${hand.side}/${finger}`;
              assert.ok(measurement.vertices > 200, label);
              assert.ok(
                measurement.minimum >= -0.0005,
                `${label}: enters grip by ${-measurement.minimum} m`,
              );
              assert.ok(
                measurement.minimum < 0.004,
                `${label}: misses grip by ${measurement.minimum} m`,
              );
              minimum = Math.min(minimum, measurement.minimum);
              maximumContact = Math.max(maximumContact, measurement.minimum);
            }
            for (const { point } of hand.vertices) {
              const local = course.zipRig.hanger.worldToLocal(point.clone());
              for (const sign of [-1, 1]) {
                const segment = new THREE.Line3(
                  new THREE.Vector3(sign * 0.205, 0, 0),
                  new THREE.Vector3(sign * 0.365, -0.43, 0),
                );
                const distance = segment
                  .closestPointToPoint(local, true, new THREE.Vector3())
                  .distanceTo(local);
                assert.ok(
                  distance > 0.041,
                  `${level.id}/${f.id}: hand enters strut envelope`,
                );
                strutClearance = Math.min(strutClearance, distance - 0.041);
              }
            }
            vertices += hand.vertices.length;
            samples++;
          }
        }
      }
      game.world.remove(course.root);
      course.root.traverse((o) => o.geometry?.dispose());
    }
  }
  assert.equal(samples, 378);
  t.diagnostic(
    JSON.stringify({
      samples,
      vertices,
      minimum,
      maximumContact,
      strutClearance,
    }),
  );
  Object.values(materials).forEach((m) => m.dispose());
});

test("dismounting restores the base hand animation without retaining finger or wrist rotations", async () => {
  const game = await groundedActor(),
    reference = await groundedActor();
  game.world = new THREE.Group();
  game.world.add(game.player);
  const course = {
    id: "release",
    stage: 0,
    root: new THREE.Group(),
    zip: new THREE.Mesh(),
    launch: new THREE.Vector3(0, 8.4, 0),
    exit: new THREE.Vector3(0, 0, 22),
  };
  game.world.add(course.root);
  buildReturnCable(game, course, {
    stone: new THREE.MeshStandardMaterial(),
    timber: new THREE.MeshStandardMaterial(),
    metal: new THREE.MeshStandardMaterial(),
  });
  game.player.position.copy(course.launch).lerp(course.exit, 0.4);
  reference.player.position.copy(game.player.position);
  game.zipRide = { course, approach: false };
  game.grounded = reference.grounded = false;
  updateReturnCable(game, course, 0);
  for (let i = 0; i < 30; i++) {
    animateExplorer(game, 1 / 60, false, false);
    animateExplorer(reference, 1 / 60, false, false);
  }
  const closed = [];
  game.rig.model.traverse((bone) => {
    if (bone.isBone && /Hand.*[123]$/.test(bone.name))
      closed.push({ bone, rotation: bone.quaternion.clone() });
  });
  game.zipRide = null;
  for (let i = 0; i < 90; i++) {
    animateExplorer(game, 1 / 60, false, false);
    animateExplorer(reference, 1 / 60, false, false);
    game.rig.model.traverse((bone) => {
      if (!bone.isBone || !/Hand/.test(bone.name)) return;
      const expected = reference.rig.model.getObjectByName(bone.name);
      assert.ok(
        bone.quaternion
          .toArray()
          .every(
            (q, i) => Math.abs(q - expected.quaternion.toArray()[i]) < 1e-6,
          ),
        bone.name,
      );
    });
  }
  assert.ok(
    closed.some(
      ({ bone, rotation }) => rotation.angleTo(bone.quaternion) > 0.5,
    ),
  );
  assert.ok(game.rig.hangLift < 0.00001);
});
// Independent of the runtime's reduced probes: inspect every outsole vertex.
function soleClearances(game) {
  const shoe = game.rig.model.getObjectByName("shoes04"),
    { position, skinWeight, skinIndex } = shoe.geometry.attributes,
    result = [Infinity, Infinity],
    point = new THREE.Vector3();
  game.avatar.updateWorldMatrix(true, false);
  game.rig.model.updateMatrixWorld(true);
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > 0.035) continue;
    let dominant = 0;
    for (let j = 1; j < 4; j++)
      if (skinWeight.getComponent(i, j) > skinWeight.getComponent(i, dominant))
        dominant = j;
    const side = shoe.skeleton.bones[
      skinIndex.getComponent(i, dominant)
    ].name.includes("Left")
      ? 0
      : 1;
    shoe.getVertexPosition(i, point).applyMatrix4(shoe.matrixWorld);
    result[side] = Math.min(
      result[side],
      point.y -
        supportAt(game, point.x, point.z, game.player.position.y + 0.45).height,
    );
  }
  return result;
}

test("crouched hands stay below the shoulders with relaxed finger chains across gait phases, slopes and facing", async (t) => {
  const game = await groundedActor();
  const bones = [];
  game.rig.model.traverse((bone) => {
    if (bone.isBone && /(?:Arm|ForeArm|Hand.*)$/.test(bone.name))
      bones.push({
        bone,
        position: bone.position.clone(),
        scale: bone.scale.clone(),
      });
  });
  const point = (name) =>
    game.rig.model
      .getObjectByName("mixamorig" + name)
      .getWorldPosition(new THREE.Vector3());
  let samples = 0,
    minimumDrop = Infinity,
    maximumDrop = 0;
  game.crouching = true;
  game.rig.crouchBlend = 1;
  for (const yaw of [0, Math.PI / 2, Math.PI])
    for (const slope of [-0.25, 0, 0.25])
      for (const moving of [false, true]) {
        game.avatar.rotation.y = yaw;
        game.groundHeight = (x, z) => slope * z;
        game.moveVelocity.z = game.actualMoveSpeed = moving ? 2.2 : 0;
        for (let i = 0; i < 30; i++) {
          game.elapsed += 1 / 30;
          const root = game.player.position.clone();
          animateExplorer(game, 1 / 30, moving, false);
          assert(game.player.position.equals(root));
          for (const { bone, position, scale } of bones) {
            assert(bone.position.distanceTo(position) < 1e-7, bone.name);
            assert(bone.scale.distanceTo(scale) < 1e-7, bone.name);
            assert(bone.quaternion.toArray().every(Number.isFinite), bone.name);
          }
          for (const side of ["Left", "Right"]) {
            const wrist = point(side + "Hand"),
              shoulder = point(side + "Arm");
            const drop = shoulder.y - wrist.y;
            assert(drop > 0.2 && drop < 0.3, `${side}: raised wrist ${drop}`);
            minimumDrop = Math.min(minimumDrop, drop);
            maximumDrop = Math.max(maximumDrop, drop);
            const knuckle = point(side + "HandMiddle1");
            assert(knuckle.y < wrist.y - 0.025, `${side}: wrist bends upward`);
            for (const finger of ["Index", "Middle", "Ring", "Pinky"]) {
              const joints = [1, 2, 3].map((j) =>
                point(side + "Hand" + finger + j),
              );
              const a = joints[1].clone().sub(joints[0]);
              const b = joints[2].clone().sub(joints[1]);
              const bend = a.angleTo(b);
              assert(bend > 0.3 && bend < 0.65, `${side}/${finger}: ${bend}`);
            }
          }
          samples++;
        }
      }
  t.diagnostic(JSON.stringify({ samples, minimumDrop, maximumDrop }));
});

test("crouch hand overlays blend, stop with blocked travel and release without retaining rotations", async (t) => {
  const game = await groundedActor();
  const wrist = () =>
    game.rig.model
      .getObjectByName("mixamorigLeftHand")
      .getWorldPosition(new THREE.Vector3());
  animateExplorer(game, 1 / 60, false, false);
  let previous = wrist(),
    maximumStep = 0;
  for (const crouching of [true, false]) {
    game.crouching = crouching;
    for (let i = 0; i < 60; i++) {
      animateExplorer(game, 1 / 60, false, false);
      const next = wrist();
      maximumStep = Math.max(maximumStep, next.distanceTo(previous));
      previous = next;
    }
  }
  assert(maximumStep < 0.12, `crouch transition snaps ${maximumStep} m/frame`);
  assert.equal(game.rig.crouchHands.active, false);
  game.crouching = true;
  game.actualMoveSpeed = 2.2;
  for (let i = 0; i < 60; i++) animateExplorer(game, 1 / 60, true, false);
  assert(game.rig.crouchHands.swing > 0.99);
  game.actualMoveSpeed = 0;
  for (let i = 0; i < 90; i++) animateExplorer(game, 1 / 60, true, false);
  assert.equal(game.rig.state, "Idle");
  assert(game.rig.crouchHands.swing < 0.001);
  const phase = game.rig.actions.Walk.time;
  game.elapsed += 200;
  animateExplorer(game, 0, true, false);
  assert.equal(game.rig.actions.Walk.time, phase);
  const base = game.rig.crouchHands.base.map(({ bone, rotation }) => [
    bone,
    rotation.clone(),
  ]);
  restoreCrouchHands(game);
  restoreCrouchHands(game);
  for (const [bone, rotation] of base)
    assert(bone.quaternion.equals(rotation), bone.name);
  // An airborne state cancels the crouch immediately; fingers must follow its clip.
  const reference = await groundedActor();
  game.grounded = reference.grounded = false;
  game.crouching = false;
  for (const g of [game, reference]) {
    g.rig.mixer.stopAllAction();
    g.rig.actions.Idle.reset().play();
    g.rig.state = "Idle";
    animateExplorer(g, 1 / 60, false, false);
  }
  for (const [bone] of base) {
    if (!/Hand.*[123]$/.test(bone.name)) continue;
    assert(
      bone.quaternion.angleTo(
        reference.rig.model.getObjectByName(bone.name).quaternion,
      ) < 0.001,
      bone.name,
    );
  }
  t.diagnostic(
    JSON.stringify({ maximumStep, stoppedSwing: game.rig.crouchHands.swing }),
  );
});

test("crouching lowers the delivered actor with bent legs and grounded soles through travel and release", async () => {
  const game = await groundedActor();
  const head = game.rig.model.getObjectByName("mixamorigHead");
  const bones = [];
  game.rig.model.traverse((o) => {
    if (o.isBone) bones.push([o, o.position.length()]);
  });
  animateExplorer(game, 0.05, false, false);
  const standing = head.getWorldPosition(new THREE.Vector3()).y;
  game.crouching = true;
  game.moveVelocity.z = 2.2;
  for (const moving of [false, true]) {
    for (let i = 0; i < 60; i++) {
      game.elapsed += 1 / 30;
      if (moving) game.player.position.z += 2.2 / 30;
      const root = game.player.position.clone();
      animateExplorer(game, 1 / 30, moving, false);
      const soles = soleClearances(game);
      assert(game.player.position.equals(root));
      assert(
        soles.every((gap) => gap > -0.012),
        `crouched soles: ${soles}`,
      );
      for (const [bone, length] of bones) {
        if (bone.name.endsWith("Hips")) continue;
        assert(Math.abs(bone.position.length() - length) < 1e-5, bone.name);
      }
    }
    assert(head.getWorldPosition(new THREE.Vector3()).y < standing - 0.28);
  }
  game.crouching = false;
  for (let i = 0; i < 40; i++) animateExplorer(game, 1 / 30, false, false);
  assert(
    Math.abs(head.getWorldPosition(new THREE.Vector3()).y - standing) < 0.05,
  );
  game.crouching = true;
  for (let i = 0; i < 30; i++) animateExplorer(game, 1 / 30, false, false);
  game.crouching = false;
  game.aimUntil = game.elapsed + 2;
  game.aiming = true;
  game.yaw = 0;
  game.aimPoint = game.player.position
    .clone()
    .add(new THREE.Vector3(0, 1.5, -12));
  for (let i = 0; i < 20; i++) {
    animateExplorer(game, i ? 1 / 60 : 0, false, false);
    const hand = game.rig.model
      .getObjectByName("mixamorigRightHand")
      .getWorldPosition(new THREE.Vector3());
    assert(
      hand.distanceTo(game.rig.weapon.group.position) < 0.055,
      "pistol leaves the hand while standing",
    );
  }
});

test("delivered sole movement matches travel more closely while running retains flight and crouched knees clear the floor", async (t) => {
  const results = [];
  for (const [mode, speed, limit] of [
    ["walk", 2.4, 0.3],
    ["jog", 6, 0.5],
    ["sprint", 10, 0.75],
    ["crouch", 2.2, 0.4],
  ]) {
    const game = await groundedActor(),
      feet = strideSoles(game.rig.model),
      slips = [];
    game.crouching = mode === "crouch";
    game.moveVelocity.z = game.actualMoveSpeed = speed;
    let previous,
      minimumKnee = Infinity,
      minimumSole = Infinity,
      flight = 0;
    for (let i = 0; i < 240; i++) {
      game.player.position.z += speed / 60;
      game.elapsed += 1 / 60;
      const root = game.player.position.clone();
      animateExplorer(game, 1 / 60, true, mode === "sprint");
      assert(game.player.position.equals(root));
      const current = sampleStrideSoles(feet);
      if (i > 40) {
        slips.push(...soleSlip(previous, current, 1 / 60));
        const lowest = Math.min(...current.flat().map((p) => p.y));
        minimumSole = Math.min(minimumSole, lowest);
        flight = Math.max(flight, lowest);
        for (const side of ["Left", "Right"])
          minimumKnee = Math.min(
            minimumKnee,
            game.rig.model
              .getObjectByName("mixamorig" + side + "Leg")
              .getWorldPosition(new THREE.Vector3()).y,
          );
      }
      previous = current;
    }
    slips.sort((a, b) => a - b);
    assert(slips.length > 10000, `${mode}: too few contact samples`);
    const median = slips[Math.floor(slips.length / 2)];
    assert(
      median < limit,
      `${mode}: near-floor material points slide at ${median} m/s`,
    );
    assert(minimumSole > -0.012, `${mode}: boot enters the floor`);
    if (mode === "jog" || mode === "sprint")
      assert(flight > 0.055, `${mode}: lost running flight`);
    if (mode === "crouch")
      assert(minimumKnee > 0.105, `kneeling during travel: ${minimumKnee}`);
    results.push({
      mode,
      median,
      p90: slips[Math.floor(slips.length * 0.9)],
      minimumKnee,
      minimumSole,
      flight,
    });
  }
  t.diagnostic(JSON.stringify(results));
});

test("moving slopes keep stride soles supported and contact sounds at the floor at 20 and 30 updates per second", async (t) => {
  const results = [];
  for (const hz of [20, 30]) {
    const counts = {};
    for (const [mode, speed] of [
      ["walk", 2.4],
      ["jog", 6],
      ["sprint", 10],
      ["crouch", 2.2],
    ]) {
      const game = await groundedActor(),
        sounds = [];
      game.crouching = mode === "crouch";
      game.groundHeight = (x, z) => x * 0.06 + z * 0.12;
      game.moveVelocity.z = game.actualMoveSpeed = speed;
      game.audio = {
        footstep(surface, sprint, point) {
          sounds.push({
            surface,
            sprint,
            gap: point.y - game.groundHeight(point.x, point.z),
          });
        },
      };
      let minimum = Infinity;
      for (let i = 0; i < hz * 3; i++) {
        game.player.position.z += speed / hz;
        game.player.position.y = game.groundHeight(0, game.player.position.z);
        game.elapsed += 1 / hz;
        const root = game.player.position.clone();
        animateExplorer(game, 1 / hz, true, mode === "sprint");
        assert(game.player.position.equals(root));
        const soles = soleClearances(game);
        minimum = Math.min(minimum, ...soles);
        assert(
          soles.every((y) => y > -0.012),
          `${hz}/${mode}: slope penetration ${soles}`,
        );
        for (let f = 0; f < 2; f++)
          assert(
            Math.abs(soles[f] - game.rig.grounding.contacts[f].lift) < 0.045,
            `${hz}/${mode}: lost support`,
          );
      }
      assert(sounds.length >= 4, `${hz}/${mode}: missed footfalls`);
      assert(
        sounds.every((s) => s.gap > -0.012 && s.gap < 0.045),
        `${hz}/${mode}: sound leaves the floor`,
      );
      assert(sounds.every((s) => s.sprint === (mode === "sprint")));
      counts[mode] = sounds.length;
      results.push({ hz, mode, contacts: sounds.length, minimum });
    }
    assert(
      counts.sprint > counts.jog,
      `${hz}: sprint cadence does not follow speed`,
    );
  }
  t.diagnostic(JSON.stringify(results));
});

test("ambient contacts track delivered animated soles without changing the actor or its pose", async () => {
  const game = await groundedActor();
  game.scene = new THREE.Scene();
  game.scene.add(game.player);
  game.audio = { footstep() {} };
  const contacts = new ExplorerContact(game),
    feet = strideSoles(game.rig.model),
    bones = [];
  game.rig.model.traverse((o) => {
    if (o.isBone) bones.push(o);
  });
  let visible = 0,
    lifted = 0;
  try {
    for (const grade of [-0.3, 0, 0.3])
      for (const mode of ["Idle", "Walk", "Run", "Crouch"]) {
        game.groundHeight = (x, z) => x * grade + z * 0.05;
        game.player.position.set(5, game.groundHeight(5, 8), 8);
        game.avatar.rotation.y = 0.8;
        game.crouching = mode === "Crouch";
        const clip = mode === "Crouch" ? "Walk" : mode;
        game.rig.mixer.stopAllAction();
        game.rig.actions[clip].reset().play();
        game.rig.state = clip;
        game.rig.grounding = undefined;
        game.moveVelocity.z =
          mode === "Run" ? 6 : mode === "Crouch" ? 2.2 : 2.4;
        for (let i = 0; i < 30; i++) {
          game.player.position.x += mode === "Idle" ? 0 : 0.04;
          game.player.position.y = game.groundHeight(game.player.position.x, 8);
          animateExplorer(game, 1 / 30, mode !== "Idle", false);
          const root = game.player.position.toArray(),
            pose = bones.map((b) => [
              b.position.toArray(),
              b.quaternion.toArray(),
            ]);
          contacts.update();
          assert.deepEqual(game.player.position.toArray(), root);
          assert.deepEqual(
            bones.map((b) => [b.position.toArray(), b.quaternion.toArray()]),
            pose,
          );
          const soles = sampleStrideSoles(feet);
          for (const [f, mesh] of contacts.meshes.entries()) {
            if (!mesh.visible) {
              lifted++;
              continue;
            }
            visible++;
            const p = mesh.geometry.attributes.position,
              index = mesh.geometry.index,
              center = new THREE.Vector3().fromBufferAttribute(p, 24),
              bounds = new THREE.Box3().setFromPoints(soles[f]);
            assert(
              center.x >= bounds.min.x - 0.02 &&
                center.x <= bounds.max.x + 0.02,
            );
            assert(
              center.z >= bounds.min.z - 0.02 &&
                center.z <= bounds.max.z + 0.02,
            );
            for (let k = 0; k < mesh.geometry.drawRange.count; k++) {
              const v = index.getX(k),
                gap = p.getY(v) - game.groundHeight(p.getX(v), p.getZ(v));
              assert(
                gap > 0.0039 && gap < 0.0041,
                `${mode}: contact leaves support`,
              );
            }
          }
        }
      }
    assert(visible > 300);
    assert(lifted > 0, "raised running feet must lose their contact patch");
  } finally {
    contacts.dispose();
  }
});

test("boots fit slopes in either direction while retaining swing clearance and the physical root", async () => {
  const game = await groundedActor();
  for (const grade of [-0.38, 0, 0.38]) {
    game.groundHeight = (x, z) => x * grade + z * 0.06;
    game.player.position.set(4, game.groundHeight(4, 6), 6);
    for (const yaw of [0, Math.PI / 2, Math.PI]) {
      game.avatar.rotation.y = yaw;
      for (const name of ["Idle", "Walk", "Run"]) {
        game.rig.mixer.stopAllAction();
        game.rig.actions[name].reset().play();
        game.rig.state = name;
        game.moveVelocity.z = name === "Run" ? 6 : 2.4;
        game.rig.grounding = undefined;
        for (let i = 0; i < 30; i++) {
          const root = game.player.position.clone();
          animateExplorer(game, 1 / 30, name !== "Idle", false);
          const soles = soleClearances(game),
            contacts = game.rig.grounding.contacts;
          assert.ok(
            game.player.position.equals(root),
            "visual IK moved the capsule",
          );
          for (let foot = 0; foot < 2; foot++) {
            assert.ok(
              soles[foot] > -0.012,
              `${grade}/${yaw}/${name}/${i}: sole ${foot} penetrates ${soles[foot]}`,
            );
            assert.ok(
              Math.abs(soles[foot] - contacts[foot].lift) < 0.045,
              `${grade}/${yaw}/${name}/${i}: sole ${foot} gap ${soles[foot]} vs animation ${contacts[foot].lift}`,
            );
          }
        }
      }
    }
  }
});

test("visible contact drives positioned footsteps and stays quiet without travel or on water", async () => {
  const game = await groundedActor(),
    sounds = [];
  game.audio = {
    footstep: (surface, sprint, point) =>
      sounds.push({
        surface,
        sprint,
        point: point.clone(),
        time: game.elapsed,
      }),
  };
  const run = (frames, travel, moving = true) => {
    for (let i = 0; i < frames; i++) {
      game.player.position.z += travel;
      game.elapsed += 1 / 60;
      animateExplorer(game, 1 / 60, moving, false);
    }
  };
  run(180, 0.04);
  assert.ok(
    sounds.length >= 4 && sounds.length <= 10,
    `walking produced ${sounds.length} contacts`,
  );
  for (const sound of sounds) {
    assert.equal(sound.surface, "snow");
    assert.ok(sound.point.y > -0.012 && sound.point.y < 0.045);
  }
  const count = sounds.length;
  run(120, 0); // Input against a wall must not generate steps.
  run(120, 0, false);
  game.paused = true;
  run(120, 0.04);
  game.paused = false;
  game.waterMeshes = [
    {
      position: new THREE.Vector3(0, 0.4, game.player.position.z),
      userData: { kind: "water", width: 100, length: 100 },
    },
  ];
  run(120, 0.04);
  game.waterMeshes = [];
  for (let i = 0; i < 60; i++) run(1, 10); // Teleports are not footfalls.
  assert.equal(sounds.length, count);
  game.grounded = false;
  run(120, 0.04);
  assert.equal(game.rig.grounding.active, false);
  assert.equal(sounds.length, count);
  game.grounded = true;
  game.moveVelocity.z = 6;
  const startJog = sounds.length;
  run(180, 0.1);
  const jogContacts = sounds.length - startJog;
  assert.ok(jogContacts >= 6, "jogging lost its foot contacts");
  const startSprint = sounds.length;
  game.moveVelocity.z = 10;
  for (let i = 0; i < 180; i++) {
    game.player.position.z += 10 / 60;
    game.elapsed += 1 / 60;
    animateExplorer(game, 1 / 60, true, true);
  }
  assert.ok(
    sounds.length - startSprint > jogContacts,
    "sprinting should contact more often than jogging",
  );
  assert.ok(sounds.slice(startSprint).every((s) => s.sprint));
});

test("ground fitting uses platform tops and leaves unsupported feet above a deep drop", async () => {
  const game = await groundedActor();
  game.obstacles = [{ x: 0, z: 0, w: 2, d: 2, h: 2, climbable: true }];
  game.player.position.y = 2;
  animateExplorer(game, 0.1, false, false);
  assert.ok(
    soleClearances(game).every((gap) => gap > -0.012 && gap < 0.045),
    JSON.stringify({
      soles: soleClearances(game),
      contacts: game.rig.grounding.contacts,
    }),
  );
  game.obstacles = [];
  game.groundHeight = () => -20;
  animateExplorer(game, 0.1, false, false);
  assert.ok(game.rig.grounding.contacts.every((c) => !c.supported));
  assert.ok(
    Math.abs(game.avatar.position.y) < 0.05,
    "IK pulled the body into the ravine",
  );
  assert.equal(game.player.position.y, 2);
});
test("sagging bridge boards support the boots and produce timber contacts", async () => {
  const game = await groundedActor(),
    surfaces = [];
  game.groundHeight = () => -20;
  game.skyBridges = [
    {
      id: "test-span",
      ax: 0,
      az: 0,
      bx: 0,
      bz: 10,
      ay: 2,
      by: 2,
      width: 2,
      open: 1,
      gaps: [],
    },
  ];
  game.audio = { footstep: (surface) => surfaces.push(surface) };
  game.player.position.z = 1;
  for (let i = 0; i < 180; i++) {
    game.player.position.z += 0.04;
    game.player.position.y = supportAt(game, 0, game.player.position.z).height;
    animateExplorer(game, 1 / 60, true, false);
    const gaps = soleClearances(game);
    assert.ok(gaps.every((gap) => gap > -0.012));
    assert.ok(Math.min(...gaps) < 0.045);
  }
  assert.ok(surfaces.length >= 4);
  assert.ok(surfaces.every((surface) => surface === "wood"));
});
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
test("retargeted locomotion preserves running flight and grounded walk/idle without horizontal root motion", async () => {
  const { scene, animations } = await actor(),
    mixer = new THREE.AnimationMixer(scene),
    shoe = scene.getObjectByName("shoes04"),
    hips = scene.getObjectByName("mixamorigHips");
  for (const clip of animations) {
    mixer.stopAllAction();
    const action = mixer.clipAction(clip).play();
    let first;
    const heights = [];
    for (let frame = 0; frame < 120; frame++) {
      mixer.setTime((clip.duration * frame) / 120);
      scene.updateMatrixWorld(true);
      shoe.skeleton.update();
      let lowest = Infinity;
      for (let i = 0; i < shoe.geometry.attributes.position.count; i++) {
        const p = shoe
          .getVertexPosition(i, new THREE.Vector3())
          .applyMatrix4(shoe.matrixWorld);
        lowest = Math.min(lowest, p.y);
      }
      heights.push(lowest);
      assert.ok(lowest > -0.012, `${clip.name}: sunken shoe at ${lowest}`);
      const p = hips.getWorldPosition(new THREE.Vector3());
      first ??= p;
      assert.ok(
        Math.abs(p.x - first.x) < 0.00001 && Math.abs(p.z - first.z) < 0.00001,
      );
    }
    const peak = Math.max(...heights);
    if (clip.name === "Run") {
      assert.ok(peak > 0.05 && peak < 0.1, `running flight peak: ${peak}`);
      assert.ok(
        heights.filter((h) => h < 0.01).length > 30,
        "running lost ground contact",
      );
    } else assert.ok(peak < 0.025, `${clip.name}: floating shoe at ${peak}`);
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
test("shoulder aim follows elevation while preserving arm lengths and the pistol grip", async () => {
  const game = await groundedActor();
  game.aiming = true;
  game.aimUntil = 100;
  const bones = [];
  game.rig.model.traverse((b) => {
    if (b.isBone) bones.push([b, b.position.clone(), b.scale.clone()]);
  });
  for (const yaw of [0, Math.PI / 2, Math.PI])
    for (const pitch of [-0.55, 0, 0.6]) {
      game.yaw = game.aimYaw = yaw;
      game.aimPoint = new THREE.Vector3(
        -Math.sin(yaw) * 30,
        1.34 + Math.tan(pitch) * 30,
        -Math.cos(yaw) * 30,
      );
      animateExplorer(game, 1 / 60, false, false);
      const hand = game.rig.model
        .getObjectByName("mixamorigRightHand")
        .getWorldPosition(new THREE.Vector3());
      assert(hand.distanceTo(game.rig.weapon.group.position) < 0.055);
      const direction = game.rig.weapon.group.getWorldDirection(
        new THREE.Vector3(),
      );
      assert(
        direction.dot(
          game.aimPoint.clone().sub(game.rig.weapon.group.position).normalize(),
        ) > 0.999,
      );
      for (const [bone, position, scale] of bones) {
        if (/Arm|ForeArm|Hand/.test(bone.name))
          assert(bone.position.distanceTo(position) < 1e-6, bone.name);
        assert(bone.scale.distanceTo(scale) < 1e-6, bone.name);
        assert(bone.quaternion.toArray().every(Number.isFinite));
      }
    }
});
test("locomotion selects a jog at travel speed, a faster sprint, and a quiet pose while swimming", () => {
  const g = { grounded: true, moveVelocity: { x: 6, z: 0 } };
  const jog = explorerGait(g, true, false);
  assert.equal(jog.name, "Run");
  assert(jog.rate > 1 && jog.rate < 1.4);
  g.moveVelocity.x = 10;
  const sprint = explorerGait(g, true, true);
  assert.equal(sprint.name, "Run");
  assert(sprint.rate > jog.rate && sprint.rate < 2);
  g.moveVelocity.x = 2.4;
  const walk = explorerGait(g, true, false);
  assert.equal(walk.name, "Walk");
  assert(walk.rate > 1.2 && walk.rate < 1.5);
  g.actualMoveSpeed = 0.8;
  assert(explorerGait(g, true, false).rate < walk.rate / 2);
  g.swimming = true;
  assert.deepEqual(explorerGait(g, true, true), { name: "Idle", rate: 1 });
});

test("blocked input settles the delivered explorer into idle and movement restarts the stride", async () => {
  const game = await groundedActor();
  game.moveVelocity.z = 6;
  game.actualMoveSpeed = 6;
  for (let frame = 0; frame < 30; frame++) {
    game.player.position.z += 0.1;
    animateExplorer(game, 1 / 60, true, false);
  }
  assert.equal(game.rig.state, "Run");
  game.actualMoveSpeed = 0;
  const position = game.player.position.clone();
  for (let frame = 0; frame < 30; frame++)
    animateExplorer(game, 1 / 60, true, true);
  assert.equal(game.rig.state, "Idle");
  assert.ok(game.rig.actions.Idle.getEffectiveWeight() > 0.99);
  assert.ok(game.player.position.equals(position));
  assert.ok(soleClearances(game).every((gap) => gap > -0.012 && gap < 0.045));
  game.actualMoveSpeed = 2.4;
  animateExplorer(game, 1 / 60, true, false);
  assert.equal(game.rig.state, "Walk");
  game.actualMoveSpeed = 10;
  animateExplorer(game, 1 / 60, true, true);
  assert.equal(game.rig.state, "Run");
  assert(game.rig.actions.Run.getEffectiveTimeScale() > 1.5);
  assert(game.rig.actions.Run.getEffectiveTimeScale() < 2);
  game.actualMoveSpeed = 0;
  game.blockGrip = { move: { pull: true } };
  game.moveVelocity.z = 1.8;
  assert.deepEqual(explorerGait(game, true, false), {
    name: "Walk",
    rate: -0.75,
  });
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
    groundHeight: () => 0,
    obstacles: [],
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

test("cleft hanging fits the delivered hand surfaces and releases its finger pose without stretching bones", async () => {
  const game = await groundedActor();
  game.grounded = false;
  game.avatar.rotation.y = Math.PI;
  game.player.position.set(8, 5, 0.87);
  game.cleft = { nodes: [{ grip: new THREE.Vector3(8, 6.9, 0.32) }] };
  game.wallGrip = { kind: "hang", node: 0 };
  const bones = [];
  game.rig.model.traverse((b) => {
    if (b.isBone && /Arm|Hand|UpLeg|Leg|Foot/.test(b.name))
      bones.push({
        bone: b,
        position: b.position.clone(),
        scale: b.scale.clone(),
      });
  });
  for (let i = 0; i < 10; i++) animateExplorer(game, 1 / 60, false, false);
  const handles = cleftHandTargets(game).map((p) => {
    const h = new THREE.Object3D();
    h.position.copy(p);
    h.rotation.y = Math.PI;
    return h;
  });
  const measured = handGeometry(game, { handles, halfLength: 0.2 });
  for (const hand of measured)
    for (const [name, finger] of Object.entries(hand.fingers)) {
      assert(finger.vertices > 200);
      assert(
        finger.minimum >= -0.002,
        `${hand.side}/${name} penetrates ${finger.minimum}`,
      );
      assert(
        finger.minimum < 0.012,
        `${hand.side}/${name} misses ${finger.minimum}`,
      );
    }
  for (const { bone, position, scale } of bones) {
    assert(bone.position.distanceTo(position) < 1e-7);
    assert(bone.scale.distanceTo(scale) < 1e-7);
    assert(bone.quaternion.toArray().every(Number.isFinite));
  }
  game.wallGrip = null;
  game.grounded = true;
  animateExplorer(game, 1 / 60, false, false);
  assert.equal(game.rig.gripBaseActive, false);
});

test("cleft return descent keeps both hands on the inclined rope", async () => {
  const g = await groundedActor();
  g.grounded = false;
  g.avatar.rotation.y = Math.PI;
  g.cleft = {
    returnLineStart: new THREE.Vector3(13, 19.9, 2.7),
    returnLineEnd: new THREE.Vector3(13, 0.25, 6.5),
  };
  g.wallGrip = { kind: "rappel", time: 1, duration: 7 };
  const axis = g.cleft.returnLineStart
    .clone()
    .sub(g.cleft.returnLineEnd)
    .normalize();
  for (const y of [18, 12, 5, 0.18]) {
    const z = 2.7 + ((19.9 - y - 1.8) * 3.8) / 19.65 + 0.15;
    g.player.position.set(13, y, z);
    animateExplorer(g, 1 / 60, false, false);
    const handles = cleftHandTargets(g).map((p) => {
      const h = new THREE.Object3D();
      h.position.copy(p);
      h.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis);
      return h;
    });
    for (const hand of handGeometry(g, { handles, halfLength: 0.14 }))
      for (const [name, f] of Object.entries(hand.fingers)) {
        assert(
          f.minimum >= -0.002,
          `${y}/${hand.side}/${name} penetrates ${f.minimum}`,
        );
        assert(
          f.minimum < 0.012,
          `${y}/${hand.side}/${name} misses ${f.minimum}`,
        );
      }
  }
});

test("delivered hands follow all nine shutter catches through reach, ratchet turn and release with fixed bone lengths", async (t) => {
  const game = await groundedActor();
  Object.assign(game, {
    level: LEVELS[2],
    map: createMap(LEVELS[2]),
    progress: { stage: 5, field: [], shutterHouse: { turns: [0, 0, 0] } },
    world: new THREE.Group(),
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    keys: new Set(),
    health: 100,
    audio: { tone() {} },
    cb: {},
    save() {},
    canMove: Adventure.prototype.canMove,
    walkable: () => true,
    box: Adventure.prototype.box,
    shadow: Adventure.prototype.shadow,
  });
  game.world.add(game.player);
  game.items = game.map.features.filter((f) => f.shutterHeight !== undefined);
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  try {
    for (const f of game.items) {
      f.group = new THREE.Group();
      f.group.position.set(f.x * 7, 0, f.z * 7);
      game.world.add(f.group);
      buildShutterStation(game, f, f.group);
    }
    buildShutterHouse(game);
  } finally {
    globalThis.document = old;
  }
  const bones = [];
  game.rig.model.traverse((bone) => {
    if (bone.isBone)
      bones.push({
        bone,
        position: bone.position.clone(),
        scale: bone.scale.clone(),
      });
  });
  let samples = 0,
    minimum = Infinity,
    contactMaximum = -Infinity;
  for (let index = 0; index < 3; index++) {
    game.player.position.copy(shutterStance(game, index));
    game.avatar.rotation.y = Math.PI;
    for (let i = 0; i < 30; i++) animateExplorer(game, 1 / 60, false, false);
    for (let catchIndex = 0; catchIndex < 3; catchIndex++) {
      assert(startShutterTurn(game, index));
      for (let i = 0; i < 115; i++) {
        game.elapsed += 1 / 60;
        updateShutterHouse(game, 1 / 60);
        advanceShutterTurn(game, 1 / 60, { x: 0, z: 0 });
        animateExplorer(game, 1 / 60, false, false);
        for (const { bone, position, scale } of bones) {
          if (/(?:Arm|ForeArm|Hand.*)$/.test(bone.name))
            assert(bone.position.distanceTo(position) < 1e-7);
          assert(bone.scale.distanceTo(scale) < 1e-7);
          assert(bone.quaternion.toArray().every(Number.isFinite));
        }
        const op = game.shutterHouse.turn;
        if (!op || i % 6) continue;
        samples++;
        const phase = shutterTurnPhase(op),
          contact =
            phase >= SHUTTER_WHEEL.turnStart && phase <= SHUTTER_WHEEL.detent;
        for (const hand of handGeometry(game, {
          handles: game.items[index].shutterGrips,
          halfLength: 0.1,
        })) {
          for (const [part, m] of Object.entries(hand.fingers)) {
            minimum = Math.min(minimum, m.minimum);
            assert(
              m.minimum > -0.002,
              `${index}/${catchIndex}/${i}/${hand.side}/${part}: penetrates ${m.minimum}`,
            );
            if (contact) {
              contactMaximum = Math.max(contactMaximum, m.minimum);
              assert(
                m.minimum < 0.004,
                `${index}/${catchIndex}/${i}/${hand.side}/${part}: separated ${m.minimum}`,
              );
            }
          }
        }
      }
      assert.equal(game.shutterHouse.turn, null);
      assert.equal(game.rig.gripBaseActive, false);
      assert.equal(game.shutterHouse.saved.turns[index], catchIndex + 1);
    }
  }
  assert(samples >= 150);
  assert.deepEqual(game.progress.field, [
    "field-5-0",
    "field-5-1",
    "field-5-2",
  ]);
  t.diagnostic(JSON.stringify({ samples, minimum, contactMaximum }));
});
