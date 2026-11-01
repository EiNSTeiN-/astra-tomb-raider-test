import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildCaverns } from "../src/caverns.js";
import { Adventure } from "../src/game.js";
import {
  flowstoneGeometry,
  flowstoneAllowed,
  planCavernFlowstone,
  buildCavernFlowstone,
} from "../src/cavern-flowstone.js";
import {
  stationSupport,
  stationBlocked,
  stationEntry,
} from "../src/field-station-solids.js";

function dispose(root) {
  const materials = new Set();
  root.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) materials.add(o.material);
  });
  for (const m of materials) m.dispose();
}
function fixture(t) {
  t.mock.method(T.TextureLoader.prototype, "load", () => new T.Texture());
  const level = LEVELS[6],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level);
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile,
    world: new T.Group(),
    obstacles: [],
    progress: { stage: 0, field: [] },
    jumpY: 0,
  });
  buildCaverns(game);
  t.after(() => dispose(game.world));
  return game;
}
function closure(geometry) {
  const edges = new Map(),
    p = geometry.attributes.position,
    a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3();
  let volume = 0;
  for (let i = 0; i < geometry.index.count; i += 3) {
    const ids = [0, 1, 2].map((j) => geometry.index.getX(i + j));
    for (let j = 0; j < 3; j++) {
      const key = [ids[j], ids[(j + 1) % 3]].sort((a, b) => a - b).join(",");
      edges.set(key, (edges.get(key) || 0) + 1);
    }
    a.fromBufferAttribute(p, ids[0]);
    b.fromBufferAttribute(p, ids[1]);
    c.fromBufferAttribute(p, ids[2]);
    assert(b.clone().sub(a).cross(c.clone().sub(a)).length() > 1e-8);
    volume += a.dot(b.cross(c)) / 6;
  }
  assert([...edges.values()].every((n) => n === 2));
  assert(volume > 0);
  assert(p.array.every(Number.isFinite));
  assert(geometry.attributes.normal.array.every(Number.isFinite));
  return geometry.index.count / 3;
}

test("flowstone has closed outward shelves and a buried perimeter on uneven ground", () => {
  const surface = (x, z) =>
    12 + Math.sin(x * 0.7) * 0.22 + Math.cos(z * 0.45) * 0.16 + x * 0.035;
  for (const seed of [2.1, 9.4, 17.8]) {
    const site = {
        x: 54,
        z: 68,
        rx: 5.2,
        rz: 2.1,
        height: 1.2,
        seed,
        radius: 5.824,
        yaw: seed * 0.3,
      },
      geo = flowstoneGeometry(site, surface),
      p = geo.attributes.position,
      base = surface(site.x, site.z);
    closure(geo);
    let highest = -Infinity;
    for (let j = 0; j < 48; j++)
      for (let k = 0; k <= 16; k++) {
        const a = new T.Vector3().fromBufferAttribute(p, 48 + j),
          b = new T.Vector3().fromBufferAttribute(p, 48 + ((j + 1) % 48)),
          v = a.lerp(b, k / 16);
        assert(
          base + v.y < surface(site.x + v.x, site.z + v.z),
          "perimeter buried",
        );
      }
    for (let i = 0; i < 48; i++)
      assert(
        base + p.getY(i) <
          surface(site.x + p.getX(i), site.z + p.getZ(i)) - 0.3,
      );
    for (let i = 0; i < p.count; i++) highest = Math.max(highest, p.getY(i));
    assert(highest > 0.9);
    geo.dispose();
  }
});

test("oriented flowstone margins reserve paths, controls, water and finite obstacles", (t) => {
  const g = fixture(t),
    site = { x: 180, z: 180, rx: 5, rz: 2, yaw: 0.7 };
  // Isolate the reservation observer, retaining a delivered terrain profile.
  g.map = {
    ...g.map,
    features: [],
    enemies: [],
    paths: [],
    echoGallery: null,
    echoCauseway: null,
    spawn: { x: 2, z: 2 },
  };
  g.terrainProfile = { ...g.terrainProfile, waters: [] };
  g.cavernPatches = [];
  g.obstacles = [];
  assert(flowstoneAllowed(g, site));
  const end = {
    x: site.x + 3 * Math.cos(site.yaw),
    z: site.z + 3 * Math.sin(site.yaw),
  };
  g.map.paths = [[{ x: end.x / 7, z: end.z / 7 }]];
  assert(!flowstoneAllowed(g, site));
  g.map.paths = [];
  g.map.features = [
    { type: "mechanism", x: (site.x + 3) / 7, z: (site.z - 12) / 7 },
  ];
  assert(!flowstoneAllowed(g, site));
  g.map.features = [];
  g.terrainProfile.waters = [{ x: end.x, z: end.z, width: 1, length: 1 }];
  assert(!flowstoneAllowed(g, site));
  g.terrainProfile.waters = [];
  g.obstacles = [{ x: end.x, z: end.z, w: 0.3, d: 0.3, bottom: -100 }];
  assert(!flowstoneAllowed(g, site));
  g.obstacles[0].bottom = 1000;
  assert(
    flowstoneAllowed(g, site),
    "overhead pendant does not reserve the floor",
  );
  g.soundSources = [{ x: end.x, z: end.z }];
  assert(!flowstoneAllowed(g, site));
});

