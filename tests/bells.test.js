import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { createPuzzle, restorePuzzle, isSolved } from "../src/puzzles.js";
import {
  BELL_LESSONS,
  BELL_FREQUENCIES,
  bellCue,
  bellAnswer,
  normalizeBells,
} from "../src/bell-rules.js";
import {
  buildBellCourts,
  updateBellCourts,
  bellReady,
  bellInteract,
  playBellPhrase,
  cancelBellPlayback,
  saveBellState,
  focusBells,
} from "../src/bell-courts.js";
import { buildMonasteryArchitecture } from "../src/monastery-architecture.js";
import { Soundscape } from "../src/audio.js";

const level = LEVELS[2];
function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  t.after(() => {
    globalThis.document = old;
  });
  const memory = new Map(),
    storage = {
      getItem: (k) => memory.get(k),
      setItem: (k, v) => memory.set(k, v),
    };
  const store = new SaveStore(storage),
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    world = new THREE.Group(),
    sounds = [];
  const game = Object.assign(Object.create(Adventure.prototype), {
    store,
    map,
    level,
    world,
    progress: store.level(level.id),
    terrainProfile: terrain,
    groundHeight: terrain.height,
    player: new THREE.Group(),
    items: [],
    obstacles: [],
    stoneMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    glowMat: new THREE.MeshStandardMaterial(),
    cameraSurfaces: new CameraSurfaces(world),
    camera: new THREE.PerspectiveCamera(),
    renderer: { domElement: { clientWidth: 900, clientHeight: 650 } },
    counterweights: { saved: { solved: false } },
    keys: new Set(),
    paused: false,
    health: 100,
    jumpY: 0,
    grounded: true,
    explored: new Set(),
    checkpoint: { x: 84, z: 112 },
    sense: 0,
    elapsed: 0,
    cb: { toast() {}, saved() {}, puzzle() {} },
    clock: { getDelta: () => 0 },
    audio: {
      ctx: { currentTime: 0 },
      setMode(mode) {
        this.mode = mode;
      },
      resume() {},
      tone() {},
      bell(frequency, position, options) {
        const s = {
          frequency,
          position: position.clone(),
          ...options,
          stopped: false,
          stop() {
            this.stopped = true;
          },
        };
        sounds.push(s);
        return s;
      },
    },
  });
  buildMonasteryArchitecture(game);
  for (const f of map.features.filter((f) => f.type === "mechanism")) {
    const x = f.x * 7,
      z = f.z * 7,
      y = terrain.height(x, z),
      h = f.stage === 0 ? 0 : 2.8 + (f.stage % 3) * 0.3;
    f.group = new THREE.Group();
    f.group.position.set(x, y + h, z);
    f.yOffset = h;
    f.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), game.glowMat);
    f.group.add(f.core);
    if (f.stage > 0) {
      game.cylinder(1.8, 2.1, 0.8, game.stoneMat, 0, 0.5, 0, f.group);
      game.cylinder(1.4, 1.6, 0.35, game.goldMat, 0, 1.05, 0, f.group);
    }
    world.add(f.group);
    game.items.push(f);
    if (h) game.obstacles.push({ x, z, w: 3, d: 3, h, climbable: true });
  }
  buildBellCourts(game);
  game.cameraSurfaces.rebuild();
  t.after(() => world.traverse((o) => o.geometry?.dispose()));
  return { game, storage, sounds };
}
function ready(game, stage) {
  game.progress.stage = stage;
  game.progress.field = [0, 1, 2].map((i) => `field-${stage}-${i}`);
  game.counterweights.saved.solved = true;
  updateBellCourts(game, 1);
}
function pull(game, stage, index) {
  const f = game.bellSites[stage].bells[index].control;
  game.player.position.set(
    f.x * 7,
    game.bellSites[stage].root.position.y,
    f.z * 7,
  );
  game.nearest = f;
  return bellInteract(game);
}

