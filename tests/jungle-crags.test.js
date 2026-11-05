import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { jungleCragGeometry } from "../src/jungle-crag-geometry.js";
import { JungleCragCamera } from "../src/jungle-crag-camera.js";
import { closedComponentMeshes } from "../scripts/inspect-explorer-solids-browser.js";
import {
  stationMeshSolid,
  stationEntry,
  stationBlocked,
  stationSupport,
} from "../src/field-station-solids.js";
import { natureRockAllowed } from "../src/nature-rocks.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildJungleCrags } from "../src/jungle-crags.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  verifyJungleCrags,
  inspectJungleCragQueries,
} from "../scripts/inspect-jungle-crags-browser.js";

const profile = { extent: 100, step: 1.75, height: (x, z) => (28 - z) * 2 },
  site = { side: 0, along: 50, width: 8, low: 2, top: 30 },
  level = { seed: 42, biome: "jungle" };

test("fractured cliff beds are closed and their backs meet independently raycast ground", () => {
  const ground = new T.PlaneGeometry(100, 100, 100, 100)
      .rotateX(-Math.PI / 2)
      .translate(50, 0, 50),
    p = ground.attributes.position,
    material = new T.MeshBasicMaterial({ side: T.DoubleSide });
  for (let i = 0; i < p.count; i++)
    p.setY(i, profile.height(p.getX(i), p.getZ(i)));
  const terrain = new T.Mesh(ground, material),
    ray = new T.Raycaster();
  terrain.updateMatrixWorld();
  let probes = 0;
  for (let layer = 0; layer < 4; layer++) {
    const geometry = jungleCragGeometry(profile, level, site, layer, layer + 1);
    assert(geometry);
    const mesh = new T.Mesh(geometry, material),
      r = closedComponentMeshes([mesh]);
    assert.equal(r.stats.openComponents, 0);
    assert.equal(r.stats.closedComponents, 1);
    const pos = geometry.attributes.position,
      back = geometry.attributes.cragBack,
      index = geometry.index;
    for (let i = 0; i < index.count; i += 3) {
      const ids = [0, 1, 2].map((j) => index.getX(i + j));
      if (ids.some((id) => !back.getX(id))) continue;
      const vertices = ids.map((i) =>
        new T.Vector3().fromBufferAttribute(pos, i),
      );
      for (const q of [
        ...vertices,
        new T.Triangle(...vertices).getMidpoint(new T.Vector3()),
      ]) {
        ray.set(new T.Vector3(q.x, 200, q.z), new T.Vector3(0, -1, 0));
        const hit = ray.intersectObject(terrain)[0];
        assert(hit);
        assert(hit.point.y - q.y > 0.05);
        probes++;
      }
    }
    r.meshes?.forEach((m) => m.geometry.dispose());
    geometry.dispose();
  }
  assert(probes > 500);
  ground.dispose();
  material.dispose();
});

test("crag camera cells and physical sight agree with the rendered irregular front", () => {
  const geometry = jungleCragGeometry(profile, level, site, 0, 1),
    material = new T.MeshStandardMaterial({ side: T.DoubleSide }),
    mesh = new T.Mesh(geometry, material),
    camera = new JungleCragCamera(geometry),
    game = { groundHeight: profile.height, obstacles: [] },
    solid = stationMeshSolid(game, { id: "crag" }, mesh),
    p = geometry.attributes.position,
    back = geometry.attributes.cragBack,
    index = geometry.index,
    ray = new T.Raycaster();
  mesh.updateMatrixWorld();
  let hits = 0,
    ledges = 0;
  for (let i = 0; i < index.count; i += 15) {
    const ids = [0, 1, 2].map((j) => index.getX(i + j));
    if (ids.some((id) => back.getX(id))) continue;
    const vertices = ids.map((i) => new T.Vector3().fromBufferAttribute(p, i)),
      triangle = new T.Triangle(...vertices),
      center = triangle.getMidpoint(new T.Vector3()),
      normal = triangle.getNormal(new T.Vector3()),
      start = center.clone().addScaledVector(normal, 5),
      end = center.clone().addScaledVector(normal, -5),
      direction = end.clone().sub(start).normalize();
    ray.set(start, direction);
    ray.far = 10;
    const hit = ray.intersectObject(mesh)[0];
    assert(hit);
    const entry = camera.entry(start, end),
      physics = stationEntry(solid, start, end);
    assert(entry !== null && physics !== null);
    assert(Math.abs(entry * 10 - hit.distance) < 2e-4);
    assert(Math.abs(physics * 10 - hit.distance) < 2e-4);
    assert(camera.entry(start, end, 0.28) <= entry);
    if (
      normal.y > 0.65 &&
      center.y > profile.height(center.x, center.z) + 0.1
    ) {
      const y = stationSupport(solid, center.x, center.z, center.y + 0.01);
      assert(y !== null && Math.abs(y - center.y) < 2e-4);
      ledges++;
    }
    hits++;
  }
  assert(hits > 10);
  assert(ledges > 0);
  const inside = new T.Vector3(50, 5, 25);
  assert(stationBlocked(solid, inside.x, inside.y, inside.z, 0.1, 0));
  geometry.dispose();
  material.dispose();
});

