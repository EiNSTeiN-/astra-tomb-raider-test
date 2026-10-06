import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { CameraSurfaces, faceCameraTarget } from "../src/camera-collision.js";
import { followClearCamera } from "../src/camera-follow.js";
import {
  advanceCharacter,
  safeArrival,
  supportAt,
} from "../src/character-motion.js";
import { buildCounterweights } from "../src/counterweights.js";
import { buildFieldGates } from "../src/field-world.js";
import {
  CIPHER_TRIALS,
  cipherCandidates,
  cipherClue,
  cipherClueHolds,
  normalizeCipher,
} from "../src/cipher-rules.js";
import {
  createPuzzle,
  restorePuzzle,
  applyMove,
  isSolved,
} from "../src/puzzles.js";
import {
  buildCipherCourts,
  updateCipherCourts,
  settleCipher,
  cipherReady,
  cipherInteract,
  saveCipherState,
} from "../src/cipher-courts.js";
import { updateSoundSources } from "../src/sound-landmarks.js";
import { focusCipher } from "../src/cipher-courts.js";
import {
  cipherCameraRecovery,
  cipherCameraSpace,
  cipherArrivalCamera,
} from "../src/cipher-follow.js";

const level = LEVELS[0];
function fixture(t) {
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
  const game = Object.assign(Object.create(Adventure.prototype), {
    store,
    map,
    level,
    progress: store.level(level.id),
    world,
    terrainProfile: terrain,
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    items: [],
    obstacles: [],
    waterMeshes: [],
    skyBridges: [],
    flames: [],
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    glowMat: new THREE.MeshStandardMaterial(),
    cameraSurfaces: new CameraSurfaces(world),
    camera: new THREE.PerspectiveCamera(58, 900 / 650, 0.1, 1000),
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
      f.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), game.glowMat);
      f.group.add(f.core);
    }
    game.items.push(f);
  }
  buildFieldGates(game);
  buildCipherCourts(game);
  game.cameraSurfaces.rebuild();
  game.soundSources = game.cipherSources.map((s) => ({ ...s }));
  t.after(() => world.traverse((o) => o.geometry?.dispose()));
  return { game, storage };
}
function ready(game, stage) {
  game.progress.stage = stage;
  game.progress.completed = false;
  game.progress.field = [0, 1, 2].map((i) => `field-${stage}-${i}`);
  game.counterweights.saved.solved = true;
  settleCipher(game);
  return game.cipherSites[stage];
}
function turn(game, site, index, delta = 1) {
  const f = site.nodes[index].control;
  game.player.position.copy(f.group.position);
  game.nearest = f;
  game.keys.clear();
  if (delta < 0) game.keys.add("ShiftLeft");
  return cipherInteract(game);
}

