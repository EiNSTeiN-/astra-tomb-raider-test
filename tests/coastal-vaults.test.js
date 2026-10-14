import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import {
  coastalVaultPlan,
  coastalRoofCells,
  coastalRoofCellGeometry,
} from "../src/coastal-vaults.js";
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
  const level = LEVELS[3],
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

test("all nine maritime roofs have closed dressed cells and genuinely open roof lights", () => {
  const names = new Set(),
    forms = new Set();
  for (let stage = 0; stage < 9; stage++) {
    const plan = coastalVaultPlan(stage),
      cells = coastalRoofCells(plan);
    names.add(plan.name);
    forms.add(
      JSON.stringify([
        plan.section,
        plan.rise,
        plan.skew,
        plan.start,
        plan.holes,
        plan.towers,
      ]),
    );
    const material = new THREE.MeshBasicMaterial(),
      meshes = [];
    for (const cell of cells)
      for (const skin of [false, true]) {
        const geometry = coastalRoofCellGeometry(plan, cell, skin);
        closed(geometry);
        meshes.push(new THREE.Mesh(geometry, material));
      }
    const ray = new THREE.Raycaster();
    for (const [x0, x1, z0, z1] of plan.holes) {
      ray.set(
        new THREE.Vector3((x0 + x1) / 2, 30, (z0 + z1) / 2),
        new THREE.Vector3(0, -1, 0),
      );
      assert.equal(
        ray.intersectObjects(meshes, false).length,
        0,
        "opening passes through both skins",
      );
    }
    for (const mesh of meshes) mesh.geometry.dispose();
    material.dispose();
  }
  assert.equal(names.size, 9);
  assert.equal(forms.size, 9);
});

test("delivered roof batches provide finite body collision and exact rendered support while leaving the ground aisle clear", (t) => {
  const game = fixture(t),
    ray = new THREE.Raycaster(),
    point = new THREE.Vector3();
  let supports = 0;
  for (const gate of game.fieldGates) {
    const roof = gate.coastalVault,
      c = gate.root.position;
    assert(roof.root.children.length <= 4, "bounded material batches");
    for (const mesh of roof.root.children) closed(mesh.geometry);
    assert(roof.triangles < 16000, "roof geometry budget");
    for (const solid of roof.solids) {
      assert(solid.bounds.min.y >= c.y + 7.04);
      assert.equal(
        stationBlocked(solid, c.x, c.y, c.z),
        false,
        "no invisible pillar beneath roof",
      );
    }
    for (const [x, z] of [
      [-4.5, -4.5],
      [4.5, -4.5],
      [4.5, 3],
      [0, 4],
    ])
      assert(game.canMove(c.x + x, c.z + z, 0));
    for (const cell of roof.cells.filter((_, i) => i % 8 === 0)) {
      point.set(
        c.x + (cell.x0 + cell.x1) / 2,
        c.y + 30,
        c.z + (cell.z0 + cell.z1) / 2,
      );
      ray.set(point, new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObjects(roof.root.children, false);
      assert(hits.length > 0);
      const top = hits[0].point.y;
      const actual = Math.max(
        ...roof.solids.map(
          (s) => stationSupport(s, point.x, point.z) ?? -Infinity,
        ),
      );
      assert(
        Math.abs(actual - top) < 1e-5,
        "copied collision follows delivered roof",
      );
      assert(
        roof.solids.some((s) =>
          stationBlocked(s, point.x, top - 0.08, point.z, 0.2),
        ),
        "roof has finite physical thickness",
      );
      supports++;
    }
  }
  assert(supports > 150);
});

test("all eighteen coastal leaves and drive emitters retain their pre-vault geometry and sources", (t) => {
  const game = fixture(t),
    before = JSON.parse(
      readFileSync(
        new URL("./fixtures/coastal-vault-preserved.json", import.meta.url),
      ),
    );
  const hash = (v) =>
    createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const meshHash = (o) => {
    o.updateMatrix();
    const h = createHash("sha256");
    for (const key of Object.keys(o.geometry.attributes).sort()) {
      const a = o.geometry.attributes[key];
      h.update(key);
      h.update(
        Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength),
      );
    }
    if (o.geometry.index) h.update(Buffer.from(o.geometry.index.array.buffer));
    h.update(JSON.stringify(o.matrix.elements));
    return h.digest("hex");
  };
  for (const gate of game.fieldGates) {
    assert.equal(hash(gate.sources), before[gate.stage].sources);
    assert.equal(
      hash(
        gate.leaves.map((l) => {
          const m = [];
          l.group.traverse((o) => {
            if (o.isMesh) m.push(meshHash(o));
          });
          return m;
        }),
      ),
      before[gate.stage].leaves,
    );
  }
});
