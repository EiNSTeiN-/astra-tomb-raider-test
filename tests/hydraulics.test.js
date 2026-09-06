import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { buildFieldGates } from "../src/field-world.js";
import { buildPalaceArchitecture } from "../src/palace-architecture.js";
import { buildCounterweights } from "../src/counterweights.js";
import {
  createPuzzle,
  restorePuzzle,
  applyMove,
  isSolved,
  hint,
} from "../src/puzzles.js";
import {
  HYDRAULIC_TRIALS,
  hydraulicStates,
  normalizeHydraulics,
  hydraulicInput,
  inHydraulicCourt,
} from "../src/hydraulic-rules.js";
import {
  buildHydraulicCourts,
  updateHydraulicCourts,
  hydraulicReady,
  hydraulicInteract,
  saveHydraulicState,
  settleHydraulics,
  focusHydraulics,
} from "../src/hydraulic-courts.js";
import { cisternGeometry } from "../src/hydraulic-geometry.js";
import { updateSoundSources } from "../src/sound-landmarks.js";

const level = LEVELS[3];
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
    hits = [],
    messages = [];
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
    camera: new THREE.PerspectiveCamera(55, 900 / 650, 0.1, 1000),
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
    cb: { toast: (s) => messages.push(s), saved() {}, puzzle() {} },
    audio: {
      setMode() {},
      resume() {},
      tone() {},
      noiseHit: (...args) => hits.push(args),
    },
  });
  buildPalaceArchitecture(game);
  for (const f of map.features.filter((f) => f.type === "mechanism")) {
    f.group = new THREE.Group();
    f.group.position.set(f.x * 7, terrain.height(f.x * 7, f.z * 7), f.z * 7);
    world.add(f.group);
    f.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), game.glowMat);
    f.group.add(f.marker);
    if (f.stage === 0) buildCounterweights(game, f, f.group);
    else {
      game.cylinder(1.8, 2.1, 0.8, game.darkMat, 0, 0.5, 0, f.group);
      game.cylinder(1.4, 1.6, 0.35, game.goldMat, 0, 1.05, 0, f.group);
      f.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), game.glowMat);
      f.group.add(f.core);
    }
    game.items.push(f);
  }
  buildFieldGates(game);
  buildHydraulicCourts(game);
  game.cameraSurfaces.rebuild();
  game.soundSources = game.hydraulicSources.map((s) => ({ ...s }));
  t.after(() => world.traverse((o) => o.geometry?.dispose()));
  return { game, storage, hits, messages };
}
function ready(game, stage = 0) {
  game.progress.stage = stage;
  game.progress.field = [0, 1, 2].map((i) => `field-${stage}-${i}`);
  game.counterweights.saved.solved = true;
  updateHydraulicCourts(game, 0);
  return game.hydraulicSites[stage];
}
function use(game, site, index) {
  const f = index < 0 ? site.tablet : site.tanks[index].control;
  game.player.position.copy(f.group.position);
  game.nearest = f;
  return hydraulicInteract(game);
}

test("nine authored measures have distinct capacities and directed circuits, conserve water, and remain solvable from every reachable state", () => {
  assert.equal(
    new Set(HYDRAULIC_TRIALS.map((t) => t.capacity.join(","))).size,
    9,
  );
  assert.equal(
    new Set(HYDRAULIC_TRIALS.map((t) => JSON.stringify(t.positions))).size,
    9,
  );
  assert.equal(
    new Set(HYDRAULIC_TRIALS.map((t) => JSON.stringify(t.links))).size,
    7,
  );
  const lengths = [];
  for (let stage = 0; stage < 9; stage++) {
    const trial = HYDRAULIC_TRIALS[stage],
      state = createPuzzle(level, stage),
      all = hydraulicStates(trial);
    lengths.push(state.solution.length);
    for (const reachable of all) {
      assert.equal(
        reachable.value.reduce((a, b) => a + b),
        trial.capacity[0],
      );
      assert.ok(
        hydraulicStates(trial, reachable.value).some((s) =>
          s.value.every((v, i) => v === trial.target[i]),
        ),
      );
    }
    for (const [a, b] of state.solution) {
      applyMove(state, { index: a });
      const e = applyMove(state, { index: b });
      assert.equal(e.kind, "transfer");
      assert.ok(state.values.every((v, i) => v >= 0 && v <= state.capacity[i]));
      assert.equal(
        state.values.reduce((a, b) => a + b),
        state.capacity[0],
      );
    }
    assert.ok(isSolved(state));
    assert.equal(state.moves, state.solution.length);
    assert.ok(hint(state, level).includes("balanced"));
  }
  assert.deepEqual(lengths, [7, 9, 11, 12, 20, 18, 28, 22, 30]);
});

