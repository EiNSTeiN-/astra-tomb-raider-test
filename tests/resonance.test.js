import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { buildCaverns, updateCaverns } from "../src/caverns.js";
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
  RESONANCE_TRIALS,
  resonanceTargets,
  resonanceSolution,
  resonanceClue,
  resonanceFrequency,
  normalizeResonance,
} from "../src/resonance-rules.js";
import {
  buildResonanceCourts,
  updateResonanceCourts,
  settleResonance,
  resonanceReady,
  resonanceInteract,
  saveResonanceState,
  focusResonance,
} from "../src/resonance-courts.js";
import { updateSoundSources } from "../src/sound-landmarks.js";
import { scoreBar } from "../src/audio.js";
const level = LEVELS[6];
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
  buildCaverns(game);
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
  buildResonanceCourts(game);
  game.cameraSurfaces.rebuild();
  game.soundSources = game.resonanceSources.map((s) => ({ ...s }));
  t.after(() => world.traverse((o) => o.geometry?.dispose()));
  return { game, storage };
}
function ready(game, stage = 1) {
  game.progress.stage = stage;
  game.progress.completed = false;
  game.progress.field = [0, 1, 2].map((i) => `field-${stage}-${i}`);
  game.counterweights.saved.solved = true;
  settleResonance(game);
  return game.resonanceSites[stage];
}
function use(game, site, index, delta = 1) {
  const f = index < 0 ? site.tablet : site.nodes[index].control;
  game.player.position.copy(f.group.position);
  game.nearest = f;
  game.keys.clear();
  if (delta < 0) game.keys.add("ShiftLeft");
  return resonanceInteract(game);
}

