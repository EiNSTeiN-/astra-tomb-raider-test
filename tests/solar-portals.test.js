import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { Adventure } from "../src/game.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { normalizeSave } from "../src/storage.js";
import { buildFieldGates } from "../src/field-world.js";
import { updateSanctuaryGate } from "../src/sanctuary-gates.js";
import { CameraSurfaces, boxEntry } from "../src/camera-collision.js";
import { solarPortalPlan } from "../src/solar-portals.js";
function fixture(t) {
  t.mock.method(T.TextureLoader.prototype, "load", () => new T.Texture());
  const level = LEVELS[1],
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    world = new T.Group(),
    g = Object.assign(Object.create(Adventure.prototype), {
      level,
      map,
      world,
      terrainProfile: terrain,
      groundHeight: terrain.height,
      walkable: () => true,
      obstacles: [],
      items: [],
      waterMeshes: [],
      flames: [],
      progress: normalizeSave({ version: 1, levels: { sands: { stage: 9 } } })
        .levels.sands,
      player: new T.Group(),
      avatar: new T.Group(),
      grounded: true,
      jumpY: 0,
      velocityY: 0,
      health: 100,
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
  world.updateMatrixWorld(true);
  t.after(() => {
    const resources = new Set();
    world.traverse((o) => {
      if (o.geometry) resources.add(o.geometry);
      for (const m of [o.material].flat().filter(Boolean)) {
        resources.add(m);
        for (const v of Object.values(m)) if (v?.isTexture) resources.add(v);
      }
    });
    for (const r of resources) r.dispose();
  });
  return g;
}
function closed(geometry) {
  const p = geometry.attributes.position,
    ids = geometry.index?.array || Array.from({ length: p.count }, (_, i) => i),
    edges = new Map();
  let volume = 0;
  for (let i = 0; i < ids.length; i += 3) {
    const v = [0, 1, 2].map((j) =>
      new T.Vector3().fromBufferAttribute(p, ids[i + j]),
    );
    if (v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).lengthSq() < 1e-16)
      continue;
    volume += v[0].dot(v[1].clone().cross(v[2])) / 6;
    const keys = v.map((p) =>
      p
        .toArray()
        .map((n) => Math.round(n * 1e5))
        .join(","),
    );
    for (let j = 0; j < 3; j++) {
      const key = [keys[j], keys[(j + 1) % 3]].sort().join("/");
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  assert(volume > 0, "outward closed volume");
  assert(
    [...edges.values()].every((n) => n === 2),
    "no missing cap or reveal edges",
  );
  for (const name of ["position", "normal", "uv"])
    assert([...geometry.attributes[name].array].every(Number.isFinite));
}
function setAmount(g, gate, amount) {
  g.progress.stage = 0;
  g.progress.completed = false;
  g.progress.field = [];
  gate.amount = amount;
  updateSanctuaryGate(g, gate, 0);
  g.world.updateMatrixWorld(true);
}
function firstSolid(g, from, to) {
  const ray = new T.Raycaster(
    from,
    to.clone().sub(from).normalize(),
    0,
    from.distanceTo(to),
  );
  return ray
    .intersectObject(g.world, true)
    .find(
      (h) =>
        h.object.isMesh &&
        !h.object.material.transparent &&
        !h.object.material.isMeshBasicMaterial,
    );
}

test("nine portal assemblies retain closed delivered stone, metal panels and window reveals after batching", (t) => {
  const g = fixture(t);
  let geometries = 0;
  assert.equal(
    new Set(
      Array.from({ length: 9 }, (_, i) => JSON.stringify(solarPortalPlan(i))),
    ).size,
    9,
  );
  for (const gate of g.fieldGates) {
    assert.equal(
      gate.solarPortal.root.children.length,
      2,
      "masonry batches by material",
    );
    assert.equal(
      gate.solarPortal.feature.stationSolids.length,
      1,
      "one finite assembly for each stone surround",
    );
    for (const root of [
      gate.solarPortal.root,
      ...gate.leaves.map((l) => l.group),
    ])
      root.traverse((m) => {
        if (m.isMesh) {
          closed(m.geometry);
          geometries++;
        }
      });
  }
  assert(geometries >= 54);
  t.diagnostic(`${geometries} delivered closed geometry batches`);
});

test("moving pointed and corbelled heads retain actual empty camera space between slab and surround", (t) => {
  const g = fixture(t);
  let checks = 0;
  for (const stage of [1, 2, 3, 4, 5, 8]) {
    const gate = g.fieldGates[stage],
      c = gate.root.position;
    setAmount(g, gate, 0.42);
    // At half stroke the lowered heads clear this upper side view. The former
    // full rectangular proxy still occupies it for the pointed/arched profiles.
    const x = stage === 5 ? 5.1 : 5.0,
      y = 3.45,
      a = new T.Vector3(c.x + x, c.y + y, c.z + 8.2),
      b = new T.Vector3(c.x + x, c.y + y, c.z + 5.6);
    assert.equal(firstSolid(g, a, b), undefined, `delivered gap ${stage}`);
    assert.equal(
      g.cameraSurfaces.entry(a, b, 0.15),
      1,
      `empty camera gap ${stage}`,
    );
    const old = new T.Box3(
      new T.Vector3(c.x - 6.2, c.y + gate.door.position.y, c.z + 6.2),
      new T.Vector3(c.x + 6.2, c.y + 7.4 + gate.door.position.y, c.z + 6.8),
    );
    assert.notEqual(
      boxEntry(a, b, old, 0.15),
      null,
      "negative control: shared rectangular proxy blocks the view",
    );
    checks++;
  }
  assert.equal(checks, 6);
});

test("upper light-well holes and relay slots remain physically open with camera clearance through complete lift cycles", (t) => {
  const g = fixture(t);
  let openings = 0,
    metal = 0;
  for (const stage of [6, 7]) {
    const gate = g.fieldGates[stage],
      c = gate.root.position;
    for (const amount of [0, 0.15, 0.3, 0]) {
      setAmount(g, gate, amount);
      for (const x of [-3.1, 3.1]) {
        const y = (stage === 6 ? 6.55 : 6.57) + gate.door.position.y,
          a = new T.Vector3(c.x + x, c.y + y, c.z + 7.5),
          b = new T.Vector3(c.x + x, c.y + y, c.z + 5.9);
        assert.equal(
          firstSolid(g, a, b),
          undefined,
          `window reveal ${stage}/${amount}/${x}`,
        );
        assert.equal(
          g.cameraSurfaces.entry(a, b, 0.2),
          1,
          `window camera ${stage}/${amount}/${x}`,
        );
        openings++;
      }
    }
    setAmount(g, gate, 0);
    for (const x of [-3.1, 3.1])
      for (const y of [5.85, 7.2]) {
        const a = new T.Vector3(c.x + x, c.y + y, c.z + 7.5),
          b = new T.Vector3(c.x + x, c.y + y, c.z + 5.9);
        assert(firstSolid(g, a, b), "solid metal beside the opening");
        assert(g.cameraSurfaces.entry(a, b, 0.15) < 1);
        metal++;
      }
  }
  assert.equal(openings, 16);
  assert.equal(metal, 8);
});