test("eight authored covenants have distinct layouts and exactly one answer supported by every inscription", () => {
  assert.equal(
    new Set(CIPHER_TRIALS.map((t) => JSON.stringify(t.positions))).size,
    8,
  );
  const solutions = [];
  for (const [stage, trial] of CIPHER_TRIALS.entries()) {
    const candidates = cipherCandidates(trial);
    assert.equal(candidates.length, 1, trial.title);
    solutions.push(candidates[0].join(""));
    const puzzle = createPuzzle(level, stage);
    assert.deepEqual(puzzle.target, candidates[0]);
    assert.ok(!isSolved(puzzle));
    for (const c of trial.clues) {
      assert.ok(cipherClueHolds(c, puzzle.target));
      assert.ok(cipherClue(c).length > 8);
    }
    for (let index = 0; index < puzzle.values.length; index++)
      while (puzzle.values[index] !== puzzle.target[index])
        applyMove(puzzle, { index });
    assert.ok(isSolved(puzzle));
    const before = structuredClone(puzzle);
    applyMove(puzzle, { index: 999 });
    applyMove(puzzle, { index: 0, delta: 4 });
    assert.deepEqual(puzzle, before);
    applyMove(puzzle, { index: 0 });
    applyMove(puzzle, { index: 0, delta: -1 });
    assert.deepEqual(puzzle.values, before.values);
  }
  assert.equal(new Set(solutions).size, 8);
  assert.equal(
    CIPHER_TRIALS.reduce((n, t) => n + t.positions.length, 0),
    42,
  );
});
test("unfinished covenant turns survive bounded save normalization without leaking into another chapter", () => {
  const state = createPuzzle(level, 7);
  applyMove(state, { index: 5, delta: -1 });
  const save = normalizeSave({
    version: 1,
    levels: {
      verdant: { cipher: { 7: state } },
      sands: { cipher: { 7: state } },
    },
  });
  assert.deepEqual(
    restorePuzzle(level, 7, save.levels.verdant.cipher[7]),
    state,
  );
  assert.deepEqual(save.levels.sands.cipher, {});
  assert.deepEqual(
    normalizeCipher({
      0: { values: [0, 0, 0, 99] },
      1: { values: [0, 0, 0] },
      7: { values: [0, 0, 0, 0, 0, NaN] },
    }),
    {},
  );
  const normalized = normalizeCipher({
    7: { ...state, moves: Infinity, last: 90 },
  })[7];
  assert.equal(normalized.moves, 0);
  assert.equal(normalized.last, null);
  state.values[5] = 1;
  assert.equal(save.levels.verdant.cipher[7].values[5], 3);
});
test("all physical drum controls stay supported and clear, with bounded relief batches and one inscription atlas", (t) => {
  const { game } = fixture(t),
    maps = new Set();
  let rotors = 0;
  assert.equal(game.cipherSites.length, 8);
  assert.equal(game.cipherSources.length, 42);
  for (const site of game.cipherSites) {
    ready(game, site.stage);
    for (const f of [...site.nodes.map((n) => n.control), site.tablet]) {
      const p = f.group.position;
      assert.ok(game.canMove(p.x, p.z, 0), `${f.id} is blocked`);
      assert.ok(Math.abs(game.groundHeight(p.x, p.z) - p.y) < 0.001);
      for (const dx of [-0.4, 0, 0.4])
        for (const dz of [0, 0.5, 1])
          assert.ok(
            game.canMove(p.x + dx, p.z + dz, 0),
            `${f.id} approach ${dx},${dz}`,
          );
    }
    for (const n of site.nodes) {
      rotors++;
      assert.equal(n.rotor.children.length, 3);
      for (const mesh of n.rotor.children) {
        const { position, normal } = mesh.geometry.attributes;
        assert.ok(position.count < 10000);
        for (let i = 0; i < position.count; i++)
          assert.ok(
            Number.isFinite(
              position.getX(i) +
                position.getY(i) +
                position.getZ(i) +
                normal.getX(i),
            ),
          );
        if (mesh.material.map?.isCanvasTexture) maps.add(mesh.material.map);
      }
    }
  }
  assert.equal(rotors, 42);
  assert.equal(maps.size, 1);
});
test("world turns, shared focused changes and reset persist; locked courts cannot turn or activate", (t) => {
  const { game, storage } = fixture(t),
    site = game.cipherSites[1];
  assert.equal(cipherReady(game, site), false);
  turn(game, site, 0);
  assert.equal(game.progress.cipher[1], undefined);
  ready(game, 1);
  turn(game, site, 0, -1);
  assert.equal(site.state.values[0], 3);
  assert.equal(new SaveStore(storage).level(level.id).cipher[1].values[0], 3);
  const state = restorePuzzle(level, 1, game.progress.cipher[1]);
  const event = applyMove(state, { index: 1 });
  game.paused = true;
  assert.ok(saveCipherState(game, 1, state, event));
  assert.ok(game.presentationRemaining > 0);
  settleCipher(game);
  assert.deepEqual(
    site.nodes.map((n) => n.display),
    state.values,
  );
  assert.ok(saveCipherState(game, 1, createPuzzle(level, 1)));
  assert.deepEqual(site.state.values, [0, 0, 0, 0]);
  const before = JSON.stringify(game.progress.cipher);
  game.progress.field = [];
  turn(game, site, 0);
  assert.equal(JSON.stringify(game.progress.cipher), before);
});
test("stone motion drives positional sound, stops at rest and clears references on another biome", (t) => {
  const { game } = fixture(t),
    site = ready(game, 1);
  turn(game, site, 0);
  updateCipherCourts(game, 1 / 60);
  updateSoundSources(game);
  const source = game.soundSources.find(
    (s) => s.cipherStage === 1 && s.cipherIndex === 0,
  );
  assert.ok(source.activity > 0);
  assert.equal(source.near, 1.2);
  assert.equal(source.range, 20);
  assert.equal(source.x, site.nodes[0].sound.x);
  for (let i = 0; i < 90; i++) updateCipherCourts(game, 1 / 60);
  updateSoundSources(game);
  assert.equal(source.activity, 0);
  assert.equal(site.moving, false);
  game.level = LEVELS[1];
  assert.equal(buildCipherCourts(game), false);
  assert.deepEqual(game.cipherSites, []);
  assert.deepEqual(game.cipherSources, []);
  assert.equal(game.cipherFocus, null);
  updateSoundSources(game);
  assert.equal(source.activity, 0);
});

