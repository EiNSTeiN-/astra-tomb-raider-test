import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile, buildTerrainSurface } from "../src/terrain.js";
import {
  addForgeForecourtMap,
  forgeForecourtPlan,
} from "../src/forge-forecourt-plan.js";
import { buildForgeForecourts } from "../src/forge-forecourts.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { stationBlocked, stationSupport } from "../src/field-station-solids.js";

test("the nine foundry courts have distinct connected foreground pairs without rewriting objectives or paths", () => {
  const map = createMap(LEVELS[4]),
    before = JSON.stringify({
      features: map.features,
      paths: map.paths,
      spawn: map.spawn,
      enemies: map.enemies,
    });
  addForgeForecourtMap(map, LEVELS[4]);
  assert.equal(
    JSON.stringify({
      features: map.features,
      paths: map.paths,
      spawn: map.spawn,
      enemies: map.enemies,
    }),
    before,
  );
  assert.equal(map.forgeForecourtAnnexes.length, 18);
  for (const [i, a] of map.forgeForecourtAnnexes.entries())
    for (const b of map.forgeForecourtAnnexes.slice(i + 1))
      assert(
        Math.abs(a.worldX - b.worldX) > (a.width + b.width) / 2 ||
          Math.abs(a.worldZ - b.worldZ) > (a.depth + b.depth) / 2,
        `separate courts ${a.room}/${a.index} and ${b.room}/${b.index}`,
      );
  assert.equal(
    new Set(
      map.rooms.map((r) =>
        forgeForecourtPlan(r)
          .map((p) => p.kind)
          .join("/"),
      ),
    ).size,
    9,
  );
  const start = [map.spawn.x, map.spawn.z],
    seen = new Set([start.join(",")]),
    queue = [start];
  for (let i = 0; i < queue.length; i++)
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const [x, z] = queue[i],
        nx = x + dx,
        nz = z + dz,
        key = `${nx},${nz}`;
      if (map.grid[nz]?.[nx] && !seen.has(key)) {
        seen.add(key);
        queue.push([nx, nz]);
      }
    }
  for (const p of map.forgeForecourtAnnexes) {
    for (const cell of p.cells)
      assert(seen.has(cell.join(",")), `connected annex ${p.room}/${p.index}`);
    for (const dx of [-p.width / 2, 0, p.width / 2])
      for (const dz of [-p.depth / 2, 0, p.depth / 2])
        assert(
          map.grid[Math.round((p.worldZ + dz) / 7)]?.[
            Math.round((p.worldX + dx) / 7)
          ],
        );
  }
  for (const level of LEVELS.filter((l) => l.biome !== "volcano"))
    assert.equal(createMap(level).forgeForecourtAnnexes, undefined);
});

