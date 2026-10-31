import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { jungleApronTriangles } from "../src/jungle-apron.js";

function specimen() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -1, 0.4, -1, -1, 0.4, 1, 1, 0.4, -1, 1, 0.4, 1, -1, 0.4, -1, 1, 0.4, -1,
        -1, 2, -1, 1, 2, -1, -1, 0, -1, 1, 0, -1, -1, 0.4, -1, 1, 0.4, -1,
      ],
      3,
    ),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      [
        0.1, 0.1, 0.1, 0.2, 0.2, 0.1, 0.2, 0.2, 0.6, 0.1, 0.7, 0.1, 0.6, 0.8,
        0.7, 0.8, 0.8, 0.1, 0.9, 0.1, 0.8, 0.2, 0.9, 0.2,
      ],
      2,
    ),
  );
  geometry.setIndex([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7, 8, 9, 10, 10, 9, 11]);
  geometry.attributes.position.setY(1, 0.1);
  geometry.attributes.position.setY(3, 0.1);
  return geometry;
}

test("a raised ground UV island is seated without treating its adjoining tall bark island as soil", () => {
  const indexed = specimen(),
    expanded = indexed.toNonIndexed();
  try {
    assert.deepEqual(jungleApronTriangles(indexed, 1), [0, 1]);
    assert.deepEqual(
      jungleApronTriangles(expanded, 1),
      [0, 1],
      "normal/index duplication must not split the same island",
    );
    // A continuous UV chart that climbs the trunk is bark, even where its
    // lowest triangles face upward. It must not be buried as a ground patch.
    indexed.attributes.uv.setXY(4, 0.1, 0.1);
    indexed.attributes.uv.setXY(5, 0.2, 0.1);
    assert.deepEqual(jungleApronTriangles(indexed, 1), []);
  } finally {
    indexed.dispose();
    expanded.dispose();
  }
});
