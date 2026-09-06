import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { buildForgeArchitecture } from "../src/forge-architecture.js";
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
  THERMAL_TRIALS,
  thermalEffects,
  thermalSolutions,
  thermalSolution,
  thermalTarget,
  normalizeThermal,
} from "../src/thermal-rules.js";
import {
  buildThermalCourts,
  thermalReady,
  thermalInteract,
  saveThermalState,
  updateThermalCourts,
  settleThermal,
  focusThermal,
} from "../src/thermal-courts.js";
import { updateSoundSources } from "../src/sound-landmarks.js";

const level = LEVELS[4];
function fixture(t, saved = null) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  t.after(() => (globalThis.document = old));
  const memory = new Map(),
    storage = {
      getItem: (k) => memory.get(k),
      setItem: (k, v) => memory.set(k, v),
    },
    store = new SaveStore(storage),
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    world = new THREE.Group(),
    hits = [];
  const progress = store.level(level.id);
  if (saved) Object.assign(progress, saved);
  const game = Object.assign(Object.create(Adventure.prototype), {
    store,
    map,
    level,
    world,
    progress,
    terrainProfile: terrain,
    groundHeight: terrain.height,
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    items: [],
    obstacles: [],
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
    audio: {
      setMode() {},
      resume() {},
      tone() {},
      noiseHit: (...args) => hits.push(args),
    },
  });
  buildForgeArchitecture(game);
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
  buildThermalCourts(game);
  game.cameraSurfaces.rebuild();
  game.soundSources = game.thermalSources.map((s) => ({ ...s }));
  t.after(() => world.traverse((o) => o.geometry?.dispose()));
  return { game, storage, hits };
}
function ready(game, stage = 1) {
  game.progress.stage = stage;
  game.progress.completed = false;
  game.progress.field = [0, 1, 2].map((i) => `field-${stage}-${i}`);
  game.counterweights.saved.solved = true;
  settleThermal(game);
  return game.thermalSites[stage];
}
function use(game, site, index) {
  const f = index < 0 ? site.tablet : site.nodes[index].control;
  game.player.position.copy(f.group.position);
  game.nearest = f;
  return thermalInteract(game);
}

test("eight thermal trials have six coupling laws, distinct goals and exact shortest solutions from every reachable pattern", () => {
  assert.equal(new Set(THERMAL_TRIALS.map((t) => t.circuit)).size, 6);
  assert.equal(new Set(THERMAL_TRIALS.map((t) => t.target.join(""))).size, 8);
  const lengths = [];
  for (const [stage, trial] of THERMAL_TRIALS.entries()) {
    const state = createPuzzle(level, stage),
      effects = thermalEffects(trial),
      best = thermalSolutions(trial);
    lengths.push(state.solution.length);
    assert.ok(!isSolved(state));
    for (const [delta, pressed] of best) {
      let produced = 0;
      for (let i = 0; i < effects.length; i++)
        if (pressed & (1 << i)) produced ^= effects[i];
      assert.equal(produced, delta);
      const mask = delta ^ thermalTarget(trial),
        solution = thermalSolution(stage, mask);
      assert.equal(
        solution.length,
        pressed.toString(2).replaceAll("0", "").length,
      );
      assert.equal(
        solution.reduce((m, i) => m ^ effects[i], mask),
        thermalTarget(trial),
      );
      for (const effect of effects)
        assert.ok(
          best.has(delta ^ effect),
          "any further turn stays recoverable",
        );
    }
    for (const index of [...state.solution]) applyMove(state, { index });
    assert.ok(isSolved(state));
  }
  assert.deepEqual(lengths, [5, 6, 6, 7, 6, 8, 10, 11]);
});

test("thermal inputs are reversible, reject invalid controls without charging moves and use actual circuit hints", () => {
  for (let stage = 0; stage < 8; stage++) {
    const s = createPuzzle(level, stage),
      original = s.mask;
    for (const index of [-1, 16, 1.5, NaN]) {
      const before = structuredClone(s);
      assert.equal(applyMove(s, { index }).kind, "invalid");
      assert.deepEqual(s, before);
    }
    for (let i = 0; i < s.effects.length; i++) {
      applyMove(s, { index: i });
      applyMove(s, { index: i });
      assert.equal(s.mask, original);
    }
    assert.ok(hint(s, level).includes("shortest route"));
    const restored = restorePuzzle(level, stage, {
      mask: s.mask,
      moves: s.moves,
      last: s.last,
    });
    assert.deepEqual(restored, s);
  }
});

