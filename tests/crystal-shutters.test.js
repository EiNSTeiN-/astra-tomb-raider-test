import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createHash } from "node:crypto";
import {
  buildCrystalShutter,
  crystalShutterPlan,
} from "../src/crystal-shutters.js";

// Earcut may span several collinear hole edges with one cap edge. Check their
// opposite interval coverage, not just matching endpoint pairs. A missing cap
// still leaves an uncovered interval; a deliberate cut below checks that case.
function closure(g) {
  const p = g.attributes.position,
    edges = new Map();
  let volume = 0;
  for (let i = 0; i < (g.index?.count ?? p.count); i += 3) {
    const points = [0, 1, 2].map((j) =>
      new THREE.Vector3().fromBufferAttribute(
        p,
        g.index ? g.index.getX(i + j) : i + j,
      ),
    );
    const [a, b, c] = points;
    if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() < 1e-16) continue;
    volume += a.dot(b.clone().cross(c)) / 6;
    for (let j = 0; j < 3; j++) {
      const a = points[j],
        b = points[(j + 1) % 3];
      const key = [a, b]
        .map((v) =>
          v
            .toArray()
            .map((n) => Math.round(n * 1e5))
            .join(","),
        )
        .sort()
        .join("|");
      const edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { a, b, count: 1 });
    }
  }
  if ([...edges.values()].some((e) => e.count > 2))
    return { volume, closed: false };
  const boundary = [...edges.values()].filter((e) => e.count === 1);
  const closed = boundary.every((edge) => {
    const axis = edge.b.clone().sub(edge.a),
      length = axis.length();
    axis.divideScalar(length);
    const intervals = [];
    for (const other of boundary) {
      if (other === edge || axis.dot(other.b.clone().sub(other.a)) >= 0)
        continue;
      const projected = [other.a, other.b].map((p) =>
        p.clone().sub(edge.a).dot(axis),
      );
      if (
        [other.a, other.b].some(
          (p, i) =>
            p.distanceTo(edge.a.clone().addScaledVector(axis, projected[i])) >
            2e-5,
        )
      )
        continue;
      intervals.push(projected.sort((a, b) => a - b));
    }
    let covered = 0;
    for (const [a, b] of intervals.sort((a, b) => a[0] - b[0])) {
      if (a > covered + 2e-5) break;
      if (b > covered) covered = b;
    }
    return covered >= length - 2e-5;
  });
  return { volume, closed };
}

test("eight two-sided shutter carvings have closed finite stone and metal inside the moving envelope", () => {
  const materials = Object.fromEntries(
    ["wall", "dark", "metal", "trim", "inlay"].map((k) => [
      k,
      new THREE.MeshStandardMaterial(),
    ]),
  );
  const signatures = new Set(),
    names = new Set();
  let meshes = 0,
    backs = 0;
  try {
    for (let stage = 0; stage < 8; stage++)
      for (const side of [-1, 1]) {
        const leaf = new THREE.Group(),
          detail = new THREE.Group(),
          cx = -side * 3.1;
        leaf.add(detail);
        const meta = buildCrystalShutter({
          gate: { stage },
          leaf,
          detail,
          side,
          cx,
          materials,
        });
        assert.equal(meta.faces, 2);
        names.add(meta.name);
        const hash = createHash("sha256");
        const targets = leaf.children.filter(
          (o) =>
            o.isMesh && [materials.wall, materials.dark].includes(o.material),
        );
        for (const target of [
          ...targets,
          ...detail.children,
          ...leaf.children.filter((o) => o.isMesh && !targets.includes(o)),
        ]) {
          const g = target.geometry,
            p = g.attributes.position;
          assert(p.array.every(Number.isFinite));
          assert(g.attributes.normal.array.every(Number.isFinite));
          assert(g.attributes.uv.array.every(Number.isFinite));
          hash.update(Buffer.from(p.array.buffer));
          g.computeBoundingBox();
          const b = g.boundingBox;
          assert(b.min.x >= cx - 3.06 && b.max.x <= cx + 3.06);
          assert(b.min.y > 0.1 && b.max.y < 7.3);
          assert(b.min.z > -0.57 && b.max.z < 0.57);
          const { volume, closed } = closure(g);
          assert(volume > 1e-8, `outward closed component ${stage}`);
          assert(closed, `sealed component ${stage}`);
          meshes++;
        }
        signatures.add(hash.digest("hex"));
        leaf.updateMatrixWorld(true);
        for (const pocket of crystalShutterPlan(stage, side).pockets) {
          const vertices = pocket.map((p) => new THREE.Vector2(...p)),
            triangles = THREE.ShapeUtils.triangulateShape(vertices, []);
          const biggest = triangles
            .map((t) => ({
              t,
              area: Math.abs(THREE.ShapeUtils.area(t.map((i) => vertices[i]))),
            }))
            .sort((a, b) => b.area - a.area)[0];
          const center = biggest.t
            .reduce((p, i) => p.add(vertices[i]), new THREE.Vector2())
            .divideScalar(3);
          for (const face of [1, -1]) {
            const ray = new THREE.Raycaster(
              new THREE.Vector3(cx + face * center.x, center.y, face * 2),
              new THREE.Vector3(0, 0, -face),
            );
            const hits = ray.intersectObjects(targets, false);
            assert(hits.length);
            assert.equal(
              hits[0].object.material,
              materials.dark,
              `real recess ${stage}`,
            );
            assert(Math.abs(hits[0].point.z - face * 0.275) < 1e-5);
            backs++;
          }
        }
        leaf.traverse((o) => o.geometry?.dispose());
      }
    assert.equal(names.size, 8);
    assert.equal(signatures.size, 16);
    assert(meshes > 1000 && backs > 100);
    const control = new THREE.BoxGeometry();
    assert(closure(control).closed);
    control.setIndex(Array.from(control.index.array).slice(3));
    assert.equal(
      closure(control).closed,
      false,
      "observer rejects a missing triangle",
    );
    control.dispose();
  } finally {
    for (const m of Object.values(materials)) m.dispose();
  }
});
