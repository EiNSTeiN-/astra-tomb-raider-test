import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import {
  SOLAR_ROUTES,
  solarLayout,
  solarLocal,
  traceSolar,
  normalizeSolar,
} from "../src/solar-rules.js";
import { createPuzzle, restorePuzzle } from "../src/puzzles.js";
import {
  buildSolarChambers,
  updateSolarChambers,
  clipSolarSegment,
  solarInteract,
  solarReady,
  solarTarget,
} from "../src/solar-chambers.js";
import { buildDesertArchitecture } from "../src/desert-architecture.js";
import { buildFieldGates, updateFieldWorld } from "../src/field-world.js";
import { updateSoundSources } from "../src/sound-landmarks.js";
import { createTerrainProfile } from "../src/terrain.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { arrivalCamera } from "../src/camera-arrival.js";
import { Adventure } from "../src/game.js";
import { inSolarCourt } from "../src/solar-rules.js";
import { SaveStore, normalizeSave } from "../src/storage.js";

const level = LEVELS[1];
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
  t.after(() => (globalThis.document = old));
  const memory = new Map(),
    storage = {
      getItem: (k) => memory.get(k),
      setItem: (k, v) => memory.set(k, v),
    };
  const store = new SaveStore(storage),
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    world,
    store,
    progress: store.level(level.id),
    terrainProfile: terrain,
    groundHeight: terrain.height,
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    glowMat: new THREE.MeshStandardMaterial(),
    player: new THREE.Group(),
    items: [],
    obstacles: [],
    keys: new Set(),
    flames: [],
    waterMeshes: [],
    elapsed: 0,
    sense: 0,
    health: 100,
    grounded: true,
    jumpY: 0,
    checkpoint: { x: 371, z: 224 },
    explored: new Set(),
    traversalCourses: [],
    counterweights: { saved: { solved: false } },
    audio: { tone() {}, noiseHit() {}, setMode() {}, resume() {} },
    clock: { getDelta: () => 0 },
    cb: { toast() {}, saved() {} },
    cameraSurfaces: new CameraSurfaces(world),
  });
  for (const f of map.features.filter((f) => f.type === "mechanism")) {
    f.group = new THREE.Group();
    f.group.position.set(f.x * 7, terrain.height(f.x * 7, f.z * 7), f.z * 7);
    world.add(f.group);
    game.items.push(f);
  }
  buildDesertArchitecture(game);
  buildFieldGates(game);
  buildSolarChambers(game);
  game.cameraSurfaces.rebuild();
  game.soundSources = game.solarSources.map((s) => ({ ...s }));
  t.after(() => world.traverse((o) => o.geometry?.dispose()));
  return { game, storage };
}
const ready = (g, stage) => {
  g.progress.stage = stage;
  g.progress.field = [0, 1, 2].map((i) => `field-${stage}-${i}`);
  g.counterweights.saved.solved = true;
  updateFieldWorld(g, 100);
  updateSolarChambers(g, 100);
};
const stand = (g, f) =>
  g.player.position.set(f.x * 7, g.groundHeight(f.x * 7, f.z * 7), f.z * 7);

