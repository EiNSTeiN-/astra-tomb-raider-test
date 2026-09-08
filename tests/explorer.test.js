import test from "node:test";
import { poseCounterweight } from "../src/counterweights.js";
import assert from "node:assert/strict";
import { NodeIO } from "@gltf-transform/core";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";
import { animateExplorer, explorerGait } from "../src/explorer.js";
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
  assert.equal(samples, 396);
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
