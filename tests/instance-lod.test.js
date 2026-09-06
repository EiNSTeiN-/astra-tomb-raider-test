import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  createLodPatch,
  updateLodPatch,
  selectLod,
  disposeInstanceBuffers,
} from "../src/instance-lod.js";
import { updateForest } from "../src/vegetation.js";

test("scene retirement releases visible and hidden instance buffers while shared geometry remains separately owned", () => {
  const root = new THREE.Group(),
    nested = new THREE.Group(),
    geometry = new THREE.BoxGeometry(),
    material = new THREE.MeshStandardMaterial();
  root.add(nested);
  const a = new THREE.InstancedMesh(geometry, material, 3),
    b = new THREE.InstancedMesh(geometry, material, 4),
    ordinary = new THREE.Mesh(geometry, material);
  root.add(a, ordinary);
  nested.add(b);
  nested.visible = false;
  b.setColorAt(0, new THREE.Color("red"));
  const retired = [];
  let geometryDisposals = 0,
    materialDisposals = 0;
  a.addEventListener("dispose", () => retired.push(a));
  b.addEventListener("dispose", () => retired.push(b));
  geometry.addEventListener("dispose", () => geometryDisposals++);
  material.addEventListener("dispose", () => materialDisposals++);
  assert.equal(disposeInstanceBuffers(root), 2);
  assert.deepEqual(new Set(retired), new Set([a, b]));
  assert.equal(retired.length, 2);
  assert.equal(geometryDisposals, 0);
  assert.equal(materialDisposals, 0);
  geometry.dispose();
  material.dispose();
});

function fixture(positions = [5, 25, 70, 190]) {
  const geometry = new THREE.BoxGeometry(),
    material = new THREE.MeshStandardMaterial();
  const points = positions.map((x) => new THREE.Vector3(x, 0, 0));
  const matrices = points.map((p) =>
    new THREE.Matrix4().makeTranslation(p.x, p.y, p.z),
  );
  const world = new THREE.Group();
  const patch = createLodPatch(
    world,
    [0, 1, 2].map(() => [{ geometry, material }]),
    matrices,
    points,
  );
  return { patch, observer: new THREE.Vector3(), world };
}
function placements(patch) {
  const matrix = new THREE.Matrix4();
  return patch.tiers.flatMap((tier) => {
    const mesh = tier[0];
    return Array.from({ length: mesh.count }, (_, i) => {
      mesh.getMatrixAt(i, matrix);
      return {
        x: matrix.elements[12],
        coverage: mesh.geometry.attributes.instanceCoverage.getX(i),
      };
    });
  });
}

test("each tree uses exactly one settled detail tier and all in-range placements survive quality changes", () => {
  const { patch, observer } = fixture();
  const game = {
    player: { position: observer },
    forestPatches: [patch],
    store: { data: { settings: { quality: "high" } } },
  };
  updateForest(game);
  assert.deepEqual(patch.counts, [1, 1, 1]);
  assert.deepEqual(
    placements(patch)
      .map((p) => p.x)
      .sort((a, b) => a - b),
    [5, 25, 70],
  );
  game.store.data.settings.quality = "low";
  updateForest(game);
  assert.deepEqual(patch.counts, [0, 2, 1]);
  observer.x = 190;
  updateForest(game);
  assert.deepEqual(
    placements(patch).map((p) => p.x),
    [190],
  );
  observer.x = 1000;
  updateForest(game);
  assert.ok(
    patch.tiers.flat().every((mesh) => !mesh.visible && mesh.count === 0),
  );
});

test("LOD fades preserve transforms and complementary coverage, including reversals and culling", () => {
  const { patch, observer } = fixture([5]);
  updateLodPatch(patch, observer, [10, 30, 60]);
  observer.x = 20;
  updateLodPatch(patch, observer, [10, 30, 60], 0.1);
  let instances = placements(patch);
  assert.equal(instances.length, 2);
  assert.ok(instances.every((p) => p.x === 5));
  assert.ok(
    Math.abs(instances[0].coverage - Math.abs(instances[1].coverage) - 1 / 3) <
      1e-5,
  );
  observer.x = 0;
  updateLodPatch(patch, observer, [10, 30, 60], 0.01);
  assert.equal(
    placements(patch).length,
    1,
    "reversing an early fade must not duplicate a tier or exceed instance capacity",
  );
  observer.x = 90;
  updateLodPatch(patch, observer, [10, 30, 60], 0.1);
  assert.equal(placements(patch).length, 1);
  updateLodPatch(patch, observer, [10, 30, 60], 0.3);
  assert.equal(placements(patch).length, 0);
  observer.x = 0;
  updateLodPatch(patch, observer, [10, 30, 60], 0.1);
  assert.ok(placements(patch)[0].coverage < 0);
  updateLodPatch(patch, observer, [10, 30, 60], 0.3);
  assert.equal(placements(patch)[0].coverage, 1);
});

test("hysteresis prevents boundary chatter and patch coverage buffers remain independent", () => {
  assert.equal(selectLod(11, [10, 30, 60], 0, 2), 0);
  assert.equal(selectLod(9, [10, 30, 60], 1, 2), 1);
  assert.equal(selectLod(7, [10, 30, 60], 1, 2), 0);
  const { patch } = fixture([5]);
  const a = patch.tiers[0][0].geometry,
    b = patch.tiers[1][0].geometry;
  assert.equal(a.attributes.position, b.attributes.position);
  assert.notEqual(a.attributes.instanceCoverage, b.attributes.instanceCoverage);
  a.attributes.instanceCoverage.setX(0, 0.25);
  assert.equal(b.attributes.instanceCoverage.getX(0), 1);
  assert.ok(
    patch.tiers
      .flat()
      .every((mesh) => mesh.customDepthMaterial.userData.instanceLod),
  );
});

test("delivered distant vegetation has bounded geometry, finite attributes, and source node alignment", async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const triangles = (doc) =>
    doc
      .getRoot()
      .listMeshes()
      .reduce(
        (sum, mesh) =>
          sum +
          mesh
            .listPrimitives()
            .reduce((n, p) => n + p.getIndices().getCount() / 3, 0),
        0,
      );
  for (const name of [
    "shrub_01",
    "fern_02",
    "island_tree_01",
    "island_tree_02",
    "fir_tree_01",
  ]) {
    const source = await io.read(`public/assets/models/${name}/optimized.glb`);
    const distant = await io.read(`public/assets/models/${name}/distant.glb`);
    assert.ok(triangles(distant) < triangles(source) * 0.6, name);
    assert.deepEqual(
      distant
        .getRoot()
        .listNodes()
        .map((n) => n.getName()),
      source
        .getRoot()
        .listNodes()
        .map((n) => n.getName()),
    );
    for (const mesh of distant.getRoot().listMeshes())
      for (const primitive of mesh.listPrimitives()) {
        const position = primitive.getAttribute("POSITION");
        for (const semantic of primitive.listSemantics())
          assert.ok(
            primitive.getAttribute(semantic).getArray().every(Number.isFinite),
          );
        const original = source
          .getRoot()
          .listMeshes()
          .find((m) => m.getName() === mesh.getName())
          .listPrimitives()
          .find(
            (p) =>
              p.getMaterial().getName() === primitive.getMaterial().getName(),
          );
        if (original.getAttribute("TEXCOORD_0"))
          assert.ok(primitive.getAttribute("TEXCOORD_0"));
        assert.ok(
          primitive
            .getIndices()
            .getArray()
            .every((i) => i >= 0 && i < position.getCount()),
        );
      }
  }
});
