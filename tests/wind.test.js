import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { CameraSurfaces, constrainCamera } from "../src/camera-collision.js";
import { buildFieldGates } from "../src/field-world.js";
import { buildCounterweights } from "../src/counterweights.js";
import {
  createPuzzle,
  restorePuzzle,
  applyMove,
  isSolved,
  hint,
} from "../src/puzzles.js";
import {
  WIND_TRIALS,
  windLayout,
  traceWind,
  windSolution,
  normalizeWind,
  WIND_PORTS,
  rotateWind,
} from "../src/wind-rules.js";
import {
  buildWindCourts,
  updateWindCourts,
  settleWind,
  windReady,
  windInteract,
  advanceWindApproach,
  saveWindState,
  focusWind,
} from "../src/wind-courts.js";
import { updateSoundSources } from "../src/sound-landmarks.js";
import { syncWindCourt } from "../src/wind-rendering.js";
import { buildWaterSurfaces } from "../src/water-surface.js";
import { waterAt } from "../src/hydrology.js";
import { advanceSwimming, restoreWaterArrival } from "../src/water-motion.js";
import { arrivalCamera } from "../src/camera-arrival.js";
import { windCameraStandoff, windCameraSpace } from "../src/wind-camera.js";
import { NodeIO } from "@gltf-transform/core";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { animateExplorer } from "../src/explorer.js";
import { handGeometry } from "../scripts/inspect-hand-geometry.js";
import { strideSoles, sampleStrideSoles } from "../scripts/inspect-stride.js";
import { supportAt } from "../src/character-motion.js";
const level = LEVELS[5];
function fixture(t, saved = null) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({ fillText() {}, clearRect() {} }),
    }),
  };
  t.after(() => (globalThis.document = old));
  const data = new Map(),
    storage = {
      getItem: (k) => data.get(k),
      setItem: (k, v) => data.set(k, v),
    },
    store = new SaveStore(storage),
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    world = new THREE.Group();
  const progress = store.level(level.id);
  if (saved) Object.assign(progress, saved);
  const game = Object.assign(Object.create(Adventure.prototype), {
    store,
    map,
    level,
    progress,
    world,
    terrainProfile: terrain,
    groundHeight: terrain.height,
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    items: [],
    obstacles: [],
    waterMeshes: [],
    flames: [],
    skyBridges: [],
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    glowMat: new THREE.MeshStandardMaterial(),
    cameraSurfaces: new CameraSurfaces(world),
    camera: new THREE.PerspectiveCamera(58, 900 / 650, 0.1, 1000),
    sun: new THREE.DirectionalLight(),
    renderer: { domElement: { clientWidth: 900, clientHeight: 650 } },
    keys: new Set(),
    paused: false,
    health: 100,
    medkits: 3,
    jumpY: 0,
    grounded: true,
    explored: new Set(),
    checkpoint: { x: 84, z: 112 },
    sense: 0,
    elapsed: 0,
    presentationRemaining: 0,
    traversalCourses: [],
    clock: { getDelta: () => 0 },
    cb: { toast() {}, saved() {}, puzzle() {} },
    audio: { setMode() {}, resume() {}, tone() {}, noiseHit() {} },
  });
  for (const f of map.features.filter((f) => f.type === "mechanism")) {
    f.group = new THREE.Group();
    f.group.position.set(f.x * 7, terrain.height(f.x * 7, f.z * 7), f.z * 7);
    world.add(f.group);
    f.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), game.glowMat);
    f.group.add(f.marker);
    if (f.stage === 0) buildCounterweights(game, f, f.group);
    else {
      game.cylinder(1.8, 2.1, 0.8, game.darkMat, 0, 0.5, 0, f.group);
      f.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), game.glowMat);
      f.group.add(f.core);
    }
    game.items.push(f);
  }
  buildFieldGates(game);
  buildWaterSurfaces(game);
  buildWindCourts(game);
  game.cameraSurfaces.rebuild();
  game.soundSources = game.windSources.map((s) => ({ ...s }));
  t.after(() => world.traverse((o) => o.geometry?.dispose()));
  return { game, storage };
}
function ready(game, stage = 1) {
  game.progress.stage = stage;
  game.progress.completed = false;
  game.progress.field = [0, 1, 2].map((i) => `field-${stage}-${i}`);
  game.counterweights.saved.solved = true;
  settleWind(game);
  return game.windSites[stage];
}
function use(game, site, index) {
  const f = index < 0 ? site.tablet : site.nodes[index].control;
  game.player.position.copy(f.group.position);
  game.nearest = f;
  game.keys.clear();
  return windInteract(game);
}