test("selection, cancellation, check valves and full or empty receivers cannot consume or invent a transfer", () => {
  const s = createPuzzle(level, 8);
  assert.equal(hydraulicInput(s, 1).kind, "empty");
  assert.equal(s.moves, 0);
  assert.equal(hydraulicInput(s, 0).kind, "selected");
  assert.equal(hydraulicInput(s, 2).kind, "blocked");
  assert.equal(s.selected, 0);
  assert.equal(hydraulicInput(s, 0).kind, "cancelled");
  assert.equal(s.selected, null);
  hydraulicInput(s, 0);
  assert.equal(hydraulicInput(s, 1).kind, "transfer");
  assert.deepEqual(s.values, [7, 10, 0]);
  hydraulicInput(s, 0);
  assert.equal(hydraulicInput(s, 1).kind, "full");
  assert.equal(s.moves, 1);
  for (const index of [-1, 3, 0.5, NaN])
    assert.equal(hydraulicInput(s, index).kind, "invalid");
  assert.deepEqual(s.values, [7, 10, 0]);
});

test("saved measures admit only reachable integer volumes, preserve a selected source, and copy independently", () => {
  const bad = {
    0: { values: [3, 5, 0], moves: 4, selected: 1 },
    1: { values: [5, 2, 2] },
    2: { values: [6.5, 0.5, 5] },
    3: { values: [2, 4, 3], selected: 9 },
    9: { values: [8, 0, 0] },
    "01": { values: [10, 0, 0] },
  };
  const s = normalizeHydraulics(bad);
  assert.deepEqual(Object.keys(s), ["0"]);
  assert.equal(s[0].selected, 1);
  s[0].values[0] = 0;
  assert.equal(bad[0].values[0], 3);
  const a = createPuzzle(level, 2);
  applyMove(a, { index: 0 });
  const save = normalizeSave({
    version: 1,
    levels: {
      tides: { hydraulics: { 2: a } },
      verdant: { hydraulics: { 2: a } },
    },
  });
  assert.equal(save.levels.tides.hydraulics[2].selected, 0);
  assert.deepEqual(save.levels.verdant.hydraulics, {});
  assert.deepEqual(
    restorePuzzle(level, 2, save.levels.tides.hydraulics[2]).values,
    [12, 0, 0],
  );
});

test("cisterns have closed, finite bowl walls and each geometric water unit occupies the same volume", (t) => {
  for (const variant of [0, 1, 2]) {
    const g = cisternGeometry(12, variant),
      p = g.attributes.position,
      idx = g.index.array,
      edges = new Map();
    assert.ok(p.array.every(Number.isFinite));
    assert.ok(g.attributes.normal.array.every(Number.isFinite));
    const key = (i) =>
      [p.getX(i), p.getY(i), p.getZ(i)]
        .map((v) => Math.round(v * 1e5))
        .join(",");
    let volume = 0;
    for (let i = 0; i < idx.length; i += 3) {
      const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]].map((j) =>
        new THREE.Vector3().fromBufferAttribute(p, j),
      );
      if (b.clone().sub(a).cross(c.clone().sub(a)).length() < 1e-9) continue;
      volume += a.dot(b.clone().cross(c)) / 6;
      for (let k = 0; k < 3; k++) {
        const a = key(idx[i + k]),
          b = key(idx[i + ((k + 1) % 3)]),
          e = [a, b].sort().join("|");
        edges.set(e, (edges.get(e) || 0) + 1);
      }
    }
    assert.ok(volume > 0);
    assert.ok([...edges.values()].every((n) => n === 2));
    g.dispose();
  }
  const { game } = fixture(t);
  for (const site of game.hydraulicSites)
    for (const [i, tank] of site.tanks.entries()) {
      const g = tank.surface.geometry,
        p = g.attributes.position,
        index = g.index.array;
      let area = 0;
      for (let j = 0; j < index.length; j += 3) {
        const [a, b, c] = [index[j], index[j + 1], index[j + 2]].map((k) =>
          new THREE.Vector3().fromBufferAttribute(p, k),
        );
        area += b.sub(a).cross(c.sub(a)).length() / 2;
      }
      // Water stays 2.5 cm clear of its stone wall to avoid coincident surfaces.
      const innerArea = area * (tank.radius / (tank.radius - 0.025)) ** 2;
      assert.ok(
        Math.abs(innerArea * 2.2 - site.state.capacity[i] * 0.6) < 1e-5,
      );
    }
});

