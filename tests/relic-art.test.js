import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { stationBlocked } from "../src/field-station-solids.js";
import { buildRelicArtwork, updateRelicArtwork } from "../src/relic-art.js";
import { SaveStore } from "../src/storage.js";
import { supportAt } from "../src/character-motion.js";

// Terrain construction is expensive. These profiles are read-only; each
// fixture gets its own feature, meshes, physics, progress and camera index.
const terrainFixtures = new Map();
function fixture(t, level, saved = null) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  if (!terrainFixtures.has(level.id)) {
    const map = createMap(level);
    terrainFixtures.set(level.id, {
      map,
      terrain: createTerrainProfile(map, level),
    });
  }
  const { map, terrain } = terrainFixtures.get(level.id),
    world = new THREE.Group(),
    feature = { ...map.features.find((f) => f.type === "relic") },
    root = new THREE.Group(),
    memory = new Map(),
    store = new SaveStore({
      getItem: (k) => memory.get(k),
      setItem: (k, v) => memory.set(k, v),
    }),
    game = {
      level,
      map,
      terrainProfile: terrain,
      world,
      store,
      progress: store.level(level.id),
      obstacles: [],
      groundHeight: terrain.height,
      stoneMat: new THREE.MeshStandardMaterial({ color: level.stone }),
      cameraSurfaces: new CameraSurfaces(world),
    };
  if (saved) Object.assign(game.progress, saved);
  root.position.set(
    feature.x * 7,
    terrain.height(feature.x * 7, feature.z * 7),
    feature.z * 7,
  );
  feature.group = root;
  feature.marker = new THREE.Group();
  root.add(feature.marker);
  world.add(root);
  buildRelicArtwork(game, feature, root);
  game.cameraSurfaces.rebuild();
  t.after(() =>
    world.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    }),
  );
  return { game, feature, memory };
}

test("all chapter relics fit their supported stands and retain bounded, finite render geometry", (t) => {
  const silhouettes = new Set();
  let largest = 0;
  for (const level of LEVELS) {
    const { game, feature } = fixture(t, level, { stage: level.mechanisms }),
      art = feature.relicArt,
      bounds = new THREE.Box3().setFromObject(art.payload),
      seat = feature.group.position.y + art.seat;
    assert(
      Math.abs(bounds.min.y - seat) < 0.001,
      `${level.id}: socket bears on the seat`,
    );
    assert(
      bounds.max.y < seat + 1.5,
      `${level.id}: model fits below the objective beacon`,
    );
    assert(
      Math.max(
        bounds.max.x - feature.group.position.x,
        feature.group.position.x - bounds.min.x,
        bounds.max.z - feature.group.position.z,
        feature.group.position.z - bounds.min.z,
      ) < 0.65,
      `${level.id}: payload stays over the stand`,
    );
    let triangles = 0;
    feature.group.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position;
      for (const value of p.array) assert(Number.isFinite(value));
      assert(o.geometry.attributes.normal && o.geometry.attributes.uv);
      triangles += (o.geometry.index?.count ?? p.count) / 3;
    });
    largest = Math.max(largest, triangles);
    assert(
      triangles < 12000,
      `${level.id}: single reward geometry budget (${triangles})`,
    );
    silhouettes.add(
      [bounds.getSize(new THREE.Vector3()).toArray(), triangles].join(),
    );
    assert.equal(feature.core.name, level.artifact);
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8,
        x = feature.group.position.x + Math.sin(a) * 2.2,
        z = feature.group.position.z + Math.cos(a) * 2.2,
        y = game.groundHeight(x, z);
      assert(
        !game.obstacles.some((o) => stationBlocked(o, x, y, z)),
        `${level.id}: collection ring stays clear`,
      );
    }
  }
  assert.equal(silhouettes.size, 8);
  t.diagnostic(`Largest relic stand and payload: ${largest} triangles`);
});

test("the complete foundation footprint is buried on each chapter's actual terrain", (t) => {
  for (const level of LEVELS) {
    const { game, feature } = fixture(t, level),
      solid = feature.stationSolids[0],
      p = feature.group.position;
    for (let i = 0; i < 128; i++) {
      const a = (i * Math.PI) / 64,
        x = p.x + Math.sin(a) * 0.86,
        z = p.z + Math.cos(a) * 0.86,
        floor = game.groundHeight(x, z);
      assert(
        solid.bounds.min.y < floor - 0.1,
        `${level.id}: whole foot is buried`,
      );
      assert(
        solid.bounds.max.y > floor + 0.1,
        `${level.id}: foundation reaches above its ground`,
      );
    }
    assert(
      game.obstacles.some((o) => stationBlocked(o, p.x, p.y, p.z)),
      "an empty stand remains solid",
    );
  }
});