test("eight remembered arrays have distinct targets, layouts, relational clues and minimal reversible solutions", () => {
  assert.equal(
    new Set(RESONANCE_TRIALS.map((t) => JSON.stringify(t.positions))).size,
    8,
  );
  assert.equal(
    new Set(RESONANCE_TRIALS.map((t) => resonanceTargets(t).join(","))).size,
    8,
  );
  for (const [stage, trial] of RESONANCE_TRIALS.entries()) {
    const s = createPuzzle(level, stage);
    assert.ok(!isSolved(s));
    assert.equal(s.values.length, trial.positions.length);
    for (const [i, c] of trial.clues.entries()) {
      assert.ok(resonanceClue(trial, i).includes(String.fromCharCode(65 + i)));
      if (c.from !== undefined)
        assert.ok(
          c.from < i,
          "every relation is grounded in an earlier named voice",
        );
      for (let value = 0; value < 12; value++) {
        const sample = createPuzzle(level, stage);
        sample.values[i] = value;
        const plan = resonanceSolution(sample);
        const shortest = sample.values.reduce((n, v, i) => {
          const d = Math.abs(v - sample.target[i]);
          return n + Math.min(d, 12 - d);
        }, 0);
        assert.equal(plan.length, shortest);
        plan.forEach((a) => applyMove(sample, a));
        assert.ok(isSolved(sample));
      }
    }
    assert.equal(typeof hint(s, level), "string");
  }
});
test("invalid controls do not charge turns; saves clone only canonical chapter-specific marks", () => {
  const s = createPuzzle(level, 5),
    original = structuredClone(s);
  for (const a of [
    { index: -1 },
    { index: 5 },
    { index: 1.2 },
    { index: 0, delta: 0 },
    { index: 0, delta: 12 },
  ]) {
    assert.equal(applyMove(s, a).kind, "invalid");
    assert.deepEqual(s, original);
  }
  applyMove(s, { index: 0, delta: -1 });
  assert.equal(s.values[0], 11);
  applyMove(s, { index: 0 });
  assert.equal(s.values[0], 0);
  assert.equal(s.moves, 2);
  const save = normalizeSave({
    version: 1,
    levels: {
      crystal: { resonance: { 5: s } },
      embers: { resonance: { 5: s } },
    },
  });
  assert.deepEqual(save.levels.embers.resonance, {});
  assert.deepEqual(save.levels.crystal.resonance[5].values, s.values);
  s.values[0] = 7;
  assert.equal(save.levels.crystal.resonance[5].values[0], 0);
  for (const v of [[0], [0, 0, 0, 0, 12], [0, 0, 0, 0, NaN], [0, 0, 0, 0, "1"]])
    assert.deepEqual(normalizeResonance({ 5: { values: v } }), {});
  assert.deepEqual(
    restorePuzzle(level, 5, { values: [0], target: [9] }),
    original,
  );
});
test("33 physical crystals, 41 controls and 66 audible fronts clear the cave floor, gates and camera", (t) => {
  const { game } = fixture(t);
  assert.equal(game.resonanceSites.length, 8);
  assert.equal(game.resonanceSources.length, 66);
  assert.equal(game.items.filter((f) => f.type === "resonator").length, 41);
  for (const site of game.resonanceSites) {
    ready(game, site.stage);
    for (const f of [site.tablet, ...site.nodes.map((n) => n.control)])
      for (const dx of [-0.12, 0, 0.12])
        for (const dz of [-0.12, 0, 0.12])
          assert.ok(game.canMove(f.x * 7 + dx, f.z * 7 + dz, 0), f.id);
    for (const n of site.nodes) {
      assert.ok(!game.canMove(n.center.x, n.center.z, 0));
      assert.ok(n.handles.every((h) => h.parent === n.wheel));
      assert.ok(
        game.cavernProfile.height(n.center.x, n.center.z) > n.center.y + 5,
      );
      for (const source of [n.voice, n.reference])
        assert.ok(
          game.lineOfSight(
            n.control.group.position,
            new THREE.Vector3(source.x, source.y - 1.4, source.z),
          ),
          source.id,
        );
      const a = n.center.clone().add(new THREE.Vector3(0, 2, 2)),
        b = n.center.clone().add(new THREE.Vector3(0, 2, -2));
      assert.ok(game.cameraSurfaces.entry(a, b, 0.1) < 1);
      a.y += 3;
      b.y += 3;
      assert.equal(game.cameraSurfaces.entry(a, b, 0.1), 1);
    }
  }
});
test("field stations, counterweights, actual distance and height gate the tuning controls", (t) => {
  const { game } = fixture(t),
    site = game.resonanceSites[0];
  use(game, site, 0);
  assert.equal(game.progress.resonance[0], undefined);
  game.progress.field = [0, 1, 2].map((i) => `field-0-${i}`);
  assert.equal(resonanceReady(game, site), false);
  game.counterweights.saved.solved = true;
  use(game, site, 0);
  assert.equal(site.state.values[0], 1);
  game.player.position.z += 5;
  resonanceInteract(game);
  assert.equal(site.state.moves, 1);
  game.player.position.copy(site.nodes[0].control.group.position);
  game.player.position.y += 1;
  resonanceInteract(game);
  assert.equal(site.state.moves, 1);
  game.progress.stage = 1;
  resonanceInteract(game);
  assert.equal(site.state.moves, 1);
});
test("a world turn animates the collar, retunes its voice, preserves its reference and commits local storage", (t) => {
  const { game, storage } = fixture(t),
    site = ready(game),
    n = site.nodes[0],
    reference = n.reference.rate;
  use(game, site, 0);
  updateResonanceCourts(game, 0.05);
  updateSoundSources(game);
  assert.ok(n.display > 0 && n.display < 1);
  assert.equal(n.reference.rate, reference);
  assert.equal(n.voice.rate, resonanceFrequency(1) / 200);
  assert.equal(
    game.soundSources.find((s) => s.id === n.voice.id).rate,
    n.voice.rate,
  );
  const saved = new SaveStore(storage).level("crystal").resonance[1];
  assert.equal(saved.values[0], 1);
  assert.equal(saved.moves, 1);
  assert.equal(saved.last, 0);
  use(game, site, 0, -1);
  use(game, site, 0, -1);
  assert.ok(
    game.keys.has("ShiftLeft"),
    "holding Shift keeps subsequent turns descending",
  );
  updateResonanceCourts(game, 0.05);
  assert.ok(
    n.display > 11 && n.display < 12,
    "backward wrap takes one mechanical step",
  );
  assert.ok(
    game.resonanceSites[2].nodes.every(
      (n) => n.voice.activity === 0 && n.reference.activity === 0,
    ),
  );
});
test("all eight physical arrays solve in both directions and their aligned references fall silent", (t) => {
  const { game, storage } = fixture(t);
  let moves = 0;
  for (const site of game.resonanceSites) {
    ready(game, site.stage);
    game.setResonanceValues(site.stage, createPuzzle(level, site.stage));
    for (const a of resonanceSolution(site.state)) {
      use(game, site, a.index, a.delta);
      moves++;
    }
    updateResonanceCourts(game, 2);
    assert.ok(isSolved(site.state));
    assert.ok(
      site.nodes.every(
        (n) => n.reference.activity === 0 && n.voice.activity === 1,
      ),
    );
    assert.deepEqual(
      new SaveStore(storage).level("crystal").resonance[site.stage].values,
      site.state.target,
    );
  }
  assert.ok(moves > 90); // Substantive tuning commands, not a duration claim.
});
test("paused presentation moves tuning collars without advancing field physics, health or play time", (t) => {
  const { game } = fixture(t),
    site = ready(game);
  game.setPaused(true);
  const s = restorePuzzle(level, 1, game.progress.resonance[1]);
  const e = applyMove(s, { index: 0 });
  saveResonanceState(game, 1, s, e);
  const before = {
    position: game.player.position.clone(),
    time: game.progress.time,
    health: game.health,
  };
  game.active = true;
  game.scene = {};
  game.clock.getDelta = () => 0.1;
  game.updateCamera = () => {};
  game.updateDecorations = (_, dt) => updateResonanceCourts(game, dt);
  game.updateAudio = () => {};
  game.renderScene = () => {};
  game.updatePlayer = () => assert.fail("paused physics");
  game.updateEnemies = () => assert.fail("paused enemies");
  game.frame();
  assert.ok(site.nodes[0].display > 0 && site.nodes[0].display < 1);
  assert.equal(game.progress.time, before.time);
  assert.equal(game.health, before.health);
  assert.ok(game.player.position.equals(before.position));
});
test("pause and reload restore exact marks and use the existing four cavern lights for nearby tuning stones", (t) => {
  const { game, storage } = fixture(t),
    site = ready(game);
  use(game, site, 0, -1);
  game.setPaused(true);
  assert.equal(game.resonanceGrip, null);
  assert.equal(site.nodes[0].display, 11);
  const saved = new SaveStore(storage).level("crystal"),
    other = fixture(t, saved).game;
  assert.deepEqual(other.resonanceSites[1].state.values, site.state.values);
  assert.equal(other.resonanceSites[1].state.moves, 1);
  game.player.position.copy(site.nodes[0].center);
  updateCaverns(game, 0);
  assert.equal(game.cavernLights.length, 4);
  assert.ok(
    game.cavernLights.some(
      (l) =>
        Math.hypot(
          l.position.x - site.nodes[0].center.x,
          l.position.z - site.nodes[0].center.z,
        ) < 0.01,
    ),
  );
});
test("focused cameras stay under the vault with visible arrays, and another biome releases their references", (t) => {
  const { game } = fixture(t);
  game.paused = true;
  for (const [width, height] of [
    [900, 650],
    [390, 844],
    [844, 390],
  ])
    for (const site of game.resonanceSites) {
      Object.assign(game.renderer.domElement, {
        clientWidth: width,
        clientHeight: height,
      });
      game.camera.aspect = width / height;
      game.camera.updateProjectionMatrix();
      game.resonanceFocus = site.stage;
      assert.ok(focusResonance(game));
      game.camera.updateMatrixWorld();
      assert.ok(
        game.camera.position.y <
          game.cavernProfile.height(
            game.camera.position.x,
            game.camera.position.z,
          ),
        "camera inside cavern",
      );
      for (const n of site.nodes) {
        const p = n.center
          .clone()
          .add(new THREE.Vector3(0, 2, 0))
          .project(game.camera);
        assert.ok(
          Math.abs(p.x) < 1 && Math.abs(p.y) < 1,
          `${site.stage} ${n.index} ${width}: ${p.toArray()}`,
        );
        if (width === 390)
          assert.ok(p.y > 0, "portrait array above its controls");
      }
    }
  game.resonanceFocus = null;
  game.yaw = 0;
  game.pitch = 0.15;
  game.updateCamera(0.1);
  assert.equal(game.camera.fov, 58);
  assert.equal(game.camera.filmOffset, 0);
  game.level = LEVELS[4];
  buildResonanceCourts(game);
  assert.deepEqual(game.resonanceSites, []);
  assert.deepEqual(game.resonanceSources, []);
  assert.equal(game.resonanceFocus, null);
});
test("tuning leaves room beneath the quiet crystal score without changing its objective harmony", () => {
  const explore = scoreBar("crystal", 3, 0, "explore", "survey"),
    tuning = scoreBar("crystal", 3, 0, "explore", "tuning");
  assert.ok(explore.length > tuning.length);
  assert.ok(tuning.every((e) => ["pad", "bass"].includes(e.voice)));
  assert.deepEqual(
    tuning,
    explore.filter((e) => ["pad", "bass"].includes(e.voice)),
  );
});
