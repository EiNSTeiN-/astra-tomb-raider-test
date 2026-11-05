import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile, buildTerrainSurface } from "../src/terrain.js";
import { desertRouteDistance } from "../src/desert-geology.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { inspectDesertOutcrops } from "../scripts/inspect-desert-outcrops-browser.js";
import {
  stationSupport,
  stationBlocked,
  stationEntry,
} from "../src/field-station-solids.js";
import {
  desertOutcropCandidates,
  desertOutcropAllowed,
  sandstoneOutcropGeometry,
  buildDesertOutcrops,
} from "../src/desert-outcrops.js";

const level = LEVELS[1],
  map = createMap(level),
  profile = createTerrainProfile(map, level);
const planner = () => ({
  level,
  map,
  terrainProfile: profile,
  obstacles: [],
  items: [],
  groundHeight: profile.surfaceHeight,
});

test("sandstone districts are deterministic and keep complete footprints outside walking cells and controls", () => {
  const candidates = desertOutcropCandidates(map, level);
  assert.deepEqual(desertOutcropCandidates(map, level), candidates);
  assert(candidates.length >= 20);
  let probes = 0;
  for (const plan of candidates) {
    const geometry = sandstoneOutcropGeometry(plan, profile),
      p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      assert(desertRouteDistance(map, p.getX(i), p.getZ(i)) > 1.25);
      assert(Math.hypot(p.getX(i) - plan.x, p.getZ(i) - plan.z) < plan.radius);
      probes++;
    }
    geometry.dispose();
  }
  assert(probes > 25000);
  const g = planner(),
    accepted = candidates.filter((p) => desertOutcropAllowed(g, p));
  assert(accepted.length > 10);
  for (const f of map.features) {
    const p = { ...accepted[0], x: f.x * 7, z: f.z * 7 };
    assert.equal(desertOutcropAllowed(g, p), false);
  }
  const p = accepted[0];
  assert.equal(
    desertOutcropAllowed(
      { ...g, palmLayout: [{ x: p.x, z: p.z, scale: 1 }] },
      p,
    ),
    false,
  );
  assert.equal(
    desertOutcropAllowed(
      { ...g, obstacles: [{ x: p.x, z: p.z, w: 2, d: 2, h: 5 }] },
      p,
    ),
    false,
  );
});

test("delivered sandstone shells are closed and outward with their full rims and undersides buried", () => {
  let triangles = 0,
    buried = 0;
  for (const plan of desertOutcropCandidates(map, level)) {
    const geometry = sandstoneOutcropGeometry(plan, profile),
      p = geometry.attributes.position,
      index = geometry.index,
      edges = new Map();
    for (const a of Object.values(geometry.attributes))
      assert(a.array.every(Number.isFinite));
    let volume = 0;
    for (let i = 0; i < index.count; i += 3) {
      const ids = [0, 1, 2].map((j) => index.getX(i + j)),
        v = ids.map((id) => new THREE.Vector3().fromBufferAttribute(p, id)),
        cross = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));
      assert(cross.lengthSq() > 1e-12);
      volume += v[0].dot(v[1].clone().cross(v[2])) / 6;
      for (let j = 0; j < 3; j++) {
        const a = ids[j],
          b = ids[(j + 1) % 3],
          key = [a, b].sort((x, y) => x - y).join("/");
        const edge = edges.get(key) || { count: 0, direction: 0 };
        edge.count++;
        edge.direction += a < b ? 1 : -1;
        edges.set(key, edge);
      }
      triangles++;
    }
    assert(volume > 100);
    assert(
      [...edges.values()].every((e) => e.count === 2 && e.direction === 0),
    );
    const { sides, rings, bottom } = geometry.userData;
    for (let i = 1 + (rings - 1) * sides; i < 1 + rings * sides; i++) {
      const ground = profile.surfaceHeight(p.getX(i), p.getZ(i));
      assert(p.getY(i) < ground - 0.3);
      assert(bottom < ground - 0.8);
      buried++;
    }
    geometry.dispose();
  }
  assert(triangles > 50000);
  assert(buried > 1000);
});