test("the recorded foreground handwheel catches clothing rays while its open sectors and turning transforms remain clear", (t) => {
  const { game: g } = fixture(t);
  g.progress.stage = 9;
  g.player.position.set(163, g.groundHeight(163, 380), 380);
  updateSolarChambers(g, 100);
  const wheel = g.solarSites[2].mirrors[3].wheel,
    eye = new THREE.Vector3(
      165.16015522760205,
      3.929535957223747,
      384.79939285487933,
    ),
    points = [
      [162.76713479969268, 4.390217582140856, 380.2718010104077],
      [162.8427272570835, 4.46411936828091, 380.24435157961017],
      [162.83028425945417, 4.542018254749595, 380.22100185278083],
      [162.82223965642834, 4.619700563971983, 380.2063092120774],
      [162.74980565590383, 4.876557555510817, 380.06748144937774],
      [162.75337640950582, 4.9541168760999605, 380.07565721992887],
    ].map((p) => new THREE.Vector3(...p)),
    ray = new THREE.Raycaster();
  g.world.updateMatrixWorld(true);
  for (const point of points) {
    ray.set(eye, point.clone().sub(eye).normalize());
    ray.far = eye.distanceTo(point) - 0.015;
    assert(
      ray.intersectObject(wheel, false).length,
      "delivered metal blocks this recorded clothing ray",
    );
    assert(
      g.cameraSurfaces.entry(point, eye, 0.02) < 1,
      "camera also catches the wheel",
    );
  }
  const group = g.cameraSurfaces.dynamicGroups.get(wheel);
  assert(group && group.surfaces.length === 17);
  const mirrors = g.solarSites.flatMap((s) => s.mirrors);
  assert.equal(mirrors.length, 68);
  assert(
    mirrors.every(
      (m) =>
        g.cameraSurfaces.dynamicGroups.get(m.wheel)?.surfaces.length === 17,
    ),
    "every wheel retains its own moving metal bounds",
  );
  g.cameraSurfaces.dynamicGroups.delete(wheel);
  try {
    assert(
      points.every((p) => g.cameraSurfaces.entry(p, eye, 0.02) === 1),
      "omitting this wheel reproduces the missed occlusion",
    );
  } finally {
    g.cameraSurfaces.dynamicGroups.set(wheel, group);
  }
  // Between the actual spokes, the rim and hub leave an opening. Check world
  // rays after several turns, not just the capture's original local transform.
  for (const angle of [0, 0.21, 0.83, 1.37]) {
    wheel.rotation.z = angle;
    wheel.updateWorldMatrix(true, true);
    for (const [r, blocked] of [
      [0.23, false],
      [0.34, true],
      [0.08, true],
    ]) {
      const a = Math.PI / 8,
        local = new THREE.Vector3(Math.sin(a) * r, Math.cos(a) * r, 0),
        front = local.clone().setZ(0.3).applyMatrix4(wheel.matrixWorld),
        back = local.clone().setZ(-0.3).applyMatrix4(wheel.matrixWorld);
      ray.set(front, back.clone().sub(front).normalize());
      ray.far = front.distanceTo(back);
      assert.equal(ray.intersectObject(wheel, true).length > 0, blocked);
      assert.equal(g.cameraSurfaces.entry(front, back, 0) < 1, blocked);
    }
  }
});

test("nine unique optical routes use every intended mirror and obey the physical reflection law", () => {
  assert.equal(new Set(SOLAR_ROUTES.map((r) => JSON.stringify(r))).size, 9);
  assert.equal(
    SOLAR_ROUTES.reduce((n, r) => n + r.length - 2, 0),
    68,
  );
  for (let stage = 0; stage < 9; stage++) {
    const layout = solarLayout(stage),
      trace = traceSolar({ ...layout, values: layout.target });
    assert.ok(trace.hit, `stage ${stage}`);
    assert.deepEqual(
      trace.mirrors,
      layout.mirrors.map((_, i) => i),
    );
    for (let i = 1; i < SOLAR_ROUTES[stage].length - 1; i++) {
      const [a, b, c] = SOLAR_ROUTES[stage].slice(i - 1, i + 2);
      const incoming = new THREE.Vector3(
          b[0] - a[0],
          0,
          b[1] - a[1],
        ).normalize(),
        outgoing = new THREE.Vector3(c[0] - b[0], 0, c[1] - b[1]).normalize();
      const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        layout.target[i - 1] ? -Math.PI / 4 : Math.PI / 4,
      );
      assert.ok(incoming.reflect(normal).distanceTo(outgoing) < 1e-9);
    }
  }
});

test("every binary mirror configuration terminates safely, including crossed and looping light paths", () => {
  for (let stage = 0; stage < 9; stage++) {
    const layout = solarLayout(stage);
    let winning = 0;
    for (let mask = 0; mask < 2 ** layout.mirrors.length; mask++) {
      const values = layout.mirrors.map((_, i) => (mask >> i) & 1),
        trace = traceSolar({ ...layout, values });
      assert.ok(
        trace.points.length - 1 <= 48,
        "every route fits the rendered beam pool",
      );
      assert.ok(
        trace.points.every(
          (p) => Number.isInteger(p.x) && Number.isInteger(p.y),
        ),
      );
      if (trace.hit) {
        assert.deepEqual(trace.points.at(-1), layout.end);
        winning++;
      }
    }
    assert.equal(winning, 1, `chamber ${stage} has one complete alignment`);
  }
});

