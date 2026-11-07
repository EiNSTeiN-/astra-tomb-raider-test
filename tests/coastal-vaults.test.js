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
    assert(
      roof.root.children.length <= 5,
      "four masonry batches and one shared mosaic material",
    );
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

test("all nine mosaic fields have seated mortar beds and camera envelopes that leave their empty corners open", (t) => {
  const game = fixture(t),
    materials = new Set(),
    maps = new Set(),
    proxyMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    ray = new THREE.Raycaster();
  t.after(() => proxyMaterial.dispose());
  let seatingProbes = 0,
    cameraRays = 0,
    emptyCorners = 0,
    liftedControls = 0;
  const captured = [...new Set([...game.cameraSurfaces.cells.values()].flat())];
  for (const gate of game.fieldGates) {
    const roof = gate.coastalVault,
      panel = roof.pediment.mesh,
      geometry = panel.geometry,
      positions = geometry.attributes.position,
      data = geometry.attributes.mosaicData,
      envelope = captured.filter((s) => s.parent === roof.root && s.planes);
    assert.equal(envelope.length, 1);
    assert.equal(roof.pediment.stage, gate.stage);
    assert.equal(data.count, positions.count);
    assert(data.array.every(Number.isFinite));
    assert(
      Array.from({ length: data.count }, (_, i) => data.getY(i)).every(
        (i) => i === gate.stage,
      ),
    );
    closed(geometry);
    materials.add(panel.material);
    maps.add(panel.material.map);
    const backing = roof.root.children.filter((m) => m !== panel),
      points = new Map();
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    for (let i = 0; i < positions.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(positions, i);
      if (Math.abs(p.z - bounds.max.z) < 1e-6) points.set(`${p.x},${p.y}`, p);
    }
    const seated = (point, matrix) => {
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(matrix),
        world = point.clone().applyMatrix4(matrix);
      ray.set(world.addScaledVector(normal, 0.2), normal.negate());
      ray.far = 0.6;
      const hit = ray.intersectObjects(backing, false)[0];
      if (!hit) return false;
      const local = hit.point.clone().applyMatrix4(matrix.clone().invert());
      return (
        local.z >= bounds.min.z - 0.00005 && local.z <= bounds.max.z + 0.00005
      );
    };
    const lifted = panel.matrixWorld
      .clone()
      .premultiply(new THREE.Matrix4().makeTranslation(0, 0, 0.15));
    for (const point of points.values()) {
      assert(
        seated(point, panel.matrixWorld),
        "mortar bed intersects delivered backing",
      );
      assert(
        !seated(point, lifted),
        "lifted field control must lose its backing",
      );
      seatingProbes++;
      liftedControls++;
    }
    // Isolate the captured field from the retained walls. A full box around
    // this arched face would obstruct the real air above its low outer corners.
    const world = new THREE.Group(),
      surfaces = new CameraSurfaces(world),
      lens = new THREE.Mesh(geometry, panel.material),
      rendered = new THREE.Mesh(geometry, proxyMaterial);
    world.add(lens);
    surfaces.capture(lens, {
      small: true,
      thin: true,
      planes: envelope[0].planes,
    });
    surfaces.rebuild();
    for (const x of [-6.1, -5, -3, 0, 3, 5, 6.1])
      for (const fraction of [-0.03, 0.01, 0.2, 0.4, 0.6, 0.8, 0.99, 1.03])
        for (const reverse of [false, true]) {
          const y = bounds.min.y + (bounds.max.y - bounds.min.y) * fraction,
            from = new THREE.Vector3(x, y, reverse ? 6.8 : 7.8),
            to = new THREE.Vector3(x, y, reverse ? 7.8 : 6.8),
            direction = to.clone().sub(from),
            length = direction.length();
          ray.set(from, direction.normalize());
          ray.far = length;
          const hit = ray.intersectObject(rendered, false)[0],
            expected = hit ? hit.distance / length : 1,
            actual = surfaces.entry(from, to, 0);
          assert(
            Math.abs(actual - expected) < 0.00005,
            "captured planes match the delivered field",
          );
          if (!hit && fraction > 0 && fraction < 1) {
            assert.equal(actual, 1, "no camera wall in an empty upper corner");
            emptyCorners++;
          }
          cameraRays++;
        }
  }
  assert.equal(materials.size, 1);
  assert.equal(maps.size, 1);
  assert(seatingProbes > 200 && emptyCorners > 100);
  assert.equal(cameraRays, 1008);
  t.diagnostic(
    JSON.stringify({ seatingProbes, liftedControls, cameraRays, emptyCorners }),
  );
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