test("wind-camera bounds preserve diagonal working views and guard receiver blades and tablets", (t) => {
  const { game } = fixture(t),
    site = game.windSites[2];
  ready(game, 2);
  for (const index of [6, 9, 11]) {
    game.player.position.copy(site.nodes[index].control.group.position);
    updateWindCourts(game, 0);
    assert.equal(site.detail.visible, true);
    const target = site.nodes[index].control.group.position
        .clone()
        .add(new THREE.Vector3(0, 1.3, 0)),
      yaw = 2.2,
      camera = arrivalCamera(
        target,
        { yaw, pitch: 0.13 },
        game.cameraSurfaces,
        (p) => game.cameraSpace(p),
      ).position;
    assert.ok(
      camera.distanceTo(target) > 2.2,
      `node ${index}: retains a third-person view`,
    );
    assert.ok(
      game.cameraSurfaces.entry(target, camera, 0) >= 0.999,
      `node ${index}: no casting crossed`,
    );
  }
  const fan = site.fans.find((fan) => fan.receiver).spinner.parent;
  fan.updateWorldMatrix(true, false);
  const a = fan.localToWorld(new THREE.Vector3(0.5, 0.3, -2)),
    b = fan.localToWorld(new THREE.Vector3(0.5, 0.3, 2));
  assert.ok(
    game.cameraSurfaces.entry(a, b, 0) < 0.5,
    "camera cannot pass through the spinning blade envelope",
  );
  const outsideA = fan.localToWorld(new THREE.Vector3(1.02, 1.02, -2)),
    outsideB = fan.localToWorld(new THREE.Vector3(1.02, 1.02, 2));
  assert.equal(
    game.cameraSurfaces.entry(outsideA, outsideB, 0),
    1,
    "empty corner outside the circular frame remains clear",
  );
  for (const other of game.windSites) {
    game.player.position.copy(other.tablet.group.position);
    updateWindCourts(game, 0);
    const a = other.root.localToWorld(
        new THREE.Vector3(
          -10.5,
          game.groundHeight(
            other.root.position.x - 10.5,
            other.root.position.z + 21.5,
          ) -
            other.root.position.y +
            0.65,
          20.1,
        ),
      ),
      b = a.clone().add(new THREE.Vector3(0, 0, 3));
    assert.ok(
      game.cameraSurfaces.entry(a, b, 0) < 1,
      `stage ${other.stage}: inscription blocks the camera`,
    );
  }
});

test("wind working views retain camera separation through moving grips and fade the look offset away from machinery", (t) => {
  const { game } = fixture(t);
  let samples = 0,
    wheels = 0,
    minimum = Infinity;
  for (const site of game.windSites) {
    ready(game, site.stage);
    for (const node of site.nodes) {
      if (!node.control) continue;
      settleWind(game);
      game.player.position.copy(node.control.group.position);
      const root = game.player.position.clone();
      assert(Math.abs(windCameraStandoff(game) - 0.14) < 1e-10);
      for (let turn = 0; turn < 4; turn++) {
        game.nearest = node.control;
        assert(windInteract(game));
        for (const dt of [0, 0.15, 0.65]) {
          updateWindCourts(game, dt);
          const chest = root.clone().add(new THREE.Vector3(0, 1.3, 0)),
            standoff = windCameraStandoff(game),
            target = root
              .clone()
              .add(new THREE.Vector3(0, 1.3, windCameraStandoff(game)));
          for (let orbit = 0; orbit < 8; orbit++) {
            const yaw = 2.2 + (orbit * Math.PI) / 4,
              desired = target
                .clone()
                .add(
                  new THREE.Vector3(
                    Math.sin(yaw) * Math.cos(0.13) * 5.3,
                    Math.sin(0.13) * 5.3 + 0.2,
                    Math.cos(yaw) * Math.cos(0.13) * 5.3,
                  ),
                ),
              camera = constrainCamera(
                target,
                desired,
                game.cameraSurfaces,
                (point) => windCameraSpace(game, point, chest, standoff),
              );
            const arm = camera.distanceTo(target);
            minimum = Math.min(minimum, arm);
            // Headings toward a close casting can legitimately become a
            // first-person view, but must not collapse to the look point.
            assert(
              arm > 0.05,
              `${site.stage}/${node.index}/${turn}/${orbit}: view collapses`,
            );
            assert(game.cameraSpace(camera));
            assert(game.cameraSurfaces.entry(target, camera, 0) >= 0.999);
            assert(game.cameraSurfaces.entry(chest, camera, 0) >= 0.999);
            samples++;
          }
          if (site.stage === 2 && [6, 11].includes(node.index)) {
            const yaw =
                node.index === 6 ? 1.600448898838987 : 1.606787818127785,
              desired = target
                .clone()
                .add(
                  new THREE.Vector3(
                    Math.sin(yaw) * Math.cos(0.13) * 5.3,
                    Math.sin(0.13) * 5.3 + 0.2,
                    Math.cos(yaw) * Math.cos(0.13) * 5.3,
                  ),
                ),
              camera = constrainCamera(
                target,
                desired,
                game.cameraSurfaces,
                (point) => windCameraSpace(game, point, chest, standoff),
              );
            assert(
              camera.distanceTo(target) > 2.2,
              `native view ${node.index}/${turn} loses the explorer`,
            );
          }
          assert(game.player.position.equals(root));
        }
      }
      wheels++;
    }
  }
  assert.equal(wheels, 110);
  assert.equal(samples, 10560);
  t.diagnostic(`Minimum constrained orbit arm: ${minimum} m`);
  const pad = game.windSites[2].nodes[6].control.group.position;
  game.player.position.copy(pad);
  game.swimming = true;
  assert.equal(windCameraStandoff(game), 0);
  game.swimming = false;
  game.player.position.y += 1.5;
  assert.equal(windCameraStandoff(game), 0);
  game.player.position.copy(pad);
  game.player.position.z += 1.3;
  assert.equal(windCameraStandoff(game), 0);
  game.player.position.copy(pad);
  const offsets = [];
  for (let dx = 0; dx <= 1.3; dx += 0.05) {
    game.player.position.x = pad.x + dx;
    offsets.push(windCameraStandoff(game));
  }
  assert(offsets.slice(1).every((value, i) => value <= offsets[i] + 1e-12));
  assert(
    offsets.slice(1).every((value, i) => Math.abs(value - offsets[i]) < 0.025),
  );
});