test("solar saves reject malformed layouts and preserve independent partial puzzles and targets", () => {
  const a = createPuzzle(level, 0),
    b = createPuzzle(level, 8);
  a.values[0] = 1 - a.values[0];
  a.moves = 4;
  b.moves = 11;
  const raw = {
    0: a,
    8: b,
    9: a,
    3: { values: [0, 0] },
    2: { values: [0, 0, 0, 0, 0, 2] },
    bad: a,
  };
  const clean = normalizeSolar(raw);
  assert.deepEqual(Object.keys(clean), ["0", "8"]);
  const saved = normalizeSave({
    version: 1,
    levels: { sands: { solar: raw, stage: 0 }, verdant: { solar: raw } },
  });
  assert.deepEqual(saved.levels.sands.solar, clean);
  assert.deepEqual(saved.levels.verdant.solar, {});
  const restored = restorePuzzle(level, 8, clean[8]);
  assert.deepEqual(restored.values, b.values);
  assert.deepEqual(restored.target, createPuzzle(level, 8).target);
  clean[0].values[0] = 1 - clean[0].values[0];
  assert.notDeepEqual(clean[0].values, a.values);
  assert.deepEqual(normalizeSolar([]), {});
});

test("all nine built chambers retain clear controls and their solved beams reach the actual receiver", (t) => {
  const { game: g } = fixture(t);
  assert.equal(g.solarSites.length, 9);
  assert.equal(g.solarSources.length, 77);
  for (const site of g.solarSites) {
    ready(g, site.stage);
    g.progress.solar[site.stage] = {
      values: [...site.state.target],
      moves: 10,
    };
    updateSolarChambers(g, 100);
    assert.ok(site.aligned, `site ${site.stage}`);
    const last = site.segments.at(-1)[1],
      end = solarLocal(site.state.end);
    assert.ok(Math.hypot(last.x - end.x, last.z - end.z) < 1e-8);
    for (const f of [...site.mirrors.map((m) => m.feature), site.receiver])
      for (const dx of [-0.18, 0, 0.18])
        for (const dz of [-0.18, 0, 0.18])
          assert.ok(g.canMove(f.x * 7 + dx, f.z * 7 + dz, 0), f.id);
    assert.ok(site.mirrors.every((m) => m.pivot.parent && m.wheel.parent));
  }
});

test("all 68 mirror handwheels retain a solid axle and centered hub throughout rotation", (t) => {
  const { game: g } = fixture(t),
    ray = new THREE.Raycaster(),
    direction = new THREE.Vector3(0, 0, -1);
  let checked = 0;
  for (const site of g.solarSites) {
    for (const mirror of site.mirrors) {
      const group = mirror.wheel.parent,
        origin = group.getWorldPosition(new THREE.Vector3()),
        center = mirror.wheel.getWorldPosition(new THREE.Vector3());
      for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
        mirror.wheel.rotation.z = angle;
        g.world.updateMatrixWorld(true);
        assert(
          mirror.wheel
            .getWorldPosition(new THREE.Vector3())
            .distanceTo(center) < 1e-8,
        );
        const axis = new THREE.Vector3(0, 0, 1).transformDirection(
          mirror.wheel.matrixWorld,
        );
        assert(axis.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-8);
        // Test the actual batched meshes, including the moving hub, across
        // the old air gap between the column and the handwheel's center.
        for (const x of [0.28, 0.4, 0.55, 0.7, 0.85, 0.95, 1.04]) {
          ray.set(
            origin.clone().add(new THREE.Vector3(x, 1.03, 0.4)),
            direction,
          );
          ray.far = 0.8;
          const hits = ray.intersectObject(site.root, true);
          assert(
            hits.length,
            `missing mount at ${site.stage}/${mirror.feature.index}, x=${x}, angle=${angle}`,
          );
          assert(
            hits.some((hit) => hit.distance > 0.04 && hit.distance < 0.34),
            `missing shaft or hub behind rim at ${site.stage}/${mirror.feature.index}, x=${x}, angle=${angle}`,
          );
        }
      }
      checked++;
    }
  }
  assert.equal(checked, 68);
});

