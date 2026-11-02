import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildMeridianDoor } from "../src/meridian-doors.js";
import { mergeArchitecture } from "../src/visuals.js";
import { buildFieldGates } from "../src/field-world.js";
import { updateSanctuaryGate } from "../src/sanctuary-gates.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { SaveStore } from "../src/storage.js";
import { Adventure } from "../src/game.js";

function release(root) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [o.material].flat().filter(Boolean)) materials.add(m);
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => {
    for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    m.dispose();
  });
  textures.forEach((t) => t.dispose());
}
function leaf(stage, side) {
  const root = new THREE.Group(),
    detail = new THREE.Group(),
    materials = Object.fromEntries(
      ["metal", "trim", "dark", "inlay"].map((k) => [
        k,
        new THREE.MeshStandardMaterial(),
      ]),
    );
  root.add(detail);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(6.15, 7.4, 0.48),
    materials.metal,
  );
  body.geometry.translate(0, 3.7, 0);
  root.add(body);
  buildMeridianDoor({
    gate: { stage },
    leaf: root,
    detail,
    side,
    cx: 0,
    materials,
  });
  root.updateMatrixWorld(true);
  return { root, detail, materials, body };
}
function closed(g, label) {
  const p = g.attributes.position,
    index = g.index,
    key = (i) =>
      [p.getX(i), p.getY(i), p.getZ(i)]
        .map((v) => Math.round(v * 1e6))
        .join(","),
    edges = new Map();
  let volume = 0;
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const v = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j)),
      a = new THREE.Vector3().fromBufferAttribute(p, v[0]),
      b = new THREE.Vector3().fromBufferAttribute(p, v[1]),
      c = new THREE.Vector3().fromBufferAttribute(p, v[2]);
    assert(
      b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-16,
      "no collapsed rendered triangle",
    );
    volume += a.dot(b.cross(c)) / 6;
    for (let j = 0; j < 3; j++) {
      const pair = [key(v[j]), key(v[(j + 1) % 3])].sort().join("|");
      edges.set(pair, (edges.get(pair) || 0) + 1);
    }
  }
  // Earcut can bridge several collinear hole bottoms with one cap edge.
  // Split those segments at the actual rendered vertices before comparing
  // their coverage to the shorter return edges.
  const vertices = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    vertices.set(k, k.split(",").map(Number));
  }
  const split = new Map();
  for (const [edge, count] of edges) {
    const [ak, bk] = edge.split("|"),
      a = vertices.get(ak),
      b = vertices.get(bk),
      d = b.map((v, i) => v - a[i]),
      length = d.reduce((n, v) => n + v * v, 0),
      cuts = [
        [0, ak],
        [1, bk],
      ];
    if (count !== 2)
      for (const [k, v] of vertices) {
        const q = v.map((n, i) => n - a[i]),
          t = q.reduce((s, n, i) => s + n * d[i], 0) / length;
        if (t <= 1e-7 || t >= 1 - 1e-7) continue;
        if (q.reduce((s, n, i) => s + (n - t * d[i]) ** 2, 0) < 1.1)
          cuts.push([t, k]);
      }
    cuts.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < cuts.length; i++) {
      const pair = [cuts[i - 1][1], cuts[i][1]].sort().join("|");
      split.set(pair, (split.get(pair) || 0) + count);
    }
  }
  assert(
    [...split.values()].every((n) => n === 2),
    JSON.stringify({
      label,
      edges: [...split].filter(([k, n]) => n !== 2).slice(0, 6),
    }),
  );
  assert(volume > 1e-7, "outward-facing positive volume");
}
function grid(root, face) {
  const ray = new THREE.Raycaster(),
    rows = [];
  for (let y = 0.7; y < 6.8; y += 0.31)
    for (let x = -2.55; x < 2.6; x += 0.29) {
      ray.set(
        new THREE.Vector3(x, y, face * 2),
        new THREE.Vector3(0, 0, -face),
      );
      const hit = ray.intersectObject(root, true)[0];
      assert(
        hit && hit.face.normal.z * face > 1e-6,
        "opaque front and rear covers must face the viewer",
      );
      rows.push(Math.round(Math.abs(hit.point.z) * 10000));
    }
  return rows;
}