test("all working wind wheels fit the delivered hands through four legal turns without stretching the rig or losing planted feet", async (t) => {
  const { game } = fixture(t),
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
    );
  game.player.add(game.avatar);
  game.avatar.add(scene);
  game.world.add(game.player);
  const mixer = new THREE.AnimationMixer(scene),
    actions = {};
  for (const clip of animations) actions[clip.name] = mixer.clipAction(clip);
  actions.Idle.play();
  game.rig = {
    model: scene,
    mixer,
    actions,
    state: "Idle",
    weapon: { group: new THREE.Group() },
  };
  game.moveVelocity = { x: 0, z: 0 };
  game.actualMoveSpeed = 0;
  const soles = strideSoles(scene),
    bones = [];
  scene.traverse((bone) => {
    if (bone.isBone)
      bones.push({
        bone,
        position: bone.position.clone(),
        scale: bone.scale.clone(),
      });
  });
  let controls = 0,
    poses = 0;
  for (const site of game.windSites) {
    ready(game, site.stage);
    for (const node of site.nodes) {
      if (!node.control) continue;
      game.player.position.copy(node.control.group.position);
      const root = game.player.position.clone();
      game.avatar.rotation.y = 0;
      game.rig.grounding = undefined;
      game.windGrip = null;
      animateExplorer(game, 1 / 60, false, false);
      for (let turn = 0; turn < 4; turn++) {
        settleWind(game);
        game.nearest = node.control;
        const moves = site.state.moves;
        assert(windInteract(game));
        assert.equal(site.state.moves, moves + 1);
        for (const dt of [1 / 60, 0.05, 0.15, 0.15, 0.15]) {
          game.elapsed += dt;
          animateExplorer(game, dt, false, false);
          updateWindCourts(game, dt);
          assert(game.player.position.equals(root));
          for (const { bone, position, scale } of bones) {
            if (/(?:Arm|ForeArm|Hand.*)$/.test(bone.name))
              assert(bone.position.distanceTo(position) < 1e-7, bone.name);
            assert(bone.scale.distanceTo(scale) < 1e-7, bone.name);
            assert(bone.quaternion.toArray().every(Number.isFinite), bone.name);
          }
          for (const hand of handGeometry(game, {
            handles: game.windGrip.order.map((i) => node.handles[i]),
            halfLength: 0.08,
          }))
            for (const [name, measurement] of Object.entries(hand.fingers)) {
              assert(
                measurement.minimum > -0.002,
                `${site.stage}/${node.index}/${turn}/${name}: enters grip ${measurement.minimum}`,
              );
              assert(
                measurement.minimum < (name === "Palm" ? 0.011 : 0.004),
                `${site.stage}/${node.index}/${turn}/${name}: loses grip ${measurement.minimum}`,
              );
            }
          for (const points of sampleStrideSoles(soles)) {
            const clearance = Math.min(
              ...points.map(
                (point) =>
                  point.y -
                  supportAt(game, point.x, point.z, root.y + 0.45).height,
              ),
            );
            assert(
              clearance > -0.012 && clearance < 0.045,
              `${site.stage}/${node.index}: boot ${clearance}`,
            );
          }
          poses++;
        }
        updateWindCourts(game, 0.1);
        assert.equal(game.windGrip, null);
        animateExplorer(game, 1 / 60, false, false);
        assert.equal(game.rig.gripBaseActive, false);
      }
      controls++;
    }
  }
  assert.equal(controls, 110);
  assert.equal(poses, 2200);

  // Exercise the real rendered hands after walking into the stance, including
  // arrivals retained within the ordinary route planner's 2 cm tolerance.
  const site = ready(game, 2),
    node = site.nodes[6];
  for (const offset of [
    [0, 0.8],
    [0.6, 0],
    [-0.6, 0],
    [0.014, 0.014],
  ]) {
    settleWind(game);
    game.player.position.copy(node.control.group.position);
    game.player.position.x += offset[0];
    game.player.position.z += offset[1];
    game.player.position.y = game.groundHeight(
      game.player.position.x,
      game.player.position.z,
    );
    const from = game.player.position.clone(),
      moves = site.state.moves;
    game.rig.grounding = undefined;
    game.actualMoveSpeed = 0;
    animateExplorer(game, 0.3, false, false);
    game.nearest = node.control;
    assert(windInteract(game));
    if (Math.hypot(...offset) > 0.02) {
      assert(game.windApproach);
      assert.equal(game.windGrip, null);
      assert.equal(site.state.moves, moves);
    } else assert(game.player.position.equals(from));
    let gripFrames = 0;
    for (let frame = 0; frame < 90; frame++) {
      const before = game.player.position.clone();
      advanceWindApproach(game, 1 / 60, { x: 0, z: 0 });
      game.elapsed += 1 / 60;
      animateExplorer(
        game,
        1 / 60,
        Math.hypot(game.moveVelocity.x, game.moveVelocity.z) > 0.1,
        false,
      );
      updateWindCourts(game, 1 / 60);
      assert(
        game.player.position.distanceTo(before) < 0.05,
        "ordinary walking steps",
      );
      if (!game.windGrip) continue;
      assert.equal(site.state.moves, moves + 1);
      const grip = game.windGrip;
      game.nearest = node.control;
      assert(windInteract(game), "repeated input is consumed");
      assert.equal(
        game.windGrip,
        grip,
        "an ongoing turn keeps its hand assignment",
      );
      assert.equal(
        site.state.moves,
        moves + 1,
        "repeated input does not overlap turns",
      );
      for (const hand of handGeometry(game, {
        handles: grip.order.map((i) => node.handles[i]),
        halfLength: 0.08,
      }))
        for (const [name, contact] of Object.entries(hand.fingers)) {
          assert(
            contact.minimum > -0.002,
            `${offset}/${name}: enters grip ${contact.minimum}`,
          );
          assert(
            contact.minimum < (name === "Palm" ? 0.011 : 0.004),
            `${offset}/${name}: loses grip ${contact.minimum}`,
          );
        }
      for (const points of sampleStrideSoles(soles)) {
        const gap = Math.min(
          ...points.map(
            (point) =>
              point.y -
              supportAt(game, point.x, point.z, game.player.position.y + 0.45)
                .height,
          ),
        );
        assert(gap > -0.012 && gap < 0.045, `${offset}: boot ${gap}`);
      }
      gripFrames++;
    }
    assert(gripFrames >= 30);
    assert.equal(site.state.moves, moves + 1);
    assert.equal(game.windApproach, null);
    assert.equal(game.windGrip, null);
    assert(
      game.player.position.distanceTo(node.control.group.position) < 0.021,
    );
    assert(windInteract(game), "settled wheel can turn again");
    assert.equal(site.state.moves, moves + 2);
  }
});