test("the two recorded jungle entrance views clear the actual drum components without changing look or progress", (t) => {
  const { game } = fixture(t);
  game.progress.field = ["field-0-0", "field-0-1", "field-0-2"];
  const saved = structuredClone(game.progress);
  for (const pose of [
    {
      feet: [206.71978164681306, 3.9901884775392142, 60.21860262188385],
      yaw: -1.5014610925326943,
      previous: [201.4928168767206, 6.212320416636965, 60.47701263272937],
      previousFeet: [206.65708484554784, 3.990249063359883, 60.22755930777888],
    },
    {
      feet: [206.42809589483, 3.990407705307007, 57.638329688485186],
      yaw: 0.28548845760747604,
      previous: [207.15577848377774, 6.139021668265054, 62.40537915345804],
      previousFeet: [206.47028384903118, 3.990407705307007, 57.68556619588602],
    },
  ]) {
    game.player.position.fromArray(pose.feet);
    game.yaw = pose.yaw;
    game.pitch = 0.15;
    game.camera.position.fromArray(pose.previous);
    game.cameraFollowTarget = new THREE.Vector3()
      .fromArray(pose.previousFeet)
      .add(new THREE.Vector3(0, 1.3, 0));
    updateCipherCourts(game, 0);
    const feet = game.player.position.clone(),
      target = feet.clone().add(new THREE.Vector3(0, 1.3, 0)),
      desired = target
        .clone()
        .add(
          new THREE.Vector3(
            Math.sin(game.yaw) * Math.cos(game.pitch) * 5.3,
            Math.sin(game.pitch) * 5.3 + 0.2,
            Math.cos(game.yaw) * Math.cos(game.pitch) * 5.3,
          ),
        );
    game.world.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      target,
      desired.clone().sub(target).normalize(),
      0,
      target.distanceTo(desired),
    );
    const hits = ray
      .intersectObjects(
        game.cipherSites.flatMap((s) => [s.fixed, s.detail]),
        true,
      )
      .filter((hit) => {
        let visible = true;
        for (let parent = hit.object; parent; parent = parent.parent)
          visible &&= parent.visible;
        return (
          visible &&
          hit.object.material.isMeshStandardMaterial &&
          !hit.object.material.transparent
        );
      });
    assert.equal(
      hits.length,
      0,
      "the recorded central sightline crosses no delivered cipher skin",
    );
    // Nearby rim and turning-stone margins remain real obstructions. Recovery
    // must find room beside them without changing the player's selected look.
    for (let frame = 0; frame < 120; frame++) {
      game.camera.position.copy(
        followClearCamera(game, target, desired, 1 / 60, (p) =>
          game.cameraSpace(p),
        ),
      );
      game.cameraFollowTarget = target.clone();
      assert(game.camera.position.distanceTo(target) >= 2.2 - 1e-8);
      assert.equal(game.cameraSurfaces.entry(target, game.camera.position), 1);
      assert(game.player.position.equals(feet));
      assert.deepEqual(
        { yaw: game.yaw, pitch: game.pitch },
        { yaw: pose.yaw, pitch: 0.15 },
      );
      assert.deepEqual(game.progress, saved);
    }
  }
});