test("all eight bell lessons transform their cues into the intended answer and introduce four clear rules", () => {
  assert.equal(new Set(BELL_LESSONS.map((l) => l.mode)).size, 4);
  const answers = new Set();
  for (let stage = 0; stage < 8; stage++) {
    const s = createPuzzle(level, stage),
      cue = bellCue(s.target, stage);
    assert.deepEqual(bellAnswer(cue, stage), s.target);
    assert.equal(cue.length, 5 + (stage % 4));
    assert.equal(new Set(cue).size, 4);
    assert.ok(
      cue.every((n, i) => i < 2 || n !== cue[i - 1] || n !== cue[i - 2]),
    );
    answers.add(s.target.join(""));
    // The relation holds for every possible three-note phrase, not only the seed.
    for (let n = 0; n < 64; n++) {
      const phrase = [n % 4, Math.floor(n / 4) % 4, Math.floor(n / 16)];
      assert.deepEqual(bellAnswer(bellCue(phrase, stage), stage), phrase);
    }
  }
  assert.equal(answers.size, 8);
});

test("unfinished bell phrases normalize independently without admitting extra notes, bad stages or fractional pitches", () => {
  const input = {
    0: { values: [0, 3], moves: 2, heard: true },
    1: { values: [], moves: -3 },
    2: { values: [1.2] },
    3: { values: [4] },
    4: { values: Array(6).fill(0) },
    8: { values: [] },
    "01": { values: [] },
  };
  const clean = normalizeBells(input);
  assert.deepEqual(Object.keys(clean), ["0", "1"]);
  clean[0].values[0] = 2;
  assert.equal(input[0].values[0], 0);
  assert.equal(clean[1].moves, 0);
  const save = normalizeSave({
    version: 1,
    levels: { frost: { bells: input }, sands: { bells: input } },
  });
  assert.deepEqual(save.levels.sands.bells, {});
  const restored = restorePuzzle(level, 0, save.levels.frost.bells[0]);
  assert.deepEqual(restored.values, [0, 3]);
  assert.equal(restored.heard, true);
  assert.deepEqual(restored.target, createPuzzle(level, 0).target);
});

test("all forty bell controls stand clear on their actual raised platforms and retain moving camera parents", (t) => {
  const { game } = fixture(t);
  assert.equal(game.bellSites.length, 8);
  assert.equal(game.items.filter((f) => f.type === "bell").length, 40);
  for (const site of game.bellSites) {
    for (const f of [site.tablet, ...site.bells.map((b) => b.control)]) {
      for (const dx of [-0.12, 0, 0.12])
        for (const dz of [-0.12, 0, 0.12]) {
          const x = f.x * 7 + dx,
            z = f.z * 7 + dz,
            height = site.root.position.y - game.groundHeight(x, z);
          assert.ok(game.canMove(x, z, height), `${f.id} at ${dx},${dz}`);
        }
    }
    for (const bell of site.bells) assert.equal(bell.hinge.parent, site.root);
  }
  assert.ok(
    game.cameraSurfaces.dynamic.some((s) => s.parent?.userData.cameraDynamic),
  );
});

test("replaced pedestal bounds cannot pull the follow camera into a bell rope", (t) => {
  const { game } = fixture(t),
    site = game.bellSites[1],
    c = site.root.position;
  const eye = new THREE.Vector3(c.x + 2.1, c.y + 1.3, c.z + 1.05),
    behind = eye.clone().add(new THREE.Vector3(-5, 1, 0.7));
  assert.equal(game.cameraSurfaces.entry(eye, behind), 1);
});

