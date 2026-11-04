import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { monasteryRoofGeometry } from "../src/monastery-roof.js";
import { roofFasciaGeometry } from "../src/roof-fascia.js";
import { RoofCamera } from "../src/roof-camera.js";
import {
  stationAssemblySolid,
  stationSupport,
} from "../src/field-station-solids.js";

function closed(g, skip = 0) {
  const p = g.attributes.position,
    edges = new Map();
  let volume = 0;
  for (let i = skip; i < p.count; i += 3) {
    const v = [0, 1, 2].map((j) =>
      new T.Vector3().fromBufferAttribute(p, i + j),
    );
    assert(new T.Triangle(...v).getArea() > 1e-10);
    volume += v[0].dot(v[1].clone().cross(v[2])) / 6;
    for (let j = 0; j < 3; j++) {
      const key = (v) =>
          v
            .toArray()
            .map((x) => Math.round(x * 1e5))
            .join(","),
        a = key(v[j]),
        b = key(v[(j + 1) % 3]),
        id = [a, b].sort().join("|");
      edges.set(id, (edges.get(id) || 0) + (a < b ? 1 : -1));
    }
  }
  return volume > 0 && [...edges.values()].every((n) => n === 0);
}
test("fascias form closed boards fitted to actual hipped, gabled and pavilion skirts", (t) => {
  const material = new T.MeshBasicMaterial({ side: T.DoubleSide }),
    ray = new T.Raycaster();
  let probes = 0,
    detached = 0;
  try {
    for (const profile of ["hip", "gable", "pavilion"])
      for (const damage of [0, 1, 2]) {
        const roof = monasteryRoofGeometry({
            width: 11.02,
            depth: 5,
            rise: 1.7,
            profile,
            damage,
          }),
          fascia = roofFasciaGeometry(roof),
          mesh = new T.Mesh(roof, material),
          p = fascia.attributes.position;
        try {
          assert(closed(fascia));
          assert(!closed(fascia, 3));
          assert(p.array.every(Number.isFinite));
          for (let i = 0; i < p.count; i += 3) {
            const v = [0, 1, 2].map((j) =>
                new T.Vector3().fromBufferAttribute(p, i + j),
              ),
              tri = new T.Triangle(...v);
            if (tri.getNormal(new T.Vector3()).y <= 1e-6) continue;
            for (const point of [...v, tri.getMidpoint(new T.Vector3())]) {
              ray.set(
                point.clone().add(new T.Vector3(0, -0.1, 0)),
                new T.Vector3(0, 1, 0),
              );
              ray.far = 0.5;
              const hit = ray.intersectObject(mesh)[0];
              assert(hit);
              const gap = hit.point.y - point.y;
              assert(Math.abs(gap + 0.004) < 0.00003);
              assert(gap + 0.25 > 0.2);
              probes++;
              detached++;
            }
          }
          for (let i = 0; i < p.count; i++)
            assert(
              Math.abs(p.getZ(i)) >= 2.26 - 1e-6 &&
                Math.abs(p.getZ(i)) <= 2.5 + 1e-6,
            );
        } finally {
          roof.dispose();
          fascia.dispose();
        }
      }
  } finally {
    material.dispose();
  }
  assert(probes > 1000 && detached === probes);
  t.diagnostic(`${probes} delivered skirt contacts and lowered-board controls`);
});

test("fascia camera and support follow the two boards while keeping the roof center empty", () => {
  const roof = monasteryRoofGeometry({
      width: 11.02,
      depth: 5,
      rise: 2.25,
      profile: "gable",
    }),
    g = roofFasciaGeometry(roof),
    material = new T.MeshBasicMaterial(),
    mesh = new T.Mesh(g, material),
    kernel = new RoofCamera(g),
    ray = new T.Raycaster(new T.Vector3(0, 5, 2.4), new T.Vector3(0, -1, 0));
  try {
    const hit = ray.intersectObject(mesh)[0];
    assert(hit);
    const a = hit.point.clone().add(new T.Vector3(0, 0.1, 0)),
      b = hit.point.clone().add(new T.Vector3(0, -0.1, 0));
    assert(Math.abs(kernel.entry(a, b, 0) - 0.5) < 1e-4);
    assert.equal(
      kernel.entry(new T.Vector3(0, 5, 0), new T.Vector3(0, -1, 0)),
      null,
    );
    const game = { obstacles: [], groundHeight: () => -10 },
      solid = stationAssemblySolid(game, { id: "fitted-fascia" }, [mesh], {
        supportRadius: 0,
      });
    assert(Math.abs(stationSupport(solid, 0, 2.4, 5) - hit.point.y) < 1e-5);
    assert.equal(stationSupport(solid, 0, 0, 5), null);
  } finally {
    roof.dispose();
    g.dispose();
    material.dispose();
  }
});