test("all 110 working wheels accept a clear walking approach and commit only after arrival", (t) => {
  const { game } = fixture(t);
  let controls = 0;
  for (const site of game.windSites) {
    ready(game, site.stage);
    for (const node of site.nodes) {
      if (!node.control) continue;
      settleWind(game);
      game.player.position.copy(node.control.group.position);
      game.player.position.z += 0.8;
      game.player.position.y = game.groundHeight(
        game.player.position.x,
        game.player.position.z,
      );
      const moves = site.state.moves;
      game.nearest = node.control;
      assert(windInteract(game));
      assert(game.windApproach, `${site.stage}/${node.index}: approach starts`);
      assert.equal(site.state.moves, moves);
      assert.equal(game.windGrip, null);
      for (let i = 0; i < 60 && game.windApproach; i++) {
        const before = game.player.position.clone();
        assert(advanceWindApproach(game, 1 / 60, { x: 0, z: 0 }));
        updateWindCourts(game, 1 / 60);
        assert(game.player.position.distanceTo(before) < 0.05);
        assert(
          game.canMove(
            game.player.position.x,
            game.player.position.z,
            game.jumpY,
          ),
        );
        assert(game.grounded);
        if (game.windApproach) assert.equal(site.state.moves, moves);
      }
      assert.equal(game.windApproach, null);
      assert.equal(site.state.moves, moves + 1);
      assert(
        game.player.position.distanceTo(node.control.group.position) < 0.005,
      );
      controls++;
    }
  }
  assert.equal(controls, 110);
});