test("all 36 world controls stand clear of tanks and palace masonry, and camera captures leave open air below the pipes", (t) => {
  const { game } = fixture(t);
  assert.equal(game.hydraulicSites.length, 9);
  assert.equal(game.hydraulicSources.length, 54);
  for (const site of game.hydraulicSites) {
    for (const f of [site.tablet, ...site.tanks.map((t) => t.control)])
      for (const dx of [-0.12, 0, 0.12])
        for (const dz of [-0.12, 0, 0.12])
          assert.ok(game.canMove(f.x * 7 + dx, f.z * 7 + dz, 0), f.id);
    for (const tank of site.tanks) {
      assert.ok(
        !game.canMove(
          tank.group.position.x + site.root.position.x,
          tank.group.position.z + site.root.position.z,
          0,
        ),
      );
      assert.ok(tank.handles.every((h) => h.parent === tank.wheel));
      assert.ok(
        inHydraulicCourt(game.map, tank.control.x * 7, tank.control.z * 7),
      );
    }
    const c = site.root.position;
    assert.equal(
      game.cameraSurfaces.entry(
        new THREE.Vector3(c.x + 4, c.y + 1.7, c.z + 18),
        new THREE.Vector3(c.x + 4, c.y + 1.7, c.z + 26),
      ),
      1,
    );
  }
  assert.equal(game.cameraSurfaces.pending.length, 0);
});

test("field work, the first counterweight chamber, stage order and physical reach guard the controls", (t) => {
  const { game } = fixture(t),
    site = game.hydraulicSites[0];
  assert.equal(hydraulicReady(game, site), false);
  use(game, site, 0);
  assert.deepEqual(game.progress.hydraulics, {});
  game.progress.field = ["field-0-0", "field-0-1", "field-0-2"];
  assert.equal(hydraulicReady(game, site), false);
  ready(game);
  assert.equal(hydraulicReady(game, site), true);
  const f = site.tanks[0].control;
  game.nearest = f;
  game.player.position.copy(f.group.position).add(new THREE.Vector3(5, 0, 0));
  hydraulicInteract(game);
  assert.deepEqual(game.progress.hydraulics, {});
  game.player.position.copy(f.group.position).add(new THREE.Vector3(0, 2, 0));
  hydraulicInteract(game);
  assert.deepEqual(game.progress.hydraulics, {});
  assert.equal(hydraulicReady(game, game.hydraulicSites[1]), false);
  game.progress.completed = true;
  assert.equal(hydraulicReady(game, site), false);
});

test("world commands, water surfaces, float gauges and spatial emitters follow a conserving transfer and become quiet at rest", (t) => {
  const { game, storage } = fixture(t),
    site = ready(game, 1);
  use(game, site, 0);
  assert.equal(game.progress.hydraulics[1].selected, 0);
  assert.equal(new SaveStore(storage).level("tides").hydraulics[1].selected, 0);
  use(game, site, 2);
  assert.deepEqual(site.state.values, [7, 0, 3]);
  assert.equal(site.state.moves, 1);
  const old = [...site.state.values];
  use(game, site, 1);
  assert.deepEqual(site.state.values, old, "busy pump rejects another command");
  updateHydraulicCourts(game, site.flow.duration / 2);
  updateSoundSources(game);
  assert.ok(Math.abs(site.display.reduce((a, b) => a + b) - 10) < 1e-9);
  assert.deepEqual(site.display, [8.5, 0, 1.5]);
  for (const [i, tank] of site.tanks.entries()) {
    assert.ok(
      Math.abs(
        tank.surface.position.y -
          (0.7 + (site.display[i] / site.state.capacity[i]) * 2.2),
      ) < 1e-9,
    );
    assert.equal(tank.float.position.y, tank.surface.position.y);
    assert.equal(tank.stream.visible, i === 2);
  }
  assert.equal(game.soundSources.filter((s) => s.activity > 0).length, 3);
  const source = game.soundSources.find(
      (s) =>
        s.channel === "water" && s.hydraulicStage === 1 && s.tankIndex === 2,
    ),
    tank = site.tanks[2];
  assert.equal(
    source.y,
    site.root.position.y +
      tank.group.position.y +
      (tank.nozzle.y + tank.surface.position.y) / 2,
  );
  updateHydraulicCourts(game, 10);
  updateSoundSources(game);
  assert.equal(site.flow, null);
  assert.ok(game.soundSources.every((s) => s.activity === 0));
  assert.deepEqual(site.display, site.state.values);
});

