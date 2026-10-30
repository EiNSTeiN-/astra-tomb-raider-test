import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile, buildTerrainSurface } from "../src/terrain.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { desertRouteDistance } from "../src/desert-geology.js";
import { stationSupport, stationBlocked } from "../src/field-station-solids.js";
import {
  basaltColumnGeometry,
  volcanicOutcropPlan,
  buildVolcanicOutcrops,
} from "../src/volcanic-outcrops.js";

const level = LEVELS[4],
  map = createMap(level),
  profile = createTerrainProfile(map, level);
const planner = () => ({ level, map, terrainProfile: profile, obstacles: [] });

function separation(a, b) {
  let gap = -Infinity;
  for (const p of [a, b])
    for (let i = 0; i < p.length; i++) {
      const q = p[(i + 1) % p.length],
        dx = q[0] - p[i][0],
        dz = q[1] - p[i][1],
        length = Math.hypot(dx, dz);
      if (length < 1e-9) continue;
      const project = (v) => (-dz * v[0] + dx * v[1]) / length;
      const x = a.map(project),
        z = b.map(project);
      gap = Math.max(
        gap,
        Math.min(...x) - Math.max(...z),
        Math.min(...z) - Math.max(...x),
      );
    }
  return gap;
}

test("basalt clusters leave the walking collar and focus cameras clear with separated cooling cells", () => {
  const plans = volcanicOutcropPlan(planner());
  assert(plans.length >= 3 && plans.length <= map.rooms.length);
  assert.deepEqual(volcanicOutcropPlan(planner()), plans);
  let probes = 0,
    columns = 0;
  for (const plan of plans) {
    columns += plan.cells.length;
    for (let i = 0; i < plan.cells.length; i++) {
      const a = plan.cells[i].polygon;
      for (let j = i + 1; j < plan.cells.length; j++)
        assert(
          separation(a, plan.cells[j].polygon) > 1e-5,
          "open column joints",
        );
      for (let edge = 0; edge < a.length; edge++) {
        const p = a[edge],
          q = a[(edge + 1) % a.length],
          count = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.2);
        for (let n = 0; n <= count; n++) {
          const t = n / count,
            x = p[0] + (q[0] - p[0]) * t,
            z = p[1] + (q[1] - p[1]) * t;
          assert(
            desertRouteDistance(map, x, z) > 6.8,
            "keep the full camera arm outside the stone",
          );
          for (const f of map.features.filter((f) => f.type === "mechanism"))
            assert(
              !(
                x > f.x * 7 &&
                x < f.x * 7 + 27 &&
                z > f.z * 7 + 9 &&
                z < f.z * 7 + 69
              ),
              "desktop and portrait focus approach",
            );
          probes++;
        }
      }
    }
  }
  assert(columns > 100 && probes > 5000);
});

test("closed basalt columns meet the delivered terrain and their batched physical surfaces", async (t) => {
  t.mock.method(THREE.TextureLoader.prototype, "load", (_, onLoad) => {
    const texture = new THREE.Texture();
    queueMicrotask(() => onLoad?.(texture));
    return texture;
  });
  const world = new THREE.Group(),
    sentinel = { x: 1, z: 1, w: 0.5, d: 0.5, h: 4 },
    heights = profile.heights.slice(),
    originalMap = JSON.stringify(map);
  const game = {
    ...planner(),
    world,
    darkMat: new THREE.MeshStandardMaterial({ map: new THREE.Texture() }),
    cameraSurfaces: new CameraSurfaces(world),
    groundHeight: profile.surfaceHeight,
    obstacles: [sentinel],
  };
  buildTerrainSurface(game);
  await game.terrainTexturesReady;
  buildVolcanicOutcrops(game);
  world.updateMatrixWorld(true);
  game.cameraSurfaces.rebuild();
  t.after(() => {
    const gs = new Set(),
      ms = new Set([game.darkMat]);
    world.traverse((o) => {
      if (o.geometry) gs.add(o.geometry);
      for (const m of [o.material].flat().filter(Boolean)) ms.add(m);
    });
    for (const g of gs) g.dispose();
    for (const m of ms) m.dispose();
  });
  assert.deepEqual(profile.heights, heights);
  assert.equal(JSON.stringify(map), originalMap);
  assert.equal(game.obstacles[0], sentinel);
  assert.equal(game.volcanicOutcrops.material.map, game.darkMat.map);
  const ray = new THREE.Raycaster();
  let roots = 0,
    columns = 0,
    triangles = 0;
  for (const { plan, mesh, solid } of game.volcanicOutcrops.clusters) {
    assert.equal(
      solid.triangles.solids.length,
      plan.cells.length,
      "each column stays a separate closed solid",
    );
    for (const cell of plan.cells) {
      const geometry = basaltColumnGeometry(cell, plan, profile),
        p = geometry.attributes.position,
        edges = new Map();
      let volume = 0;
      for (const attribute of Object.values(geometry.attributes))
        assert(attribute.array.every(Number.isFinite));
      for (let i = 0; i < p.count; i += 3) {
        const vs = [0, 1, 2].map((j) =>
          new THREE.Vector3().fromBufferAttribute(p, i + j),
        );
        const area = new THREE.Vector3()
          .subVectors(vs[1], vs[0])
          .cross(new THREE.Vector3().subVectors(vs[2], vs[0]))
          .length();
        assert(area > 1e-9);
        volume += vs[0].dot(vs[1].clone().cross(vs[2])) / 6;
        for (let j = 0; j < 3; j++) {
          const key = (v) =>
              v
                .toArray()
                .map((n) => n.toFixed(5))
                .join(","),
            a = key(vs[j]),
            b = key(vs[(j + 1) % 3]),
            id = [a, b].sort().join("/");
          edges.set(id, (edges.get(id) || 0) + (a < b ? 1 : -1));
        }
      }
      assert(volume > 0);
      assert([...edges.values()].every((n) => n === 0));
      const bottom = geometry.boundingBox.min.y;
      for (const [x, z] of [cell.center, ...cell.polygon]) {
        ray.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
        const ground = ray.intersectObjects(game.terrainMeshes, false)[0];
        assert(ground);
        assert(
          bottom < ground.point.y - 0.3,
          "complete base buried under actual Float32 terrain",
        );
        roots++;
      }
      const [x, z] = cell.center;
      ray.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh, false)[0];
      assert(hit);
      assert(Math.abs(stationSupport(solid, x, z) - hit.point.y) < 1e-5);
      assert(stationBlocked(solid, x, hit.point.y - 0.1, z, 0.2));
      assert.equal(
        stationBlocked(solid, x, hit.point.y + 0.1, z, 1.8, 0),
        false,
      );
      triangles += p.count / 3;
      columns++;
      geometry.dispose();
    }
  }
  assert(roots > 900 && columns > 100 && triangles < 60000);
  assert.equal(game.cameraSurfaces.count, columns);
});

test("other chapters allocate no volcanic geometry or retain the previous chapter reference", () => {
  for (const level of LEVELS.filter((l) => l.biome !== "volcano")) {
    const world = new THREE.Group(),
      game = { level, world, volcanicOutcrops: { old: true } };
    buildVolcanicOutcrops(game);
    assert.equal(game.volcanicOutcrops, null);
    assert.equal(world.children.length, 0);
  }
});