test("all twenty Meridian leaves use closed, bounded geometry and distinct two-sided recessed records", () => {
  const signatures = new Set();
  const missingFace = new THREE.BoxGeometry(1, 1, 1);
  missingFace.setIndex(Array.from(missingFace.index.array).slice(0, -3));
  assert.throws(() => closed(missingFace, "missing-triangle control"));
  missingFace.dispose();
  for (let stage = 0; stage < 10; stage++)
    for (const side of [-1, 1]) {
      const f = leaf(stage, side);
      try {
        assert.equal(f.root.userData.meridianDoor.faces, 2);
        f.root.traverse((o) => {
          if (!o.geometry) return;
          closed(o.geometry, {
            stage,
            side,
            type: o.geometry.type,
            material: Object.keys(f.materials).find(
              (k) => f.materials[k] === o.material,
            ),
          });
          for (const a of Object.values(o.geometry.attributes))
            assert(a.array.every(Number.isFinite));
          if (!o.geometry.index) {
            const p = o.geometry.attributes.position,
              uv = o.geometry.attributes.uv;
            for (let i = 0; i < p.count; i += 3) {
              const [a, b, c] = [0, 1, 2].map((j) =>
                  new THREE.Vector3().fromBufferAttribute(p, i + j),
                ),
                area = b.sub(a).cross(c.sub(a)).length(),
                [u, v, w] = [0, 1, 2].map((j) =>
                  new THREE.Vector2().fromBufferAttribute(uv, i + j),
                ),
                ratio = Math.abs(v.sub(u).cross(w.sub(u))) / area;
              assert(
                ratio >= 1 / (4 * Math.sqrt(3)) - 0.0001 && ratio <= 0.2501,
                "returns retain a bounded physical texture scale",
              );
            }
          }
          o.geometry.computeBoundingBox();
          const box = o.geometry.boundingBox;
          assert(box.min.x >= -3.1 && box.max.x <= 3.1);
          assert(box.min.y >= -1e-5 && box.max.y <= 7.4 + 1e-5);
          assert(box.min.z >= -0.56 && box.max.z <= 0.56);
        });
        const front = grid(f.root, 1),
          rear = grid(f.root, -1);
        assert(front.includes(2730), "recess floors must be visible");
        assert(
          rear.some((z) => z > 2401 && z < 2600),
          "the shallower rear still has visible recessed floors",
        );
        if (side === 1) signatures.add(front.join(","));
        mergeArchitecture(f.root);
        mergeArchitecture(f.detail);
        f.root.updateMatrixWorld(true);
        assert.deepEqual(
          grid(f.root, 1),
          front,
          "material batching retains the carved front",
        );
        assert.deepEqual(
          grid(f.root, -1),
          rear,
          "material batching retains the carved rear",
        );
      } finally {
        release(f.root);
      }
    }
  assert.equal(
    signatures.size,
    10,
    "actual ray depths distinguish every objective's record",
  );
});

test("stone emblems enter the real bronze faces or recess backs instead of hovering over them", () => {
  const ray = new THREE.Raycaster();
  let samples = 0;
  for (let stage = 0; stage < 10; stage++) {
    const f = leaf(stage, 1),
      foundations = f.root.children.filter(
        (o) =>
          o === f.body ||
          (o.geometry?.type === "ExtrudeGeometry" &&
            [f.materials.metal, f.materials.dark].includes(o.material)),
      ),
      stones = f.root.children.filter(
        (o) =>
          o.geometry?.type === "ExtrudeGeometry" &&
          o.material === f.materials.trim,
      );
    try {
      for (const stone of stones) {
        const p = stone.geometry.attributes.position;
        stone.geometry.computeBoundingBox();
        const face = stone.geometry.boundingBox.max.z < 0 ? -1 : 1,
          z =
            face > 0
              ? stone.geometry.boundingBox.min.z
              : stone.geometry.boundingBox.max.z;
        for (let i = 0; i < p.count; i++)
          if (Math.abs(p.getZ(i) - z) < 1e-5) {
            ray.set(
              new THREE.Vector3(p.getX(i), p.getY(i), face * 0.8),
              new THREE.Vector3(0, 0, -face),
            );
            const support = ray.intersectObjects(foundations, false)[0];
            assert(
              support && face * (support.point.z - z) >= -1e-5,
              `unseated ${stage} emblem`,
            );
            samples++;
          }
      }
    } finally {
      release(f.root);
    }
  }
  assert(samples > 500);
});

test("delivered gate camera bounds contain the complete front and rear relief throughout each hinge sweep", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[7],
    map = createMap(level),
    world = new THREE.Group(),
    store = new SaveStore({ getItem: () => null, setItem() {} }),
    g = Object.assign(Object.create(Adventure.prototype), {
      level,
      map,
      world,
      store,
      progress: store.level(level.id),
      terrainProfile: createTerrainProfile(map, level),
      obstacles: [],
      elapsed: 0,
      items: map.features.filter((f) => f.type === "mechanism"),
      cameraSurfaces: new CameraSurfaces(world),
      audio: { noiseHit() {} },
    });
  t.after(() => release(world));
  buildFieldGates(g);
  g.cameraSurfaces.rebuild();
  const progress = structuredClone(g.progress),
    point = new THREE.Vector3();
  let count = 0;
  for (const amount of [0, 0.2, 0.5, 0.8, 1]) {
    for (const gate of g.fieldGates) {
      gate.amount = amount;
      updateSanctuaryGate(g, gate, 0);
    }
    world.updateMatrixWorld(true);
    g.cameraSurfaces.entry(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));
    for (const gate of g.fieldGates)
      for (const leaf of gate.leaves) {
        assert.equal(leaf.group.userData.meridianDoor.faces, 2);
        const surface = g.cameraSurfaces.dynamic.find(
          (s) => s.parent === leaf.group,
        );
        assert(surface);
        leaf.group.traverse((o) => {
          if (!o.geometry) return;
          const p = o.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) {
            point.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
            assert(
              surface.bounds.clone().expandByScalar(1e-5).containsPoint(point),
              JSON.stringify({
                stage: gate.stage,
                side: leaf.side,
                amount,
                point: point.toArray(),
                bounds: surface.bounds,
              }),
            );
            count++;
          }
        });
      }
  }
  assert(count > 100000);
  assert.deepEqual(g.progress, progress);
});
