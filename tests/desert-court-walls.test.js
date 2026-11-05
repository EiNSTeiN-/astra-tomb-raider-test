import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  buildDesertArchitecture,
  desertPlan,
} from "../src/desert-architecture.js";
import {
  desertCourtWallPlan,
  desertWallRectangles,
} from "../src/desert-court-walls.js";
import { inspectDesertCourtWalls } from "../scripts/inspect-desert-court-walls-browser.js";

test("authored rear walls retain crossing passages, complete window heads and usable masonry divisions", () => {
  const map = createMap(LEVELS[1]),
    variants = new Set();
  for (const room of map.rooms) {
    const walls = desertCourtWallPlan(room, desertPlan(room));
    variants.add(JSON.stringify(walls));
    for (const w of walls) {
      assert(![2].includes(w.span));
      assert(Math.abs(w.x) - w.width / 2 > 5);
      assert(w.z + w.depth / 2 < -17);
      const shape = desertWallRectangles(w, -0.3, 0);
      for (const r of shape.rectangles) {
        assert(
          r.right - r.left > 0.05,
          "no inverted or needle-thin facing stones",
        );
        assert(r.top > r.bottom);
      }
      for (const aperture of shape.openings) {
        assert(aperture.right - aperture.left >= 0.8);
        assert(aperture.top - aperture.bottom > 1.2);
        assert(
          shape.rectangles.some(
            (r) =>
              r.left <= aperture.left + 1e-8 &&
              r.right > aperture.left &&
              r.bottom === aperture.top &&
              r.top > r.bottom + 0.4,
          ),
        );
      }
    }
  }
  assert.equal(variants.size, 10);
});

test("delivered rear masonry retains real windows, seated rims, exact cap support and matching render/query rays", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[1],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    world = new THREE.Group(),
    game = {
      level,
      map,
      world,
      groundHeight: profile.surfaceHeight,
      obstacles: [],
      cameraSurfaces: new CameraSurfaces(world),
    },
    before = JSON.stringify(map),
    heights = profile.heights.slice();
  t.after(() => {
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of [o.material].flat().filter(Boolean)) {
        materials.add(m);
        for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((v) => v.dispose());
  });
  buildDesertArchitecture(game);
  game.cameraSurfaces.rebuild();
  let closedParts = 0;
  for (const patch of game.desertPatches) {
    const ids = new Set(
        patch.parts.filter((p) => p.kind === "rear wall").map((p) => p.id),
      ),
      records = new Map();
    patch.root.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const { position: p, arcadePart: part } = mesh.geometry.attributes;
      assert(
        Object.values(mesh.geometry.attributes).every((a) =>
          a.array.every(Number.isFinite),
        ),
      );
      for (let i = 0; i < p.count; i += 3) {
        const id = part.getX(i);
        if (!ids.has(id)) continue;
        const record = records.get(id) || { edges: new Map(), volume: 0 };
        records.set(id, record);
        const vs = [0, 1, 2].map((j) =>
            new THREE.Vector3().fromBufferAttribute(p, i + j),
          ),
          cross = vs[1].clone().sub(vs[0]).cross(vs[2].clone().sub(vs[0]));
        assert(
          cross.lengthSq() > 1e-14,
          "nondegenerate delivered wall triangles",
        );
        record.volume += vs[0].dot(vs[1].clone().cross(vs[2])) / 6;
        const keys = vs.map((v) =>
          v
            .toArray()
            .map((n) => n.toFixed(5))
            .join(","),
        );
        for (let j = 0; j < 3; j++) {
          const key = [keys[j], keys[(j + 1) % 3]].sort().join("|");
          record.edges.set(key, (record.edges.get(key) || 0) + 1);
        }
      }
    });
    for (const record of records.values()) {
      assert(record.volume > 1e-8, "outward wall component");
      assert(
        [...record.edges.values()].every((n) => n === 2),
        "every wall component is closed",
      );
      closedParts++;
    }
  }
  assert(closedParts > 1000);
  const report = inspectDesertCourtWalls(game);
  assert.deepEqual(report.failures, []);
  assert.equal(report.walls, 24);
  assert(report.windows > 15 && report.rims > 1800 && report.supports > 400);
  assert.equal(JSON.stringify(map), before);
  assert.deepEqual(profile.heights, heights);
  const original =
    game.desertPatches[0].masonryFeature.stationSolids[0].triangles.entry;
  game.desertPatches[0].masonryFeature.stationSolids[0].triangles.entry = () =>
    0.1;
  assert(
    inspectDesertCourtWalls(game).failures.some(
      (f) => f.kind === "filled window",
    ),
  );
  game.desertPatches[0].masonryFeature.stationSolids[0].triangles.entry =
    original;
});
