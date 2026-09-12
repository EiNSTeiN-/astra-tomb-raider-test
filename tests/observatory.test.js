import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { domePanelGeometry } from "../src/observatory-geometry.js";
import {
  normalizeAlignments,
  observatoryState,
} from "../src/observatory-state.js";
import {
  buildObservatory,
  updateObservatory,
  focusObservatory,
} from "../src/observatory.js";
import { normalizeSave } from "../src/storage.js";
import {
  createPuzzle,
  restorePuzzle,
  applyMove,
  isSolved,
} from "../src/puzzles.js";
import { CameraSurfaces, boxEntry } from "../src/camera-collision.js";
import {
  buildSoundLandmarks,
  updateSoundSources,
} from "../src/sound-landmarks.js";
import { Adventure } from "../src/game.js";

const level = LEVELS[7],
  map = createMap(level),
  terrain = createTerrainProfile(map, level);
function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    world,
    terrainProfile: terrain,
    groundHeight: Adventure.prototype.groundHeight,
    progress: { stage: 0, field: [], alignments: {}, time: 12 },
    player: { position: new THREE.Vector3(385, 0, 210) },
    obstacles: [],
    flames: [],
    items: [],
    waterMeshes: [],
    elapsed: 0,
    cameraSurfaces: new CameraSurfaces(world),
  });
  buildObservatory(game);
  buildSoundLandmarks(game);
  game.cameraSurfaces.rebuild();
  t.after(() => world.traverse((o) => o.geometry?.dispose()));
  return game;
}

test("curved bronze panels are closed, outward facing shells with a real open oculus", () => {
  const g = domePanelGeometry(10, 5.5, -0.38, 0.38);
  const p = g.attributes.position,
    index = g.index;
  const edges = new Map(),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    a.fromBufferAttribute(p, ids[0]);
    b.fromBufferAttribute(p, ids[1]);
    c.fromBufferAttribute(p, ids[2]);
    volume += a.dot(b.cross(c)) / 6;
    for (let j = 0; j < 3; j++) {
      const key = [ids[j], ids[(j + 1) % 3]].sort((x, y) => x - y).join(",");
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  assert.ok(volume > 5 && volume < 30, `shell volume ${volume}`);
  assert.ok([...edges.values()].every((count) => count === 2));
  assert.ok(p.array.every(Number.isFinite));
  assert.ok(g.attributes.normal.array.every(Number.isFinite));
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial());
  assert.equal(
    new THREE.Raycaster(
      new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(0, -1, 0),
    ).intersectObject(mesh).length,
    0,
  );
  const top = new THREE.Raycaster(
    new THREE.Vector3(7, 10, 0),
    new THREE.Vector3(0, -1, 0),
  ).intersectObject(mesh)[0];
  assert.ok(top?.face.normal.y > 0);
  const inner = new THREE.Raycaster(
    new THREE.Vector3(7, 0, 0),
    new THREE.Vector3(0, 1, 0),
  ).intersectObject(mesh)[0];
  assert.ok(inner?.face.normal.y < 0);
  g.dispose();
  mesh.material.dispose();
});

test("all observatory footings bury their complete footprints and close the old pedestal gaps after batching", (t) => {
  const game = fixture(t),
    ray = new THREE.Raycaster();
  game.world.updateMatrixWorld(true);
  let foundations = 0,
    exposedRays = 0;
  for (const patch of game.observatories)
    for (const footing of patch.foundations) {
      const x = patch.root.position.x + footing.x,
        z = patch.root.position.z + footing.z;
      foundations++;
      if (footing.kind === "pedestal") {
        const oldBottom = game.groundHeight(x, z);
        assert.equal(footing.top, oldBottom + 0.035);
        for (let i = 0; i < 128; i++) {
          const a = (i * Math.PI) / 64,
            dx = Math.sin(a),
            dz = Math.cos(a),
            ground = game.groundHeight(x + dx * 4, z + dz * 4);
          assert(footing.bottom <= ground - 0.18);
          if (oldBottom - ground < 0.08) continue;
          for (const fraction of [0.15, 0.5, 0.85]) {
            const y = ground + (oldBottom - ground) * fraction;
            ray.set(
              new THREE.Vector3(x + dx * 5, y, z + dz * 5),
              new THREE.Vector3(-dx, 0, -dz),
            );
            const hit = ray.intersectObject(patch.root, true)[0];
            assert(hit && hit.distance < 1.08, `open pedestal ${patch.index}`);
            exposedRays++;
          }
        }
      } else {
        for (let ix = -5; ix <= 5; ix++)
          for (let iz = -5; iz <= 5; iz++)
            assert(
              footing.bottom <=
                game.groundHeight(x + ix * 0.25, z + iz * 0.25) - 0.18,
              `column ${patch.index}/${footing.column}`,
            );
      }
      const half = footing.radius || footing.width / 2,
        y = footing.bottom + 0.12;
      ray.set(
        new THREE.Vector3(x + half + 1, y, z),
        new THREE.Vector3(-1, 0, 0),
      );
      const hit = ray.intersectObject(patch.root, true)[0];
      assert(hit && hit.distance < 1.12, `missing foundation ${patch.index}`);
      assert(
        game.cameraSurfaces.entry(
          new THREE.Vector3(x + half + 1, y, z),
          new THREE.Vector3(x, y, z),
        ) < 1,
      );
    }
  assert.equal(foundations, 99);
  assert(exposedRays > 100);
});