test("thermal saves accept reachable canonical masks, reject malformed and impossible patterns, and remain chapter-specific", () => {
  const s = createPuzzle(level, 1),
    valid = { mask: s.mask, moves: 3, last: 4 };
  assert.deepEqual(normalizeThermal({ 1: valid })[1], valid);
  for (const mask of [-1, 65536, 1.5, NaN, Infinity, "3"])
    assert.deepEqual(normalizeThermal({ 1: { mask } }), {});
  const impossible = Array.from(
    { length: 1 << s.effects.length },
    (_, i) => i,
  ).find((i) => thermalSolution(1, i) === null);
  assert.deepEqual(normalizeThermal({ 1: { mask: impossible } }), {});
  assert.deepEqual(normalizeThermal([]), {});
  assert.equal(
    normalizeThermal({ 1: { ...valid, moves: Infinity, last: 100 } })[1].last,
    null,
  );
  const save = normalizeSave({
    version: 1,
    levels: {
      embers: { thermal: { 1: valid } },
      tides: { thermal: { 1: valid } },
    },
  });
  assert.deepEqual(save.levels.embers.thermal[1], valid);
  assert.deepEqual(save.levels.tides.thermal, {});
  valid.mask = 0;
  assert.notEqual(save.levels.embers.thermal[1].mask, valid.mask);
});

test("all 102 chambers and 110 controls have clear ground and sound fronts, retained hand anchors and upward-opening shutters", (t) => {
  const { game } = fixture(t);
  assert.equal(game.thermalSites.length, 8);
  assert.equal(game.thermalSources.length, 204);
  assert.equal(game.items.filter((f) => f.type === "thermal").length, 110);
  for (const site of game.thermalSites) {
    ready(game, site.stage);
    for (const f of [site.tablet, ...site.nodes.map((n) => n.control)])
      for (const dx of [-0.12, 0, 0.12])
        for (const dz of [-0.12, 0, 0.12])
          assert.ok(game.canMove(f.x * 7 + dx, f.z * 7 + dz, 0), f.id);
    for (const n of site.nodes) {
      assert.ok(
        !game.canMove(
          site.root.position.x + n.x,
          site.root.position.z + n.z,
          0,
        ),
      );
      assert.ok(n.handles.every((h) => h.parent === n.wheel));
      const center = site.root.position
        .clone()
        .add(new THREE.Vector3(n.x, n.y + 1.1, n.z));
      const front = center.clone().add(new THREE.Vector3(0, 0, 1.5));
      const back = center.clone().add(new THREE.Vector3(0, 0, -1.5));
      assert.ok(
        game.cameraSurfaces.entry(front, back, 0.1) < 1,
        "batched chamber retains camera obstruction",
      );
      front.y += 1.7;
      back.y += 1.7;
      assert.equal(
        game.cameraSurfaces.entry(front, back, 0.1),
        1,
        "camera clears the chamber above its shutters",
      );
      for (const source of [n.rumble, n.hiss])
        assert.ok(
          game.lineOfSight(
            n.control.group.position,
            new THREE.Vector3(source.x, source.y - 1.4, source.z),
          ),
          source.id,
        );
      n.plume.updateWorldMatrix(true, false);
      const p = n.plume.getWorldPosition(new THREE.Vector3());
      assert.ok(
        p.distanceTo(new THREE.Vector3(n.hiss.x, n.hiss.y, n.hiss.z)) < 0.00001,
      );
      if (n.heat === 1)
        for (const h of n.hinges) {
          h.group.updateWorldMatrix(true, true);
          const after = h.group.children[0].getWorldPosition(
            new THREE.Vector3(),
          );
          assert.ok(
            after.y > site.root.position.y + n.y + 1.73,
            "hot shutters lift above their hinges",
          );
        }
    }
  }
});

test("field work, counterweights, current stage and actual reach gate physical valve commands", (t) => {
  const { game } = fixture(t),
    site = game.thermalSites[0],
    initial = site.state.mask;
  use(game, site, 0);
  assert.equal(site.state.mask, initial);
  assert.equal(game.progress.thermal[0], undefined);
  game.progress.field = ["field-0-0", "field-0-1", "field-0-2"];
  assert.equal(thermalReady(game, site), false);
  game.counterweights.saved.solved = true;
  assert.equal(thermalReady(game, site), true);
  use(game, site, 0);
  assert.notEqual(site.state.mask, initial);
  const changed = site.state.mask;
  game.player.position.z += 5;
  thermalInteract(game);
  assert.equal(site.state.mask, changed);
  game.player.position.copy(site.nodes[0].control.group.position);
  game.player.position.y += 1;
  thermalInteract(game);
  assert.equal(site.state.mask, changed);
  game.progress.stage = 1;
  thermalInteract(game);
  assert.equal(site.state.mask, changed);
});

