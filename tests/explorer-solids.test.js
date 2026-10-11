import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  closedMeshReader,
  inspectExplorerSolids,
} from "../scripts/inspect-explorer-solids-browser.js";

test("delivered oblique winding distinguishes overlapping closed pieces, empty gaps and thin contacts after batching and translation", () => {
  const a = new THREE.BoxGeometry(2, 2, 2).toNonIndexed(),
    b = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
  b.translate(1, 0, 0);
  const geometry = mergeGeometries([a, b], false),
    material = new THREE.MeshBasicMaterial(),
    mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(20, 3, 30);
  mesh.rotation.y = 0.71;
  const read = closedMeshReader([mesh]),
    point = (x, y, z) =>
      new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld);
  assert.equal(read(point(-2, 0, 0)), null);
  assert.equal(read(point(4, 0, 0)), null);
  assert(Math.abs(read(point(-0.5, 0, 0)) - 0.5) < 1e-5);
  assert(Math.abs(read(point(0.5, 0, 0)) - 0.5) < 1e-5);
  assert(read(point(0, 0.995, 0)) < 0.006);
  for (const g of [a, b, geometry]) g.dispose();
  material.dispose();
});

test("a closed ring retains its real empty interior rather than its bounding box", () => {
  const shape = new THREE.Shape()
      .moveTo(-2, -2)
      .lineTo(2, -2)
      .lineTo(2, 2)
      .lineTo(-2, 2)
      .closePath(),
    hole = new THREE.Path()
      .moveTo(-1, -1)
      .lineTo(-1, 1)
      .lineTo(1, 1)
      .lineTo(1, -1)
      .closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 1,
      bevelEnabled: false,
    }),
    material = new THREE.MeshBasicMaterial(),
    mesh = new THREE.Mesh(geometry, material),
    read = closedMeshReader([mesh]);
  assert.equal(read(new THREE.Vector3(0, 0, 0.5)), null);
  assert(read(new THREE.Vector3(1.5, 0, 0.5)) > 0.49);
  assert.equal(read(new THREE.Vector3(3, 0, 0.5)), null);
  geometry.dispose();
  material.dispose();
});

test("body records follow bone deformation and report real embedded vertices without changing source geometry", () => {
  const geometry = new THREE.BoxGeometry(2, 2, 2),
    material = new THREE.MeshBasicMaterial(),
    obstacle = new THREE.Mesh(geometry, material),
    bodyGeometry = new THREE.BufferGeometry();
  bodyGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([2, 0, 0, 2, 0.2, 0, 2, 0, 0.2], 3),
  );
  bodyGeometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(Array(12).fill(0), 4),
  );
  bodyGeometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  );
  const bone = new THREE.Bone(),
    mesh = new THREE.SkinnedMesh(bodyGeometry, material),
    avatar = new THREE.Group();
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  avatar.add(mesh);
  const game = { avatar, rig: { model: avatar } },
    read = closedMeshReader([obstacle]);
  assert.equal(inspectExplorerSolids(game, read).embedded, 0);
  bone.position.x = -2;
  const r = inspectExplorerSolids(game, read);
  assert.equal(r.samples, 3);
  assert.equal(r.embedded, 3);
  assert(r.deepest > 0.99);
  assert.equal(bodyGeometry.attributes.position.getX(0), 2);
  mesh.skeleton.dispose();
  geometry.dispose();
  bodyGeometry.dispose();
  material.dispose();
});
