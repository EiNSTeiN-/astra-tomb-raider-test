import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {
  orreryPedestalGeometry,
  captureOrreryPedestal,
} from "../src/orrery-pedestals.js";
import { CameraSurfaces, convexEntry } from "../src/camera-collision.js";
import {
  stationMeshSolid,
  stationSupport,
  stationEntry,
} from "../src/field-station-solids.js";
import { pedestalFootingGeometry } from "../src/observatory-footings.js";

function closed(g) {
  const p = g.attributes.position,
    edges = new Map();
  let volume = 0;
  const key = (i) =>
    [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.round(v * 1e6)).join(",");
  for (let i = 0; i < p.count; i += 3) {
    const a = new T.Vector3().fromBufferAttribute(p, i),
      b = new T.Vector3().fromBufferAttribute(p, i + 1),
      c = new T.Vector3().fromBufferAttribute(p, i + 2);
    assert(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-15);
    volume += a.dot(b.clone().cross(c)) / 6;
    const v = [0, 1, 2].map((j) => key(i + j));
    for (let j = 0; j < 3; j++) {
      const k = [v[j], v[(j + 1) % 3]].sort().join("|");
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  assert(
    [...edges.values()].every((n) => n === 2),
    "complete paired edges",
  );
  assert(volume > 1, "outward positive volume");
  assert(p.array.every(Number.isFinite));
  assert(g.attributes.normal.array.every(Number.isFinite));
}
test("eleven pedestal silhouettes close their faces, meet the existing footing and retain real support", () => {
  const material = new T.MeshStandardMaterial(),
    ray = new T.Raycaster(),
    signatures = new Set();
  let rays = 0;
  try {
    for (let index = 0; index < 11; index++) {
      const bottom = -0.7,
        g = orreryPedestalGeometry(index, bottom),
        mesh = new T.Mesh(g, material),
        world = new T.Group();
      world.add(mesh);
      world.updateMatrixWorld(true);
      closed(g);
      const physics = { obstacles: [], groundHeight: () => -2 },
        solid = stationMeshSolid(physics, { id: "pedestal" }, mesh, {
          bodyPadding: 0.7,
          layeredSupport: true,
        }),
        foundation = new T.Mesh(
          pedestalFootingGeometry(-1.1, bottom + 0.035),
          material,
        );
      foundation.updateMatrixWorld(true);
      const signature = [];
      for (let turn = 0; turn < 96; turn++) {
        const a = (turn * Math.PI * 2) / 96,
          n = new T.Vector3(Math.sin(a), 0, Math.cos(a));
        for (const y of [
          bottom + 0.01,
          bottom + 0.2,
          0.5,
          1.1,
          1.8,
          2.6,
          2.99,
        ]) {
          const from = n.clone().multiplyScalar(6).setY(y),
            to = n.clone().multiplyScalar(-6).setY(y);
          ray.set(from, n.clone().negate());
          ray.far = 12;
          const hit = ray.intersectObject(mesh)[0],
            entry = stationEntry(solid, from, to);
          assert(hit && entry !== null);
          assert(Math.abs(entry - hit.distance / 12) < 2e-6);
          signature.push(Math.round(hit.distance * 1000));
          rays++;
        }
        // Avoid a ray exactly on a cap fan spoke: floating-point edge tests
        // can reject both adjoining triangles even on the published footing.
        ray.set(
          new T.Vector3(
            Math.sin(a + 0.007) * 3.96,
            bottom + 0.08,
            Math.cos(a + 0.007) * 3.96,
          ),
          new T.Vector3(0, -1, 0),
        );
        ray.far = 0.2;
        assert(
          ray.intersectObject(foundation)[0],
          "bottom course enters complete old footing",
        );
      }
      signatures.add(signature.join(","));
      for (let ix = -8; ix <= 8; ix++)
        for (let iz = -8; iz <= 8; iz++) {
          // Offset the grid from radial fan spokes and exact tangent points.
          const x = ix * 0.5 + 0.003,
            z = iz * 0.5 + 0.009;
          ray.set(new T.Vector3(x, 5, z), new T.Vector3(0, -1, 0));
          ray.far = 7;
          const hit = ray.intersectObject(mesh)[0],
            support = stationSupport(solid, x, z);
          if (hit)
            assert(support !== null && Math.abs(hit.point.y - support) < 2e-5);
          else assert.equal(support, null);
          rays++;
        }
      g.dispose();
      foundation.geometry.dispose();
    }
  } finally {
    material.dispose();
  }
  assert.equal(signatures.size, 11);
  assert(rays > 10000);
});

test("pedestal camera envelopes protect the rendered surface and preserve narrowed empty corners after capture", () => {
  const material = new T.MeshStandardMaterial(),
    ray = new T.Raycaster();
  let probes = 0,
    maxOverreach = 0;
  try {
    for (let index = 0; index < 11; index++) {
      const world = new T.Group(),
        parent = new T.Group(),
        g = orreryPedestalGeometry(index, -0.7),
        mesh = new T.Mesh(g, material);
      parent.position.set(17, 4, 23);
      world.add(parent);
      parent.add(mesh);
      const game = { cameraSurfaces: new CameraSurfaces(world) };
      assert(captureOrreryPedestal(game, mesh, index, -0.7) > 5);
      game.cameraSurfaces.rebuild();
      world.updateMatrixWorld(true);
      for (let turn = 0; turn < 48; turn++)
        for (const y of [-0.65, -0.3, 0.4, 1.1, 1.8, 2.5, 2.98]) {
          const a = (turn * Math.PI) / 24,
            n = new T.Vector3(Math.sin(a), 0, Math.cos(a)),
            centre = parent.position.clone().add(new T.Vector3(0, y, 0)),
            from = centre.clone().addScaledVector(n, 6),
            to = centre.clone().addScaledVector(n, -6);
          ray.set(from, n.clone().negate());
          ray.far = 12;
          const hit = ray.intersectObject(mesh)[0];
          assert(hit);
          const t = game.cameraSurfaces.entry(from, to, 0);
          assert(
            t < 1 && t * 12 <= hit.distance + 3e-5,
            "camera never crosses a visible face",
          );
          maxOverreach = Math.max(maxOverreach, hit.distance - t * 12);
          assert(
            game.cameraSurfaces.entry(from, to, 0.28) <= t,
            "camera margin retains the surface clearance",
          );
          probes++;
        }
      // A diagonal pass outside the upper square corner remains clear even though
      // it crosses the former eight-metre box. The real lower course stays below.
      if (index === 4) {
        const a = new T.Vector3(20.6, 6.2, 25.9),
          b = new T.Vector3(20.6, 6.2, 20.1);
        ray.set(a, b.clone().sub(a).normalize());
        ray.far = a.distanceTo(b);
        assert.equal(ray.intersectObject(mesh).length, 0);
        assert.equal(game.cameraSurfaces.entry(a, b, 0), 1);
      }
      g.dispose();
    }
  } finally {
    material.dispose();
  }
  assert(probes > 3500);
  assert(maxOverreach < 0.18, `camera envelope overreach ${maxOverreach}`);
});

test("convex camera margins allow escape while keeping a crossing solid blocked", () => {
  const planes = [
      [1, 0, 0, 1],
      [-1, 0, 0, 1],
      [0, 1, 0, 1],
      [0, -1, 0, 1],
      [0, 0, 1, 1],
      [0, 0, -1, 1],
    ],
    point = (x) => new T.Vector3(x, 0, 0);
  assert.equal(convexEntry(point(-3), point(3), planes), 1 / 3);
  assert.equal(convexEntry(point(0), point(3), planes), null);
  assert.equal(convexEntry(point(1.1), point(3), planes, 0.28), null);
  assert.equal(convexEntry(point(1.1), point(-3), planes, 0.28), 0);
  assert.equal(
    convexEntry(new T.Vector3(-3, 2, 0), new T.Vector3(3, 2, 0), planes),
    null,
  );
});

test("the lower pedestal skin stays behind the overlapping footing instead of competing for the same visible depth", () => {
  const material = new T.MeshStandardMaterial(),
    ray = new T.Raycaster();
  let probes = 0;
  try {
    for (let index = 0; index < 11; index++) {
      const bottom = -0.7,
        body = new T.Mesh(orreryPedestalGeometry(index, bottom), material),
        footing = new T.Mesh(
          pedestalFootingGeometry(-1.2, bottom + 0.035),
          material,
        );
      body.updateMatrixWorld(true);
      footing.updateMatrixWorld(true);
      try {
        for (let i = 0; i < 48; i++)
          for (const lift of [0.005, 0.015, 0.03]) {
            const a = ((i + 0.137) * Math.PI * 2) / 48,
              normal = new T.Vector3(Math.sin(a), 0, Math.cos(a)),
              origin = normal
                .clone()
                .multiplyScalar(6)
                .setY(bottom + lift);
            ray.set(origin, normal.clone().negate());
            ray.far = 12;
            const outer = ray.intersectObject(footing)[0],
              inner = ray.intersectObject(body)[0];
            assert(outer && inner);
            assert(
              inner.distance - outer.distance > 0.002,
              `competing skins at pedestal ${index}, turn ${i}, lift ${lift}`,
            );
            probes++;
          }
      } finally {
        body.geometry.dispose();
        footing.geometry.dispose();
      }
    }
  } finally {
    material.dispose();
  }
  assert.equal(probes, 1584);
});
