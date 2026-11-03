import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { createCavernProfile } from "../src/cavern-profile.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  stationBlocked,
  stationEntry,
  stationSupport,
} from "../src/field-station-solids.js";
import {
  columnAllowed,
  columnGeometry,
  planCavernColumns,
  buildCavernColumns,
} from "../src/cavern-columns.js";

function fixture(t) {
  t.mock.method(T.TextureLoader.prototype, "load", () => new T.Texture());
  const level = LEVELS[6],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level);
  const g = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile,
    cavernProfile: createCavernProfile(map, terrainProfile),
    world: new T.Group(),
    obstacles: [],
  });
  g.cameraSurfaces = new CameraSurfaces(g.world);
  t.after(() => {
    const geometries = new Set(),
      materials = new Set();
    g.world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) materials.add(o.material);
    });
    for (const geo of geometries) geo.dispose();
    for (const mat of materials) mat.dispose();
  });
  return g;
}
function closed(geo) {
  const edges = new Map(),
    p = geo.attributes.position,
    a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3();
  let volume = 0;
  for (let i = 0; i < geo.index.count; i += 3) {
    const ids = [0, 1, 2].map((j) => geo.index.getX(i + j));
    for (let j = 0; j < 3; j++) {
      const u = ids[j],
        v = ids[(j + 1) % 3],
        key = [u, v].sort((a, b) => a - b).join(",");
      const e = edges.get(key) || [0, 0];
      e[0]++;
      e[1] += u < v ? 1 : -1;
      edges.set(key, e);
    }
    a.fromBufferAttribute(p, ids[0]);
    b.fromBufferAttribute(p, ids[1]);
    c.fromBufferAttribute(p, ids[2]);
    assert(b.clone().sub(a).cross(c.clone().sub(a)).length() > 1e-8);
    volume += a.dot(b.cross(c)) / 6;
  }
  assert(
    [...edges.values()].every(
      ([count, winding]) => count === 2 && winding === 0,
    ),
  );
  assert(volume > 0);
  assert(p.array.every(Number.isFinite));
  assert(geo.attributes.normal.array.every(Number.isFinite));
}

test("calcite columns close with outward faces and buried floor and roof joins", (t) => {
  const g = fixture(t),
    sites = planCavernColumns(g);
  assert(sites.length >= 18);
  let joins = 0;
  for (const s of sites) {
    const geo = columnGeometry(s, g.terrainProfile, g.cavernProfile),
      p = geo.attributes.position,
      base = g.terrainProfile.surfaceHeight(s.x, s.z),
      last = p.count - 50;
    closed(geo);
    for (let j = 0; j < 48; j++)
      for (let k = 0; k <= 8; k++) {
        const next = (j + 1) % 48;
        for (const [offset, roof] of [
          [0, false],
          [last, true],
        ]) {
          const a = new T.Vector3().fromBufferAttribute(p, offset + j),
            b = new T.Vector3().fromBufferAttribute(p, offset + next),
            v = a.lerp(b, k / 8);
          assert(Math.hypot(v.x, v.z) < s.radius);
          const y = v.y + base;
          assert(
            roof
              ? y > g.cavernProfile.height(s.x + v.x, s.z + v.z) + 0.4
              : y <
                  Math.min(
                    g.terrainProfile.height(s.x + v.x, s.z + v.z),
                    g.terrainProfile.surfaceHeight(s.x + v.x, s.z + v.z),
                  ) -
                    0.4,
          );
          joins++;
        }
      }
    for (let i = 0; i < p.count; i++)
      assert(Math.hypot(p.getX(i), p.getZ(i)) < s.radius);
    geo.dispose();
  }
  t.diagnostic(
    `${sites.length} closed columns; ${joins} interpolated buried edge samples`,
  );
});

test("column footprints reserve continuous path segments and overhead structures", (t) => {
  const g = fixture(t),
    s = { x: 180, z: 180, radius: 3 };
  g.map = {
    ...g.map,
    grid: Array.from({ length: 60 }, () => Array(60).fill(1)),
    features: [],
    enemies: [],
    paths: [],
    spawn: { x: 2, z: 2 },
    echoGallery: null,
    echoCauseway: null,
    rooms: [],
  };
  g.terrainProfile = { ...g.terrainProfile, waters: [] };
  assert(columnAllowed(g, s));
  g.map.paths = [
    [
      { x: 140 / 7, z: 180 / 7 },
      { x: 220 / 7, z: 180 / 7 },
    ],
  ];
  assert(!columnAllowed(g, s), "interior of a long segment remains open");
  g.map.paths = [];
  g.obstacles = [{ x: 180, z: 180, w: 1, d: 1, bounds: { max: { y: 1000 } } }];
  assert(
    !columnAllowed(g, s),
    "overhead structures reserve a full-height column",
  );
  g.terrainProfile = { ...g.terrainProfile, surfaceHeight: () => 20 };
  g.obstacles = [{ x: 180, z: 180, w: 1, d: 1, h: 6 }];
  assert(!columnAllowed(g, s), "legacy heights are relative to their ground");
  g.obstacles = [];
  for (const type of ["features", "enemies"]) {
    g.map[type] = [{ x: 180 / 7, z: 180 / 7 }];
    assert(!columnAllowed(g, s));
    g.map[type] = [];
  }
  g.soundSources = [{ x: 180, z: 180 }];
  assert(!columnAllowed(g, s));
  g.soundSources = [];
  g.cavernPatches = [{ centers: [{ x: 180, z: 180 }] }];
  assert(!columnAllowed(g, s));
  g.cavernPatches = [];
  g.terrainProfile.waters = [{ x: 180, z: 180, width: 2, length: 2 }];
  assert(!columnAllowed(g, s));
});