test("all 42 drum envelopes guard actual rotating stone and wheel rim intersections through legal and intermediate turns", (t) => {
  const { game } = fixture(t),
    ray = new THREE.Raycaster(),
    center = new THREE.Vector3(),
    start = new THREE.Vector3(),
    direction = new THREE.Vector3();
  let stoneRays = 0,
    wheelRays = 0;
  for (const site of game.cipherSites) {
    ready(game, site.stage);
    for (const node of site.nodes) {
      game.player.position.copy(node.control.group.position);
      for (let phase = 0; phase < 8; phase++) {
        node.display = phase / 2;
        updateCipherCourts(game, 0);
        game.world.updateMatrixWorld(true);
        node.body.getWorldPosition(center).y += node.rotor.position.y;
        for (let angle = 0; angle < 8; angle++) {
          const yaw = (angle * Math.PI) / 4;
          start
            .copy(center)
            .add(
              new THREE.Vector3(Math.sin(yaw) * 2.3, 0, Math.cos(yaw) * 2.3),
            );
          ray.set(start, direction.copy(center).sub(start).normalize());
          ray.near = 0;
          ray.far = 2.3;
          const hit = ray
            .intersectObject(node.rotor, true)
            .find(
              (h) =>
                h.object.material.isMeshStandardMaterial &&
                !h.object.material.transparent,
            );
          assert(
            hit,
            `stone skin ${site.stage}/${node.index}/${phase}/${angle}`,
          );
          assert(
            game.cameraSurfaces.entry(start, center, 0) <=
              hit.distance / 2.3 + 1e-6,
            "the camera stops before the delivered rotating stone",
          );
          stoneRays++;
        }
        node.wheel.getWorldPosition(center);
        center.x += 0.32;
        start.copy(center).z += 1;
        const end = center.clone();
        end.z -= 0.5;
        ray.set(start, direction.copy(end).sub(start).normalize());
        ray.far = 1.5;
        const hit = ray.intersectObject(node.wheel, false)[0];
        assert(hit, "delivered wheel rim");
        assert(
          game.cameraSurfaces.entry(start, end, 0) <= hit.distance / 1.5 + 1e-6,
          "the working wheel is protected independently of the taller drum",
        );
        wheelRays++;
      }
    }
  }
  assert.equal(stoneRays, 2688);
  assert.equal(wheelRays, 336);
});

test("all 42 drives stop sustained walking before the handwheel while retaining supported control access", (t) => {
  const { game } = fixture(t);
  for (const site of game.cipherSites) {
    ready(game, site.stage);
    for (const node of site.nodes) {
      const p = node.control.group.position;
      const [solid] = node.control.stationSolids;
      assert.equal(solid.supportable, false);
      assert(game.canMove(p.x, p.z, 0), "supported control stance");
      game.player.position.copy(p);
      game.grounded = true;
      game.jumpY = game.velocityY = 0;
      for (let frame = 0; frame < 120; frame++)
        advanceCharacter(game, { x: 0, z: -3.8 }, 1 / 60);
      assert(
        game.player.position.distanceTo(p) < 0.015,
        "the drive stops the forward stride at its clear stance",
      );
      assert(game.canMove(game.player.position.x, game.player.position.z, 0));
      assert(
        !game.canMove(solid.x, solid.bounds.max.z + 0.1, 0),
        "a standing body cannot enter the drive",
      );
      assert.equal(
        supportAt(game, solid.x, solid.z, solid.bounds.max.y + 1).surface,
        null,
        "the wheel is not a landing",
      );
      assert(turn(game, site, node.index));
    }
  }
});

test("both recorded occupied drive saves recover to clear footing without rewriting puzzle progress", (t) => {
  const { game } = fixture(t);
  ready(game, 0);
  const saved = structuredClone(game.progress);
  for (const [x, z] of [
    [205.2275774123926, 60.10761322030798],
    [205.31788742209707, 60.068343514164624],
  ]) {
    const p = new THREE.Vector3(x, game.groundHeight(x, z), z);
    assert(
      !game.canMove(x, z, 0),
      "the old occupied handwheel pose is rejected",
    );
    const arrival = safeArrival(game, p);
    assert(arrival, "nearby clear arrival");
    assert(
      game.canMove(
        arrival.x,
        arrival.z,
        arrival.y - game.groundHeight(arrival.x, arrival.z),
      ),
    );
    assert(Math.hypot(arrival.x - x, arrival.z - z) < 1.5);
    assert(
      Math.abs(arrival.y - game.groundHeight(arrival.x, arrival.z)) < 0.001,
    );
    assert.deepEqual(game.progress, saved);
  }
});