test("wind approaches respect solids and interruption, free hands, pause and save boundaries", (t) => {
  const { game, storage } = fixture(t),
    site = ready(game, 2),
    node = site.nodes[6];
  const start = () => {
    settleWind(game);
    game.player.position.copy(node.control.group.position);
    game.player.position.z += 0.8;
    game.player.position.y = game.groundHeight(
      game.player.position.x,
      game.player.position.z,
    );
    game.nearest = node.control;
    game.keys.clear();
    assert(windInteract(game));
    assert(game.windApproach);
    assert(advanceWindApproach(game, 0.05, { x: 0, z: 0 }));
  };
  for (const interruption of [
    "movement",
    "jump",
    "crouch",
    "carry",
    "swim",
    "damage",
    "stage",
  ]) {
    start();
    const before = game.player.position.clone();
    if (interruption === "jump") game.keys.add("Space");
    if (interruption === "crouch") game.crouching = true;
    if (interruption === "carry") game.carrying = true;
    if (interruption === "swim") game.swimming = true;
    if (interruption === "damage") game.health = 0;
    if (interruption === "stage") game.progress.stage = 3;
    assert.equal(
      advanceWindApproach(game, 0.05, {
        x: interruption === "movement" ? 1 : 0,
        z: 0,
      }),
      false,
    );
    assert.equal(game.windApproach, null);
    assert.equal(game.windGrip, null);
    assert(game.player.position.equals(before));
    assert.equal(site.state.moves, 0);
    Object.assign(game, {
      health: 100,
      crouching: false,
      carrying: false,
      swimming: false,
    });
    game.progress.stage = 2;
  }
  start();
  game.setPaused(true);
  assert.equal(game.windApproach, null);
  assert.equal(site.state.moves, 0);
  game.setPaused(false);
  const blocker = {
    x: node.control.group.position.x,
    z: node.control.group.position.z + 0.4,
    w: 0.2,
    d: 0.1,
    h: 2,
  };
  game.obstacles.push(blocker);
  game.player.position
    .copy(node.control.group.position)
    .add(new THREE.Vector3(0, 0, 0.8));
  assert(windInteract(game));
  assert.equal(game.windApproach, null);
  assert.equal(site.state.moves, 0);
  game.obstacles.pop();
  start();
  game.save();
  const saved = new SaveStore(storage).level("sky");
  assert.equal(
    saved.wind?.[2],
    undefined,
    "approaching does not save an unperformed turn",
  );
  assert.equal(saved.windApproach, undefined);
  settleWind(game);
  game.player.position.copy(node.control.group.position);
  for (const busy of [
    "crouching",
    "carrying",
    "swimming",
    "diving",
    "blockGrip",
    "climb",
    "ropeRide",
    "zipRide",
    "dodge",
  ]) {
    game[busy] = true;
    assert(windInteract(game));
    assert.equal(site.state.moves, 0, busy);
    assert.equal(game.windGrip, null, busy);
    game[busy] = false;
  }
  game.progress.torch = true;
  assert(windInteract(game));
  assert.equal(
    game.progress.torch,
    false,
    "a lit torch is put out to free both hands",
  );
  assert.equal(site.state.moves, 1);
});

test("every wind control stays usable through water arrival and swimming updates", (t) => {
  const { game } = fixture(t);
  let opened = 0;
  game.cb.puzzle = () => opened++;
  let checked = 0;
  for (const site of game.windSites) {
    ready(game, site.stage);
    for (const f of [
      site.tablet,
      ...site.nodes.map((n) => n.control).filter(Boolean),
    ]) {
      for (const dx of [-0.3, 0, 0.3])
        for (const dz of [-0.3, 0, 0.3]) {
          const x = f.x * 7 + dx,
            z = f.z * 7 + dz;
          assert.equal(waterAt(game, x, z), null, f.id);
        }
      game.player.position.copy(f.group.position);
      restoreWaterArrival(game);
      assert.equal(game.swimming, false, f.id);
      assert.equal(
        advanceSwimming(game, { x: 0, z: 0 }, 1 / 60, false),
        false,
        f.id,
      );
      game.nearest = f;
      const moves = site.state.moves;
      game.setPaused(false);
      assert.equal(windInteract(game), true, f.id);
      if (f.kind !== "tablet") assert.equal(site.state.moves, moves + 1, f.id);
      updateWindCourts(game, 1);
      checked++;
    }
  }
  assert.equal(checked, 119);
  assert.equal(opened, 9);
});

