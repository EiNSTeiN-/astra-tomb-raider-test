import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { CameraSurfaces } from "../src/camera-collision.js";
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
    groundHeight: terrain.height,
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
      assert.ok(game.canMove(p.x, p.z, 0, 0), `${f.id} is blocked`);
      assert.ok(Math.abs(game.groundHeight(p.x, p.z) - p.y) < 0.001);
      for (const dx of [-0.4, 0, 0.4])
        for (const dz of [0, 0.5, 1])
          assert.ok(
            game.canMove(p.x + dx, p.z + dz, 0, 0),
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
