import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { windArtKit, windDuctGeometry, windSurface } from "../src/wind-art.js";
import { mergeArchitecture } from "../src/visuals.js";

test("ducts have sealed wall thickness, inward bore normals and genuinely open mouths", () => {
  for (const points of [
    [
      [0, -1.5],
      [0, -0.6],
      [0, 0.6],
      [0, 1.5],
    ],
    [
      [0, -1.5],
      [0, -0.8],
      [0.22, -0.22],
      [0.8, 0],
      [1.5, 0],
    ],
  ]) {
    const curve = new THREE.CatmullRomCurve3(
        points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      ),
      geometry = windDuctGeometry(curve),
      p = geometry.attributes.position,
      n = geometry.attributes.normal,
      cavity = geometry.attributes.windCavity;
    const edges = new Map();
    const key = (i) =>
      [p.getX(i), p.getY(i), p.getZ(i)]
        .map((v) => Math.round(v * 1e5))
        .join(",");
    for (let i = 0; i < p.count; i += 3)
      for (const [a, b] of [
        [i, i + 1],
        [i + 1, i + 2],
        [i + 2, i],
      ]) {
        const edge = [key(a), key(b)].sort().join("|");
        edges.set(edge, (edges.get(edge) || 0) + 1);
      }
    assert.ok(
      [...edges.values()].every((count) => count === 2),
      "no cracks in casting wall",
    );
    let interior = 0;
    for (let i = 0; i < p.count; i++) {
      for (const attr of [p, n])
        for (const value of [attr.getX(i), attr.getY(i), attr.getZ(i)])
          assert.ok(Number.isFinite(value));
      if (cavity.getX(i) > 0.9) {
        interior++;
        const vertex = new THREE.Vector3().fromBufferAttribute(p, i);
        const center = Array.from({ length: 33 }, (_, j) =>
          curve.getPointAt(j / 32),
        ).sort(
          (a, b) => a.distanceToSquared(vertex) - b.distanceToSquared(vertex),
        )[0];
        const radial = vertex.sub(center).normalize();
        assert.ok(
          radial.dot(new THREE.Vector3().fromBufferAttribute(n, i)) < -0.98,
          "bore normals face the open interior",
        );
      }
    }
    assert.ok(interior > 1000, "inner wall is retained geometry");
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld();
    for (const t of [0, 1]) {
      const mouth = curve.getPoint(t),
        out = curve.getTangent(t).multiplyScalar(t ? 1 : -1);
      const ray = new THREE.Raycaster(
        mouth.clone().addScaledVector(out, 0.12),
        out.clone().negate(),
        0,
        0.14,
      );
      assert.equal(
        ray.intersectObject(mesh).length,
        0,
        "the lip leaves a clear air opening",
      );
    }
    geometry.dispose();
    mesh.material.dispose();
  }
});

test("wind art has finite surfaces, bevelled working parts and curved turbine vanes inside existing clearance", () => {
  const kit = windArtKit();
  for (const [name, g] of Object.entries(kit)) {
    for (const attribute of Object.values(g.attributes))
      assert.ok([...attribute.array].every(Number.isFinite), name);
    g.computeBoundingBox();
    assert.ok(g.boundingBox.max.length() < 3, name);
  }
  assert.ok(
    kit.panel.attributes.normal.count > 24,
    "nameplate has bevel surfaces",
  );
  assert.ok(
    kit.vanes.boundingBox.max.z - kit.vanes.boundingBox.min.z > 0.15,
    "vanes have physical pitch",
  );
  const blades = kit.vanes.attributes.position;
  for (let i = 0; i < blades.count; i++)
    assert.ok(
      Math.hypot(blades.getX(i), blades.getY(i)) < 0.89,
      "spinning blades clear the frame's .91 m inner radius",
    );
  assert.ok(
    kit.wheel.boundingBox.max.x < 0.36 && kit.wheel.boundingBox.min.x > -0.36,
    "original handwheel envelope",
  );
  assert.ok(
    kit.frame.boundingBox.max.x < 1.12,
    "original fan collision envelope",
  );
  Object.values(kit).forEach((g) => g.dispose());
});

test("cast coordinates survive static merging without projecting oxidation through moving parts", () => {
  const group = new THREE.Group(),
    material = new THREE.MeshStandardMaterial();
  const expected = [];
  for (let i = 0; i < 3; i++) {
    const g = windSurface(new THREE.BoxGeometry(0.5, 1, 0.3)),
      m = new THREE.Mesh(g, material);
    m.position.set(i * 3, i, 0);
    m.rotation.y = i * 0.6;
    group.add(m);
    const expanded = g.toNonIndexed();
    expected.push(...expanded.attributes.windCoord.array);
    expanded.dispose();
  }
  mergeArchitecture(group);
  assert.equal(group.children.length, 1);
  assert.deepEqual(
    [...group.children[0].geometry.attributes.windCoord.array],
    expected,
  );
  assert.notDeepEqual(
    [...group.children[0].geometry.attributes.position.array],
    expected,
  );
  group.children[0].geometry.dispose();
  material.dispose();
});