test("every cipher stance and front approach remains on its shallow court foundation before activation", (t) => {
  const { game } = fixture(t),
    profile = game.terrainProfile;
  for (const site of game.cipherSites)
    for (const node of site.nodes) {
      const p = node.control.group.position;
      for (const side of [-0.4, 0, 0.4])
        for (const front of [0, 0.5, 1]) {
          const x = p.x + side,
            z = p.z + front,
            floor = profile.height(x, z);
          assert(
            Math.abs(floor - profile.foundationHeight(x, z)) < 1e-5,
            `${node.control.id}: reservoir excavation must not lower the working ground`,
          );
          for (const water of profile.waters) {
            if (
              water.kind === "water" &&
              Math.abs(x - water.x) <= water.width / 2 &&
              Math.abs(z - water.z) <= water.length / 2
            )
              assert(
                water.baseY - floor < 0.3,
                "the controller must remain on foot within reach of the drive",
              );
          }
        }
    }
});

test("the delivered pedestal bottoms remain below the soil across all 42 complete footprints", (t) => {
  const { game } = fixture(t),
    ray = new THREE.Raycaster(),
    center = new THREE.Vector3();
  game.world.updateMatrixWorld(true);
  let samples = 0;
  for (const site of game.cipherSites)
    for (const node of site.nodes) {
      node.body.getWorldPosition(center);
      for (const radius of [0.25, 0.6, 0.98])
        for (let angle = 0; angle < 24; angle++) {
          const yaw = (angle * Math.PI) / 12,
            x = center.x + Math.sin(yaw) * radius * 1.05,
            z = center.z + Math.cos(yaw) * radius * 1.05;
          ray.set(
            new THREE.Vector3(x, center.y - 4, z),
            new THREE.Vector3(0, 1, 0),
          );
          ray.far = 4.7;
          const hit = ray
            .intersectObject(site.fixed, true)
            .find(
              (h) =>
                h.object.material.isMeshStandardMaterial &&
                !h.object.material.transparent,
            );
          assert(hit, "the actual merged stone has a complete bottom");
          assert(
            hit.point.y <= game.groundHeight(x, z) + 0.001,
            `${node.control.id}: the bottom must not float above the slope`,
          );
          samples++;
        }
    }
  assert.equal(samples, 3024);
});

test("inspection frames contain all eight courts and every intermediate drum rotation beside or above the panel", (t) => {
  const { game } = fixture(t),
    point = new THREE.Vector3();
  const formats = [
    { width: 1280, height: 800, panel: { left: 822, top: 28 } },
    { width: 960, height: 540, panel: { left: 592, top: 12 } },
    { width: 540, height: 900, panel: { left: 12, top: 393 } },
    { width: 820, height: 1180, panel: { left: 12, top: 543 } },
  ];
  game.paused = true;
  let phases = 0,
    views = 0;
  for (const site of game.cipherSites) {
    game.cipherFocus = site.stage;
    for (let phase = 0; phase < 8; phase++) {
      for (const node of site.nodes) node.display = phase / 2;
      updateCipherCourts(game, 0);
      game.world.updateMatrixWorld(true);
      site.root.traverse((mesh) => {
        if (!mesh.geometry?.attributes.position) return;
        const positions = mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          point
            .fromBufferAttribute(positions, i)
            .applyMatrix4(mesh.matrixWorld);
          assert(
            site.inspectionBounds.containsPoint(point),
            "the cached framing envelope contains the actual delivered vertex",
          );
        }
      });
      phases++;
    }
    for (const { width, height, panel } of formats) {
      Object.assign(game.renderer.domElement, {
        clientWidth: width,
        clientHeight: height,
        ownerDocument: {
          querySelector: () => ({ getBoundingClientRect: () => panel }),
        },
      });
      game.camera.aspect = width / height;
      assert(focusCipher(game));
      const compact = width <= 600 || (width <= 900 && height >= width),
        right = compact ? width - 16 : panel.left - 16,
        bottom = compact ? panel.top - 16 : height - 16,
        bounds = site.inspectionBounds;
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            point.set(x, y, z).project(game.camera);
            const px = ((point.x + 1) * width) / 2,
              py = ((1 - point.y) * height) / 2;
            assert(
              px >= 16 - 1e-7 && px <= right + 1e-7,
              `${site.stage}: horizontal panel clearance`,
            );
            assert(
              py >= 16 - 1e-7 && py <= bottom + 1e-7,
              `${site.stage}: vertical panel clearance`,
            );
          }
      views++;
    }
  }
  assert.equal(phases, 64);
  assert.equal(views, 32);
  game.paused = false;
  assert.equal(focusCipher(game), false);
});

