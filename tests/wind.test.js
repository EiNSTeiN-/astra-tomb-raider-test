import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { CameraSurfaces } from "../src/camera-collision.js";
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
  saveWindState,
  focusWind,
} from "../src/wind-courts.js";
import { updateSoundSources } from "../src/sound-landmarks.js";
import { syncWindCourt } from "../src/wind-rendering.js";
import { buildWaterSurfaces } from "../src/water-surface.js";
import { waterAt } from "../src/hydrology.js";
import { advanceSwimming, restoreWaterArrival } from "../src/water-motion.js";
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
      assert.equal(windInteract(game), true, f.id);
      if (f.kind !== "tablet") assert.equal(site.state.moves, moves + 1, f.id);
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
