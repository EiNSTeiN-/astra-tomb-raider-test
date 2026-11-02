import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { buildMonasteryDoor } from "../src/monastery-doors.js";
import { mergeArchitecture } from "../src/visuals.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { buildFieldGates } from "../src/field-world.js";
import { updateSanctuaryGate } from "../src/sanctuary-gates.js";
import { normalizeSave } from "../src/storage.js";
import { closedMeshReader } from "../scripts/inspect-explorer-solids-browser.js";

function release(root) {
  const all = new Set();
  root.traverse((o) => {
    if (o.geometry) all.add(o.geometry);
    for (const m of [o.material].flat().filter(Boolean)) {
      all.add(m);
      for (const v of Object.values(m)) if (v?.isTexture) all.add(v);
    }
  });
  for (const r of all) r.dispose();
}
function leaf(stage, side) {
  const root = new T.Group(),
    detail = new T.Group(),
    materials = Object.fromEntries(
      ["wood", "metal", "chamberInset"].map((k) => [
        k,
        new T.MeshStandardMaterial(),
      ]),
    );
  root.add(detail);
  buildMonasteryDoor({
    gate: { stage },
    leaf: root,
    detail,
    side,
    cx: 0,
    materials,
  });
  return { root, detail, materials };
}
function closed(geometry, label = "missing-face control") {
  const p = geometry.attributes.position,
    indices =
      geometry.index?.array || Array.from({ length: p.count }, (_, i) => i),
    edges = new Map();
  let volume = 0;
  const key = (i) =>
    [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.round(v * 1e6)).join(",");
  for (let i = 0; i < indices.length; i += 3) {
    const ids = Array.from(indices.slice(i, i + 3)),
      v = ids.map((j) => new T.Vector3().fromBufferAttribute(p, j));
    assert(new T.Triangle(...v).getArea() > 1e-10);
    volume += v[0].dot(v[1].clone().cross(v[2])) / 6;
    for (let j = 0; j < 3; j++) {
      const a = key(ids[j]),
        b = key(ids[(j + 1) % 3]),
        k = [a, b].sort().join("|");
      edges.set(k, (edges.get(k) || 0) + (a < b ? 1 : -1));
    }
  }
  assert(volume > 1e-7);
  assert(
    [...edges.values()].every((n) => n === 0),
    `${label}: ${JSON.stringify([...edges].filter(([, n]) => n !== 0).slice(0, 4))}`,
  );
}
function depthGrid(root, face) {
  root.updateMatrixWorld(true);
  const ray = new T.Raycaster(),
    depths = [];
  for (let y = 0.55; y < 6.85; y += 0.3)
    for (let x = -2.72; x < 2.73; x += 0.28) {
      ray.set(new T.Vector3(x, y, face), new T.Vector3(0, 0, -face));
      ray.far = 2;
      const hit = ray.intersectObject(root, true)[0];
      assert(hit);
      depths.push(Math.round(Math.abs(hit.point.z) * 1e5));
    }
  return depths;
}

test("sixteen painted monastery leaves remain closed and inside the existing camera and hinge depth", (t) => {
  const control = new T.BoxGeometry(1, 1, 1);
  control.setIndex(Array.from(control.index.array).slice(0, -3));
  assert.throws(() => closed(control));
  control.dispose();
  let pieces = 0;
  for (let stage = 0; stage < 8; stage++)
    for (const side of [-1, 1]) {
      const f = leaf(stage, side);
      try {
        assert.equal(f.root.userData.monasteryDoor.faces, 2);
        f.root.traverse((o) => {
          if (!o.isMesh) return;
          const part =
            f.root.userData.monasteryDoor.parts[
              o.geometry.attributes.monasteryDoorPart.getX(0)
            ];
          closed(o.geometry, `${stage}/${side}/${part.kind}/${part.face}`);
          pieces++;
          for (const a of Object.values(o.geometry.attributes))
            assert(a.array.every(Number.isFinite));
          const p = o.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) {
            assert(Math.abs(p.getX(i)) <= 3.07501);
            assert(p.getY(i) >= -1e-6 && p.getY(i) <= 7.40001);
            assert(Math.abs(p.getZ(i)) < 0.30001);
          }
        });
      } finally {
        release(f.root);
      }
    }
  assert(pieces > 600);
  t.diagnostic(`${pieces} closed timber and fitting pieces`);
});