test("world commands animate every linked shutter, preserve the saved mask and release coolant at the visible outlet", (t) => {
  const { game, storage, hits } = fixture(t),
    site = ready(game),
    initial = site.state.mask;
  const values = site.nodes.map((n) => n.heat),
    eventIndex = 0,
    effect = site.state.effects[eventIndex];
  use(game, site, eventIndex);
  assert.equal(site.state.mask, initial ^ effect);
  assert.equal(hits.length, 1);
  updateThermalCourts(game, 0.08);
  updateSoundSources(game);
  for (const n of site.nodes) {
    const affected = !!(effect & (1 << n.index));
    if (affected) {
      assert.ok(n.heat > 0 && n.heat < 1);
      assert.ok(n.hiss.activity > 0);
      assert.ok(n.plume.visible);
    } else assert.equal(n.heat, values[n.index]);
    assert.equal(n.heatUniform.value, n.heat);
    const copied = game.soundSources.find((s) => s.id === n.hiss.id);
    assert.equal(copied.activity, n.hiss.activity);
  }
  assert.equal(
    new SaveStore(storage).level("embers").thermal[1].mask,
    site.state.mask,
  );
  for (let i = 0; i < 20; i++) updateThermalCourts(game, 0.1);
  assert.equal(site.moving, false);
  assert.ok(site.nodes.every((n) => n.hiss.activity === 0 && !n.plume.visible));
  assert.ok(
    game.thermalSites[2].nodes.every(
      (n) => n.hiss.activity === 0 && n.rumble.activity === 0,
    ),
  );
});

test("all 59 authored shortest-route turns succeed through physical valve interaction and save their target heat pattern", (t) => {
  const { game, storage } = fixture(t);
  let moves = 0;
  for (let stage = 0; stage < 8; stage++) {
    const site = ready(game, stage),
      s = createPuzzle(level, stage);
    saveThermalState(game, stage, s);
    for (const index of [...s.solution]) {
      use(game, site, index);
      updateThermalCourts(game, 0.4);
      moves++;
    }
    assert.ok(isSolved(site.state));
    assert.equal(
      new SaveStore(storage).level("embers").thermal[stage].mask,
      s.targetMask,
    );
  }
  assert.equal(moves, 59);
});

test("focused thermal presentation updates shutters while field simulation and expedition time remain paused", (t) => {
  const { game } = fixture(t),
    site = ready(game);
  game.setPaused(true);
  const s = restorePuzzle(level, 1, game.progress.thermal[1]),
    event = applyMove(s, { index: 0 });
  saveThermalState(game, 1, s, event);
  const time = game.progress.time,
    position = game.player.position.clone(),
    health = game.health;
  game.active = true;
  game.scene = {};
  game.clock.getDelta = () => 0.15;
  game.updateCamera = () => {};
  game.updateDecorations = (_, __, dt) => updateThermalCourts(game, dt);
  game.updateAudio = () => updateSoundSources(game);
  game.renderScene = () => {};
  game.updatePlayer = () =>
    assert.fail("paused field physics must not advance");
  game.updateEnemies = () => assert.fail("paused guardians must not advance");
  game.frame();
  assert.ok(site.nodes.some((n) => n.heat > 0 && n.heat < 1));
  assert.equal(game.progress.time, time);
  assert.equal(game.health, health);
  assert.ok(game.player.position.equals(position));
});

test("pause and reload settle committed shutters without replaying steam and restore quiet hot-chamber rumble", (t) => {
  const { game, storage } = fixture(t),
    site = ready(game);
  use(game, site, 0);
  updateThermalCourts(game, 0.05);
  assert.ok(game.thermalGrip);
  game.setPaused(true);
  assert.equal(game.thermalGrip, null);
  assert.ok(site.nodes.every((n) => n.hiss.activity === 0));
  const saved = new SaveStore(storage).level("embers"),
    rebuilt = fixture(t, saved).game,
    other = rebuilt.thermalSites[1];
  assert.equal(other.state.mask, site.state.mask);
  assert.equal(other.state.last, 0);
  assert.equal(other.state.moves, 1);
  assert.ok(other.nodes.every((n) => n.hiss.activity === 0));
  assert.deepEqual(
    other.nodes.map((n) => n.heat),
    site.nodes.map((n) => n.heat),
  );
});

test("focused cameras frame the regulator rows on desktop and portrait and changing chapters clears references", (t) => {
  const { game } = fixture(t);
  game.paused = true;
  for (const [width, height] of [
    [900, 650],
    [390, 844],
  ])
    for (const site of game.thermalSites) {
      Object.assign(game.renderer.domElement, {
        clientWidth: width,
        clientHeight: height,
      });
      game.camera.aspect = width / height;
      game.camera.updateProjectionMatrix();
      game.thermalFocus = site.stage;
      assert.equal(focusThermal(game), true);
      game.camera.updateMatrixWorld();
      for (const n of site.nodes) {
        const p = n.body.position
          .clone()
          .add(site.root.position)
          .add(new THREE.Vector3(0, 1.4, 0))
          .project(game.camera);
        assert.ok(Math.abs(p.x) < 1 && p.y > -1 && p.y < 1);
        if (width === 390)
          assert.ok(p.y > 0, "portrait machinery above the panel");
      }
    }
  game.level = LEVELS[3];
  buildThermalCourts(game);
  assert.deepEqual(game.thermalSites, []);
  assert.deepEqual(game.thermalSources, []);
  assert.equal(game.thermalFocus, null);
  assert.equal(game.thermalTime, null);
  assert.equal(game.thermalGrip, null);
});
