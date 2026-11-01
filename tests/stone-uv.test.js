import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { projectStoneUVs } from "../src/stone-uv.js";
import { buildCrystalShutter } from "../src/crystal-shutters.js";
import { buildCrystalFacade } from "../src/crystal-facades.js";

function measure(geometry, metric = false) {
  const p = geometry.attributes.position,
    uv = geometry.attributes.uv;
  let triangles = 0,
    collapsed = 0;
  for (let i = 0; i < (geometry.index?.count ?? p.count); i += 3) {
    const ids = [0, 1, 2].map((j) =>
      geometry.index ? geometry.index.getX(i + j) : i + j,
    );
    const [a, b, c] = ids.map((i) =>
      new THREE.Vector3().fromBufferAttribute(p, i),
    );
    const cross = b.sub(a).cross(c.sub(a)),
      area = cross.length();
    if (area < 1e-9) continue;
    const [u, v, w] = ids.map((i) =>
      new THREE.Vector2().fromBufferAttribute(uv, i),
    );
    const uvArea = Math.abs(v.sub(u).cross(w.sub(u)));
    triangles++;
    if (uvArea / area < 1e-6) collapsed++;
    if (metric)
      assert(
        uvArea / area >= 1 / (4 * Math.sqrt(3)) - 0.0001 &&
          uvArea / area <= 0.2501,
        "bounded physical texture scale",
      );
  }
  return { triangles, collapsed };
}

test("stone projections retain front coordinates and geometry while giving depth faces a bounded physical texture scale", () => {
  for (const rotation of [
    [0, 0, 0],
    [0.38, 0.64, 0.73],
    [-0.89, 0.31, -0.22],
  ]) {
    const g = new THREE.BoxGeometry(2.3, 4.1, 0.24).toNonIndexed();
    g.rotateX(rotation[0]);
    g.rotateY(rotation[1]);
    g.rotateZ(rotation[2]);
    g.translate(2.1, 9.4, 7.15);
    const p = g.attributes.position,
      uv = g.attributes.uv,
      original = new Float32Array(p.array),
      normals = new Float32Array(g.attributes.normal.array);
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2, p.getY(i) / 2);
    if (rotation[0] === 0)
      assert.equal(
        measure(g).collapsed,
        8,
        "old front projection fails eight depth triangles",
      );
    projectStoneUVs(g);
    assert.equal(measure(g, true).collapsed, 0);
    assert.deepEqual(p.array, original);
    assert.deepEqual(g.attributes.normal.array, normals);
    for (let i = 0; i < p.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, i),
        b = new THREE.Vector3().fromBufferAttribute(p, i + 1),
        c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
      const n = b.sub(a).cross(c.sub(a));
      if (Math.abs(n.z) < Math.max(Math.abs(n.x), Math.abs(n.y))) continue;
      for (let j = i; j < i + 3; j++) {
        assert.equal(uv.getX(j), p.getX(j) / 2);
        assert.equal(uv.getY(j), p.getY(j) / 2);
      }
    }
    g.dispose();
  }
  const indexed = new THREE.BoxGeometry();
  assert.throws(() => projectStoneUVs(indexed), /separate face vertices/);
  indexed.dispose();
});

test("all sixteen carved leaves and eight windowed crowns have finite non-collapsed texture triangles after batching", (t) => {
  const materials = Object.fromEntries(
    ["wall", "trim", "metal", "inlay", "dark"].map((k) => [
      k,
      new THREE.MeshStandardMaterial(),
    ]),
  );
  let triangles = 0;
  try {
    for (let stage = 0; stage < 8; stage++) {
      const world = new THREE.Group(),
        gate = { stage, root: new THREE.Group(), jambMeshes: [] };
      world.add(gate.root);
      const game = {
        world,
        obstacles: [],
        groundHeight: () => 0,
        terrainProfile: { step: 1.75 },
      };
      buildCrystalFacade(game, gate, materials);
      for (const side of [-1, 1]) {
        const leaf = new THREE.Group(),
          detail = new THREE.Group();
        leaf.add(detail);
        world.add(leaf);
        buildCrystalShutter({
          gate,
          leaf,
          detail,
          side,
          cx: -side * 3.1,
          materials,
        });
      }
      world.traverse((o) => {
        if (!o.geometry) return;
        assert(o.geometry.attributes.uv.array.every(Number.isFinite));
        const result = measure(o.geometry);
        assert.equal(result.collapsed, 0, `stage ${stage} ${o.material.name}`);
        triangles += result.triangles;
      });
      world.traverse((o) => o.geometry?.dispose());
    }
    assert(triangles > 50000);
    t.diagnostic(
      `${triangles} non-collapsed textured triangles across all archive leaves and crowns`,
    );
  } finally {
    for (const m of Object.values(materials)) {
      if (m.isMaterial) m.dispose();
      else for (const v of Object.values(m)) v.dispose();
    }
  }
});

