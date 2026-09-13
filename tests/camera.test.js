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
import { arrivalCamera } from "../src/camera-arrival.js";
import { normalizeCamera } from "../src/camera-state.js";
import { SaveStore, normalizeSave } from "../src/storage.js";

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

test("a retracted camera follows a moving target without swinging across it and remains outside walls", () => {
  const { surfaces, add } = fixture();
  add(30, 7, 0.3, 0, 3.5, 0.7);
  surfaces.rebuild();
  let previous = v(0, 1.3, 0),
    camera = constrainCamera(previous, v(0, 2.1, 5.3), surfaces, () => true);
  const offset = v(0, 0.8, 5.3);
  for (let i = 1; i <= 120; i++) {
    // Slide along the wall, then walk away and recover the normal orbit.
    const target = i <= 60 ? v(i * 0.1, 1.3, 0) : v(6, 1.3, -(i - 60) * 0.1);
    camera = followCamera(
      camera,
      target,
      target.clone().add(offset),
      1 / 60,
      surfaces,
      () => true,
      previous,
    );
    assert(Math.abs(camera.x - target.x) < 0.015, "sideways camera swing");
    assert(camera.z > target.z, "camera crossed the target");
    assert(surfaces.entry(target, camera) >= 0.999, "camera crossed the wall");
    previous = target;
  }
  assert(camera.distanceTo(previous) > 4.5, "camera did not recover");
});

test("arrival preserves a clear chosen view and finds a nearby clear orbit behind a blocked wall", () => {
  const { surfaces, add } = fixture();
  add(4, 7, 0.3, 0, 3.5, 1);
  surfaces.rebuild();
  const target = v(0, 1.3, 0),
    canOccupy = (p) => p.y >= 0.28;
  const clear = arrivalCamera(
    target,
    { yaw: Math.PI, pitch: 0.31 },
    surfaces,
    canOccupy,
  );
  assert.equal(clear.yaw, Math.PI);
  assert.equal(clear.pitch, 0.31);
  const blocked = arrivalCamera(
    target,
    { yaw: 0, pitch: 0.15 },
    surfaces,
    canOccupy,
  );
  assert(blocked.length > 5.2);
  assert(Math.abs(blocked.yaw) < Math.PI);
  assert.equal(blocked.pitch, 0.15);
  assert(surfaces.entry(target, blocked.position) >= 0.999);
});

test("arrival sweeps terrain and ceiling space and returns a bounded view when no full arm fits", () => {
  const target = v(0, 1.3, 0),
    corridor = (p) =>
      p.y >= 0.28 && p.y <= 2 && Math.abs(p.x) < 0.7 && Math.abs(p.z) < 2;
  const view = arrivalCamera(
    target,
    { yaw: Math.PI / 2, pitch: 0.6 },
    null,
    corridor,
  );
  assert(view.length > 1 && view.length < 3);
  assert(corridor(view.position));
  for (let i = 1; i <= 100; i++)
    assert(corridor(target.clone().lerp(view.position, i / 100)));
  const bank = arrivalCamera(
    target,
    { yaw: 0, pitch: 0.15 },
    null,
    (p) => p.z < 0.6 && p.y >= 0.28,
  );
  assert(bank.length > 5.2);
  assert(bank.position.z < 0.6);
});

test("camera angles survive independent chapter saves and malformed or legacy records stay compatible", () => {
  for (const value of [
    null,
    {},
    [],
    { yaw: "1", pitch: 0 },
    { yaw: NaN, pitch: 0 },
    { yaw: 0, pitch: Infinity },
  ])
    assert.equal(normalizeCamera(value), null);
  assert.deepEqual(normalizeCamera({ yaw: 0.37, pitch: 0.22 }), {
    yaw: 0.37,
    pitch: 0.22,
  });
  assert.equal(normalizeCamera({ yaw: 1, pitch: 20 }).pitch, 1.05);
  assert.equal(normalizeCamera({ yaw: 1, pitch: -20 }).pitch, -0.65);
  assert(
    Math.abs(normalizeCamera({ yaw: Math.PI * 4 + 0.5, pitch: 0 }).yaw - 0.5) <
      1e-12,
  );
  const memory = new Map(),
    storage = {
      getItem: (k) => memory.get(k),
      setItem: (k, v) => memory.set(k, v),
    },
    store = new SaveStore(storage);
  store.level("sands").camera = { yaw: -0.45, pitch: 0.26 };
  store.level("frost").camera = { yaw: 2.2, pitch: -0.3 };
  store.save();
  const restored = new SaveStore(storage);
  assert.deepEqual(restored.level("sands").camera, store.level("sands").camera);
  assert.deepEqual(restored.level("frost").camera, store.level("frost").camera);
  assert.equal(
    normalizeSave({
      version: 1,
      levels: { sands: { position: { x: 58.35, z: 221.15 } } },
    }).levels.sands.camera,
    null,
  );
});
