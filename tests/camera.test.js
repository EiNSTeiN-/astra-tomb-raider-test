import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  CameraSurfaces,
  boxEntry,
  constrainCamera,
  followCamera,
} from "../src/camera-collision.js";
import { mergeArchitecture } from "../src/visuals.js";

const v = (x, y, z) => new THREE.Vector3(x, y, z);
function fixture() {
  const world = new THREE.Group(),
    surfaces = new CameraSurfaces(world),
    material = new THREE.MeshStandardMaterial();
  const add = (w, h, d, x, y, z, parent = world) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    surfaces.capture(mesh);
    return mesh;
  };
  return { world, surfaces, add };
}
test("camera clearance catches thin and overhead walls, permits looking out of a prop, and misses parallel rays", () => {
  const box = new THREE.Box3(v(-4, 2, 2), v(4, 2.2, 3));
  assert.equal(boxEntry(v(0, 0, 0), v(0, 4, 5), box), 0.5);
  assert.ok(boxEntry(v(0, 0, 0), v(0, 4, 5), box, 0.28) < 0.5);
  assert.equal(boxEntry(v(0, 0, 0), v(0, 0, 5), box), null);
  assert.equal(boxEntry(v(0, 2.1, 2.5), v(0, 0, 0), box), null);
});
test("camera surfaces survive render batching without treating gaps between columns as a wall", () => {
  const { world, surfaces, add } = fixture();
  add(1, 8, 1, -3, 4, 2);
  add(1, 8, 1, 3, 4, 2);
  add(8, 1, 1, 0, 8, 2);
  mergeArchitecture(world);
  surfaces.rebuild();
  assert.equal(world.children.length, 1);
  assert.equal(surfaces.count, 3);
  assert.equal(surfaces.entry(v(0, 2, 0), v(0, 2, 5)), 1);
  assert.ok(surfaces.entry(v(3, 2, 0), v(3, 2, 5)) < 0.4);
  assert.ok(surfaces.entry(v(0, 6, 0), v(0, 10, 5)) < 1);
});
test("a lifted gate stops occluding and a rotated wall uses its oriented bounds", () => {
  const { world, surfaces, add } = fixture();
  const door = new THREE.Group();
  door.userData.cameraDynamic = true;
  world.add(door);
  add(6, 7, 0.3, 0, 3.5, 2, door);
  const wall = add(6, 5, 0.4, 20, 2.5, 2);
  wall.rotation.y = Math.PI / 4;
  surfaces.rebuild();
  assert.ok(surfaces.entry(v(0, 2, 0), v(0, 2, 5)) < 1);
  door.position.y = 8;
  assert.equal(surfaces.entry(v(0, 2, 0), v(0, 2, 5)), 1);
  // The start lies inside the wall's broad AABB, outside its actual rotated box.
  assert.ok(surfaces.entry(v(21, 2, 3), v(19, 2, 1)) < 1);
  assert.equal(surfaces.entry(v(21.9, 2, 3.9), v(22, 2, 4)), 1);
});
test("camera retracts immediately through an obstructed orbit and extends smoothly when clear", () => {
  const { surfaces, add } = fixture();
  add(8, 7, 0.3, 0, 3.5, 2);
  surfaces.rebuild();
  const target = v(0, 2, 0),
    desired = v(0, 3, 5),
    current = desired.clone();
  const corrected = followCamera(
    current,
    target,
    desired,
    0.016,
    surfaces,
    () => true,
  );
  assert.ok(corrected.z < 1.6);
  const recovered = followCamera(
    corrected,
    target,
    desired,
    0.016,
    null,
    () => true,
  );
  assert.ok(recovered.z > corrected.z && recovered.z < desired.z);
  const ridge = constrainCamera(target, desired, null, (p) => p.z < 3);
  assert.ok(ridge.z < 3);
});
test("actors and distant structures do not obstruct or inflate a nearby camera query", () => {
  const { world, surfaces, add } = fixture();
  const actor = new THREE.Group();
  actor.userData.actor = true;
  world.add(actor);
  add(3, 5, 3, 0, 2, 2, actor);
  for (let i = 0; i < 100; i++) add(3, 5, 3, 100 + i * 20, 2, 100);
  surfaces.rebuild();
  assert.equal(surfaces.count, 100);
  assert.equal(surfaces.entry(v(0, 2, 0), v(0, 2, 5)), 1);
  assert.equal(surfaces.lastCandidates, 0);
});