test("forecourt foundations meet rendered terrain, real caps support feet, and original paths clear finite architecture", async (t) => {
  t.mock.method(THREE.TextureLoader.prototype, "load", (_, loaded) => {
    const texture = new THREE.Texture();
    queueMicrotask(() => loaded?.(texture));
    return texture;
  });
  const level = LEVELS[4],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    world = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial(),
    dark = stone.clone(),
    metal = stone.clone(),
    paving = stone.clone();
  paving.name = "Worn court paving";
  paving.transparent = true;
  const yard = new THREE.Group();
  yard.add(new THREE.Mesh(new THREE.BoxGeometry(), paving));
  const g = {
    level,
    map,
    terrainProfile: profile,
    world,
    groundHeight: profile.surfaceHeight,
    obstacles: [],
    items: [],
    traversalCourses: [],
    stoneMat: stone,
    darkMat: dark,
    forgeMetal: metal,
    stationYards: [{ root: yard }],
    cameraSurfaces: new CameraSurfaces(world),
  };
  const heights = profile.heights.slice();
  buildTerrainSurface(g);
  await g.terrainTexturesReady;
  buildForgeForecourts(g);
  world.updateMatrixWorld(true);
  g.cameraSurfaces.rebuild();
  t.after(() => {
    const gs = new Set(),
      ms = new Set([stone, dark, metal, paving]);
    for (const root of [world, yard])
      root.traverse((o) => {
        if (o.geometry) gs.add(o.geometry);
        for (const m of [o.material].flat()) if (m) ms.add(m);
      });
    gs.forEach((g) => g.dispose());
    ms.forEach((m) => m.dispose());
  });
  assert.deepEqual(profile.heights, heights);
  assert.equal(g.forgeForecourts.length, 9);
  const roles = g.forgeForecourts.flatMap((c) =>
    c.assemblies.map((a) => a.role),
  );
  assert.equal(roles.filter((r) => r === "gallery roof").length, 3);
  assert.equal(roles.filter((r) => r === "engine apron lintel").length, 1);
  assert.equal(roles.filter((r) => r === "casting bed").length, 7);
  const aprons = g.forgeForecourts.flatMap((c) =>
    c.paving.map((p) => ({
      ...p,
      x: p.x + c.root.position.x,
      z: p.z + c.root.position.z,
    })),
  );
  assert.equal(aprons.length, 27);
  for (const [i, a] of aprons.entries())
    for (const b of aprons.slice(i + 1))
      assert(
        Math.abs(a.x - b.x) >= (a.w + b.w) / 2 ||
          Math.abs(a.z - b.z) >= (a.d + b.d) / 2,
        "neighboring courts cannot layer coplanar paving",
      );
  const ray = new THREE.Raycaster();
  let roots = 0,
    caps = 0,
    triangles = 0;
  for (const court of g.forgeForecourts) {
    assert(court.walls.length > 4, `court ${court.room} retains architecture`);
    assert(court.root.children.length <= 4);
    const beds = court.assemblies.filter((a) => a.role === "casting bed");
    for (let i = 1; i < beds.length; i++) {
      const a = beds[i - 1].solid.bounds,
        b = beds[i].solid.bounds;
      assert(
        Math.max(
          b.min.x - a.max.x,
          a.min.x - b.max.x,
          b.min.z - a.max.z,
          a.min.z - b.max.z,
        ) > 1.2,
        "paired casting beds retain a walking gap",
      );
    }
    triangles += court.triangles;
    court.root.traverse((o) => {
      if (o.geometry)
        for (const a of Object.values(o.geometry.attributes))
          assert(a.array.every(Number.isFinite));
    });
    for (const wall of court.walls) {
      const x = court.root.position.x + wall.x,
        z = court.root.position.z + wall.z;
      for (const dx of [-wall.w / 2, 0, wall.w / 2])
        for (const dz of [-wall.d / 2, 0, wall.d / 2]) {
          ray.set(
            new THREE.Vector3(x + dx, 200, z + dz),
            new THREE.Vector3(0, -1, 0),
          );
          const hit = ray.intersectObjects(g.terrainMeshes, false)[0];
          assert(hit);
          assert(wall.bottom < hit.point.y - 0.1);
          roots++;
        }
      ray.set(new THREE.Vector3(x, 200, z), new THREE.Vector3(0, -1, 0));
      const hit = ray
        .intersectObject(court.root, true)
        .find((h) => !h.object.material.transparent);
      assert(hit);
      const top = Math.max(
        ...court.assemblies.map(
          (a) => stationSupport(a.solid, x, z) ?? -Infinity,
        ),
      );
      assert(Math.abs(top - hit.point.y) < 1e-4, `rendered cap ${court.room}`);
      caps++;
    }
    for (let i = 0; i < court.paving.length; i++)
      for (let j = i + 1; j < court.paving.length; j++) {
        const a = court.paving[i],
          b = court.paving[j];
        assert(
          Math.abs(a.x - b.x) >= (a.w + b.w) / 2 ||
            Math.abs(a.z - b.z) >= (a.d + b.d) / 2,
          "no overlapping coplanar inlays",
        );
      }
  }
  assert(roots > 900 && caps > 100);
  assert(triangles < 200000);
  let samples = 0;
  for (const path of map.paths)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 7);
      for (let step = 0; step <= n; step++) {
        const t = step / n,
          x = (a.x + (b.x - a.x) * t) * 7,
          z = (a.z + (b.z - a.z) * t) * 7,
          y = g.groundHeight(x, z);
        assert(
          g.obstacles.every((o) => !stationBlocked(o, x, y, z)),
          `original path ${x},${z}`,
        );
        samples++;
      }
    }
  assert(samples > 1000);
});

test("leaving the volcanic chapter clears forecourt references without allocating new geometry", () => {
  for (const level of LEVELS.filter((l) => l.biome !== "volcano")) {
    const world = new THREE.Group(),
      game = { level, world, forgeForecourts: [{ old: true }] };
    buildForgeForecourts(game);
    assert.deepEqual(game.forgeForecourts, []);
    assert.equal(world.children.length, 0);
  }
});