test("colored window returns avoid coincident exposed stone planes on all twenty-four openings", (t) => {
  const materials = Object.fromEntries(
    ["wall", "trim", "inlay"].map((k) => [k, new THREE.MeshStandardMaterial()]),
  );
  let samples = 0,
    controls = 0;
  try {
    for (let stage = 0; stage < 8; stage++) {
      const world = new THREE.Group(),
        gate = { stage, root: new THREE.Group(), jambMeshes: [] };
      world.add(gate.root);
      buildCrystalFacade(
        {
          world,
          obstacles: [],
          groundHeight: () => 0,
          terrainProfile: { step: 1.75 },
        },
        gate,
        materials,
      );
      world.updateMatrixWorld(true);
      const targets = gate.facade.root.children.filter((o) => o.isMesh),
        stone = targets.find((o) => o.material === materials.facade.stone),
        inlay = targets.find((o) => o.material === materials.inlay);
      stone.geometry.computeBoundingBox();
      inlay.geometry.computeBoundingBox();
      const depth =
        (stone.geometry.boundingBox.max.z + inlay.geometry.boundingBox.min.z) /
        2;
      for (const window of gate.facade.plan.windows) {
        const center = window
          .reduce((p, a) => p.add(new THREE.Vector2(...a)), new THREE.Vector2())
          .divideScalar(window.length);
        for (let i = 0; i < window.length; i++) {
          const a = new THREE.Vector2(...window[i]),
            b = new THREE.Vector2(...window[(i + 1) % window.length]),
            mid = a.clone().add(b).multiplyScalar(0.5),
            d = b.clone().sub(a),
            n = new THREE.Vector2(d.y, -d.x).normalize();
          if (n.dot(mid.clone().sub(center)) < 0) n.negate();
          const ray = new THREE.Raycaster(
              new THREE.Vector3(mid.x - n.x * 0.03, mid.y - n.y * 0.03, depth),
              new THREE.Vector3(n.x, n.y, 0),
              0,
              0.16,
            ),
            hits = ray.intersectObjects(targets, false),
            support = hits.find((h) => h.object.material !== materials.inlay);
          assert(support, "actual stone return sampled");
          assert(
            !hits.some(
              (h) =>
                h.object.material === materials.inlay &&
                Math.abs(h.distance - support.distance) < 1e-5,
            ),
            `no fighting return ${stage}/${i}`,
          );
          samples++;
          if (stage === 0 && i === 0) {
            const geometry = new THREE.BufferGeometry().setAttribute(
              "position",
              new THREE.Float32BufferAttribute(
                [
                  a.x,
                  a.y,
                  depth - 0.02,
                  b.x,
                  b.y,
                  depth - 0.02,
                  mid.x,
                  mid.y,
                  depth + 0.02,
                ],
                3,
              ),
            );
            const material = new THREE.MeshBasicMaterial({
                side: THREE.DoubleSide,
              }),
              mesh = new THREE.Mesh(geometry, material),
              hit = ray.intersectObject(mesh, false)[0];
            assert(
              hit && Math.abs(hit.distance - support.distance) < 1e-5,
              "observer detects a coincident face control",
            );
            controls++;
            geometry.dispose();
            material.dispose();
          }
        }
      }
      world.traverse((o) => o.geometry?.dispose());
    }
    assert.equal(samples, 115);
    assert(controls > 0);
    t.diagnostic(
      `${samples} separated stone/trim return samples; coincident controls detected`,
    );
  } finally {
    for (const m of Object.values(materials)) {
      if (m.isMaterial) m.dispose();
      else for (const v of Object.values(m)) v.dispose();
    }
  }
});