test("bell ropes cannot bypass field work, counterweights, reach or platform height", (t) => {
  const { game } = fixture(t);
  assert.equal(bellReady(game, game.bellSites[0]), false);
  pull(game, 0, 1);
  assert.equal(game.progress.bells[0], undefined);
  game.progress.field = [0, 1, 2].map((i) => `field-0-${i}`);
  pull(game, 0, 1);
  assert.equal(game.progress.bells[0], undefined);
  ready(game, 1);
  pull(game, 1, 2);
  assert.deepEqual(game.progress.bells[1].values, [2]);
  game.player.position.y -= 3;
  updateBellCourts(game, 1);
  bellInteract(game);
  assert.deepEqual(game.progress.bells[1].values, [2]);
  game.player.position.y += 3;
  game.player.position.x += 3;
  bellInteract(game);
  assert.deepEqual(game.progress.bells[1].values, [2]);
});

test("world rope inputs save every note and every transformed lesson remains completable", (t) => {
  const { game, storage } = fixture(t);
  for (let stage = 0; stage < 8; stage++) {
    ready(game, stage);
    const state = createPuzzle(level, stage);
    for (const [n, note] of state.target.entries()) {
      updateBellCourts(game, 0.3);
      pull(game, stage, note);
      const saved = new SaveStore(storage).level(level.id).bells[stage];
      assert.deepEqual(saved.values, state.target.slice(0, n + 1));
      assert.equal(saved.moves, n + 1);
    }
    assert.ok(
      isSolved(restorePuzzle(level, stage, game.progress.bells[stage])),
    );
    updateBellCourts(game, 1);
    pull(game, stage, 0);
    assert.equal(game.progress.bells[stage].values.length, state.target.length);
  }
});

test("replaying a phrase preserves an unfinished answer, schedules positioned notes and drives the matching visible bells", (t) => {
  const { game, sounds } = fixture(t);
  ready(game, 1);
  pull(game, 1, 3);
  const values = [...game.progress.bells[1].values],
    time = game.progress.time;
  assert.ok(playBellPhrase(game, 1));
  const site = game.bellSites[1],
    cue = bellCue(createPuzzle(level, 1).target, 1);
  assert.deepEqual(game.progress.bells[1].values, values);
  assert.equal(game.progress.bells[1].heard, true);
  assert.equal(game.audio.mode, "puzzle");
  const scheduled = sounds.slice(-cue.length);
  for (let i = 0; i < cue.length; i++) {
    assert.equal(scheduled[i].frequency, BELL_FREQUENCIES[cue[i]]);
    assert.equal(scheduled[i].delay, 0.25 + i * 1.1);
    assert.equal(scheduled[i].atTime, 0.25 + i * 1.1);
    assert.deepEqual(scheduled[i].position, site.bells[cue[i]].audioPosition);
    game.audio.ctx.currentTime = 0.25 + i * 1.1 + 0.02;
    updateBellCourts(game, 1.1);
    assert.equal(site.playback.active, i);
    assert.ok(site.bells[cue[i]].glow.emissiveIntensity > 2);
  }
  game.audio.ctx.currentTime = cue.length * 1.1 + 1;
  updateBellCourts(game, 1);
  assert.equal(site.playback, null);
  assert.equal(game.audio.mode, "explore");
  assert.equal(game.progress.time, time);
});

test("pause cancels queued bell strikes without completing or erasing the player's answer", (t) => {
  const { game, sounds } = fixture(t);
  ready(game, 3);
  pull(game, 3, 0);
  playBellPhrase(game, 3);
  const queued = sounds.slice(1);
  game.setPaused(true);
  assert.ok(queued.every((s) => s.stopped));
  assert.equal(game.bellSites[3].playback, null);
  assert.equal(game.progress.stage, 3);
  assert.deepEqual(game.progress.bells[3].values, [0]);
  assert.equal(game.audio.mode, "pause");
});

