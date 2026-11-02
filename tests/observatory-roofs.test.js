import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { observatoryRoofPanel } from "../src/observatory-roof.js";
import { observatoryRoofPlan } from "../src/observatory-roof-plan.js";

// Weld coordinates, rather than trusting the author's index sharing. Cylinder
// seams and cap normals deliberately have separate render vertices.
function closedComponents(geometry) {
  const p = geometry.attributes.position,
    index = geometry.index,
    keys = new Map(),
    ids = [],
    parent = [],
    edges = new Map(),
    faces = [];
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)]
      .map((v) => Math.round(v * 1e6))
      .join(",");
    if (!keys.has(key)) {
      keys.set(key, keys.size);
      parent.push(parent.length);
    }
    ids.push(keys.get(key));
  }
  for (let i = 0; i < index.count; i += 3) {
    const v = [index.getX(i), index.getX(i + 1), index.getX(i + 2)],
      w = v.map((n) => ids[n]);
    for (let j = 0; j < 3; j++) {
      const a = w[j],
        b = w[(j + 1) % 3];
      parent[find(a)] = find(b);
      const key = [a, b].sort((a, b) => a - b).join(",");
      edges.set(key, (edges.get(key) || 0) + 1);
    }
    const a = new THREE.Vector3().fromBufferAttribute(p, v[0]),
      b = new THREE.Vector3().fromBufferAttribute(p, v[1]),
      c = new THREE.Vector3().fromBufferAttribute(p, v[2]);
    faces.push({ vertex: w[0], volume: a.dot(b.cross(c)) / 6 });
  }
  assert(
    [...edges.values()].every((n) => n === 2),
    "every rendered component must have sealed cut edges",
  );
  const volume = new Map();
  for (const f of faces) {
    const component = find(f.vertex);
    volume.set(component, (volume.get(component) || 0) + f.volume);
  }
  return [...volume.values()];
}
test("all eleven detailed roofs have closed outward-facing skins, ribs, bands and fasteners", () => {
  const silhouettes = [];
  for (let index = 0; index < 11; index++) {
    const plan = observatoryRoofPlan(index),
      before = JSON.stringify(plan),
      radius = 9.6 + (index % 3) * 0.3,
      geometry = observatoryRoofPanel(radius, plan, -0.38, 0.38);
    for (const attribute of Object.values(geometry.attributes))
      assert(attribute.array.every(Number.isFinite));
    const position = geometry.attributes.position,
      sheet = (plan.radial + 1) * (plan.rings + 1);
    for (const ring of [0, 4, 12, plan.rings])
      for (const column of [0, 6, plan.radial]) {
        const vertex = ring * (plan.radial + 1) + column,
          outer = new THREE.Vector3().fromBufferAttribute(position, vertex),
          inner = new THREE.Vector3().fromBufferAttribute(
            position,
            vertex + sheet,
          );
        assert(
          Math.abs(outer.distanceTo(inner) - 0.18) < 0.00002,
          "the inner plate retains its thickness at flat eaves and the oculus",
        );
      }
    const components = closedComponents(geometry);
    assert.equal(components.length, 12);
    assert(
      components.every((v) => v > 0.0001),
      "each component winds outward, including its caps",
    );
    assert.equal(JSON.stringify(plan), before);
    silhouettes.push(
      [
        geometry.attributes.position.getY(0),
        geometry.attributes.position.getX(0),
      ]
        .map((n) => n.toFixed(4))
        .join(","),
    );
    geometry.dispose();
  }
  assert.equal(new Set(silhouettes).size, 11);
});
test("the crown keeps a real open oculus and a complete inner skin beneath the structural strips", () => {
  const ray = new THREE.Raycaster(),
    material = new THREE.MeshBasicMaterial();
  for (let index = 0; index < 11; index++) {
    const plan = observatoryRoofPlan(index),
      radius = 9.6 + (index % 3) * 0.3,
      geometry = observatoryRoofPanel(radius, plan, -0.38, 0.38),
      mesh = new THREE.Mesh(geometry, material);
    ray.set(new THREE.Vector3(0, 30, 0), new THREE.Vector3(0, -1, 0));
    assert.equal(ray.intersectObject(mesh).length, 0);
    for (const fraction of [0.45, 0.65, 0.85, 0.97])
      for (const angle of [-0.33, 0.03, 0.33]) {
        const x = Math.cos(angle) * radius * fraction,
          z = Math.sin(angle) * radius * fraction;
        ray.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
        const top = ray.intersectObject(mesh)[0];
        assert(top && top.face.normal.y > 0);
        ray.set(new THREE.Vector3(x, -3, z), new THREE.Vector3(0, 1, 0));
        const inner = ray.intersectObject(mesh)[0];
        assert(inner && inner.face.normal.y < 0);
        assert(inner.point.y < top.point.y - 0.01);
      }
    geometry.dispose();
  }
  material.dispose();
});