test("relic plates separate their visible faces from masonry and retain a continuous crown bearing", (t) => {
  for (const level of LEVELS) {
    const { game, feature } = fixture(t, level, { completed: true }),
      art = feature.relicArt,
      centre = feature.group.position,
      seat = centre.y + art.seat,
      ray = new THREE.Raycaster();
    feature.group.updateWorldMatrix(true, true);
    for (let i = 0; i < 32; i++) {
      const a = (i * Math.PI) / 16,
        x = centre.x + Math.sin(a) * 0.55,
        z = centre.z + Math.cos(a) * 0.55;
      ray.set(new THREE.Vector3(x, seat + 1, z), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObject(art.construction, true),
        plate = hits.find(
          (hit) => hit.object.material.name === "Relic worn bronze",
        ),
        stone = hits.find(
          (hit) => hit.object.material.name === "Relic stand masonry",
        );
      assert(plate && stone, `${level.id}: both actual surfaces exist`);
      assert(
        Math.abs(plate.point.y - seat) < 1e-6,
        "artifact seat stays fixed",
      );
      assert(
        plate.point.y - stone.point.y > 0.02,
        "exposed faces cannot depth fight",
      );
      assert(
        plate.point.y - stone.point.y < 0.03,
        "the plate remains seated on a thin bearing",
      );
    }
    // The old crown floated above the neck/collar by 4.25 cm. Sweep actual
    // rendered side walls throughout that join, rather than checking boxes.
    for (let i = 0; i <= 32; i++) {
      const y = seat - 0.21 + (i * 0.16) / 32;
      ray.set(
        new THREE.Vector3(centre.x - 2, y, centre.z),
        new THREE.Vector3(1, 0, 0),
      );
      assert(
        ray
          .intersectObject(art.construction, true)
          .some((hit) => hit.distance < 3),
        `${level.id}: no unsupported crown gap at ${y}`,
      );
    }
    for (const offset of [0.5, 0.66]) {
      const x = centre.x,
        z = centre.z + offset;
      ray.set(new THREE.Vector3(x, seat + 1, z), new THREE.Vector3(0, -1, 0));
      const top = ray.intersectObject(art.construction, true)[0];
      assert(top);
      assert(
        Math.abs(supportAt(game, x, z).height - top.point.y) < 1e-6,
        "feet follow the plate or its lower stone rim",
      );
    }
  }
});

test("unlock and collected saves preserve their state and remove only payload collision and camera bounds", (t) => {
  for (const level of LEVELS) {
    const { game, feature } = fixture(t, level),
      art = feature.relicArt,
      p = feature.group.position,
      from = new THREE.Vector3(p.x, p.y + art.seat + 1.6, p.z),
      to = from.clone().setY(p.y + art.seat + 0.12),
      payloadSolid = feature.stationSolids.at(-1);
    assert(!art.payload.visible);
    assert(!feature.marker.visible);
    assert(feature.group.visible);
    assert.equal(
      game.cameraSurfaces.entry(from, to, 0),
      1,
      "locked payload has no camera obstruction",
    );
    assert(!stationBlocked(payloadSolid, p.x, p.y + art.seat, p.z));
    game.progress.stage = level.mechanisms;
    updateRelicArtwork(game, feature);
    assert(art.payload.visible);
    assert(feature.marker.visible);
    assert(
      game.cameraSurfaces.entry(from, to, 0) < 1,
      `${level.id}: actual reward blocks camera`,
    );
    assert(stationBlocked(payloadSolid, p.x, p.y + art.seat, p.z));
    Object.assign(game.progress, {
      completed: true,
      found: ["note-0", "relic"],
      health: 72,
    });
    const before = structuredClone(game.progress);
    updateRelicArtwork(game, feature);
    assert.deepEqual(
      game.progress,
      before,
      "art cannot change rewards or progress",
    );
    assert(!art.payload.visible);
    assert(!feature.marker.visible);
    assert(feature.group.visible);
    assert.equal(
      game.cameraSurfaces.entry(from, to, 0),
      1,
      "collected payload leaves no phantom camera bound",
    );
    assert(!stationBlocked(payloadSolid, p.x, p.y + art.seat, p.z));
    const restored = fixture(t, level, before);
    assert(restored.feature.group.visible);
    assert(!restored.feature.core.visible);
    assert.deepEqual(restored.game.progress, before);
    // Older completion records can omit the relic id while retaining completion.
    game.progress.found = [];
    updateRelicArtwork(game, feature);
    assert(!art.payload.visible);
  }
});
