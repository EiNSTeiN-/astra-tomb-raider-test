import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TriangleSolids } from "../src/triangle-solids.js";
import { palaceVesselGeometry } from "../src/palace-furnishing-art.js";
import { restingFoothold } from "../src/explorer-foothold.js";

test("a resting foothold reaches the real hollow rim after placement and unequal vertical scaling", () => {
  for (const basin of [false, true]) {
    const geometry = palaceVesselGeometry(basin);
    const material = new THREE.MeshBasicMaterial(),
      mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(20, 1.2, 30);
    mesh.rotation.y = 0.34;
    mesh.scale.set(1.3, 0.7, 1.3);
    mesh.updateMatrixWorld(true);
    const kernel = new TriangleSolids([
      { geometry, matrices: [mesh.matrixWorld] },
    ]);
    const bounds = new THREE.Box3().setFromObject(mesh),
      height = bounds.max.y;
    const radius = Math.max(bounds.max.x - 20, bounds.max.z - 30) + 0.4;
    for (const dx of [0, 0.35, -0.35]) {
      const ankle = new THREE.Vector3(20 + dx, height + 0.12, 30);
      const tread = restingFoothold(
        { triangles: kernel },
        ankle,
        height,
        radius,
      );
      assert(tread, "the hollow centre still has a reachable rim");
      assert(
        Math.hypot(tread.point.x - ankle.x, tread.point.z - ankle.z) <= radius,
      );
      assert(tread.normal.y >= 0.65);
      const ray = new THREE.Raycaster(
        tread.point.clone().add(new THREE.Vector3(0, 0.03, 0)),
        new THREE.Vector3(0, -1, 0),
      );
      const hit = ray.intersectObject(mesh)[0];
      assert(hit);
      assert(
        Math.abs(hit.point.y - tread.point.y) < 1e-5,
        "projected point lies on actual rendered triangles",
      );
    }
    geometry.dispose();
    material.dispose();
  }
});

test("an overhead cap and a steep shaft cannot become an invented resting tread", () => {
  const geometry = new THREE.CylinderGeometry(0.3, 0.7, 4, 24),
    matrix = new THREE.Matrix4().makeTranslation(20, 2, 30);
  const surface = {
    triangles: new TriangleSolids([{ geometry, matrices: [matrix] }]),
  };
  assert.equal(
    restingFoothold(surface, new THREE.Vector3(20, 1, 30), 1, 0.65),
    null,
  );
  assert.equal(
    restingFoothold(surface, new THREE.Vector3(23, 4, 30), 4, 0.65),
    null,
  );
  geometry.dispose();
});
