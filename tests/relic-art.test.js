import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { stationBlocked } from "../src/field-station-solids.js";
import { buildRelicArtwork, updateRelicArtwork } from "../src/relic-art.js";
import { SaveStore } from "../src/storage.js";

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