test("actual terrain, sandstone support, sight and camera rays agree without filling empty bounding corners", async (t) => {
  t.mock.method(THREE.TextureLoader.prototype, "load", (_, onLoad) => {
    const texture = new THREE.Texture();
    queueMicrotask(() => onLoad?.(texture));
    return texture;
  });
  const world = new THREE.Group(),
    g = { ...planner(), world, cameraSurfaces: new CameraSurfaces(world) },
    storedMap = JSON.stringify(map),
    storedHeights = profile.heights.slice();
  buildTerrainSurface(g);
  await g.terrainTexturesReady;
  buildDesertOutcrops(g);
  world.updateMatrixWorld(true);
  g.cameraSurfaces.rebuild();
  const ray = new THREE.Raycaster(),
    gs = new Set(),
    ms = new Set(),
    ts = new Set();
  t.after(() => {
    world.traverse((o) => {
      if (o.geometry) gs.add(o.geometry);
      if (o.material)
        for (const m of [o.material].flat()) {
          ms.add(m);
          for (const v of Object.values(m)) if (v?.isTexture) ts.add(v);
        }
    });
    gs.forEach((v) => v.dispose());
    ms.forEach((v) => v.dispose());
    ts.forEach((v) => v.dispose());
  });
  assert.deepEqual(profile.heights, storedHeights);
  assert.equal(JSON.stringify(map), storedMap);
  assert(
    g.desertOutcrops.sites.length >= 10 && g.desertOutcrops.sites.length <= 28,
  );
  assert.equal(g.cameraSurfaces.count, g.desertOutcrops.sites.length);
  let probes = 0,
    empty = 0;
  for (const { plan, mesh, solid } of g.desertOutcrops.sites) {
    assert.equal(solid.triangles.solids.length, 1);
    const b = mesh.geometry.boundingBox;
    for (let iz = 0; iz <= 8; iz++)
      for (let ix = 0; ix <= 8; ix++) {
        const x = b.min.x + ((b.max.x - b.min.x) * ix) / 8,
          z = b.min.z + ((b.max.z - b.min.z) * iz) / 8,
          from = new THREE.Vector3(x, b.max.y + 5, z),
          to = new THREE.Vector3(x, b.min.y - 1, z);
        ray.set(from, new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(mesh, false)[0],
          support = stationSupport(solid, x, z),
          sight = stationEntry(solid, from, to),
          camera = g.cameraSurfaces.entry(from, to, 0);
        if (hit) {
          assert(Math.abs(support - hit.point.y) < 1e-5);
          assert(Math.abs(sight - hit.distance / from.distanceTo(to)) < 1e-5);
          assert(camera !== null && Math.abs(camera - sight) < 1e-4);
          assert(stationBlocked(solid, x, hit.point.y - 0.05, z, 0.1, 0));
          assert(!stationBlocked(solid, x, hit.point.y + 0.05, z, 1.8, 0));
          probes++;
        } else {
          assert.equal(support, null);
          assert.equal(sight, null);
          assert.equal(camera, 1);
          empty++;
        }
      }
    const p = mesh.geometry.attributes.position,
      { sides, rings } = mesh.geometry.userData;
    for (let i = 1 + (rings - 1) * sides; i < 1 + rings * sides; i++) {
      ray.set(
        new THREE.Vector3(p.getX(i), 100, p.getZ(i)),
        new THREE.Vector3(0, -1, 0),
      );
      const hit = ray.intersectObjects(g.terrainMeshes, false)[0];
      assert(hit);
      assert(p.getY(i) < hit.point.y - 0.3);
    }
    assert(desertRouteDistance(map, plan.x, plan.z) > plan.radius + 1.3);
  }
  assert(probes > 200 && empty > 200);
  const observed = inspectDesertOutcrops(g);
  assert.deepEqual(observed.failures, []);
  assert(observed.rimQueries > 1000);
  assert(observed.triangles <= 120000);
  const moved = g.desertOutcrops.sites[0].mesh;
  moved.position.y = 1;
  assert(
    inspectDesertOutcrops(g).failures.some((f) => f.kind === "unburied rim"),
  );
  moved.position.y = 0;
});

test("the other seven chapters allocate no sandstone scenery and drop an old chapter reference", () => {
  for (const level of LEVELS.filter((l) => l.biome !== "desert")) {
    const g = {
      level,
      world: new THREE.Group(),
      desertOutcrops: { old: true },
    };
    buildDesertOutcrops(g);
    assert.equal(g.desertOutcrops, null);
    assert.equal(g.world.children.length, 0);
  }
});