test("all 77 solar control arrivals start with a clear full orbit and preserve saved clear headings", (t) => {
  const { game: g } = fixture(t);
  g.camera = new THREE.PerspectiveCamera(58, 1.6, 0.1, 450);
  g.avatar = new THREE.Group();
  let checked = 0;
  for (const site of g.solarSites) {
    ready(g, site.stage);
    for (const f of [...site.mirrors.map((m) => m.feature), site.receiver]) {
      stand(g, f);
      // A prepared arrival must activate the same nearby geometry as the live
      // scene before querying camera bounds, rather than its last distance state.
      updateSolarChambers(g, 0);
      g.progress.position = { x: g.player.position.x, z: g.player.position.z };
      g.progress.camera = null;
      // The old fallback aimed toward room 1 after field tasks were complete.
      g.restoreCamera(g.map.rooms[1]);
      const target = g.player.position
        .clone()
        .add(new THREE.Vector3(0, 1.3, 0));
      assert(g.camera.position.distanceTo(target) > 5.1, f.id);
      assert(g.avatar.visible, f.id);
      assert(g.cameraSpace(g.camera.position), f.id);
      assert(g.cameraSurfaces.entry(target, g.camera.position) > 0.999, f.id);
      const view = { yaw: g.yaw, pitch: g.pitch },
        camera = g.camera.position.clone();
      g.save();
      g.progress.camera = new SaveStore(g.store.storage).level(
        g.level.id,
      ).camera;
      g.restoreCamera(site.feature);
      assert(Math.abs(Math.sin(g.yaw - view.yaw)) < 1e-10);
      assert.equal(g.pitch, view.pitch);
      assert(g.camera.position.distanceTo(camera) < 1e-8);
      checked++;
    }
  }
  assert.equal(checked, 77);
});

test("a blocked saved solar look keeps its input angles and complete store while the arrival camera takes a clear detour", (t) => {
  const { game: g } = fixture(t),
    preferred = { yaw: 1.161799387799149, pitch: -0.18 };
  g.camera = new THREE.PerspectiveCamera(58, 1.6, 0.1, 450);
  g.avatar = new THREE.Group();
  g.progress.stage = 4;
  g.player.position.set(261, g.groundHeight(261, 72), 72);
  updateSolarChambers(g, 100);
  assert(g.canMove(261, 72, 0));
  g.yaw = preferred.yaw;
  g.pitch = preferred.pitch;
  g.save();
  const target = g.player.position.clone().add(new THREE.Vector3(0, 1.3, 0)),
    view = arrivalCamera(target, preferred, g.cameraSurfaces, (p) =>
      g.cameraSpace(p),
    ),
    stable = (data) => {
      const copy = structuredClone(data);
      for (const level of Object.values(copy.levels)) delete level.lastPlayed;
      return copy;
    },
    before = stable(g.store.data);
  assert(
    Math.abs(view.yaw - preferred.yaw) > 0.1,
    "delivered solar metal blocks the requested arrival orbit",
  );
  for (let reload = 0; reload < 3; reload++) {
    g.restoreCamera(g.map.rooms[5]);
    assert.equal(
      g.yaw,
      preferred.yaw,
      "safe camera orbit must not rewrite input yaw",
    );
    assert.equal(g.pitch, preferred.pitch);
    assert(g.camera.position.distanceTo(target) > 5.1);
    assert(g.cameraSpace(g.camera.position));
    assert.equal(g.cameraSurfaces.entry(target, g.camera.position, 0), 1);
    assert(
      g.cameraBodyRecovery,
      "retain the selected arrival detour separately from input look",
    );
    g.save();
    assert.deepEqual(stable(g.store.data), before);
  }
});

