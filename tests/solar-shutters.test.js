import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { buildSolarPortalLeaf } from "../src/solar-portals.js";
import { solarShutterScene } from "../src/solar-shutter-scenes.js";
import { solarCastPrism } from "../src/solar-cast-prism.js";
import { crownPrism } from "../src/desert-crowns.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  inspectSolarShutters,
  shutterGeometryTopology,
} from "../scripts/inspect-solar-shutters-browser.js";

function fixture(t) {
  const world = new T.Group(),
    materials = { metal: new T.MeshStandardMaterial() },
    game = { world, fieldGates: [], cameraSurfaces: new CameraSurfaces(world) };
  for (let stage = 0; stage < 9; stage++) {
    const root = new T.Group(),
      door = new T.Group(),
      gate = { stage, root, door, leafWidth: 6.2, leaves: [] };
    root.position.x = stage * 25;
    world.add(root);
    root.add(door);
    for (const side of [-1, 1]) {
      const leaf = new T.Group();
      leaf.position.x = side * gate.leafWidth;
      leaf.userData.cameraDynamic = true;
      door.add(leaf);
      buildSolarPortalLeaf(game, { gate, leaf, side, materials });
      gate.leaves.push({ side, group: leaf });
    }
    game.fieldGates.push(gate);
  }
  world.updateMatrixWorld(true);
  game.cameraSurfaces.rebuild();
  t.after(() => {
    world.traverse((n) => n.geometry?.dispose());
    for (const m of Object.values(materials)) m.dispose();
  });
  return game;
}

test("eighteen shutters retain sealed outward castings and both recessed faces through their stroke", (t) => {
  const g = fixture(t),
    names = new Set();
  let count;
  for (const amount of [0, 0.35, 1, 0.15, 0]) {
    for (const gate of g.fieldGates) gate.door.position.y = -amount * 8.2;
    const report = inspectSolarShutters(g);
    assert.deepEqual(report.failures, []);
    assert.equal(report.leaves, 18);
    assert.equal(report.faces, 36);
    assert(report.parts > 600 && report.triangles < 180000);
    assert(
      report.recesses > 190 && report.sockets === 162 && report.bonded > 500,
    );
    count = report.parts;
  }
  for (const gate of g.fieldGates) {
    names.add(gate.leaves[0].group.userData.solarShutter.scene);
    for (const leaf of gate.leaves)
      assert.equal(
        leaf.group.userData.solarShutter.root.children.length,
        3,
        "three shared material batches",
      );
  }
  assert.equal(names.size, 9);
  t.diagnostic(`${count} closed castings at five stroke positions`);
});

test("the recessed-face observer rejects a backing filled to the old flat leaf surface", (t) => {
  const g = fixture(t),
    r = g.fieldGates[0].leaves[0].group.userData.solarShutter,
    saved = [];
  r.root.traverse((m) => {
    if (!m.isMesh) return;
    const { position: p, solarShutterPart: id } = m.geometry.attributes;
    saved.push([p, p.array.slice()]);
    for (let i = 0; i < p.count; i++)
      if (r.parts[id.getX(i)].kind === "recess backing")
        p.setZ(i, p.getZ(i) * 2);
  });
  try {
    assert(
      inspectSolarShutters(g).failures.some((f) => f.kind === "recess face"),
    );
  } finally {
    for (const [p, a] of saved) p.array.set(a);
  }
  assert.deepEqual(inspectSolarShutters(g).failures, []);
});

test("the pull-seat observer rejects the unseated legacy mount when its new socket is removed", (t) => {
  const g = fixture(t),
    r = g.fieldGates[0].leaves[0].group.userData.solarShutter,
    saved = [];
  r.root.traverse((m) => {
    if (!m.isMesh) return;
    const id = m.geometry.attributes.solarShutterPart,
      keep = [];
    for (let i = 0; i < id.count; i++)
      if (r.parts[id.getX(i)].kind !== "pull socket") keep.push(i);
    const replacement = new T.BufferGeometry();
    for (const [name, a] of Object.entries(m.geometry.attributes)) {
      const values = [];
      for (const i of keep)
        for (let k = 0; k < a.itemSize; k++) values.push(a.getComponent(i, k));
      replacement.setAttribute(
        name,
        new T.Float32BufferAttribute(values, a.itemSize),
      );
    }
    saved.push([m, m.geometry]);
    m.geometry = replacement;
  });
  try {
    assert(
      inspectSolarShutters(g).failures.some(
        (f) => f.kind === "unsupported pull mount",
      ),
    );
  } finally {
    for (const [m, original] of saved) {
      m.geometry.dispose();
      m.geometry = original;
    }
  }
  assert.deepEqual(inspectSolarShutters(g).failures, []);
});

function capArea(g) {
  const p = g.attributes.position,
    n = g.attributes.normal;
  let area = 0;
  for (let i = 0; i < p.count; i += 3)
    if (Math.abs(n.getZ(i)) > 0.999)
      area += new T.Triangle(
        ...[0, 1, 2].map((j) => new T.Vector3().fromBufferAttribute(p, i + j)),
      ).getArea();
  return area;
}
test("aligned aqueduct apertures retain their exact silhouette and cap coverage with stitched cap edges", () => {
  const shape = solarShutterScene(2, -1).shapes[0],
    raw = crownPrism(shape.points, 0.14, shape.holes, 0.008),
    stitched = solarCastPrism(shape.points, 0.14, shape.holes, 0.008);
  try {
    assert(
      shutterGeometryTopology(raw).failures.some((f) => f.edges > 0),
      "the original cap triangulation reproduces the open edge pairing",
    );
    const report = shutterGeometryTopology(stitched);
    assert.equal(report.invalid + report.degenerate, 0);
    assert.deepEqual(report.failures, []);
    raw.computeBoundingBox();
    stitched.computeBoundingBox();
    assert(raw.boundingBox.equals(stitched.boundingBox));
    assert(
      Math.abs(capArea(raw) - capArea(stitched)) < 1e-5,
      "stitching changes neither openings nor total cap area",
    );
    const broken = new T.BufferGeometry();
    for (const [name, a] of Object.entries(stitched.attributes))
      broken.setAttribute(
        name,
        new T.BufferAttribute(a.array.slice(0, -3 * a.itemSize), a.itemSize),
      );
    try {
      assert(
        shutterGeometryTopology(broken).failures.some((f) => f.edges > 0),
        "a removed delivered triangle is detected",
      );
    } finally {
      broken.dispose();
    }
  } finally {
    raw.dispose();
    stitched.dispose();
  }
});