test("delivered chamber shelves keep real rendered support, body and ray contact after batching", (t) => {
  const g = fixture(t),
    plan = planCavernFlowstone(g);
  assert(plan.length > 9);
  buildCavernFlowstone(g);
  assert.equal(g.cavernFlowstone.length, plan.length);
  assert.deepEqual(planCavernFlowstone(g), plan);
  let rays = 0,
    triangles = 0,
    roots = 0,
    maxBatchDelta = 0,
    displacedControl = false;
  const ray = new T.Raycaster(),
    up = new T.Vector3(0, -1, 0);
  for (const s of g.cavernFlowstone) {
    assert(flowstoneAllowed(g, s));
    const geo = flowstoneGeometry(s, g.terrainProfile.surfaceHeight),
      p = geo.attributes.position,
      base = g.terrainProfile.surfaceHeight(s.x, s.z);
    triangles += closure(geo);
    const mesh = new T.Mesh(
      geo,
      new T.MeshBasicMaterial({ side: T.DoubleSide }),
    );
    mesh.position.set(s.x, base, s.z);
    mesh.updateMatrixWorld();
    for (let j = 0; j < 48; j++)
      for (let k = 0; k <= 12; k++) {
        const a = new T.Vector3().fromBufferAttribute(p, j),
          b = new T.Vector3().fromBufferAttribute(p, (j + 1) % 48),
          v = a.lerp(b, k / 12).add(mesh.position);
        assert(v.y < g.terrainProfile.surfaceHeight(v.x, v.z));
        roots++;
      }
    for (let u = -s.rx; u <= s.rx; u += 0.45)
      for (let v = -s.rz; v <= s.rz; v += 0.45) {
        const x = s.x + u * Math.cos(s.yaw) - v * Math.sin(s.yaw),
          z = s.z + u * Math.sin(s.yaw) + v * Math.cos(s.yaw),
          top = s.solid.bounds.max.y + 2;
        ray.set(new T.Vector3(x, top, z), up);
        const hit = ray.intersectObject(mesh, false)[0],
          support = stationSupport(s.solid, x, z, Infinity);
        const delivered = ray.intersectObject(s.root, true)[0];
        assert.equal(Boolean(delivered), Boolean(hit), "batched footprint");
        if (hit) {
          const delta = Math.abs(delivered.point.y - hit.point.y);
          maxBatchDelta = Math.max(maxBatchDelta, delta);
          assert(
            delta < 1e-4,
            `batched shelf height differs by ${delta} m at ${x}, ${z}`,
          );
        }
        assert.equal(support === null, !hit);
        if (hit) {
          assert(Math.abs(support - hit.point.y) < 1e-5);
          assert(stationBlocked(s.solid, x, hit.point.y - 0.2, z, 0.1, 0));
          assert(!stationBlocked(s.solid, x, hit.point.y + 0.02, z, 1.8, 0));
          const start = new T.Vector3(x, top, z),
            end = new T.Vector3(x, base - 10, z),
            entry = stationEntry(s.solid, start, end);
          assert(Math.abs(entry - (top - hit.point.y) / (top - end.y)) < 1e-6);
        }
        rays++;
      }
    if (!displacedControl) {
      s.root.position.y += 0.01;
      s.root.updateWorldMatrix(true, true);
      ray.set(new T.Vector3(s.x, s.solid.bounds.max.y + 2, s.z), up);
      const shifted = ray.intersectObject(s.root, true)[0];
      assert(
        Math.abs(shifted.point.y - stationSupport(s.solid, s.x, s.z)) > 0.009,
      );
      s.root.position.y -= 0.01;
      s.root.updateWorldMatrix(true, true);
      displacedControl = true;
    }
    geo.dispose();
    mesh.material.dispose();
  }
  assert(g.world.children.some((o) => o.name === "Chamber flowstone terraces"));
  assert(displacedControl, "render displacement control was checked");
  g.level = LEVELS[0];
  buildCavernFlowstone(g);
  assert.deepEqual(g.cavernFlowstone, []);
  t.diagnostic(
    `${plan.length} terrain-seated terraces, ${triangles} closed triangles, ${roots} buried perimeter samples, ${rays} render/physical rays; maximum batching difference ${maxBatchDelta} m`,
  );
});