function recoveredStep(game, dt = 1 / 60) {
  const view = cipherCameraRecovery(game),
    chest = game.player.position
      .clone()
      .add(new THREE.Vector3(0, 1.3 - (game.crouchCamera || 0), 0)),
    target = chest.clone().add(new THREE.Vector3(0, 0, view.offset)),
    desired = target
      .clone()
      .add(
        new THREE.Vector3(
          Math.sin(game.yaw) * Math.cos(view.pitch) * 5.3,
          Math.sin(view.pitch) * 5.3 + 0.2,
          Math.cos(game.yaw) * Math.cos(view.pitch) * 5.3,
        ),
      );
  game.camera.position.copy(
    followClearCamera(
      game,
      target,
      desired,
      dt,
      (p) =>
        game.cameraSpace(p) && cipherCameraSpace(game, p, chest, view.strength),
      view.pitch,
    ),
  );
  game.cameraFollowTarget = target.clone();
  faceCameraTarget(game.camera, view.offset ? chest : target, desired);
  game.camera.updateMatrixWorld();
  return { view, chest, target };
}

test("both complete orbits at all 50 cipher controls retain continuous clear body views and saved arrival headings", (t) => {
  const { game } = fixture(t),
    ray = new THREE.Raycaster();
  let frames = 0,
    bodyRays = 0,
    arrivalRays = 0,
    arrivals = 0;
  for (const site of game.cipherSites) {
    ready(game, site.stage);
    for (const f of [...site.nodes.map((n) => n.control), site.tablet])
      for (const sign of [1, -1]) {
        game.player.position.copy(f.group.position);
        game.grounded = true;
        game.jumpY = game.velocityY = 0;
        for (let frame = 0; frame < 180; frame++)
          advanceCharacter(game, { x: 0, z: 0 }, 1 / 60);
        updateCipherCourts(game, 0);
        const feet = game.player.position.clone(),
          saved = structuredClone(game.progress);
        game.yaw = 0;
        game.pitch = 0.15;
        game.camera.position.copy(feet).add(new THREE.Vector3(0, 2.3, 5.3));
        game.cameraFollowTarget = feet
          .clone()
          .add(new THREE.Vector3(0, 1.3, 0));
        for (let frame = 0; frame < 120; frame++) recoveredStep(game);
        let previous = game.camera.position.clone();
        for (let frame = 0; frame < 240; frame++) {
          const yaw = (sign * (frame + 1) * Math.PI) / 120;
          game.yaw = yaw;
          const { target, chest } = recoveredStep(game);
          assert(
            game.camera.position.distanceTo(target) >= 2.2 - 1e-8,
            f.id + ": visible explorer",
          );
          assert(
            game.camera.position.distanceTo(previous) < 0.65,
            f.id + ": no abrupt side switch",
          );
          assert.equal(
            game.cameraSurfaces.entry(target, game.camera.position),
            1,
          );
          assert.equal(game.yaw, yaw);
          assert.equal(game.pitch, 0.15);
          for (const height of [0, 1.7]) {
            const point = feet
              .clone()
              .add(new THREE.Vector3(0, height, 0))
              .project(game.camera);
            assert(
              Math.abs(point.x) < 0.98 && Math.abs(point.y) < 0.98,
              f.id + ": feet and head stay inside the view",
            );
          }
          previous.copy(game.camera.position);
          frames++;
          if (frame === 119) {
            game.world.updateMatrixWorld(true);
            const tangent = new THREE.Vector3(
              game.camera.position.z - chest.z,
              0,
              chest.x - game.camera.position.x,
            ).normalize();
            for (const lift of [-0.15, 0, 0.15])
              for (const lateral of [-0.15, 0, 0.15]) {
                const body = chest
                  .clone()
                  .add(new THREE.Vector3(0, lift, 0))
                  .addScaledVector(tangent, lateral);
                ray.set(
                  game.camera.position,
                  body.clone().sub(game.camera.position).normalize(),
                );
                ray.far = game.camera.position.distanceTo(body) - 0.01;
                const hits = ray
                  .intersectObjects([site.fixed, site.detail], true)
                  .filter(
                    (h) =>
                      h.object.material.isMeshStandardMaterial &&
                      !h.object.material.transparent,
                  );
                assert.equal(
                  hits.length,
                  0,
                  f.id + ": delivered body sight ray",
                );
                bodyRays++;
              }
            const arrival = cipherArrivalCamera(game, chest, {
              yaw,
              pitch: 0.15,
            });
            assert(arrival, f.id + ": clear recovered arrival");
            assert.equal(arrival.yaw, yaw);
            assert.equal(arrival.pitch, 0.15);
            assert.equal(
              game.cameraSurfaces.entry(arrival.target, arrival.position),
              1,
            );
            const arrivalTangent = new THREE.Vector3(
              arrival.position.z - chest.z,
              0,
              chest.x - arrival.position.x,
            ).normalize();
            for (const lift of [-0.15, 0, 0.15])
              for (const lateral of [-0.15, 0, 0.15]) {
                const body = chest
                  .clone()
                  .add(new THREE.Vector3(0, lift, 0))
                  .addScaledVector(arrivalTangent, lateral);
                ray.set(
                  arrival.position,
                  body.clone().sub(arrival.position).normalize(),
                );
                ray.far = arrival.position.distanceTo(body) - 0.01;
                assert.equal(
                  ray
                    .intersectObjects([site.fixed, site.detail], true)
                    .filter(
                      (h) =>
                        h.object.material.isMeshStandardMaterial &&
                        !h.object.material.transparent,
                    ).length,
                  0,
                  f.id + ": delivered arrival body sight ray",
                );
                arrivalRays++;
              }
            arrivals++;
          }
        }
        assert(game.player.position.equals(feet));
        assert.deepEqual(game.progress, saved);
      }
  }
  assert.equal(frames, 24000);
  assert.equal(bodyRays, 900);
  assert.equal(arrivalRays, 900);
  assert.equal(arrivals, 100);
});

