import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  jungleSpecimen,
  jungleTreeAllowed,
  plantJungleTrees,
} from "../src/jungle-grounding.js";
import { rockGroundHeight } from "../src/nature-rocks.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { woodlandLayout } from "../src/habitat.js";
import { buildJungleFringe } from "../src/jungle-fringe.js";

async function delivered(t) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS),
    models = [];
  for (const name of ["island_tree_01", "island_tree_02"]) {
    const scenes = [];
    for (const tier of ["near", "optimized", "distant"]) {
      const doc = await io.read(`public/assets/models/${name}/${tier}.glb`),
        scene = new THREE.Group();
      scene.userData = doc.getRoot().listScenes()[0].getExtras();
      for (const node of doc.getRoot().listNodes()) {
        if (!node.getMesh()) continue;
        const group = new THREE.Group();
        group.matrixAutoUpdate = false;
        group.matrix.fromArray(node.getWorldMatrix());
        for (const primitive of node.getMesh().listPrimitives()) {
          const geometry = new THREE.BufferGeometry(),
            material = new THREE.MeshBasicMaterial();
          geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(
              primitive.getAttribute("POSITION").getArray(),
              3,
            ),
          );
          if (primitive.getIndices())
            geometry.setIndex(
              new THREE.BufferAttribute(primitive.getIndices().getArray(), 1),
            );
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
    models.push(jungleSpecimen(scenes));
  }
  return models;
}

function fixture(t) {
  const level = LEVELS[0],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    game = {
      level,
      map,
      terrainProfile,
      obstacles: [],
      world: new THREE.Group(),
      terrainMeshes: [{ material: new THREE.MeshBasicMaterial() }],
    };
  buildJungleFringe(game);
  t.after(() => {
    game.world.traverse((o) => o.geometry?.dispose());
    game.terrainMeshes[0].material.dispose();
  });
  return game;
}

test("both delivered jungle trunks use a centred base and a common footprint across three LODs", async (t) => {
  for (const model of await delivered(t)) {
    const b = new THREE.Box3().setFromPoints(model.roots),
      center = b.getCenter(new THREE.Vector3());
    assert(Math.abs(center.x) < 1e-6 && Math.abs(center.z) < 1e-6);
    assert(Math.abs(b.min.y) < 1e-6 && b.max.y < 0.28);
    assert(model.roots.length > 100 && model.radius > 1 && model.radius < 2);
    assert.equal(model.sources.length, 3);
    for (const sources of model.sources)
      assert(sources.some((s) => /^island_tree_\d+$/.test(s.material.name)));
  }
});

test("jungle roots meet actual walking-terrain triangles without entering paths or losing the forest density", async (t) => {
  const models = await delivered(t),
    game = fixture(t),
    p = game.terrainProfile,
    anchors = woodlandLayout(game.map, game.level, p.height),
    options = {
      height: (x, z) => rockGroundHeight(p, x, z),
      allowed: (x, z, r) => jungleTreeAllowed(game, x, z, r),
    },
    planted = plantJungleTrees(anchors, models, options),
    ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0)),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    d = new THREE.Vector3(),
    hit = new THREE.Vector3();
  assert.deepEqual(planted, plantJungleTrees(anchors, models, options));
  assert(planted.length >= anchors.length * 0.95);
  let samples = 0;
  for (const tree of planted) {
    assert(options.allowed(tree.x, tree.z, tree.radius));
    const original = anchors.find(
      (anchor) => anchor.rotation === tree.rotation,
    );
    assert(
      original &&
        Math.hypot(tree.x - original.x, tree.z - original.z) <= 4.000001,
    );
    for (const root of models[tree.variant].roots) {
      const v = root
          .clone()
          .multiplyScalar(tree.scale)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), tree.rotation)
          .add(new THREE.Vector3(tree.x, tree.y, tree.z)),
        x = Math.floor(v.x / p.step) * p.step,
        z = Math.floor(v.z / p.step) * p.step;
      a.set(x, p.height(x, z), z);
      b.set(x, p.height(x, z + p.step), z + p.step);
      c.set(x + p.step, p.height(x + p.step, z + p.step), z + p.step);
      d.set(x + p.step, p.height(x + p.step, z), z);
      ray.origin.set(v.x, 1000, v.z);
      assert(
        ray.intersectTriangle(a, b, d, false, hit) ||
          ray.intersectTriangle(b, c, d, false, hit),
      );
      assert(v.y <= hit.y - 0.0799);
      assert.equal(
        !!game.map.grid[Math.round(v.z / 7)]?.[Math.round(v.x / 7)],
        false,
      );
      samples++;
    }
  }
  assert(samples > 150000);
});

test("outer jungle roots use the rendered bank surface at seams, corners and every distance tier", async (t) => {
  const models = await delivered(t),
    game = fixture(t),
    fringe = game.jungleFringe,
    extent = game.map.size * 7,
    options = {
      height: fringe.height,
      allowed: (x, z, r) => Math.max(0, -x, -z, x - extent, z - extent) > r + 4,
    },
    planted = plantJungleTrees(fringe.trees, models, options),
    ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  assert.deepEqual(planted, plantJungleTrees(fringe.trees, models, options));
  assert(planted.length >= fringe.trees.length * 0.95);
  let samples = 0,
    rays = 0;
  for (const tree of planted)
    for (const root of models[tree.variant].roots) {
      const v = root
          .clone()
          .multiplyScalar(tree.scale)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), tree.rotation)
          .add(new THREE.Vector3(tree.x, tree.y, tree.z)),
        ground = fringe.height(v.x, v.z);
      assert(Number.isFinite(ground) && v.y <= ground - 0.0799);
      if (samples++ % 97) continue;
      ray.ray.origin.set(v.x, 1000, v.z);
      const hit = ray.intersectObjects(fringe.root.children, false)[0];
      assert(hit && Math.abs(hit.point.y - ground) < 1e-6);
      rays++;
    }
  // Independently compare the accelerated sampler across all four square seams.
  for (const d of [0, 1.75, 3.5, 7, 14, 23, 34, 48, 65, 86, 110, 139.9])
    for (const x of [-d, extent + d])
      for (const z of [-d, extent + d]) {
        ray.ray.origin.set(x, 1000, z);
        const hit = ray.intersectObjects(fringe.root.children, false)[0];
        assert(hit && Math.abs(hit.point.y - fringe.height(x, z)) < 1e-6);
      }
  assert(rays > 2000);
  assert(Number.isNaN(fringe.height(extent / 2, extent / 2)));
  assert(Number.isNaN(fringe.height(-150, 0)));
});

test("unplantable cliffs are rejected and root clearance includes walking-cell corners", () => {
  const models = [
      {
        radius: 1,
        roots: [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)],
      },
    ],
    anchors = [{ x: 0, y: 0, z: 0, rotation: 0, scale: 1, variant: 0 }];
  assert.deepEqual(
    plantJungleTrees(anchors, models, {
      height: (x) => x * 8,
      allowed: () => true,
    }),
    [],
  );
  assert.deepEqual(
    plantJungleTrees(anchors, models, {
      height: () => NaN,
      allowed: () => true,
    }),
    [],
  );
  const game = {
    map: {
      size: 10,
      grid: [[1]],
      features: [],
      enemies: [],
      spawn: { x: 9, z: 9 },
    },
    obstacles: [],
    terrainProfile: { waters: [] },
  };
  assert.equal(jungleTreeAllowed(game, 4.1, 4.1, 1), false);
  assert.equal(jungleTreeAllowed(game, 4.6, 4.6, 1), true);
});