test("batched column surfaces agree with physical rays and fitted camera bands", (t) => {
  const g = fixture(t),
    plan = planCavernColumns(g);
  buildCavernColumns(g);
  g.cameraSurfaces.rebuild();
  g.world.updateMatrixWorld(true, true);
  assert.deepEqual(
    g.cavernColumns.map(({ solid, root, ...s }) => s),
    plan,
  );
  assert.deepEqual(planCavernColumns(g), plan);
  assert.equal(new Set(plan.map((s) => s.room)).size, 9);
  const ray = new T.Raycaster();
  let count = 0,
    maxDelta = 0;
  for (const s of g.cavernColumns) {
    const base = g.terrainProfile.surfaceHeight(s.x, s.z),
      bottom = s.solid.bounds.min.y,
      top = s.solid.bounds.max.y;
    assert.equal(
      stationSupport(s.solid, s.x, s.z),
      null,
      "buried cap is not a walkable platform",
    );
    for (const t of [0.03, 0.07, 0.15, 0.3, 0.5, 0.7, 0.85, 0.93, 0.97])
      for (let j = 0; j < 24; j++) {
        const a = (j * Math.PI) / 12,
          y = bottom + (top - bottom) * t,
          start = new T.Vector3(
            s.x + Math.cos(a) * 7,
            y,
            s.z + Math.sin(a) * 7,
          ),
          end = new T.Vector3(s.x, y, s.z),
          length = start.distanceTo(end);
        ray.set(start, end.clone().sub(start).normalize());
        const hit = ray.intersectObject(s.root, true)[0];
        assert(hit);
        const entry = stationEntry(s.solid, start, end);
        assert(entry !== null);
        const delta = Math.abs(entry * length - hit.distance);
        maxDelta = Math.max(maxDelta, delta);
        assert(delta < 1e-4);
        const camera = g.cameraSurfaces.entry(start, end, 0);
        assert(camera * length <= hit.distance + 1e-4);
        assert(
          hit.distance - camera * length < 0.025,
          "camera envelope follows a ring band",
        );
        const inside = hit.point.clone().lerp(end, 0.02);
        assert(stationBlocked(s.solid, inside.x, inside.y, inside.z, 0.1, 0));
        const outside = hit.point.clone().lerp(start, 0.1);
        assert(
          !stationBlocked(s.solid, outside.x, outside.y, outside.z, 0.1, 0),
        );
        count++;
      }
    const y = (top + bottom) / 2;
    ray.set(new T.Vector3(s.x + 7, y, s.z), new T.Vector3(-1, 0, 0));
    const waist = ray.intersectObject(s.root, true)[0];
    const gap = s.solid.bounds.max.x - waist.point.x;
    assert(gap > 0.08, "waist has space inside the enclosing root bounds");
    assert.equal(
      g.cameraSurfaces.entry(
        new T.Vector3(s.x + 7, y, s.z),
        new T.Vector3(waist.point.x + gap * 0.75, y, s.z),
        0,
      ),
      1,
      "camera can occupy the empty space beside the waist",
    );
    assert(stationBlocked(s.solid, s.x, base, s.z, 1.8, 0.55));
  }
  g.level = LEVELS[0];
  buildCavernColumns(g);
  assert.deepEqual(g.cavernColumns, []);
  t.diagnostic(
    `${count} batched render/physical/camera rays; maximum physical difference ${maxDelta} m`,
  );
});

test("the reserved radius encloses short and tall curved column variants", () => {
  for (const height of [16, 30, 45])
    for (const seed of [0, 2.7, 11.9, 19.8]) {
      const s = {
          x: 70,
          z: 70,
          rx: 2.45,
          rz: 1.8,
          radius: 2.45 * 1.36,
          seed,
          yaw: seed * 0.3,
        },
        terrain = { step: 1.75, height: () => 0, surfaceHeight: () => 0 },
        roof = { height: () => height },
        geo = columnGeometry(s, terrain, roof),
        p = geo.attributes.position;
      closed(geo);
      for (let i = 0; i < p.count; i++)
        assert(
          Math.hypot(p.getX(i), p.getZ(i)) < s.radius,
          "the whole curved mesh fits its reserved footprint",
        );
      geo.dispose();
    }
});
