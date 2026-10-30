import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { forgeRoofHeight, forgeRoofSample } from "../src/forge-vaults.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { SaveStore } from "../src/storage.js";
import { buildFieldGates } from "../src/field-world.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { stationSupport, stationBlocked } from "../src/field-station-solids.js";

function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[4],
    map = createMap(level),
    world = new THREE.Group();
  const store = new SaveStore({ getItem() {}, setItem() {} });
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    world,
    store,
    progress: store.level(level.id),
    terrainProfile: createTerrainProfile(map, level),
    player: new THREE.Group(),
    obstacles: [],
    items: map.features.filter((f) => f.type === "mechanism"),
    elapsed: 0,
    audio: { noiseHit() {} },
    cameraSurfaces: new CameraSurfaces(world),
  });
  buildFieldGates(game);
  world.updateMatrixWorld(true);
  game.cameraSurfaces.rebuild();
  t.after(() => {
    const geometries = new Set(),
      materials = new Set();
    world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of [o.material].flat().filter(Boolean)) materials.add(m);
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  });
  return game;
}

function closed(geometry) {
  const p = geometry.attributes.position,
    index = geometry.index,
    edges = new Map();
  let volume = 0;
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const a = [0, 1, 2].map((k) =>
      new THREE.Vector3().fromBufferAttribute(
        p,
        index ? index.getX(i + k) : i + k,
      ),
    );
    volume += a[0].dot(a[1].clone().cross(a[2])) / 6;
    for (let j = 0; j < 3; j++) {
      const key = (v) =>
        v
          .toArray()
          .map((x) => Math.round(x * 1e6))
          .join(",");
      const u = key(a[j]),
        v = key(a[(j + 1) % 3]),
        pair = [u, v].sort().join("/");
      edges.set(pair, (edges.get(pair) || 0) + (u < v ? 1 : -1));
    }
  }
  assert(
    [...edges.values()].every((v) => v === 0),
    "closed oriented edges",
  );
  assert(volume > 0, "outward wound finite volume");
  for (const a of Object.values(geometry.attributes))
    assert(a.array.every(Number.isFinite));
}

test("eight delivered forge roofs are closed, supported and physically match their rendered surfaces", (t) => {
  const game = fixture(t),
    ray = new THREE.Raycaster();
  assert.equal(game.fieldGates.length, 8);
  let samples = 0,
    bearings = 0,
    openings = 0,
    vents = 0;
  for (const gate of game.fieldGates) {
    const roof = gate.forgeVault,
      c = gate.root.position;
    assert(roof.root.children.length <= 3);
    assert(roof.triangles < 12000);
    for (const mesh of roof.root.children) closed(mesh.geometry);
    for (const solid of roof.solids) {
      assert(solid.bounds.min.y >= c.y + 6.91);
      assert.equal(stationBlocked(solid, c.x, c.y, c.z, 1.9), false);
    }
    for (const cell of roof.grid.cells.filter((_, i) => i % 9 === 0)) {
      const x = c.x + cell.x0 * 0.63 + cell.x1 * 0.37;
      const z = c.z + cell.z0 * 0.39 + cell.z1 * 0.61;
      ray.set(new THREE.Vector3(x, c.y + 30, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(roof.root.children, false)[0];
      assert(hit);
      const support = Math.max(
        ...roof.solids.map((s) => stationSupport(s, x, z) ?? -Infinity),
      );
      assert(
        Math.abs(support - hit.point.y) < 1e-5,
        `rendered support ${gate.stage}`,
      );
      assert(
        roof.solids.some((s) => stationBlocked(s, x, support - 0.08, z, 0.2)),
      );
      samples++;
    }
    // Inspect the old masonry independently of the new roof, so a roof cannot
    // falsely prove that its own springing course has something beneath it.
    const walls = [];
    gate.root.traverse((o) => {
      if (!o.isMesh) return;
      for (let p = o; p; p = p.parent) if (p === roof.root) return;
      walls.push(o);
    });
    for (const b of roof.bearings.filter((b) => Math.abs(b.z) < 5.2)) {
      ray.set(
        new THREE.Vector3(c.x + b.x, c.y + 7.5, c.z + b.z),
        new THREE.Vector3(0, -1, 0),
      );
      const hit = ray.intersectObjects(walls, false)[0];
      assert(
        hit && hit.point.y >= c.y + b.bottom - 0.005,
        `unseated roof ${gate.stage} ${JSON.stringify(b)}`,
      );
      bearings++;
    }
    for (const h of roof.openings.filter((h) => !h.covered)) {
      ray.set(
        new THREE.Vector3(
          c.x + (h.x0 + h.x1) / 2,
          c.y + 30,
          c.z + (h.z0 + h.z1) / 2,
        ),
        new THREE.Vector3(0, -1, 0),
      );
      assert.equal(
        ray.intersectObjects(roof.root.children, false).length,
        0,
        "real light opening",
      );
      openings++;
    }
    for (const v of roof.plan.vents) {
      ray.set(
        new THREE.Vector3(
          c.x + (v.x0 + v.x1) / 2,
          c.y + (v.y0 + v.y1) / 2,
          c.z + roof.plan.end + 0.6,
        ),
        new THREE.Vector3(0, 0, -1),
      );
      ray.far = 1;
      assert.equal(
        ray.intersectObjects(roof.root.children, false).length,
        0,
        "front vent is open between its bars",
      );
      ray.far = Infinity;
      vents++;
    }
  }
  assert(samples > 250 && bearings > 100 && openings >= 8 && vents === 9);
});

test("roof fittings sample the rendered triangles instead of the curved design between vertices", (t) => {
  const game = fixture(t),
    ray = new THREE.Raycaster();
  let error = 0,
    designDifference = 0;
  for (const gate of game.fieldGates) {
    const { plan, grid } = gate.forgeVault;
    for (const cell of grid.cells.filter((_, i) => i % 13 === 0)) {
      const x = cell.x0 * 0.41 + cell.x1 * 0.59,
        z = cell.z0 * 0.67 + cell.z1 * 0.33;
      // Read the roof skin on its own; seams and lanterns are intentionally higher.
      const vertices = [
        [cell.x0, cell.z0],
        [cell.x0, cell.z1],
        [cell.x1, cell.z1],
        [cell.x1, cell.z0],
      ];
      const p = vertices.map(
        ([a, b]) => new THREE.Vector3(a, forgeRoofHeight(plan, a, b), b),
      );
      ray.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
      const hit =
        ray.ray.intersectTriangle(
          p[0],
          p[1],
          p[2],
          false,
          new THREE.Vector3(),
        ) ||
        ray.ray.intersectTriangle(p[0], p[2], p[3], false, new THREE.Vector3());
      assert(hit);
      error = Math.max(
        error,
        Math.abs(forgeRoofSample(plan, grid, x, z) - hit.y),
      );
      designDifference = Math.max(
        designDifference,
        Math.abs(forgeRoofHeight(plan, x, z) - hit.y),
      );
    }
  }
  assert(error < 1e-9);
  assert(
    designDifference > 0.01,
    "curved design is a meaningful incorrect control",
  );
});
