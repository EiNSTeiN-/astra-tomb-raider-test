import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ExplorerContact, fitFootContact } from "../src/explorer-contact.js";

function sole(y = 0.01, yaw = 0, x = 0, z = 0) {
  return Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8;
    return new THREE.Vector3(Math.cos(a) * 0.06, y, Math.sin(a) * 0.17)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      .add(new THREE.Vector3(x, 0, z));
  });
}
function triangles(geometry) {
  const out = [];
  for (let i = 0; i < geometry.drawRange.count; i += 3)
    out.push(
      [0, 1, 2].map((k) =>
        new THREE.Vector3().fromBufferAttribute(
          geometry.attributes.position,
          geometry.index.getX(i + k),
        ),
      ),
    );
  return out;
}

test("ambient foot patches follow sloping supports, face upward and fade with lift", () => {
  const game = { scene: new THREE.Scene() },
    contact = new ExplorerContact(game),
    geometry = contact.meshes[0].geometry;
  for (const yaw of [0, 0.75, 2.1]) {
    const floor = (x, z) => x * 0.27 - z * 0.18,
      points = sole(0.01, yaw, 37, -42);
    for (const p of points) p.y += floor(p.x, p.z);
    const saved = points.map((p) => p.toArray());
    assert(fitFootContact(geometry, points, floor));
    assert.deepEqual(
      points.map((p) => p.toArray()),
      saved,
    );
    for (const [a, b, c] of triangles(geometry)) {
      assert(
        new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).y >
          0,
      );
      for (const p of [a, b, c])
        assert(Math.abs(p.y - floor(p.x, p.z) - 0.004) < 0.00002);
    }
    const planted = geometry.attributes.strength.getX(0);
    for (const p of points) p.y += 0.1;
    assert(fitFootContact(geometry, points, floor));
    assert(geometry.attributes.strength.getX(0) < planted * 0.8);
    for (const p of points) p.y += 0.3;
    assert.equal(fitFootContact(geometry, points, floor), false);
    assert.equal(geometry.drawRange.count, 0);
  }
  contact.dispose();
});

test("contact triangles cannot span a missing support or a raised ledge", () => {
  const contact = new ExplorerContact({ scene: new THREE.Scene() }),
    geometry = contact.meshes[0].geometry,
    points = sole(0.01);
  for (const absent of [null, -4, 0.4]) {
    assert(fitFootContact(geometry, points, (x) => (x < 0.03 ? 0 : absent)));
    const drawn = triangles(geometry);
    assert(drawn.length > 0 && drawn.length < 72);
    assert(drawn.flat().every((p) => p.x < 0.03001));
  }
  assert.equal(
    fitFootContact(geometry, points, () => null),
    false,
  );
  assert.equal(geometry.drawRange.count, 0);
  contact.dispose();
});

test("contacts disappear for traversal and submerged supports and release owned resources", () => {
  const points = [sole(), sole(0.01, 0, 0.2, 0.1)],
    game = {
      scene: new THREE.Scene(),
      player: new THREE.Group(),
      avatar: new THREE.Group(),
      grounded: true,
      groundHeight: () => 0,
      obstacles: [],
      rig: {
        model: new THREE.Group(),
        grounding: {
          active: true,
          feet: points.map((values) => ({
            indices: values.map((_, i) => i),
            shoe: {
              matrixWorld: new THREE.Matrix4(),
              getVertexPosition(i, p) {
                return p.copy(values[i]);
              },
            },
          })),
        },
      },
    },
    contact = new ExplorerContact(game);
  contact.update();
  assert(contact.meshes.every((m) => m.visible));
  for (const key of ["swimming", "climb", "ropeRide", "zipRide", "dodge"]) {
    game[key] = true;
    contact.update();
    assert(
      contact.meshes.every((m) => !m.visible),
      key,
    );
    game[key] = false;
  }
  game.grounded = false;
  contact.update();
  assert(contact.meshes.every((m) => !m.visible));
  game.grounded = true;
  game.waterMeshes = [
    {
      position: new THREE.Vector3(0, 0.2, 0),
      userData: { kind: "water", width: 8, length: 8 },
    },
  ];
  contact.update();
  assert(contact.meshes.every((m) => !m.visible));
  game.waterMeshes = [];
  contact.update();
  assert(contact.meshes.every((m) => m.visible));
  let geometries = 0,
    materials = 0;
  for (const mesh of contact.meshes)
    mesh.geometry.addEventListener("dispose", () => geometries++);
  contact.material.addEventListener("dispose", () => materials++);
  contact.dispose();
  assert.equal(geometries, 2);
  assert.equal(materials, 1);
  assert.equal(game.scene.children.length, 0);
});