test("crouched cipher orbits retain the lower body view within the canvas and clear the delivered stone", (t) => {
  const { game } = fixture(t),
    ray = new THREE.Raycaster();
  game.crouching = true;
  game.crouchCamera = 0.4;
  let frames = 0,
    bodyRays = 0;
  for (const site of game.cipherSites) {
    ready(game, site.stage);
    for (const f of [...site.nodes.map((n) => n.control), site.tablet]) {
      game.player.position.copy(f.group.position);
      game.grounded = true;
      game.jumpY = game.velocityY = 0;
      for (let frame = 0; frame < 180; frame++)
        advanceCharacter(game, { x: 0, z: 0 }, 1 / 60);
      updateCipherCourts(game, 0);
      const feet = game.player.position.clone(),
        saved = structuredClone(game.progress);
      game.yaw = 0;
      game.pitch = 0.15;
      game.camera.position.copy(feet).add(new THREE.Vector3(0, 1.9, 5.3));
      game.cameraFollowTarget = feet.clone().add(new THREE.Vector3(0, 0.9, 0));
      for (let frame = 0; frame < 120; frame++) recoveredStep(game);
      let previous = game.camera.position.clone();
      for (let frame = 0; frame < 240; frame++) {
        const yaw = ((frame + 1) * Math.PI) / 120;
        game.yaw = yaw;
        const { target, chest } = recoveredStep(game);
        assert(game.camera.position.distanceTo(target) >= 2.2 - 1e-8);
        assert(game.camera.position.distanceTo(previous) < 1);
        assert.equal(
          game.cameraSurfaces.entry(target, game.camera.position),
          1,
        );
        assert.equal(game.yaw, yaw);
        assert.equal(game.pitch, 0.15);
        for (const height of [0, 1.3]) {
          const point = feet
            .clone()
            .add(new THREE.Vector3(0, height, 0))
            .project(game.camera);
          assert(
            Math.abs(point.x) < 0.98 && Math.abs(point.y) < 0.98,
            f.id + ": crouched feet and head stay inside the view",
          );
        }
        previous.copy(game.camera.position);
        frames++;
        if (frame === 119) {
          game.world.updateMatrixWorld(true);
          const tangent = new THREE.Vector3(
            game.camera.position.z - chest.z,
            0,
            chest.x - game.camera.position.x,
          ).normalize();
          for (const lift of [-0.15, 0, 0.15])
            for (const lateral of [-0.15, 0, 0.15]) {
              const body = chest
                .clone()
                .add(new THREE.Vector3(0, lift, 0))
                .addScaledVector(tangent, lateral);
              ray.set(
                game.camera.position,
                body.clone().sub(game.camera.position).normalize(),
              );
              ray.far = game.camera.position.distanceTo(body) - 0.01;
              assert.equal(
                ray
                  .intersectObjects([site.fixed, site.detail], true)
                  .filter(
                    (h) =>
                      h.object.material.isMeshStandardMaterial &&
                      !h.object.material.transparent,
                  ).length,
                0,
                f.id + ": delivered crouched body sight ray",
              );
              bodyRays++;
            }
        }
      }
      assert(game.player.position.equals(feet));
      assert.deepEqual(game.progress, saved);
    }
  }
  assert.equal(frames, 12000);
  assert.equal(bodyRays, 450);
});