test("partial orbital saves are bounded, independent and survive normalization without modifying targets", () => {
  const record = { values: [1, 2, 7], moves: 3 };
  const raw = {
    0: record,
    9: { values: [7, 0, 1], moves: 1e6 },
    10: record,
    bad: record,
    2: { values: [8, 0, 0] },
    3: { values: [1.5, 0, 0] },
    4: { values: [0, 0] },
    5: { values: [0, 0, 0], moves: -5 },
  };
  const parsed = normalizeAlignments(raw);
  assert.deepEqual(Object.keys(parsed), ["0", "5", "9"]);
  assert.equal(parsed[9].moves, 100000);
  assert.equal(parsed[5].moves, 0);
  parsed[0].values[0] = 3;
  assert.equal(record.values[0], 1);
  const saved = normalizeSave({
    version: 1,
    levels: { eclipse: { alignments: raw }, jungle: { alignments: raw } },
  });
  assert.deepEqual(saved.levels.eclipse.alignments[0], record);
  assert.deepEqual(saved.levels.jungle.alignments, {});
  const state = restorePuzzle(level, 0, saved.levels.eclipse.alignments[0]);
  assert.deepEqual(state.values, record.values);
  assert.deepEqual(state.target, createPuzzle(level, 0).target);
  assert.deepEqual(
    restorePuzzle(LEVELS[0], 0, record),
    createPuzzle(LEVELS[0], 0),
  );
  assert.deepEqual(
    restorePuzzle(level, 0, { values: [NaN, 0, 0] }),
    createPuzzle(level, 0),
  );
});

test("all ten orbital mechanisms remain solvable after arbitrary saved intermediate positions", () => {
  for (let stage = 0; stage < 10; stage++) {
    const s = restorePuzzle(level, stage, {
      values: [stage % 8, (stage * 3) % 8, (stage * 5) % 8],
      moves: 11,
    });
    let solution;
    for (let a = 0; a < 8; a++)
      for (let b = 0; b < 8; b++)
        for (let c = 0; c < 8; c++) {
          const v = [
            (s.values[0] + a + 2 * c) % 8,
            (s.values[1] + b + 2 * a) % 8,
            (s.values[2] + c + 2 * b) % 8,
          ];
          if (v.every((n, i) => n === s.target[i])) solution = [a, b, c];
        }
    assert.ok(solution, `stage ${stage}`);
    solution.forEach((count, index) => {
      for (let n = 0; n < count; n++) applyMove(s, { index });
    });
    assert.ok(isSolved(s));
  }
});

test("lunar shutters follow their three field actions and older completed saves restore every instrument", () => {
  const progress = {
    stage: 2,
    field: [],
    alignments: { 2: { values: [2, 5, 1], moves: 8 } },
  };
  assert.equal(observatoryState(level, progress, 3).aperture, 0);
  for (let step = 0; step < 3; step++) {
    progress.field.push(`field-2-${step}`);
    assert.equal(observatoryState(level, progress, 3).aperture, (step + 1) / 3);
  }
  assert.deepEqual(observatoryState(level, progress, 3).values, [2, 5, 1]);
  progress.stage = 3;
  assert.deepEqual(
    observatoryState(level, progress, 3).values,
    createPuzzle(level, 2).target,
  );
  assert.equal(
    observatoryState(level, { stage: 0, completed: true }, 10).glow,
    1,
  );
  assert.equal(observatoryState(level, { stage: 3, field: [] }, 3).aperture, 1);
  assert.equal(observatoryState(level, { stage: 3, field: [] }, 4).restored, 0);
});

test("dome motion updates captured camera surfaces and ring collision preserves the space inside each hoop", (t) => {
  const game = fixture(t),
    patch = game.observatories[3],
    petal = patch.petals[0];
  assert.equal(game.observatories.length, 11);
  assert.equal(
    game.observatories.reduce((n, p) => n + p.petals.length, 0),
    86,
  );
  assert.equal(
    game.observatories.reduce((n, p) => n + p.rings.length, 0),
    33,
  );
  const surface = game.cameraSurfaces.dynamic.find(
    (s) => s.parent === petal.pivot,
  );
  assert.ok(surface);
  const matrix = surface.matrix.clone();
  game.progress.field = ["field-2-0", "field-2-1", "field-2-2"];
  updateObservatory(game, 0.25);
  assert.ok(patch.aperture > 0 && patch.aperture < 1);
  game.cameraSurfaces.entry(
    patch.center.clone(),
    patch.center.clone().add(new THREE.Vector3(20, 20, 0)),
  );
  assert.ok(!surface.matrix.equals(matrix));
  const ring = patch.rings[2];
  const captured = game.cameraSurfaces.dynamic.filter((s) => s.parent === ring);
  assert.equal(captured.length, 8);
  assert.ok(
    captured.every(
      (s) =>
        boxEntry(
          new THREE.Vector3(1.8, 0, 1),
          new THREE.Vector3(1.8, 0, -1),
          s.box,
          0.1,
          true,
        ) === null,
    ),
  );
  updateObservatory(game, 100);
  assert.equal(patch.aperture, 1);
});

