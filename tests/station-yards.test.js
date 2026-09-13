import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { terrainInlayGeometry } from "../src/terrain-inlay.js";
import {
  yardRouteClear,
  yardTraversalClear,
} from "../src/station-yard-plan.js";

test("court inlays follow rendered terrain triangles instead of bridging a saddle cell", () => {
  const height = (x, z) => x + z * 2 + (x === 1 && z === 1 ? 4 : 0);
  const ground = new THREE.PlaneGeometry(2, 2, 2, 2);
  ground.rotateX(-Math.PI / 2).translate(1, 0, 1);
  const p = ground.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setY(i, height(Math.round(p.getX(i)), Math.round(p.getZ(i))));
  ground.computeVertexNormals();
  const mesh = new THREE.Mesh(
    ground,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  const inlay = terrainInlayGeometry(
    { step: 1, height },
    { x: 1, z: 1, w: 1.7, d: 1.6 },
    { x: 0, y: 0, z: 0 },
    0.17,
  );
  const ray = new THREE.Raycaster(),
    q = inlay.attributes.position;
  for (let i = 0; i < q.count; i++) {
    ray.set(
      new THREE.Vector3(q.getX(i), 20, q.getZ(i)),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = ray.intersectObject(mesh)[0];
    assert(hit);
    assert(Math.abs(q.getY(i) - hit.point.y - 0.003) < 2e-6);
    assert(q.getX(i) >= 0.15 - 1e-6 && q.getX(i) <= 1.85 + 1e-6);
    assert(q.getZ(i) >= 0.2 - 1e-6 && q.getZ(i) <= 1.8 + 1e-6);
    assert(q.getX(i) + q.getZ(i) <= 3.48 + 1e-6);
  }
  assert(q.count > 6, "crossing cells need their actual diagonal edges");
  ground.dispose();
  inlay.dispose();
  mesh.material.dispose();
});

test("a neighboring court leaves the descending return cable and its landing clear", () => {
  const course = {
    entry: { x: 131, z: 269 },
    ledges: [
      { x: 127, z: 269 },
      { x: 121, z: 269 },
      { x: 114, z: 269 },
      { x: 114, z: 254 },
      { x: 119, z: 259 },
    ],
    launch: { x: 121.65, z: 258.1 },
    exit: { x: 131, z: 255 },
  };
  // Reproduced sky-city pier hit while the rider descended to field-6-0.
  assert.equal(
    yardTraversalClear([course], { x: 129.5, z: 255.5, w: 1.05, d: 1.05 }),
    false,
  );
  assert.equal(
    yardTraversalClear([course], { x: 133, z: 255, w: 1, d: 1 }),
    false,
  );
  assert.equal(
    yardTraversalClear([course], { x: 141, z: 245, w: 3.95, d: 0.72 }),
    true,
  );
});

test("yard placement preserves full walking lanes along axial and diagonal approaches", () => {
  const axial = {
    paths: [
      [
        { x: 0, z: 0 },
        { x: 4, z: 0 },
      ],
    ],
  };
  assert.equal(yardRouteClear(axial, { x: 14, z: 1.9, w: 2, d: 1 }), false);
  assert.equal(yardRouteClear(axial, { x: 14, z: 2.3, w: 2, d: 1 }), true);
  const diagonal = {
    paths: [
      [
        { x: 0, z: 0 },
        { x: 4, z: 4 },
      ],
    ],
  };
  assert.equal(yardRouteClear(diagonal, { x: 14, z: 14, w: 1, d: 1 }), false);
  assert.equal(yardRouteClear(diagonal, { x: 5, z: 20, w: 1, d: 1 }), true);
  assert.equal(yardRouteClear(axial, { x: 32, z: 0, w: 1, d: 1 }), true);
});