test("nine distinct wind routes solve through legal rotations, preserve fixed castings and use varied terraces", () => {
  assert.equal(new Set(WIND_TRIALS.map((t) => t.path.join(","))).size, 9);
  assert.equal(
    new Set(WIND_TRIALS.map((t) => `${t.columns}x${t.rows}`)).size,
    4,
  );
  for (let stage = 0; stage < 9; stage++) {
    const state = createPuzzle(level, stage),
      fixed = state.fixed.map((i) => state.values[i]);
    assert.ok(!isSolved(state));
    for (const i of windSolution(state)) applyMove(state, { index: i });
    assert.ok(isSolved(state), `stage ${stage}`);
    assert.deepEqual(traceWind(state).cells, state.path);
    assert.deepEqual(
      state.fixed.map((i) => state.values[i]),
      fixed,
    );
    assert.match(hint(state, level), /receiver/);
  }
});
test("wind cannot wrap row edges, jump closed mouths, turn braced ducts or change castings", () => {
  const s = windLayout(3);
  s.values = [...s.target];
  assert.ok(traceWind(s).hit);
  s.values[0] = 3;
  assert.equal(traceWind(s).hit, false);
  assert.equal(traceWind(s).cells.length, 0);
  s.values[0] = 10;
  s.values[1] = 10;
  s.values[2] = 10;
  s.values[3] = 10;
  assert.deepEqual(traceWind(s).cells, [0, 1, 2, 3]);
  assert.equal(traceWind(s).hit, false);
  const t = createPuzzle(level, 4),
    before = structuredClone(t);
  for (const index of [-1, 99, 0.5, NaN, ...t.fixed])
    assert.equal(applyMove(t, { index }).kind, "ignored");
  assert.deepEqual(t, before);
  for (let i = 0; i < t.values.length; i++) {
    const value = t.values[i];
    for (let n = 0; n < 4; n++) applyMove(t, { index: i });
    assert.equal(t.values[i], value);
  }
});
test("wind saves reject malformed shapes and changed fixed bearings while preserving partial legal turns", () => {
  const s = createPuzzle(level, 7);
  applyMove(s, { index: 0 });
  const p = normalizeSave({
    version: 1,
    levels: { sky: { wind: { 7: s } }, crystal: { wind: { 7: s } } },
  });
  assert.deepEqual(p.levels.sky.wind[7].values, s.values);
  assert.deepEqual(p.levels.crystal.wind, {});
  assert.deepEqual(
    restorePuzzle(level, 7, p.levels.sky.wind[7]).values,
    s.values,
  );
  s.values[0] = 15;
  assert.deepEqual(normalizeWind({ 7: s }), {});
  s.values = [...s.target];
  s.values[s.fixed[0]] = rotateWind(s.values[s.fixed[0]]);
  assert.deepEqual(normalizeWind({ 7: s }), {});
  assert.deepEqual(normalizeWind({ 0: { values: [5] } }), {});
});
test("all physical bearings remain accessible and retained after batching, with safe field and height gates", (t) => {
  const { game } = fixture(t);
  assert.equal(game.windSites.length, 9);
  assert.equal(game.windSources.length, 260);
  let wheels = 0;
  for (const site of game.windSites) {
    ready(game, site.stage);
    for (const n of site.nodes) {
      assert.ok(n.handles.every((h) => h.parent === n.wheel));
      if (!n.control) continue;
      wheels++;
      assert.ok(
        game.canMove(n.control.x * 7, n.control.z * 7, 0),
        `${site.stage}/${n.index} approach`,
      );
    }
    assert.ok(
      game.canMove(site.tablet.x * 7, site.tablet.z * 7, 0),
      `tablet ${site.stage}`,
    );
  }
  assert.equal(wheels, 110);
  const site = ready(game, 1),
    f = site.nodes[0].control;
  game.player.position.copy(f.group.position);
  game.nearest = f;
  game.progress.field = [];
  assert.ok(windInteract(game));
  assert.equal(game.progress.wind?.[1], undefined);
  ready(game, 1);
  game.player.position.y += 2;
  windInteract(game);
  assert.equal(game.progress.wind?.[1], undefined);
  game.player.position.copy(f.group.position);
  game.player.position.x += 5;
  windInteract(game);
  assert.equal(game.progress.wind?.[1], undefined);
  use(game, site, 0);
  assert.equal(game.progress.wind[1].moves, 1);
});
test("rendered mouths agree with saved ports after native clockwise turns and reload", (t) => {
  const { game, storage } = fixture(t),
    site = ready(game, 1);
  for (let step = 0; step < 5; step++) {
    use(game, site, 0);
    updateWindCourts(game, 2);
    site.root.updateMatrixWorld(true);
    const n = site.nodes[0],
      center = n.rotor.getWorldPosition(new THREE.Vector3());
    for (const q of [0, 1]) {
      const p = n.curve
        .getPoint(q)
        .applyMatrix4(n.rotor.matrixWorld)
        .sub(center);
      const port =
        Math.abs(p.x) > Math.abs(p.z) ? (p.x > 0 ? 2 : 8) : p.z > 0 ? 4 : 1;
      assert.ok(
        site.state.values[0] & port,
        `mouth ${port}, mask ${site.state.values[0]}`,
      );
    }
  }
  const saved = new SaveStore(storage).level("sky");
  assert.equal(saved.wind[1].moves, 5);
  assert.deepEqual(saved.wind[1].values, site.state.values);
  game.setPaused(true);
  assert.equal(game.windGrip, null);
  assert.equal(site.nodes[0].angle, site.nodes[0].goal);
});
test("connected air and turning receivers drive their positioned sources, then retire on another biome", (t) => {
  const { game } = fixture(t),
    site = ready(game, 7);
  let s = restorePuzzle(level, 7);
  for (const i of windSolution(s)) applyMove(s, { index: i });
  saveWindState(game, 7, s);
  updateWindCourts(game, 2);
  updateSoundSources(game);
  assert.ok(site.flow.hit);
  assert.ok(site.fans.find((f) => f.receiver).sound.activity > 0);
  assert.ok(
    game.soundSources.find((s) => s.id === "wind-7-receiver").activity > 0,
  );
  assert.equal(
    site.nodes.filter((n) => n.air.activity > 0).length,
    site.state.path.length,
  );
  const count = site.fans[1].spinner.rotation.z;
  updateWindCourts(game, 1);
  assert.ok(site.fans[1].spinner.rotation.z > count);
  game.level = LEVELS[6];
  buildWindCourts(game);
  assert.deepEqual(game.windSites, []);
  assert.deepEqual(game.windSources, []);
  assert.equal(game.windFocus, null);
});
test("focused controls keep every duct visible across desktop and phone camera formats", (t) => {
  const { game } = fixture(t);
  game.paused = true;
  for (const [width, height] of [
    [900, 650],
    [390, 844],
    [844, 390],
  ])
    for (const site of game.windSites) {
      Object.assign(game.renderer.domElement, {
        clientWidth: width,
        clientHeight: height,
      });
      game.camera.aspect = width / height;
      game.windFocus = site.stage;
      assert.ok(focusWind(game));
      game.camera.updateMatrixWorld();
      for (const n of site.nodes) {
        const p = new THREE.Vector3(n.x, site.airHeight + 0.4, n.z)
          .add(site.root.position)
          .project(game.camera);
        assert.ok(
          Math.abs(p.x) < 1 && Math.abs(p.y) < 1,
          `${width}/${site.stage}/${n.index}: ${p.toArray()}`,
        );
        if (width === 390) assert.ok(p.y > 0, "above controls");
        else assert.ok(p.x < 0.08, "left of the focused controls");
      }
    }
  game.windFocus = null;
  game.yaw = 0;
  game.pitch = 0.15;
  game.updateCamera(0.1);
  assert.equal(game.camera.fov, 58);
  assert.equal(game.camera.filmOffset, 0);
});