test("paused instrument presentation moves only the visible mechanism, settles after slow frames and then idles", (t) => {
  const game = fixture(t),
    patch = game.observatories[2];
  let rendered = 0;
  Object.assign(game, {
    active: true,
    scene: game.world,
    paused: true,
    presentationRemaining: 1.2,
    renderOnce: false,
    clock: { getDelta: () => 0.4 },
    updateCamera: () => {},
    updateAudio: () => {},
    updateDecorations: (_dt, dt) => updateObservatory(game, dt),
    renderScene: () => rendered++,
    updatePlayer: () => assert.fail("player advanced during puzzle"),
    updateEnemies: () => assert.fail("enemies advanced"),
  });
  game.progress.alignments[1] = { values: [1, 2, 0], moves: 1 };
  const position = game.player.position.clone();
  game.frame();
  assert.ok(
    patch.rings[0].rotation.z < 0 && patch.rings[0].rotation.z > -Math.PI / 4,
  );
  game.frame();
  game.frame();
  game.frame();
  assert.equal(rendered, 3);
  assert.equal(game.presentationRemaining, 0);
  assert.ok(Math.abs(patch.rings[0].rotation.z + Math.PI / 4) < 1e-9);
  assert.ok(Math.abs(patch.rings[1].rotation.z + Math.PI / 2) < 1e-9);
  assert.deepEqual(game.player.position, position);
  assert.equal(game.progress.time, 12);
});

test("mechanical and harmonic emitters share restoration state and have unobstructed exterior listening positions", (t) => {
  const game = fixture(t),
    patch = game.observatories[2];
  assert.equal(game.observatorySources.length, 22);
  for (const s of game.observatorySources) {
    assert.ok(
      game.lineOfSight(
        new THREE.Vector3(s.x, terrain.height(s.x, s.z + 4), s.z + 4),
        new THREE.Vector3(s.x, s.y - 1.4, s.z),
      ),
      s.id,
    );
  }
  const gear = game.soundSources.find((s) => s.id === "orrery-2"),
    tone = game.soundSources.find((s) => s.id === "alignment-2");
  updateSoundSources(game);
  assert.equal(gear.activity, 0.18);
  assert.equal(tone.activity, 0.18);
  game.progress.alignments[1] = { values: [1, 2, 0], moves: 1 };
  game.progress.field = ["field-1-0"];
  updateObservatory(game, 0.1);
  updateSoundSources(game);
  assert.ok(gear.activity > 0.18);
  assert.equal(tone.activity, patch.state.glow);
  updateObservatory(game, 100);
  updateObservatory(game, 0.1);
  updateSoundSources(game);
  assert.ok(Math.abs(gear.activity - 0.18) < 1e-9);
  assert.ok(tone.activity > 0.18);
});

test("focused desktop and portrait cameras keep the selected instrument in the free scene area, and chapter changes clear it", (t) => {
  const game = fixture(t);
  Object.assign(game, {
    paused: true,
    orreryFocus: 1,
    avatar: { visible: false },
    camera: new THREE.PerspectiveCamera(52, 900 / 650, 0.1, 500),
    renderer: { domElement: { clientWidth: 900, clientHeight: 650 } },
  });
  assert.ok(focusObservatory(game));
  game.camera.updateMatrixWorld();
  let projected = game.observatories[2].center.clone().project(game.camera);
  assert.ok(projected.x < 0 && projected.x > -0.8);
  game.renderer.domElement = { clientWidth: 390, clientHeight: 844 };
  game.camera.aspect = 390 / 844;
  game.camera.updateProjectionMatrix();
  assert.ok(focusObservatory(game));
  game.camera.updateMatrixWorld();
  projected = game.observatories[2].center.clone().project(game.camera);
  assert.ok(projected.y > 0 && projected.y < 0.8);
  game.orreryFocus = null;
  const distant = game.observatories[10];
  updateObservatory(game, 0);
  assert.ok(distant.instruments.every((o) => !o.visible));
  assert.ok(distant.root.visible);
  game.player.position.copy(distant.center);
  updateObservatory(game, 0);
  assert.ok(distant.instruments.every((o) => o.visible));
  game.level = LEVELS[1];
  assert.equal(buildObservatory(game), false);
  assert.equal(game.observatories.length, 0);
  assert.equal(game.observatorySources.length, 0);
  assert.equal(game.orreryFocus, null);
  assert.equal(focusObservatory(game), false);
});