test("bell focus leaves the player still and moving ropes follow the actual clapper and grip endpoints", (t) => {
  const { game } = fixture(t);
  ready(game, 2);
  pull(game, 2, 1);
  game.paused = true;
  game.bellFocus = 2;
  const player = game.player.position.clone(),
    bell = game.bellSites[2].bells[1];
  updateBellCourts(game, 0.1);
  assert.ok(Math.abs(bell.hinge.rotation.z) > 0.1);
  assert.ok(bell.grip.position.y < 1.3);
  assert.ok(focusBells(game));
  assert.deepEqual(game.player.position, player);
  assert.ok(game.camera.position.toArray().every(Number.isFinite));
  game.renderer.domElement = { clientWidth: 390, clientHeight: 844 };
  assert.ok(focusBells(game));
  updateBellCourts(game, 100);
  assert.ok(Math.abs(bell.hinge.rotation.z) < 0.00001);
  assert.equal(bell.vertical.scale.y, 4.29 - 1.3);
});

test("changing chapters cancels the phrase and releases all bell court and focus references", (t) => {
  const { game, sounds } = fixture(t);
  ready(game, 0);
  playBellPhrase(game, 0);
  game.bellFocus = 0;
  game.level = LEVELS[3];
  assert.equal(buildBellCourts(game), false);
  assert.equal(game.bellSites.length, 0);
  assert.equal(game.bellFocus, null);
  assert.ok(sounds.every((s) => s.stopped));
});

test("focused listening schedules a full phrase while field time and player position remain paused", (t) => {
  const { game, sounds } = fixture(t);
  ready(game, 6);
  game.paused = true;
  game.bellFocus = 6;
  const position = game.player.position.clone(),
    time = game.progress.time;
  assert.ok(playBellPhrase(game, 6, { presentation: true }));
  assert.ok(game.presentationRemaining > 7);
  game.audio.ctx.currentTime = 2.5;
  updateBellCourts(game, 2.5);
  assert.equal(game.bellSites[6].playback.active, 2);
  assert.deepEqual(game.player.position, position);
  assert.equal(game.progress.time, time);
  cancelBellPlayback(game);
  assert.ok(sounds.every((sound) => sound.stopped));
  assert.equal(game.bellSites[6].playback, null);
});

test("bronze strikes use bounded spatial voices, audio-clock timing, obstruction and complete node cleanup", () => {
  const nodes = [],
    param = () => ({
      value: 0,
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
    });
  const make = () => ({
    gain: param(),
    frequency: param(),
    positionX: param(),
    positionY: param(),
    positionZ: param(),
    connect() {},
    disconnect() {
      this.disconnected = true;
    },
  });
  const sound = new Soundscape();
  sound.ctx = {
    currentTime: 4,
    createPanner: make,
    createBiquadFilter: make,
    createGain: make,
    createOscillator() {
      const n = {
        ...make(),
        start(time) {
          this.startTime = time;
        },
        stop(time) {
          if (time === undefined) this.onended?.();
          else this.endTime = time;
        },
      };
      nodes.push(n);
      return n;
    },
  };
  sound.buses = { effects: { input: make() } };
  const position = { x: 4, y: 7, z: 9 },
    voice = sound.bell(261.63, position, { delay: 1.2, blocked: true });
  assert.equal(voice.panner.panningModel, "HRTF");
  assert.equal(voice.panner.distanceModel, "linear");
  assert.equal(voice.panner.refDistance, 2);
  assert.equal(voice.panner.maxDistance, 55);
  assert.equal(voice.panner.positionY.value, 7);
  assert.equal(voice.filter.frequency.value, 1200);
  assert.ok(nodes.every((n) => n.startTime === 5.2));
  assert.equal(sound.playingNodes.size, 4);
  voice.stop();
  assert.equal(sound.playingNodes.size, 0);
  assert.equal(sound.bellVoices.size, 0);
  assert.ok(voice.panner.disconnected && voice.filter.disconnected);
  for (let i = 0; i < 18; i++) sound.bell(392, position);
  assert.equal(sound.bellVoices.size, 12);
  assert.equal(sound.playingNodes.size, 48);
  for (const v of [...sound.bellVoices]) v.stop();
  assert.equal(sound.playingNodes.size, 0);
});