test("all eight timber records retain distinct real front and rear recesses after batching", () => {
  const names = new Set(),
    signatures = new Set();
  for (let stage = 0; stage < 8; stage++)
    for (const side of [-1, 1]) {
      const f = leaf(stage, side);
      try {
        names.add(f.root.userData.monasteryDoor.name);
        const front = depthGrid(f.root, 1),
          back = depthGrid(f.root, -1);
        for (const grid of [front, back]) {
          assert(
            grid.some((d) => d < 18000),
            "exposed recessed panel backs",
          );
          assert(
            grid.some((d) => d > 27000),
            "raised framing and facing",
          );
        }
        if (side < 0) signatures.add(JSON.stringify(front));
        mergeArchitecture(f.root, 2);
        mergeArchitecture(f.detail, 2);
        assert.deepEqual(depthGrid(f.root, 1), front);
        assert.deepEqual(depthGrid(f.root, -1), back);
        assert(f.root.children.filter((o) => o.isMesh).length <= 4);
      } finally {
        release(f.root);
      }
    }
  assert.equal(names.size, 8);
  assert.equal(signatures.size, 8);
});

test("bronze door records and pulls bear on actual backs and timber", () => {
  let checked = 0;
  for (let stage = 0; stage < 8; stage++) {
    const f = leaf(stage, 1),
      metadata = f.root.userData.monasteryDoor.parts,
      ray = new T.Raycaster();
    f.root.updateMatrixWorld(true);
    try {
      const supports = f.root.children.filter(
        (o) => o.isMesh && o.material !== f.materials.metal,
      );
      for (const mesh of f.root.children.filter(
        (o) => o.isMesh && o.material === f.materials.metal,
      )) {
        const id = mesh.geometry.attributes.monasteryDoorPart.getX(0),
          part = metadata[id];
        if (part.kind !== "seated bronze record") continue;
        const bounds = new T.Box3().setFromObject(mesh),
          c = bounds.getCenter(new T.Vector3());
        ray.set(
          new T.Vector3(c.x, c.y, part.face * 0.4),
          new T.Vector3(0, 0, -part.face),
        );
        const actual = ray.intersectObject(mesh)[0],
          back = ray.intersectObjects(supports)[0];
        assert(actual && back);
        assert(
          back.distance - actual.distance < 0.026,
          "record enters the backing",
        );
        checked++;
      }
      const hardware = f.root.children.filter(
        (o) => o.isMesh && o.material === f.materials.metal,
      );
      const type = (mesh) =>
        metadata[mesh.geometry.attributes.monasteryDoorPart.getX(0)];
      for (const ring of hardware.filter((o) => type(o).kind === "ring pull")) {
        const part = type(ring),
          bounds = new T.Box3().setFromObject(ring),
          c = bounds.getCenter(new T.Vector3()),
          rear = part.face > 0 ? bounds.min.z : -bounds.max.z;
        const clearance = (backing) => {
          for (let i = 0; i < 16; i++) {
            const angle = (i * Math.PI) / 8;
            ray.set(
              new T.Vector3(
                c.x + Math.cos(angle) * 0.23,
                c.y + Math.sin(angle) * 0.23,
                part.face * 0.4,
              ),
              new T.Vector3(0, 0, -part.face),
            );
            const hit = ray.intersectObjects(backing)[0];
            assert(
              hit && rear - Math.abs(hit.point.z) > 0.06,
              "the whole pull has finger space behind its rim",
            );
          }
        };
        clearance(supports);
        if (stage === 0 && part.face > 0) {
          const blocked = new T.Mesh(
            new T.BoxGeometry(0.6, 0.6, 0.01),
            f.materials.wood,
          );
          blocked.position.set(c.x, c.y, 0.275);
          blocked.updateMatrixWorld(true);
          assert.throws(
            () => clearance([...supports, blocked]),
            /finger space/,
          );
          blocked.geometry.dispose();
        }
        for (const bearing of hardware.filter(
          (o) => type(o).kind === "pull bearing" && type(o).face === part.face,
        )) {
          const reader = closedMeshReader([bearing]),
            p = ring.geometry.attributes.position;
          let joined = false;
          for (let i = 0; i < p.count && !joined; i++)
            joined = reader(new T.Vector3().fromBufferAttribute(p, i)) > 0.001;
          assert(joined, "the ring physically joins both supporting bearings");
          const box = new T.Box3().setFromObject(bearing),
            point = box.getCenter(new T.Vector3());
          ray.set(
            new T.Vector3(point.x, point.y, part.face * 0.4),
            new T.Vector3(0, 0, -part.face),
          );
          const back = ray.intersectObjects(supports)[0];
          assert(back);
          assert(
            (part.face > 0 ? box.min.z : -box.max.z) < Math.abs(back.point.z),
            "the bearings enter the actual timber back",
          );
        }
      }
      const pulls = hardware
        .filter((o) => type(o).kind === "ring pull")
        .map((o) => new T.Box3().setFromObject(o).getCenter(new T.Vector3()));
      assert.equal(pulls.length, 2);
      assert(
        Math.abs(pulls[0].x - pulls[1].x) < 1e-6,
        "front and rear pulls align at the meeting edge",
      );
    } finally {
      release(f.root);
    }
  }
  assert(checked > 100);
});