test("world controls require restored field work and counterweights, save each turn, and activate only a lit receiver", (t) => {
  const { game: g, storage } = fixture(t),
    site = g.solarSites[0],
    f = site.mirrors[0].feature;
  stand(g, f);
  g.nearest = f;
  assert.ok(solarInteract(g));
  assert.deepEqual(g.progress.solar, {});
  g.progress.field = [0, 1, 2].map((i) => `field-0-${i}`);
  assert.equal(solarReady(g, site), false);
  ready(g, 0);
  g.nearest = site.receiver;
  stand(g, site.receiver);
  solarInteract(g);
  assert.equal(g.progress.stage, 0);
  let moves = 0;
  site.mirrors.forEach((m, i) => {
    if (site.state.values[i] === site.state.target[i]) return;
    stand(g, m.feature);
    g.nearest = m.feature;
    solarInteract(g);
    moves++;
    updateSolarChambers(g, 100);
  });
  assert.ok(site.aligned);
  assert.equal(g.progress.solar[0].moves, moves);
  assert.deepEqual(
    new SaveStore(storage).level("sands").solar[0].values,
    site.state.target,
  );
  assert.equal(solarTarget(g), site.receiver);
  stand(g, site.receiver);
  g.nearest = site.receiver;
  solarInteract(g);
  assert.equal(g.progress.stage, 1);
  assert.equal(new SaveStore(storage).level("sands").stage, 1);
});

test("moving reflectors interrupt outgoing light until they settle and update camera bounds and bearing audio", (t) => {
  const { game: g } = fixture(t);
  ready(g, 1);
  const site = g.solarSites[1],
    mirror = site.mirrors[0];
  stand(g, mirror.feature);
  g.nearest = mirror.feature;
  const captured = g.cameraSurfaces.dynamic.find(
      (s) => s.parent === mirror.pivot,
    ),
    before = captured.matrix.clone();
  solarInteract(g);
  updateSolarChambers(g, 1 / 60);
  updateSoundSources(g);
  assert.ok(mirror.motion > 1);
  assert.equal(site.aligned, false);
  assert.deepEqual(site.trace.points.at(-1), site.state.mirrors[0]);
  const start = mirror.pivot.getWorldPosition(new THREE.Vector3());
  g.cameraSurfaces.entry(
    start.clone().add(new THREE.Vector3(0, 0, 3)),
    start.clone().add(new THREE.Vector3(0, 0, -3)),
  );
  assert.ok(!captured.matrix.equals(before));
  assert.ok(
    g.soundSources.find((s) => s.id === "solar-bearing-1-0").activity > 0.7,
  );
  updateSolarChambers(g, 100);
  updateSolarChambers(g, 0);
  updateSoundSources(g);
  assert.equal(
    g.soundSources.find((s) => s.id === "solar-bearing-1-0").activity,
    0.04,
  );
});

test("receiver consoles are solid, with clear operator positions, physical sound origins and bounded activation reach", (t) => {
  const { game: g } = fixture(t);
  let consoles = 0;
  for (const site of g.solarSites) {
    const f = site.receiver,
      position = f.group.getWorldPosition(new THREE.Vector3()),
      source = g.solarSources.find(
        (s) => s.id === `solar-receiver-${site.stage}`,
      );
    assert(
      !g.canMove(position.x, position.z, 0),
      "cannot stand inside the visible console",
    );
    assert(
      g.canMove(position.x, position.z, 1.4),
      "finite console leaves the space above it open",
    );
    for (const dx of [-0.18, 0, 0.18])
      for (const dz of [-0.18, 0, 0.18])
        assert(g.canMove(f.x * 7 + dx, f.z * 7 + dz, 0));
    assert(Math.hypot(f.x * 7 - position.x, f.z * 7 - position.z) > 1);
    assert(Math.abs(source.x - position.x) < 1e-8);
    assert(Math.abs(source.z - position.z) < 1e-8);
    assert(Math.abs(source.y - position.y - 0.901) < 1e-8);
    assert.equal(
      site.foundations.filter((p) => p.kind === "console").length,
      1,
    );
    consoles++;
  }
  assert.equal(consoles, 9);
  ready(g, 4);
  const site = g.solarSites[4],
    f = site.receiver,
    position = f.group.getWorldPosition(new THREE.Vector3());
  g.progress.solar[4] = { values: [...site.state.target], moves: 10 };
  updateSolarChambers(g, 100);
  assert(site.aligned);
  g.nearest = f;
  g.player.position.set(position.x, position.y, position.z - 3.35);
  assert(
    Math.hypot(g.player.position.x - f.x * 7, g.player.position.z - f.z * 7) <
      2.25,
  );
  solarInteract(g);
  assert.equal(
    g.progress.stage,
    4,
    "operator marker cannot extend reach beyond the actual console",
  );
  stand(g, f);
  solarInteract(g);
  assert.equal(
    g.progress.stage,
    5,
    "ordinary operator position activates the lit receiver",
  );
});

