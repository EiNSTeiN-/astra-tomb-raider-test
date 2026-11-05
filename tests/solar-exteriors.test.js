import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { buildSolarExterior } from "../src/solar-exteriors.js";
import { solarExteriorPlan } from "../src/solar-exterior-plan.js";
import { inspectSolarExteriors } from "../scripts/inspect-solar-exteriors-browser.js";

function fixture(t) {
  const level = LEVELS[1],
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    world = new T.Group(),
    g = {
      level,
      map,
      world,
      terrainProfile: terrain,
      groundHeight: terrain.surfaceHeight,
      obstacles: [],
      fieldGates: [],
      soundSources: [],
    },
    material = new T.MeshStandardMaterial();
  g.cameraSurfaces = new CameraSurfaces(world);
  t.after(() => {
    world.traverse((o) => o.geometry?.dispose());
    material.dispose();
  });
  for (const f of map.features.filter((f) => f.type === "mechanism")) {
    const gate = { stage: f.stage, root: new T.Group() };
    gate.root.position.set(
      f.x * 7,
      terrain.surfaceHeight(f.x * 7, f.z * 7),
      f.z * 7,
    );
    world.add(gate.root);
    buildSolarExterior(g, gate, {
      trim: material,
      wall: material,
      chamberInset: material,
    });
    g.fieldGates.push(gate);
  }
  g.cameraSurfaces.rebuild();
  world.updateMatrixWorld(true);
  return g;
}

test("nine exterior compositions have sealed outward stone, real footing and no occupied room or optical footprint", (t) => {
  const g = fixture(t),
    plans = new Set();
  let parts = 0,
    triangles = 0;
  for (const gate of g.fieldGates) {
    plans.add(JSON.stringify(solarExteriorPlan(gate.stage)));
    const record = gate.solarExterior,
      groups = new Map(
        record.parts.map((p) => [p.id, { volume: 0, edges: new Map() }]),
      );
    assert(
      record.root.children.length <= 2,
      "existing stone material batches the new exterior",
    );
    record.root.traverse((mesh) => {
      if (!mesh.isMesh) return;
      assert(
        Object.values(mesh.geometry.attributes).every((a) =>
          a.array.every(Number.isFinite),
        ),
      );
      const { position: p, solarExteriorPart: part } = mesh.geometry.attributes;
      for (let i = 0; i < p.count; i += 3) {
        const q = [0, 1, 2].map((j) =>
            new T.Vector3().fromBufferAttribute(p, i + j),
          ),
          r = groups.get(part.getX(i));
        assert(new T.Triangle(...q).getArea() > 1e-10, "nondegenerate stone");
        r.volume += q[0].dot(q[1].clone().cross(q[2])) / 6;
        const keys = q.map((v) =>
          v
            .toArray()
            .map((x) => x.toFixed(5))
            .join(","),
        );
        for (let j = 0; j < 3; j++) {
          const key = [keys[j], keys[(j + 1) % 3]].sort().join("|");
          r.edges.set(key, (r.edges.get(key) || 0) + 1);
        }
        for (const v of q) {
          assert(
            v.z < 6.7,
            "forward optical field stays outside the new volume",
          );
          assert(
            Math.abs(v.x) > 6.6 ||
              v.z < -6.5 ||
              (record.parts[part.getX(i)].kind === "apse coping surround" &&
                v.y >= 6.94),
            "room floor remains outside the new volume",
          );
        }
        triangles++;
      }
    });
    for (const r of groups.values()) {
      assert(r.volume > 1e-8, "outward enclosed volume");
      assert(
        [...r.edges.values()].every((n) => n === 2),
        "closed stone",
      );
      parts++;
    }
  }
  assert.equal(plans.size, 9);
  assert(parts > 1000);
  assert(triangles < 250000);
});

test("delivered raking faces, roofs and camera cells agree while empty shoulders stay open", (t) => {
  const g = fixture(t),
    report = inspectSolarExteriors(g);
  assert.deepEqual(report.failures, []);
  assert.equal(report.buildings, 9);
  assert.equal(report.masses, 35);
  assert(report.roofs > 90 && report.rims > 1500 && report.emptyShoulders > 35);
  const surfaces = new Set([...g.cameraSurfaces.cells.values()].flat()),
    saved = [];
  for (const s of surfaces) {
    saved.push([s, s.planes]);
    s.planes = null;
  }
  try {
    assert(
      inspectSolarExteriors(g).failures.some(
        (f) => f.kind === "boxed empty shoulder",
      ),
      "a broad-bound negative control must block the empty sloping space",
    );
  } finally {
    for (const [s, planes] of saved) s.planes = planes;
  }
});
