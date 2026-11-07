import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { supportAt } from "../src/character-motion.js";
import { stationSolid, stationMeshSolid } from "../src/field-station-solids.js";
import { createGroundingSupport } from "../src/grounding-support.js";

function fixture() {
  return {
    player: { position: { x: 0, z: 0 } },
    groundHeight: () => 0,
    obstacles: [],
  };
}
function box(g, x, z, options = {}) {
  const group = new T.Group();
  group.position.set(x, 0, z);
  return stationSolid(
    g,
    { id: "support" },
    group,
    [2, 2, 2],
    [0, 1, 0],
    options,
  );
}
function triangle(g, x, z, t, options = {}) {
  const geometry = new T.BoxGeometry(2, 0.6, 2).rotateZ(0.16),
    mesh = new T.Mesh(geometry);
  mesh.position.set(x, 1, z);
  mesh.rotation.y = 0.37;
  const solid = stationMeshSolid(g, { id: "triangle" }, mesh, options);
  t.after(() => {
    geometry.dispose();
    mesh.material.dispose();
  });
  return solid;
}
function equal(g, read, x, z, y, radius, minUp) {
  const a = supportAt(g, x, z, y, radius, minUp),
    b = read(x, z, y, radius, minUp);
  assert.equal(b.height, a.height);
  assert.equal(b.surface, a.surface);
}

test("grounding support preserves heights and original surface identities through boxes, rotated stations, cylinders, slopes and legacy caps", (t) => {
  for (const kind of [
    "box",
    "rotated",
    "cylinder",
    "slope",
    "climbable",
    "step",
  ]) {
    const g = fixture();
    if (kind === "box") box(g, 0, 0);
    if (kind === "rotated") box(g, 0.7, 0.4, { angle: Math.PI / 4 });
    if (kind === "cylinder")
      box(g, -0.6, 0.7, { radius: 0.9, supportRadius: 0.3 });
    if (kind === "slope") triangle(g, 0, 0, t, { bodyPadding: 0.7 });
    if (kind === "climbable" || kind === "step")
      g.obstacles.push({
        x: 0.2,
        z: -0.4,
        w: 0.7,
        d: 1.2,
        h: kind === "step" ? 0.4 : 1.5,
        [kind === "step" ? "stepSupport" : "climbable"]: true,
      });
    for (let i = 0; i < 20; i++) box(g, 100 + i * 4, 50);
    const read = createGroundingSupport(g);
    for (let i = 0; i < 160; i++)
      for (const radius of [0, 0.2, 0.55, 0.8])
        for (const maxY of [-1, 0.5, 1.2, 2, Infinity])
          for (const minUp of [0, 0.65, 0.99])
            equal(
              g,
              read,
              (((i * 137) % 997) / 997) * 6 - 3,
              (((i * 251) % 991) / 991) * 6 - 3,
              maxY,
              radius,
              minUp,
            );
  }
});

test("rotated padding and large triangle support disks cannot be lost at the candidate region boundary", (t) => {
  const rotated = fixture();
  box(rotated, 3.95, 0, { angle: Math.PI / 4 });
  const read = createGroundingSupport(rotated);
  assert.equal(supportAt(rotated, 1.98, 0).height, 2);
  assert.equal(read(1.98, 0).height, 2);
  const triangleGame = fixture(),
    geometry = new T.BoxGeometry(2, 2, 2),
    mesh = new T.Mesh(geometry);
  mesh.position.set(4.4, 1, 0);
  stationMeshSolid(triangleGame, { id: "far-triangle" }, mesh, {
    bodyPadding: 0.2,
  });
  t.after(() => {
    geometry.dispose();
    mesh.material.dispose();
  });
  const triangles = createGroundingSupport(triangleGame);
  assert.equal(supportAt(triangleGame, 1.9, 0, Infinity, 1.6).height, 2);
  equal(triangleGame, triangles, 1.9, 0, Infinity, 1.6, 0.65);
  assert.equal(triangles(1.9, 0).height, 0);
});

test("each grounding update sees moved or activated stations and reads retained heights and visibility at query time", () => {
  const g = fixture(),
    o = box(g, 6, 0);
  assert.equal(createGroundingSupport(g)(0, 0).height, 0);
  o.x = 0.3;
  o.bounds.min.x = -0.7;
  o.bounds.max.x = 1.3;
  let read = createGroundingSupport(g);
  assert.equal(read(0, 0).surface, o);
  o.bounds.max.y = 2.5;
  assert.equal(read(0, 0).height, 2.5);
  o.node = { visible: false };
  assert.equal(read(0, 0).height, 0);
  o.node.visible = true;
  assert.equal(read(0, 0).height, 2.5);
  o.supportable = false;
  assert.equal(createGroundingSupport(g)(0, 0).height, 0);
  o.supportable = true;
  read = createGroundingSupport(g);
  assert.equal(read(0, 0).height, 2.5);
  box(g, 0, 0).bounds.max.y = 4;
  assert.equal(
    read(0, 0).height,
    4,
    "array growth falls back to the current complete list",
  );
  g.obstacles = [{ x: 0, z: 0, w: 1, d: 1, h: 3, climbable: true }];
  assert.equal(
    read(0, 0).height,
    3,
    "array replacement falls back to the current complete list",
  );
});

test("unknown footprints and other support systems keep the complete query contract", () => {
  const g = fixture(),
    unknown = { x: 100, z: 100, h: 3, climbable: true };
  g.obstacles.push(unknown);
  assert.equal(createGroundingSupport(g)(0, 0).surface, unknown);
  const natural = { id: "nature" },
    tree = { id: "tree" },
    calls = [];
  g.obstacles = [];
  g.natureRockSolids = {
    support(...args) {
      calls.push(["nature", ...args]);
      return args[2] >= 0.7 ? { height: 0.7, surface: natural } : null;
    },
  };
  g.jungleTreeSolids = {
    support(...args) {
      calls.push(["tree", ...args]);
      return args[2] >= 0.9 ? { height: 0.9, surface: tree } : null;
    },
  };
  const read = createGroundingSupport(g);
  for (const radius of [0, 0.55, 0.8]) {
    equal(g, read, 0.2, 0.4, 2, radius, 0.91);
    assert.deepEqual(calls.slice(-4, -2), calls.slice(-2));
  }
  assert.equal(read(0.2, 0.4, 2).surface, tree);
});

test("a synchronous grounding batch visits distant obstacles once, while out-of-region queries retain the full search", () => {
  const g = fixture();
  let visits = 0;
  for (let i = 0; i < 2000; i++) {
    const o = { x: 100 + i * 4, z: 0, w: 1, d: 1, h: 2, climbable: true };
    Object.defineProperty(o, "fieldStation", {
      get() {
        visits++;
        return undefined;
      },
    });
    g.obstacles.push(o);
  }
  const local = { x: 0, z: 0, w: 1, d: 1, h: 1, climbable: true };
  g.obstacles.push(local);
  const read = createGroundingSupport(g),
    selectionVisits = visits;
  assert(selectionVisits >= 2000 && selectionVisits <= 4000);
  visits = 0;
  for (let i = 0; i < 100; i++) assert.equal(read(0.2, 0.4).surface, local);
  assert.equal(
    visits,
    0,
    "nearby repeated queries do not rescan the remote list",
  );
  for (let i = 0; i < 100; i++) supportAt(g, 0.2, 0.4);
  assert.equal(
    visits,
    200000,
    "complete-list reference detects the unbounded work",
  );
  visits = 0;
  assert.equal(read(100, 0).height, 2);
  assert.equal(visits, 2000, "a distant support query uses the full list");
});