test("paused wind presentation turns machinery while character, health and elapsed play stay fixed", (t) => {
  const { game } = fixture(t),
    site = ready(game, 1);
  game.paused = true;
  const before = {
    position: game.player.position.clone(),
    health: game.health,
    time: game.progress.time,
  };
  const state = restorePuzzle(level, 1),
    event = applyMove(state, { index: 0 });
  saveWindState(game, 1, state, event);
  game.active = true;
  game.scene = new THREE.Scene();
  game.clock = { getDelta: () => 0.1 };
  game.updateCamera = () => {};
  game.updateDecorations = (dt, a, b) => updateWindCourts(game, b);
  game.updateAudio = () => {};
  game.renderScene = () => {};
  game.updatePlayer = () => assert.fail("paused player");
  game.updateEnemies = () => assert.fail("paused enemies");
  const old = site.nodes[0].angle;
  game.frame();
  assert.ok(
    site.nodes[0].angle > old && site.nodes[0].angle < site.nodes[0].goal,
  );
  assert.equal(game.health, before.health);
  assert.equal(game.progress.time, before.time);
  assert.ok(game.player.position.equals(before.position));
  for (const s of game.windSites)
    for (const n of s.nodes)
      assert.ok(s.airHeight - n.y - 0.31 >= 2.7, "ducts above head height");
});

test("wind batches retain every casting, collar and working wheel exactly once with the original geometry", (t) => {
  const { game } = fixture(t);
  ready(game, 7);
  updateWindCourts(game, 0.3);
  let wheels = 0,
    ducts = 0,
    collars = 0;
  for (const site of game.windSites) {
    const { batches, drivers } = site.rendering,
      expected = new Set(drivers.map((d) => d.source)),
      rendered = batches.flatMap((b) => b.slots.map((d) => d.source));
    assert.equal(
      rendered.length,
      expected.size,
      "one instance for each original part",
    );
    assert.deepEqual(new Set(rendered), expected);
    for (const batch of batches) {
      assert.equal(batch.mesh.count, batch.slots.length);
      for (const driver of batch.slots) {
        assert.equal(
          driver.source.visible,
          false,
          "transform driver is not drawn a second time",
        );
        for (const name of Object.keys(driver.source.geometry.attributes))
          assert.deepEqual(
            batch.geometry.attributes[name].array,
            driver.source.geometry.attributes[name].array,
            "vertex detail and surface mapping retained",
          );
        assert.equal(batch.mesh.castShadow, driver.source.castShadow);
        assert.equal(batch.mesh.receiveShadow, driver.source.receiveShadow);
      }
      if (batch.kind === "wheel") wheels += batch.mesh.count;
      if (batch.kind === "duct") ducts += batch.mesh.count;
      if (batch.kind === "collars") collars += batch.mesh.count;
    }
    for (const node of site.nodes) {
      assert.equal(
        expected.has(node.wheel),
        !!node.control,
        "fixed bearings have no rendered wheel",
      );
      assert.ok(node.handles.every((h) => h.parent === node.wheel));
    }
  }
  assert.equal(wheels, 110);
  assert.equal(ducts, 121);
  assert.equal(collars, 121);
});