test("missed sunlight stops at a thin wall or rising terrain and cannot illuminate a receiver through cover", () => {
  const a = new THREE.Vector3(0, 2, 0),
    b = new THREE.Vector3(10, 2, 0);
  const wall = {
    obstacles: [{ x: 5, z: 0, w: 0.1, d: 2, h: 4 }],
    groundHeight: () => 0,
  };
  const clipped = clipSolarSegment(wall, a, b);
  assert.ok(clipped.blocked);
  assert.ok(Math.abs(clipped.end.x - 4.9) < 1e-8);
  const hill = clipSolarSegment(
    { obstacles: [], groundHeight: (x) => (x < 4 ? 0 : 3) },
    a,
    b,
  );
  assert.ok(hill.blocked);
  assert.ok(hill.end.x <= 4);
  assert.equal(
    clipSolarSegment({ obstacles: [], groundHeight: () => 0 }, a, b).blocked,
    false,
  );
});

test("older completed sectors restore lit optics and leaving the desert releases chapter references", (t) => {
  const { game: g } = fixture(t);
  g.progress = normalizeSave({
    version: 1,
    levels: { sands: { stage: 3, field: [] } },
  }).levels.sands;
  updateSolarChambers(g, 100);
  assert.ok(g.solarSites.slice(0, 3).every((s) => s.aligned));
  assert.ok(g.solarSites.slice(3).every((s) => !s.active));
  g.level = LEVELS[2];
  assert.equal(buildSolarChambers(g), false);
  assert.equal(g.solarSites.length, 0);
  assert.equal(g.solarSources.length, 0);
  assert.equal(solarTarget(g), null);
});

test("optical animation follows real elapsed time in a slow frame while paused field simulation stays still", (t) => {
  const { game: g } = fixture(t);
  ready(g, 1);
  const site = g.solarSites[1],
    state = restorePuzzle(level, 1, null);
  state.values[0] = 1 - state.values[0];
  g.progress.solar[1] = { values: state.values, moves: 1 };
  const time = g.progress.time,
    position = g.player.position.clone();
  Object.assign(g, {
    active: true,
    scene: g.world,
    paused: true,
    renderOnce: true,
    clock: { getDelta: () => 2 },
    updateCamera() {},
    updateAudio() {},
    renderScene() {},
    updateDecorations(dt, _observatoryDt, solarDt) {
      assert.equal(dt, 0.05);
      assert.equal(solarDt, 2);
      updateSolarChambers(g, solarDt);
    },
  });
  g.frame();
  assert.ok(
    Math.abs(
      site.mirrors[0].pivot.rotation.y -
        (state.values[0] ? -Math.PI / 4 : Math.PI / 4),
    ) < 0.001,
  );
  assert.equal(g.progress.time, time);
  assert.deepEqual(g.player.position, position);
});

test("the reserved solar working areas cover every mirror, receiver and circulation strip but leave other courts available", () => {
  const map = createMap(level);
  for (let stage = 0; stage < 9; stage++) {
    const room = map.rooms[stage + 1],
      layout = solarLayout(stage);
    for (const p of [layout.start, ...layout.mirrors, layout.end].map(
      solarLocal,
    ))
      assert.ok(inSolarCourt(map, room.x * 7 + p.x + 1.5, room.z * 7 + p.z));
    assert.equal(inSolarCourt(map, room.x * 7, room.z * 7 - 12), false);
  }
});