test("precise nature clearance retains trees above buried stone and rejects visible overlap", () => {
  const geometry = new T.BoxGeometry(2, 2, 2).translate(50, 4, 50),
    material = new T.MeshStandardMaterial(),
    mesh = new T.Mesh(geometry, material),
    g = {
      map: { size: 20, features: [], enemies: [], spawn: { x: 1, z: 1 } },
      terrainProfile: { height: () => 9, waters: [] },
      groundHeight: () => 9,
      obstacles: [],
    },
    solid = stationMeshSolid(g, { id: "crag" }, mesh);
  assert.equal(natureRockAllowed(g, 50, 50, 0.4), false);
  solid.preciseNatureClearance = true;
  assert(natureRockAllowed(g, 50, 50, 0.4));
  g.groundHeight = () => 3.5;
  assert.equal(natureRockAllowed(g, 50, 50, 0.4), false);
  geometry.dispose();
  material.dispose();
});

test("campaign crags retain terrain data, cover the eastern witness and survive material batching", () => {
  const level = LEVELS[0],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    world = new T.Group(),
    material = new T.MeshStandardMaterial(),
    heights = terrainProfile.heights.slice(),
    originalMap = JSON.stringify(map),
    ground = new T.PlaneGeometry(
      terrainProfile.extent,
      terrainProfile.extent,
      terrainProfile.width - 1,
      terrainProfile.width - 1,
    )
      .rotateX(-Math.PI / 2)
      .translate(terrainProfile.extent / 2, 0, terrainProfile.extent / 2),
    game = {
      level,
      map,
      terrainProfile,
      world,
      terrainMeshes: [new T.Mesh(ground, material)],
      obstacles: [],
      items: [],
      groundHeight: terrainProfile.surfaceHeight,
      cameraSurfaces: new CameraSurfaces(world),
    };
  const p = ground.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setY(i, terrainProfile.height(p.getX(i), p.getZ(i)));
  buildJungleCrags(game);
  const crags = game.jungleCrags;
  assert(crags.counts.every((n) => n >= 4));
  assert(crags.sites.some((s) => s.side === 1 && s.along === 81));
  assert.equal(crags.root.children.length, 1);
  const mesh = crags.root.children[0];
  assert.equal(mesh.material, material);
  assert(mesh.geometry.attributes.position.count / 3 < 120000);
  assert.equal(game.obstacles.length, crags.sites.length);
  assert.equal(game.cameraSurfaces.pending.length, crags.parts);
  game.cameraSurfaces.rebuild();
  assert.equal(game.cameraSurfaces.count, crags.parts);
  assert.equal(game.cameraSurfaces.pending.length, 0);
  const joins = verifyJungleCrags(game),
    queries = inspectJungleCragQueries(game);
  assert.equal(joins.accepted.parts, crags.parts);
  assert(joins.accepted.backProbes > 300000);
  assert.equal(queries.captures, crags.parts);
  assert(queries.rays > 1000 && queries.inside > 1000 && queries.ledges > 150);
  assert.deepEqual(queries.failures, []);
  const cells = game.cameraSurfaces.cells;
  try {
    game.cameraSurfaces.cells = new Map();
    assert.throws(
      () => inspectJungleCragQueries(game),
      /lacks its registered camera kernel/,
    );
  } finally {
    game.cameraSurfaces.cells = cells;
  }
  assert.deepEqual(terrainProfile.heights, heights);
  assert.equal(JSON.stringify(map), originalMap);
  for (const other of LEVELS.slice(1)) {
    buildJungleCrags({
      level: other,
      set jungleCrags(value) {
        assert.equal(value, null);
      },
    });
  }
  mesh.geometry.dispose();
  ground.dispose();
  material.dispose();
});

test("the delivered join observer detects displaced closed stone and restores its draw buffers", () => {
  const geometry = jungleCragGeometry(profile, level, site, 0, 1),
    ground = new T.PlaneGeometry(100, 100, 4, 4)
      .rotateX(-Math.PI / 2)
      .translate(50, 0, 50),
    p = ground.attributes.position,
    material = new T.MeshStandardMaterial();
  for (let i = 0; i < p.count; i++)
    p.setY(i, profile.height(p.getX(i), p.getZ(i)));
  const root = new T.Group();
  root.add(new T.Mesh(geometry, material));
  const bytes = geometry.attributes.position.array.slice(),
    report = verifyJungleCrags({
      jungleCrags: { root },
      terrainMeshes: [new T.Mesh(ground, material)],
    });
  assert.equal(report.accepted.parts, 1);
  assert.equal(report.accepted.exposed, 0);
  assert(report.displaced > 500);
  assert.deepEqual(geometry.attributes.position.array, bytes);
  geometry.dispose();
  ground.dispose();
  material.dispose();
});
