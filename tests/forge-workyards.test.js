import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile, buildTerrainSurface } from "../src/terrain.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { stationBlocked, stationSupport } from "../src/field-station-solids.js";
import {
  FORGE_WORKYARDS,
  forgeWorkyardArt,
  workyardPipeGeometry,
} from "../src/forge-workyard-art.js";
import {
  forgeWorkyardPlan,
  buildForgeWorkyards,
} from "../src/forge-workyards.js";

const level = LEVELS[4],
  map = createMap(level),
  profile = createTerrainProfile(map, level);
const materials = () =>
  Object.fromEntries(
    ["stone", "dark", "metal", "clay"].map((k) => [
      k,
      new THREE.MeshStandardMaterial(),
    ]),
  );

test("all nine workyard themes use finite closed parts inside their seated bay footprint", () => {
  const m = materials();
  let count = 0;
  assert.equal(new Set(FORGE_WORKYARDS.map((p) => p.name)).size, 9);
  for (const [room, plan] of FORGE_WORKYARDS.entries())
    for (const [row, kind] of plan.kinds.entries()) {
      const root = forgeWorkyardArt(
        kind,
        m,
        5184 + room * 73 + row * 13,
        plan.canopy && row === 0,
      );
      root.updateMatrixWorld(true);
      for (const mesh of root.children) {
        const g = mesh.geometry.index
          ? mesh.geometry.toNonIndexed()
          : mesh.geometry.clone();
        g.applyMatrix4(mesh.matrixWorld);
        g.computeBoundingBox();
        for (const a of Object.values(g.attributes))
          assert(a.array.every(Number.isFinite));
        const b = g.boundingBox;
        assert(
          b.min.x >= -1.2 &&
            b.max.x <= 1.2 &&
            b.min.z >= -0.85 &&
            b.max.z <= 0.85 &&
            b.min.y >= -0.025 &&
            b.max.y < 4.05,
        );
        const p = g.attributes.position,
          edges = new Map();
        let volume = 0;
        const key = (v) =>
          v
            .toArray()
            .map((n) => Math.round(n * 1e5))
            .join(",");
        for (let i = 0; i < p.count; i += 3) {
          const vs = [0, 1, 2].map((j) =>
            new THREE.Vector3().fromBufferAttribute(p, i + j),
          );
          assert(
            vs[1].clone().sub(vs[0]).cross(vs[2].clone().sub(vs[0])).length() >
              1e-9,
            kind + " degenerate face",
          );
          volume += vs[0].dot(vs[1].clone().cross(vs[2])) / 6;
          for (let j = 0; j < 3; j++) {
            const a = key(vs[j]),
              b = key(vs[(j + 1) % 3]),
              id = [a, b].sort().join("/");
            edges.set(id, (edges.get(id) || 0) + (a < b ? 1 : -1));
          }
        }
        assert(volume > 0, kind + " outward surface");
        assert(
          [...edges.values()].every((n) => n === 0),
          kind + " closed edges",
        );
        count++;
        g.dispose();
        mesh.geometry.dispose();
      }
    }
  assert(count > 200);
  const pipe = new THREE.Mesh(workyardPipeGeometry(), m.metal),
    ray = new THREE.Raycaster(
      new THREE.Vector3(0, 2, 0),
      new THREE.Vector3(0, -1, 0),
    );
  assert.equal(ray.intersectObject(pipe).length, 0, "pipe has a real bore");
  ray.ray.origin.x = 0.3;
  assert(ray.intersectObject(pipe).length > 0, "annular end face is solid");
  pipe.geometry.dispose();
  Object.values(m).forEach((m) => m.dispose());
});