test("rear-drum walking approaches and side departures retain visible camera clearance without rewriting progress", (t) => {
  const { game } = fixture(t);
  for (const [stage, index] of [
    [6, 5],
    [7, 4],
  ]) {
    ready(game, stage);
    const pad = game.cipherSites[stage].nodes[index].control.group.position;
    game.player.position.copy(pad).z += 1;
    game.player.position.y = game.groundHeight(
      game.player.position.x,
      game.player.position.z,
    );
    game.yaw = 0;
    game.pitch = 0.15;
    game.grounded = true;
    game.jumpY = game.velocityY = 0;
    updateCipherCourts(game, 0);
    game.camera.position
      .copy(game.player.position)
      .add(new THREE.Vector3(0, 2.3, 5.3));
    game.cameraFollowTarget = null;
    for (let frame = 0; frame < 120; frame++) recoveredStep(game);
    const saved = structuredClone(game.progress);
    for (const [velocity, count] of [
      [{ x: 0, z: -2 }, 30],
      [{ x: 2, z: 0 }, 60],
    ]) {
      for (let frame = 0; frame < count; frame++) {
        advanceCharacter(game, velocity, 1 / 60);
        const { target } = recoveredStep(game);
        assert(
          game.camera.position.distanceTo(target) >= 2.2 - 1e-8,
          "body stays visible along the working approach and departure",
        );
        assert.equal(
          game.cameraSurfaces.entry(target, game.camera.position),
          1,
        );
      }
    }
    assert.equal(cipherCameraRecovery(game).strength, 0);
    assert.equal(cipherCameraRecovery(game).pitch, 0.15);
    assert.equal(game.yaw, 0);
    assert.equal(game.pitch, 0.15);
    assert.deepEqual(game.progress, saved);
  }
});

test("cipher recovery leaves other camera modes and remote exploration under their ordinary look controls", (t) => {
  const { game } = fixture(t);
  game.player.position.copy(
    game.cipherSites[0].nodes[0].control.group.position,
  );
  game.yaw = Math.PI;
  game.pitch = 0.15;
  updateCipherCourts(game, 0);
  assert(cipherCameraRecovery(game).strength > 0);
  for (const flag of [
    "swimming",
    "diving",
    "aiming",
    "climb",
    "ropeRide",
    "zipRide",
    "blockGrip",
    "aimBlend",
  ]) {
    game[flag] = true;
    assert.deepEqual(
      cipherCameraRecovery(game),
      { offset: 0, pitch: 0.15, strength: 0 },
      flag,
    );
    assert.equal(
      cipherArrivalCamera(game, game.player.position, {
        yaw: Math.PI,
        pitch: 0.15,
      }),
      null,
    );
    game[flag] = false;
  }
  game.player.position.set(0, 0, 0);
  assert.deepEqual(cipherCameraRecovery(game), {
    offset: 0,
    pitch: 0.15,
    strength: 0,
  });
});