test("instance transforms follow animated and restored machinery inside conservative rotating bounds", (t) => {
  const { game } = fixture(t),
    site = ready(game, 7),
    local = new THREE.Matrix4(),
    world = new THREE.Matrix4();
  const check = () => {
    for (const batch of site.rendering.batches)
      for (const [i, driver] of batch.slots.entries()) {
        batch.mesh.getMatrixAt(i, local);
        world.multiplyMatrices(batch.mesh.matrixWorld, local);
        for (let k = 0; k < 16; k++)
          assert.ok(
            Math.abs(
              world.elements[k] - driver.source.matrixWorld.elements[k],
            ) < 0.00002,
            "instance follows driver",
          );
        const a = batch.geometry.attributes.position;
        for (let k = 0; k < a.count; k++) {
          const p = new THREE.Vector3()
            .fromBufferAttribute(a, k)
            .applyMatrix4(local);
          assert.ok(
            batch.mesh.boundingBox.containsPoint(p),
            "rotation stays in frustum bounds",
          );
        }
      }
  };
  for (let n = 0; n < 5; n++) {
    use(game, site, 0);
    updateWindCourts(game, 0.11);
    check();
    game.setPaused(true);
    check();
    game.setPaused(false);
  }
  // Verify the reference frame too, rather than relying on zero parent transforms.
  site.root.rotation.y = 0.37;
  game.world.position.set(17, 3, -11);
  syncWindCourt(site);
  check();
});

test("batched flow keeps the same material states and moving air positions through solution and reset", (t) => {
  const { game } = fixture(t),
    site = ready(game, 7),
    state = createPuzzle(level, 7),
    p = new THREE.Vector3(),
    world = new THREE.Vector3();
  for (const i of windSolution(state)) applyMove(state, { index: i });
  for (const value of [state, createPuzzle(level, 7)]) {
    game.setWindValues(7, value);
    updateWindCourts(game, 0.7);
    let point = 0;
    const packed = site.rendering.particles.geometry.attributes.position;
    for (const node of site.nodes) {
      const copies = site.rendering.batches
        .filter((b) => b.kind === "flow")
        .flatMap((b) =>
          b.slots
            .filter((d) => d.node === node)
            .map((d) => ({ batch: b, driver: d })),
        );
      assert.equal(copies.length, 1);
      assert.equal(
        copies[0].batch.material.emissiveIntensity,
        node.glow.emissiveIntensity,
      );
      assert.ok(copies[0].batch.material.color.equals(node.glow.color));
      if (!node.flowing) continue;
      const source = node.particles.geometry.attributes.position;
      for (let i = 0; i < source.count; i++) {
        p.fromBufferAttribute(source, i).applyMatrix4(
          node.particles.matrixWorld,
        );
        world
          .fromBufferAttribute(packed, point++)
          .applyMatrix4(site.rendering.particles.matrixWorld);
        assert.ok(p.distanceTo(world) < 0.00002, "same world-space air mote");
      }
    }
    assert.equal(site.rendering.particles.geometry.drawRange.count, point);
    assert.ok(site.nodes.every((n) => !n.particles.visible));
  }
});

test("wind inscriptions share one atlas while preserving label resolution, text cells and world quads", (t) => {
  const { game } = fixture(t),
    maps = new Set(),
    labels = new Set();
  let signs = 0;
  for (const site of game.windSites) {
    site.detail.updateWorldMatrix(true, true);
    const { mesh, sources } = site.rendering.labels,
      vertices = mesh.geometry.attributes.position,
      uvs = mesh.geometry.attributes.uv;
    let offset = 0;
    for (const source of sources) {
      maps.add(source.material.map);
      labels.add(source.userData.windLabel);
      signs++;
      const cell = source.userData.windLabelCell,
        image = source.material.map.image;
      assert.equal(cell.width, 768);
      assert.equal(cell.height, 128);
      assert.ok(cell.x + 768 <= image.width);
      assert.ok(cell.y + 128 <= image.height);
      assert.equal(source.visible, false);
      const a = source.geometry.attributes.position,
        uv = source.geometry.attributes.uv;
      for (let i = 0; i < a.count; i++, offset++) {
        const old = new THREE.Vector3()
            .fromBufferAttribute(a, i)
            .applyMatrix4(source.matrixWorld),
          now = new THREE.Vector3()
            .fromBufferAttribute(vertices, offset)
            .applyMatrix4(mesh.matrixWorld);
        assert.ok(old.distanceTo(now) < 0.00002);
        assert.equal(uv.getX(i), uvs.getX(offset));
        assert.equal(uv.getY(i), uvs.getY(offset));
        const px = uv.getX(i) * image.width,
          py = (1 - uv.getY(i)) * image.height;
        assert.ok(
          px >= cell.x - 0.001 &&
            px <= cell.x + 768 + 0.001 &&
            py >= cell.y - 0.001 &&
            py <= cell.y + 128 + 0.001,
          "quad samples only its text cell",
        );
      }
    }
    assert.equal(offset, vertices.count);
  }
  assert.equal(signs, 148);
  assert.equal(maps.size, 1);
  assert.ok(labels.has("B2 · FIXED"));
  const image = [...maps][0].image;
  assert.ok(image.width <= 2048 && image.height <= 2048);
  assert.ok(image.width * image.height < signs * 768 * 128 * 0.2);
});
