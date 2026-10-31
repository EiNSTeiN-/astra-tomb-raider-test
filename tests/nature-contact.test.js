import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TriangleSolids } from "../src/triangle-solids.js";

test("scan separation clears transformed cylinder sides within the actual facet envelope", () => {
  const geometry = new THREE.CylinderGeometry(1, 1, 2, 32);
  geometry.translate(0, 1, 0);
  try {
    for (const yaw of [0, 0.73, 2.1])
      for (const [horizontal, vertical] of [
        [0.8, 1.3],
        [1.4, 0.6],
      ]) {
        const matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(20, 3, 30),
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            yaw,
          ),
          new THREE.Vector3(horizontal, vertical, horizontal),
        );
        const solids = new TriangleSolids([{ geometry, matrices: [matrix] }]),
          angle = 0.37,
          original = new THREE.Vector3(
            20 + Math.cos(angle) * (horizontal + 0.45),
            3 + vertical * 0.6,
            30 + Math.sin(angle) * (horizontal + 0.45),
          ),
          p = original.clone();
        assert(solids.blocked(p.x, p.y, p.z));
        for (let i = 0; i < 8 && solids.blocked(p.x, p.y, p.z); i++) {
          const push = solids.separation(p.x, p.y, p.z);
          assert(push && push.toArray().every(Number.isFinite));
          assert.equal(push.y, 0);
          p.add(push);
        }
        assert(!solids.blocked(p.x, p.y, p.z));
        // Every side facet lies outside this inscribed cylinder. Its radius
        // plus the body radius is an independent lower bound on a clear rest.
        assert(
          Math.hypot(p.x - 20, p.z - 30) >=
            horizontal * Math.cos(Math.PI / 32) + 0.55 - 1e-4,
        );
        assert(p.distanceTo(original) < 0.3);
        assert.equal(p.y, original.y);
        assert.equal(solids.separation(p.x, p.y, p.z), null);
      }
  } finally {
    geometry.dispose();
  }
});

test("a real flat scan top retains its landing without a sideways correction", () => {
  const geometry = new THREE.BoxGeometry(2, 1, 2),
    matrix = new THREE.Matrix4().makeTranslation(20, 0.5, 30),
    solids = new TriangleSolids([{ geometry, matrices: [matrix] }]);
  try {
    assert.equal(solids.support(20, 30, 1, 0.55, 0.65).height, 1);
    assert(!solids.blocked(20, 1, 30));
    assert.equal(solids.separation(20, 1, 30), null);
  } finally {
    geometry.dispose();
  }
});

test("a bounded point correction follows the actual transformed surface normal", () => {
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  try {
    for (const yaw of [0, 0.73]) {
      const matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(20, 3, 30),
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            yaw,
          ),
          new THREE.Vector3(1.3, 0.7, 1.3),
        ),
        solids = new TriangleSolids([{ geometry, matrices: [matrix] }]),
        point = new THREE.Vector3(0.997, 0.2, 0).applyMatrix4(matrix),
        exit = solids.pointExit(point.x, point.y, point.z);
      assert(solids.blocked(point.x, point.y, point.z, 0, 0));
      assert(exit && exit.length() < 0.01);
      assert(
        Math.abs(exit.y) < 1e-8,
        "a side bevel clears sideways rather than rising away from its tread",
      );
      const cleared = point.clone().add(exit),
        local = cleared.clone().applyMatrix4(matrix.clone().invert());
      assert(Math.abs(local.x - (1 + 0.001 / 1.3)) < 1e-6);
      assert(!solids.blocked(cleared.x, cleared.y, cleared.z, 0, 0));
      assert.equal(solids.pointExit(cleared.x, cleared.y, cleared.z), null);
      const deep = new THREE.Vector3(0, 0, 0).applyMatrix4(matrix);
      assert.equal(
        solids.pointExit(deep.x, deep.y, deep.z),
        null,
        "the bounded visual correction does not teleport a deeply embedded point",
      );
    }
  } finally {
    geometry.dispose();
  }
});
