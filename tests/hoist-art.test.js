import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  buildBellHoist,
  updateBellHoist,
  startHoist,
} from "../src/bell-hoist.js";
import {
  cableTangent,
  hoistLinkPath,
  SHEAVE_RADIUS,
  HOIST_AXIS,
} from "../src/hoist-art.js";
import { HOIST_CARS, HOIST_DECK } from "../src/bell-hoist-rules.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { Adventure } from "../src/game.js";

function fixture() {
  const world = new THREE.Group(),
    g = Object.assign(Object.create(Adventure.prototype), {
      world,
      map: { bellHoist: { x: 26, z: 52 } },
      progress: { bellHoist: { visited: true } },
      player: new THREE.Group(),
      stoneMat: new THREE.MeshStandardMaterial({ vertexColors: true }),
      obstacles: [],
      groundHeight: () => 12,
      walkable: () => true,
      cameraSurfaces: new CameraSurfaces(world),
      save() {},
      cb: { toast() {} },
      grounded: true,
    });
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  try {
    buildBellHoist(g);
  } finally {
    globalThis.document = old;
  }
  g.cameraSurfaces.rebuild();
  return g;
}

test("the upper cable joins both vertical tangents and follows the sheave grooves without a spline overshoot", () => {
  const path = hoistLinkPath();
  assert(path.getPoint(0).distanceTo(cableTangent(0)) < 1e-9);
  assert(path.getPoint(1).distanceTo(cableTangent(1)) < 1e-9);
  for (let i = 0; i < path.curves.length - 1; i++)
    assert(path.curves[i].v2.distanceTo(path.curves[i + 1].v1) < 1e-9);
  for (let i = 0; i <= 1000; i++) {
    const p = path.getPoint(i / 1000);
    assert(p.y >= 14.8 - 1e-8 && p.y <= 14.8 + SHEAVE_RADIUS + 1e-8);
    const index =
      p.distanceTo(new THREE.Vector3(-7, 14.8, -9)) < 1
        ? 0
        : p.distanceTo(new THREE.Vector3(7, 14.8, 9)) < 1
          ? 1
          : null;
    if (index === null) continue;
    const [x, z] = HOIST_CARS[index],
      d = p.clone().sub(new THREE.Vector3(x, 14.8, z));
    const along = d.dot(HOIST_AXIS);
    if (index === 0 ? along < 0 : along > 0)
      assert(Math.abs(d.length() - SHEAVE_RADIUS) < 0.00032);
  }
});

test("both moving cable ends remain attached, conserve total length and turn the rotors while their frames stay fixed", () => {
  const g = fixture(),
    h = g.bellHoist;
  const length = () =>
    h.cars.reduce(
      (sum, c) => sum + c.cable.scale.y,
      hoistLinkPath().getLength(),
    );
  const expected = length(),
    fixed = h.cars.map((c) => c.sheave.getWorldPosition(new THREE.Vector3()));
  for (const stop of [1, 2, 0]) {
    assert(startHoist(g, stop));
    for (let frame = 0; frame < 320; frame++) {
      updateBellHoist(g, 1 / 60);
      g.world.updateMatrixWorld(true);
      assert(Math.abs(length() - expected) < 1e-7);
      for (const [i, car] of h.cars.entries()) {
        const top = car.cable.localToWorld(new THREE.Vector3(0, 0.5, 0));
        const bottom = car.cable.localToWorld(new THREE.Vector3(0, -0.5, 0));
        const expectedTop = cableTangent(i).add(h.root.position);
        const expectedBottom = car.root.localToWorld(
          car.hangerOffset
            .clone()
            .add(new THREE.Vector3(0, car.cableAnchor, 0)),
        );
        assert(top.distanceTo(expectedTop) < 1e-6);
        assert(bottom.distanceTo(expectedBottom) < 1e-6);
        assert(
          car.sheave
            .getWorldPosition(new THREE.Vector3())
            .distanceTo(fixed[i]) < 1e-9,
        );
        assert.equal(car.rotor.parent, car.sheave);
        assert.equal(
          car.actuator.handle.parent,
          car.root,
          "the live lever survives batching",
        );
      }
    }
    assert.equal(h.saved.stop, stop);
  }
  assert.equal(
    h.tongue.parent,
    h.bell,
    "the fitted tongue stays independently hideable",
  );
  assert.equal(h.linkCable.parent, h.root);
});

test("fitted floor slabs retain their walking height above recessed joints and all visible geometry stays finite", () => {
  const g = fixture(),
    h = g.bellHoist;
  g.world.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(),
    new THREE.Vector3(0, -1, 0),
  );
  for (const tile of h.art.paving.filter(
    (t) => Math.abs(t.x) < 12 && Math.abs(t.z) < 10,
  )) {
    ray.ray.origin.set(h.x + tile.x, h.y + 0.5, h.z + tile.z);
    const hit = ray.intersectObject(h.root, true)[0];
    assert(hit);
    assert(Math.abs(hit.point.y - h.y - HOIST_DECK) < 0.003);
  }
  ray.ray.origin.set(h.x + 1.5, h.y + 0.5, h.z);
  assert(
    ray.intersectObject(h.root, true)[0].point.y < h.y + 0.09,
    "open joints expose the lower stone bed",
  );
  let triangles = 0;
  h.root.traverse((o) => {
    if (!o.isMesh) return;
    assert(o.geometry.attributes.position.array.every(Number.isFinite));
    assert(o.geometry.attributes.normal.array.every(Number.isFinite));
    triangles +=
      (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
  });
  assert(triangles < 120000, `tomb geometry budget exceeded: ${triangles}`);
  assert.equal(h.art.rollers.length, 8);
  for (const o of h.art.furniture)
    assert.equal(g.canMove(o.x, o.z, o.bottom - h.y + 0.05), false);
});

test("guide rollers retain rail contact throughout travel and upper bearings clear the header", () => {
  const g = fixture(),
    h = g.bellHoist;
  for (const roller of h.art.rollers) {
    const edge = Math.abs(roller.root.position.x) + 0.145;
    assert(
      Math.abs(edge - (2.05 - 0.08)) < 0.006,
      "roller tread meets the guide's inner edge",
    );
  }
  for (const car of h.cars) {
    const sheaveTop = car.sheave.position.y + SHEAVE_RADIUS + 0.055;
    assert(sheaveTop < 15.85 - 0.3, "rotor clears the bearing header");
    assert(
      car.cable.scale.y > 0.6,
      "the upper landing retains a vertical cable segment",
    );
  }
  assert(startHoist(g, 1));
  updateBellHoist(g, 0.8);
  const before = h.art.rollers.map((r) => r.root.rotation.z);
  g.paused = true;
  updateBellHoist(g, 5);
  assert.deepEqual(
    h.art.rollers.map((r) => r.root.rotation.z),
    before,
  );
});