test("all 157 transfers in the nine authored solutions execute through their world handwheels and persist their target measures", (t) => {
  const { game, storage } = fixture(t);
  let count = 0;
  for (let stage = 0; stage < 9; stage++) {
    const site = ready(game, stage),
      solution = createPuzzle(level, stage).solution;
    for (const [a, b] of solution) {
      use(game, site, a);
      use(game, site, b);
      assert.ok(site.flow);
      updateHydraulicCourts(game, 10);
      count++;
    }
    assert.ok(isSolved(site.state));
    assert.deepEqual(
      new SaveStore(storage).level("tides").hydraulics[stage].values,
      site.state.target,
    );
    assert.equal(site.state.moves, solution.length);
  }
  assert.equal(count, 157);
});

test("paused focused presentation animates the transfer without advancing player physics, health or expedition time", (t) => {
  const { game } = fixture(t),
    site = ready(game);
  game.setPaused(true);
  game.active = true;
  game.scene = {};
  const s = createPuzzle(level, 0);
  saveHydraulicState(game, 0, s, applyMove(s, { index: 0 }));
  saveHydraulicState(game, 0, s, applyMove(s, { index: 2 }));
  const position = game.player.position.clone(),
    health = game.health,
    time = game.progress.time;
  game.clock.getDelta = () => 0.25;
  game.updateCamera = () => {};
  game.updateDecorations = (_, _2, dt) => updateHydraulicCourts(game, dt);
  game.updateAudio = () => updateSoundSources(game);
  game.renderScene = () => {};
  game.updatePlayer = () => assert.fail("paused player must not update");
  game.updateEnemies = () => assert.fail("paused enemies must not update");
  game.frame();
  assert.ok(site.display[2] > 0 && site.display[2] < 3);
  assert.equal(game.progress.time, time);
  assert.equal(game.health, health);
  assert.ok(game.player.position.equals(position));
  for (let i = 0; i < 8; i++) game.frame();
  assert.equal(site.flow, null);
  assert.deepEqual(site.display, [5, 0, 3]);
});

test("pause and reload settle committed water commands and clear transient sound and hand poses", (t) => {
  const { game, storage } = fixture(t),
    site = ready(game);
  use(game, site, 0);
  use(game, site, 2);
  updateHydraulicCourts(game, 0.1);
  assert.ok(site.flow);
  assert.ok(game.hydraulicGrip);
  game.setPaused(true);
  updateSoundSources(game);
  assert.equal(site.flow, null);
  assert.equal(game.hydraulicGrip, null);
  assert.deepEqual(site.display, [5, 0, 3]);
  assert.ok(game.soundSources.every((s) => s.activity === 0));
  const saved = new SaveStore(storage).level("tides");
  const rebuilt = fixture(t, saved).game;
  assert.deepEqual(rebuilt.hydraulicSites[0].display, [5, 0, 3]);
  assert.equal(rebuilt.hydraulicSites[0].flow, null);
  assert.ok(rebuilt.hydraulicSources.every((s) => s.activity === 0));
});

test("focused cameras frame all three cisterns on desktop and portrait, and a chapter change clears hydraulic references", (t) => {
  const { game } = fixture(t);
  game.paused = true;
  for (const [width, height] of [
    [900, 650],
    [390, 844],
  ])
    for (const site of game.hydraulicSites) {
      Object.assign(game.renderer.domElement, {
        clientWidth: width,
        clientHeight: height,
      });
      game.camera.aspect = width / height;
      game.camera.updateProjectionMatrix();
      game.hydraulicFocus = site.stage;
      assert.equal(focusHydraulics(game), true);
      game.camera.updateMatrixWorld();
      for (const tank of site.tanks) {
        const p = tank.group.position
          .clone()
          .add(site.root.position)
          .add(new THREE.Vector3(0, 1.8, 0))
          .project(game.camera);
        assert.ok(Math.abs(p.x) < 1, `${width}: cistern horizontal frame`);
        assert.ok(p.y > -1 && p.y < 1);
        if (width === 390)
          assert.ok(p.y > 0, "portrait cisterns above the controls");
      }
    }
  game.level = LEVELS[0];
  buildHydraulicCourts(game);
  assert.deepEqual(game.hydraulicSites, []);
  assert.deepEqual(game.hydraulicSources, []);
  assert.equal(game.hydraulicFocus, null);
  assert.equal(game.hydraulicGrip, null);
});
