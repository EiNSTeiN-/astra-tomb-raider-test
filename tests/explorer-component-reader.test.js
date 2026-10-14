import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  closedComponentMeshes,
  closedMeshReader,
} from "../scripts/inspect-explorer-solids-browser.js";

test("instanced indicators use their delivered transforms instead of inventing a solid at the batch origin", () => {
  const geometry = new THREE.BoxGeometry(2, 2, 2),
    material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 2);
  mesh.position.set(17, 2, 31);
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(3, 0, 0));
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(-3, 0, 0));
  const component = closedComponentMeshes([mesh]),
    read = closedMeshReader(component.meshes);
  assert.equal(component.stats.closedTriangles, 24);
  assert.equal(read(new THREE.Vector3(17, 2, 31)), null);
  assert(read(new THREE.Vector3(20, 2, 31)) > 0.99);
  assert(read(new THREE.Vector3(14, 2, 31)) > 0.99);
  component.dispose();
  geometry.dispose();
  material.dispose();
});

test("an open relief cannot make a nearby clear body point look inside batched closed masonry", () => {
  const box = new THREE.BoxGeometry(2, 2, 2).toNonIndexed().translate(3, 0, 0);
  const relief = new THREE.PlaneGeometry(2, 2)
    .toNonIndexed()
    .rotateY(Math.PI / 2)
    .translate(1, 3, 0.8);
  const material = new THREE.MeshBasicMaterial(),
    batch = new THREE.Mesh(mergeGeometries([box, relief]), material);
  const clear = new THREE.Vector3(0, 0, 0),
    occupied = new THREE.Vector3(3, 0, 0);
  assert(
    closedMeshReader([batch])(clear) !== null,
    "unfiltered open face reproduces the false winding",
  );
  const component = closedComponentMeshes([batch]);
  assert.equal(component.stats.closedTriangles, 12);
  assert.equal(component.stats.openTriangles, 2);
  assert.equal(component.stats.closedComponents, 1);
  assert.equal(component.stats.openComponents, 1);
  const read = closedMeshReader(component.meshes);
  assert.equal(read(clear), null);
  assert(read(occupied) > 0.99 && read(occupied) < 1.01);
  component.dispose();
  box.dispose();
  relief.dispose();
  batch.geometry.dispose();
  material.dispose();
});

test("touching closed blocks retain every physical triangle and their world transform", () => {
  const a = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(),
    b = a.clone().translate(1, 0, 0);
  const material = new THREE.MeshBasicMaterial(),
    mesh = new THREE.Mesh(mergeGeometries([a, b]), material);
  mesh.position.set(17, 2, 31);
  mesh.rotation.y = Math.PI / 2;
  const component = closedComponentMeshes([mesh]);
  assert.equal(component.stats.triangles, 24);
  assert.equal(component.stats.closedTriangles, 24);
  assert.equal(component.stats.openTriangles, 0);
  const read = closedMeshReader(component.meshes);
  assert(read(new THREE.Vector3(17, 2, 31)) !== null);
  assert(read(new THREE.Vector3(17, 2, 30)) !== null);
  assert.equal(read(new THREE.Vector3(17, 2, 33)), null);
  const originals = [];
  mesh.updateWorldMatrix(true, false);
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++)
    originals.push(
      new THREE.Vector3()
        .fromBufferAttribute(mesh.geometry.attributes.position, i)
        .applyMatrix4(mesh.matrixWorld)
        .toArray()
        .join(","),
    );
  const retained = component.meshes.flatMap((m) =>
    Array.from({ length: m.geometry.attributes.position.count }, (_, i) =>
      new THREE.Vector3()
        .fromBufferAttribute(m.geometry.attributes.position, i)
        .toArray()
        .join(","),
    ),
  );
  assert.deepEqual(retained.sort(), originals.sort());
  component.dispose();
  a.dispose();
  b.dispose();
  mesh.geometry.dispose();
  material.dispose();
});
