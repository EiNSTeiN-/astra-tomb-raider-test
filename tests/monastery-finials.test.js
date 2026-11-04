import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { monasteryPavilionPlan } from "../src/monastery-pavilion-plan.js";
import { monasteryRoofGeometry } from "../src/monastery-roof.js";
import {
  monasteryFinialGeometry,
  monasteryFinialPlan,
} from "../src/monastery-finials.js";
import {
  stationMeshSolid,
  stationBlocked,
  stationSupport,
} from "../src/field-station-solids.js";

function sealed(g, part, skip = 0) {
  const p = g.attributes.position,
    tag = g.attributes.monasteryFinial,
    edges = new Map();
  let volume = 0,
    faces = 0;
  const key = (v) =>
    v
      .toArray()
      .map((n) => Math.round(n * 1e5))
      .join(",");
  for (let i = skip; i < p.count; i += 3) {
    if (tag.getX(i) !== part) continue;
    const v = [0, 1, 2].map((j) =>
      new T.Vector3().fromBufferAttribute(p, i + j),
    );
    assert(new T.Triangle(...v).getArea() > 1e-11);
    volume += v[0].dot(v[1].clone().cross(v[2])) / 6;
    faces++;
    for (let j = 0; j < 3; j++) {
      const a = key(v[j]),
        b = key(v[(j + 1) % 3]),
        id = [a, b].sort().join("|");
      edges.set(id, (edges.get(id) || 0) + (a < b ? 1 : -1));
    }
  }
  return volume > 0 && faces > 0 && [...edges.values()].every((n) => n === 0);
}

test("all eight cast finials have closed, outward solids, varied profiles and finite metal attributes", (t) => {
  const forms = new Set();
  let faces = 0;
  for (let index = 0; index < 9; index++) {
    const roof = monasteryPavilionPlan(index).upper;
    if (!roof) {
      assert.equal(monasteryFinialPlan(index), null);
      continue;
    }
    const slate = monasteryRoofGeometry({ ...roof, seed: index }),
      snow = monasteryRoofGeometry({ ...roof, seed: index, snow: true }),
      { geometry: g } = monasteryFinialGeometry(slate, snow, index);
    try {
      assert(sealed(g, 1));
      assert(sealed(g, 2));
      assert(!sealed(g, 1, 3));
      for (const a of Object.values(g.attributes))
        assert(a.array.every(Number.isFinite));
      assert(g.attributes.color.array.every((n) => n >= 0 && n <= 1));
      const seam = new Map();
      for (let i = 0; i < g.attributes.position.count; i += 3) {
        const [a, b, c] = [0, 1, 2].map((j) =>
          new T.Vector2().fromBufferAttribute(g.attributes.uv, i + j),
        );
        assert(
          Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) >
            1e-10,
          "noncollapsed metal-map coordinates",
        );
        const p = g.attributes.position,
          tag = g.attributes.monasteryFinial,
          ys = [0, 1, 2].map((j) => p.getY(i + j));
        const normal = new T.Triangle(
          ...[0, 1, 2].map((j) =>
            new T.Vector3().fromBufferAttribute(p, i + j),
          ),
        ).getNormal(new T.Vector3());
        for (let j = 0; j < 3; j++)
          assert(
            new T.Vector3()
              .fromBufferAttribute(g.attributes.normal, i + j)
              .dot(normal) > 0,
            "shading normals face outward",
          );
        if (tag.getX(i) === 2 && Math.max(...ys) - Math.min(...ys) > 1e-7)
          for (let j = 0; j < 3; j++)
            if (p.getX(i + j) > 0 && Math.abs(p.getZ(i + j)) < 1e-7) {
              const key = [p.getX(i + j), p.getY(i + j)]
                  .map((n) => Math.round(n * 1e5))
                  .join(","),
                u = g.attributes.uv.getX(i + j),
                phase = u - Math.floor(u);
              if (seam.has(key))
                assert(
                  Math.abs(phase - seam.get(key)) < 1e-5,
                  "periodic metal maps close at the casting seam",
                );
              else seam.set(key, phase);
            }
      }
      assert(seam.size > 20);
      forms.add(JSON.stringify(monasteryFinialPlan(index)));
      faces += g.attributes.position.count / 3;
    } finally {
      slate.dispose();
      snow.dispose();
      g.dispose();
    }
  }
  assert.equal(forms.size, 8);
  t.diagnostic(`${faces} closed finial triangles`);
});

test("finial camera and body follow the mounting boss, collars and necks without blocking air above or below", () => {
  const index = 6,
    roof = monasteryPavilionPlan(index).upper,
    slate = monasteryRoofGeometry(roof),
    snow = monasteryRoofGeometry({ ...roof, snow: true, seed: index }),
    model = monasteryFinialGeometry(slate, snow, index),
    mat = new T.MeshBasicMaterial(),
    mesh = new T.Mesh(model.geometry, mat),
    plan = monasteryFinialPlan(index),
    anchor = model.geometry.userData.anchor,
    game = { obstacles: [], groundHeight: () => -10 },
    solid = stationMeshSolid(game, { id: "finial" }, mesh, {
      bodyPadding: 0.55,
      supportRadius: 0,
      bodySupport: false,
    });
  try {
    const a = (y) => new T.Vector3(-1, y, 0),
      b = (y) => new T.Vector3(1, y, 0),
      middle = anchor + 0.68 * plan.height;
    assert(model.camera.entry(a(middle), b(middle), 0) < 0.5);
    assert(stationBlocked(solid, 0, middle, 0, 0.05, 0));
    const neck = anchor - 0.004 + 0.5 * plan.height;
    assert.equal(
      model.camera.entry(
        new T.Vector3(0.29, neck, -1),
        new T.Vector3(0.29, neck, 1),
        0,
      ),
      null,
    );
    assert(!stationBlocked(solid, 0.29, neck, 0, 0, 0));
    const box = new T.Box3().setFromBufferAttribute(
      model.geometry.attributes.position,
    );
    for (const y of [box.min.y - 0.5, box.max.y + 0.5]) {
      assert.equal(model.camera.entry(a(y), b(y), 0.1), null);
      assert(!stationBlocked(solid, 0, y, 0, 0.1, 0));
    }
    assert.equal(stationSupport(solid, 0.6, 0.6, 100), null);
    assert.equal(
      stationSupport(solid, 0, 0, 100, 0.4),
      null,
      "a narrow finial tip is not a body landing",
    );
    assert(Math.abs(stationSupport(solid, 0, 0, 100) - box.max.y) < 1e-5);
  } finally {
    slate.dispose();
    snow.dispose();
    model.geometry.dispose();
    mat.dispose();
  }
});