test("workyards retain main paths and terrain, bury foundations and match the batched physical surfaces", async (t) => {
  t.mock.method(THREE.TextureLoader.prototype, "load", (_, loaded) => {
    const texture = new THREE.Texture();
    queueMicrotask(() => loaded?.(texture));
    return texture;
  });
  const m = materials(),
    world = new THREE.Group(),
    paving = new THREE.MeshStandardMaterial({ transparent: true });
  paving.name = "Worn court paving";
  const fakeYard = new THREE.Group();
  fakeYard.add(new THREE.Mesh(new THREE.BoxGeometry(), paving));
  const game = {
    level,
    map,
    terrainProfile: profile,
    world,
    groundHeight: profile.surfaceHeight,
    obstacles: [],
    items: [],
    traversalCourses: [],
    stoneMat: m.stone,
    darkMat: m.dark,
    forgeMetal: m.metal,
    stationYards: [{ root: fakeYard }],
    cameraSurfaces: new CameraSurfaces(world),
    canMove: (x, z) => !!map.grid[Math.round(z / 7)]?.[Math.round(x / 7)],
  };
  const heights = profile.heights.slice(),
    originalMap = JSON.stringify(map),
    plan = forgeWorkyardPlan(game);
  assert.equal(plan.length, 9);
  assert.deepEqual(forgeWorkyardPlan(game), plan);
  buildTerrainSurface(game);
  await game.terrainTexturesReady;
  buildForgeWorkyards(game);
  world.updateMatrixWorld(true);
  game.cameraSurfaces.rebuild();
  t.after(() => {
    const gs = new Set(),
      ms = new Set(Object.values(m));
    world.traverse((o) => {
      if (o.geometry) gs.add(o.geometry);
      if (o.material) ms.add(o.material);
    });
    gs.forEach((g) => g.dispose());
    ms.forEach((m) => m.dispose());
    fakeYard.children[0].geometry.dispose();
    paving.dispose();
  });
  assert.deepEqual(profile.heights, heights);
  assert.equal(JSON.stringify(map), originalMap);
  assert.equal(game.forgeWorkyards.length, 9);
  const ray = new THREE.Raycaster();
  let roots = 0,
    pathSamples = 0,
    triangles = 0;
  for (const yard of game.forgeWorkyards) {
    triangles += yard.triangles;
    assert(yard.batches <= 5);
    for (const module of yard.modules) {
      for (const dx of [-module.w / 2, 0, module.w / 2])
        for (const dz of [-module.d / 2, 0, module.d / 2]) {
          const x = module.x + dx,
            z = module.z + dz;
          ray.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
          const ground = ray.intersectObjects(game.terrainMeshes, false)[0];
          assert(ground);
          assert(module.bottom < ground.point.y - 0.1);
          assert(module.top >= ground.point.y + 0.024);
          roots++;
        }
      ray.set(
        new THREE.Vector3(module.x, 100, module.z),
        new THREE.Vector3(0, -1, 0),
      );
      const hit = ray
        .intersectObject(yard.root, true)
        .find((h) => h.object.material !== paving);
      assert(hit);
      assert(
        Math.abs(
          stationSupport(module.solid, module.x, module.z) - hit.point.y,
        ) < 1e-4,
      );
      assert(
        stationBlocked(
          module.solid,
          module.x,
          hit.point.y - 0.08,
          module.z,
          0.16,
          0,
        ),
      );
      for (const path of map.paths)
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1],
            b = path[i],
            length = Math.hypot(b.x - a.x, b.z - a.z) * 7,
            steps = Math.ceil(length / 0.5);
          for (let n = 0; n <= steps; n++) {
            const x = (a.x + ((b.x - a.x) * n) / steps) * 7,
              z = (a.z + ((b.z - a.z) * n) / steps) * 7;
            if (Math.hypot(x - module.x, z - module.z) > 8) continue;
            assert.equal(
              stationBlocked(
                module.solid,
                x,
                game.groundHeight(x, z),
                z,
                1.8,
                0.68,
              ),
              false,
              "retained route through the workyard",
            );
            pathSamples++;
          }
        }
    }
    const inlay = yard.root.children.find((o) => o.material === paving);
    assert(inlay);
    const p = inlay.geometry.attributes.position;
    for (let i = 0; i < p.count; i++)
      assert(
        Math.abs(p.getY(i) - game.groundHeight(p.getX(i), p.getZ(i)) - 0.003) <
          1e-4,
        "inlay follows actual terrain triangles",
      );
  }
  assert.equal(roots, 486);
  assert(pathSamples > 100);
  assert(triangles < 70000);
});

test("the seven other chapters allocate no forge workyards or retain old references", () => {
  for (const level of LEVELS.filter((l) => l.biome !== "volcano")) {
    const world = new THREE.Group(),
      game = { level, world, forgeWorkyards: [{}] };
    buildForgeWorkyards(game);
    assert.deepEqual(game.forgeWorkyards, []);
    assert.equal(world.children.length, 0);
  }
});
