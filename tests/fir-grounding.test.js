import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { firSpecimens, plantFirTrees } from "../src/fir-grounding.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { woodlandLayout } from "../src/habitat.js";
import { createTerrainProfile } from "../src/terrain.js";

// Read the delivered geometry without allocating browser textures or a renderer.
async function deliveredScenes(t) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS),
    scenes = [];
  for (const tier of ["near", "optimized", "distant"]) {
    const doc = await io.read(`public/assets/models/fir_tree_01/${tier}.glb`),
      scene = new THREE.Group();
    scene.userData = doc.getRoot().listScenes()[0].getExtras();
    for (const node of doc.getRoot().listNodes()) {
      if (!node.getMesh()) continue;
      const group = new THREE.Group();
      group.name = node.getName();
      group.matrixAutoUpdate = false;
      group.matrix.fromArray(node.getWorldMatrix());
      for (const primitive of node.getMesh().listPrimitives()) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(
            primitive.getAttribute("POSITION").getArray(),
            3,
          ),
        );
        const material = new THREE.MeshBasicMaterial();
        material.name = primitive.getMaterial().getName();
        group.add(new THREE.Mesh(geometry, material));
      }
      scene.add(group);
    }
    scenes.push(scene);
  }
  t.after(() =>
    scenes.forEach((scene) =>
      scene.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      }),
    ),
  );
  return scenes;
}

test("the delivered fir collection splits into three rooted specimens with the same woody geometry at every distance tier", async (t) => {
  const scenes = await deliveredScenes(t),
    specimens = firSpecimens(scenes);
  assert.equal(specimens.length, 3);
  assert.equal(new Set(specimens.map((s) => s.name)).size, 3);
  assert.ok(specimens[0].offset.x < -4);
  assert.ok(specimens[2].offset.x > 4);
  for (const specimen of specimens) {
    assert.equal(specimen.sources.length, 3);
    assert.ok(specimen.roots.length > 20);
    assert.ok(Math.min(...specimen.roots.map((p) => p.y)) < 1e-8);
    const rootBox = new THREE.Box3().setFromPoints(specimen.roots);
    assert.ok(Math.abs(rootBox.getCenter(new THREE.Vector3()).x) < 1e-8);
    assert.ok(Math.abs(rootBox.getCenter(new THREE.Vector3()).z) < 1e-8);
    assert.ok(rootBox.max.y <= 0.25);
    for (const sources of specimen.sources) {
      assert.equal(
        sources.filter((m) => /trunk/.test(m.material.name)).length,
        1,
      );
      for (const source of sources.filter(
        (m) => !/twig/.test(m.material.name),
      )) {
        const original = specimen.sources[0].find(
          (m) => m.material.name === source.material.name,
        );
        assert.deepEqual(
          source.geometry.attributes.position.array,
          original.geometry.attributes.position.array,
        );
        assert.deepEqual(
          source.matrixWorld.elements,
          original.matrixWorld.elements,
        );
      }
    }
  }
});

test("individual snow fir root flares meet the rendered terrain and preserve paths, objectives and deterministic spacing", async (t) => {
  const models = firSpecimens(await deliveredScenes(t)),
    level = LEVELS[2],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    game = { map, terrainProfile: profile, obstacles: [] },
    anchors = woodlandLayout(map, level, profile.height),
    trees = plantFirTrees(game, anchors, models);
  assert.deepEqual(trees, plantFirTrees(game, anchors, models));
  assert.ok(trees.length > 240 && trees.length < 345);
  assert.equal(new Set(trees.map((t) => t.variant)).size, 3);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    d = new THREE.Vector3(),
    hit = new THREE.Vector3(),
    ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  let samples = 0;
  for (const [index, tree] of trees.entries()) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(tree.x, tree.y, tree.z),
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        tree.rotation,
      ),
      new THREE.Vector3().setScalar(tree.scale),
    );
    assert.ok(
      map.features.every(
        (f) =>
          Math.hypot(tree.x - f.x * 7, tree.z - f.z * 7) >= 2.8 + tree.radius,
      ),
    );
    for (const other of trees.slice(index + 1))
      assert.ok(
        Math.hypot(tree.x - other.x, tree.z - other.z) >=
          tree.radius + other.radius + 0.5,
      );
    for (const root of models[tree.variant].roots) {
      const p = root.clone().applyMatrix4(matrix),
        step = profile.step,
        x = Math.floor(p.x / step) * step,
        z = Math.floor(p.z / step) * step;
      assert.equal(
        !!map.grid[Math.round(p.z / 7)]?.[Math.round(p.x / 7)],
        false,
      );
      a.set(x, profile.height(x, z), z);
      b.set(x, profile.height(x, z + step), z + step);
      c.set(x + step, profile.height(x + step, z + step), z + step);
      d.set(x + step, profile.height(x + step, z), z);
      ray.origin.set(p.x, 1000, p.z);
      const contact =
        ray.intersectTriangle(a, b, d, false, hit) ||
        ray.intersectTriangle(b, c, d, false, hit);
      assert.ok(
        contact,
        "Root sample has a rendered terrain triangle below it",
      );
      assert.ok(p.y <= hit.y - 0.0799, `Exposed root at ${p.toArray()}`);
      assert.ok(p.y <= profile.height(p.x, p.z) - 0.0799);
      samples++;
    }
  }
  assert.ok(samples > 8000);
});