test("all delivered monastery panels and pulls stay inside moving camera bounds and retain open passages", (t) => {
  t.mock.method(T.TextureLoader.prototype, "load", () => new T.Texture());
  const level = LEVELS[2],
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    world = new T.Group(),
    g = Object.assign(Object.create(Adventure.prototype), {
      level,
      map,
      world,
      terrainProfile: terrain,
      groundHeight: terrain.height,
      obstacles: [],
      items: [],
      waterMeshes: [],
      flames: [],
      progress: normalizeSave({ version: 1, levels: { frost: { stage: 0 } } })
        .levels.frost,
      player: new T.Group(),
      audio: { tone() {} },
    });
  g.cameraSurfaces = new CameraSurfaces(world);
  for (const f of map.features.filter((f) => f.type === "mechanism")) {
    f.group = new T.Group();
    f.group.position.set(f.x * 7, terrain.height(f.x * 7, f.z * 7), f.z * 7);
    world.add(f.group);
    g.items.push(f);
  }
  buildFieldGates(g);
  g.cameraSurfaces.rebuild();
  t.after(() => release(world));
  let samples = 0;
  for (const gate of g.fieldGates)
    for (const amount of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      gate.amount = amount;
      updateSanctuaryGate(g, gate, 0);
      world.updateMatrixWorld(true);
      g.cameraSurfaces.entry(new T.Vector3(), new T.Vector3(1, 1, 1));
      for (const leaf of gate.leaves) {
        const surfaces = g.cameraSurfaces.dynamic.filter(
          (s) => s.parent === leaf.group,
        );
        assert(surfaces.length > 0);
        const bounds = surfaces[0].bounds.clone().expandByScalar(0.0001);
        leaf.group.traverse((mesh) => {
          if (!mesh.isMesh) return;
          const p = mesh.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) {
            const v = new T.Vector3()
              .fromBufferAttribute(p, i)
              .applyMatrix4(mesh.matrixWorld);
            assert(
              bounds.containsPoint(v),
              `gate ${gate.stage} amount ${amount}: camera misses ${v.toArray()}`,
            );
            samples++;
          }
        });
      }
      if (amount === 1)
        assert(g.canMove(gate.root.position.x, gate.root.position.z + 6.5, 0));
    }
  assert(samples > 100000);
  t.diagnostic(`${samples} moving camera vertex comparisons`);
});
