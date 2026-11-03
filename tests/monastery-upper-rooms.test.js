import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { createHash } from "node:crypto";
import { monasteryRoofGeometry } from "../src/monastery-roof.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { stationBlocked } from "../src/field-station-solids.js";
import {
  upperRoomPlan,
  roofFaceHeight,
  FacadeCamera,
  buildPavilionHouse,
} from "../src/monastery-upper-rooms.js";

function fixture(index) {
  const world = new T.Group(),
    root = new T.Group();
  root.position.set(73, 11, -51);
  world.add(root);
  const materials = Object.fromEntries(
      ["wood", "red", "stone", "plaster", "shadow"].map((name) => [
        name,
        new T.MeshStandardMaterial({ name, vertexColors: true }),
      ]),
    ),
    main = new T.Mesh(
      monasteryRoofGeometry({ width: 17.4, depth: 12.4, rise: 3.6 }),
      materials.wood,
    ),
    rise = [2.7, 2.4, 3, 2.7, 0, 2.4, 3, 2.7, 3.5][index];
  main.position.set(0, 11, -18);
  root.add(main);
  let upper = null;
  if (rise) {
    upper = new T.Mesh(
      monasteryRoofGeometry({ width: 10.2, depth: 8.2, rise }),
      materials.wood,
    );
    upper.position.set(0, 17.05, -18);
    root.add(upper);
  }
  const game = {
      world,
      level: { seed: 673 },
      obstacles: [],
      groundHeight: () => 11,
      cameraSurfaces: new CameraSurfaces(world),
    },
    house = buildPavilionHouse(game, root, index, main, upper, materials);
  game.cameraSurfaces.rebuild();
  world.updateMatrixWorld(true);
  return { game, root, main, upper, house, materials };
}
function cleanup({ root, materials }) {
  root.traverse((o) => o.geometry?.dispose());
  for (const m of Object.values(materials)) m.dispose();
}

function sealed(geometry) {
  const p = geometry.attributes.position,
    index = geometry.index,
    edges = new Map();
  let volume = 0,
    degenerate = 0;
  const key = (v) =>
    v
      .toArray()
      .map((n) => Math.round(n * 1e5))
      .join(",");
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const v = [0, 1, 2].map((j) =>
      new T.Vector3().fromBufferAttribute(p, index ? index.getX(i + j) : i + j),
    );
    degenerate += new T.Triangle(...v).getArea() < 1e-9 ? 1 : 0;
    volume += v[0].dot(v[1].clone().cross(v[2])) / 6;
    for (let j = 0; j < 3; j++) {
      const a = key(v[j]),
        b = key(v[(j + 1) % 3]),
        k = [a, b].sort().join("|");
      edges.set(k, (edges.get(k) || 0) + (a < b ? 1 : -1));
    }
  }
  return {
    volume,
    degenerate,
    unpaired: [...edges.values()].filter((n) => n !== 0).length,
  };
}

test("facade camera preserves real openings and spherical clearance through a closed extrusion", () => {
  const shape = new T.Shape(
    [
      [-2, -2],
      [2, -2],
      [2, 2],
      [-2, 2],
    ].map((p) => new T.Vector2(...p)),
  );
  shape.holes.push(
    new T.Path(
      [
        [-0.6, -0.8],
        [-0.6, 0.8],
        [0.6, 0.8],
        [0.6, -0.8],
      ].map((p) => new T.Vector2(...p)),
    ),
  );
  const geometry = new T.ExtrudeGeometry(shape, {
      depth: 0.19,
      bevelEnabled: false,
    }).translate(0, 0, -0.19),
    camera = new FacadeCamera(geometry),
    entry = (x, y, r = 0) =>
      camera.entry(new T.Vector3(x, y, 1), new T.Vector3(x, y, -1), r);
  assert.equal(entry(0, 0, 0.28), null);
  assert(entry(0.5, 0, 0.28) < 0.6, "the near plane stops beside a jamb");
  assert(entry(1, 0) < 0.51);
  assert.equal(
    entry(2.5, 0, 0.28),
    null,
    "the broad envelope does not fill exterior air",
  );
  geometry.dispose();
});

test("all upper houses have closed delivered geometry, four recessed elevations and finite camera/body shapes after batching", (t) => {
  const plans = new Set();
  let windows = 0,
    triangles = 0;
  for (let index = 0; index < 9; index++) {
    const f = fixture(index),
      { game, house, root, materials } = f;
    assert.equal(
      game.cameraSurfaces.count,
      1,
      "one finite camera assembly per court",
    );
    assert(
      house.root.children.length <= 5,
      "batched by the shared material set",
    );
    for (const mesh of house.root.children) {
      const g = mesh.geometry;
      assert(g.attributes.position.array.every(Number.isFinite));
      assert(g.attributes.normal.array.every(Number.isFinite));
      const result = sealed(g);
      assert.equal(
        result.degenerate,
        0,
        `${index}/${mesh.material.name}: no collapsed triangles`,
      );
      assert.equal(
        result.unpaired,
        0,
        `${index}/${mesh.material.name}: closed components`,
      );
      assert(result.volume > 0);
      triangles += g.attributes.position.count / 3;
    }
    if (index === 4) {
      assert.equal(house.plan, null);
      assert.equal(house.windows.length, 0);
      cleanup(f);
      continue;
    }
    plans.add(JSON.stringify(house.plan));
    const sides = new Set(house.windows.map((r) => r.side));
    assert.equal(sides.size, 4);
    const plaster = house.root.children.filter(
        (m) => m.material === materials.plaster,
      ),
      ray = new T.Raycaster();
    for (const side of sides) {
      const r = house.windows.find((r) => r.side === side),
        normal = new T.Vector3(...r.outward),
        center = new T.Vector3(...r.center)
          .addScaledVector(new T.Vector3(...r.along), r.w * 0.12)
          .add(new T.Vector3(0, r.h * 0.11, 0)),
        origin = center.clone().addScaledVector(normal, 0.7).add(root.position);
      ray.set(origin, normal.clone().negate());
      ray.far = 1.5;
      const hits = ray.intersectObjects(plaster);
      assert(hits.length > 0, "a real core closes each recess");
      assert(
        hits[0].distance > 0.78,
        `court ${index} side ${side}: plaster hole has physical depth`,
      );
      const inside = center
          .clone()
          .addScaledVector(normal, -0.55)
          .add(root.position),
        solid = house.stationSolids[0];
      assert(
        stationBlocked(solid, inside.x, inside.y - 0.05, inside.z, 0.1, 0),
        "the closed core blocks a body inside",
      );
      const outside = center
        .clone()
        .addScaledVector(normal, 1)
        .add(root.position);
      assert(
        !stationBlocked(solid, outside.x, outside.y - 0.05, outside.z, 0.1, 0),
        "empty exterior stays clear",
      );
      assert(game.cameraSurfaces.entry(origin, inside, 0.02) < 1);
    }
    windows += house.windows.length;
    cleanup(f);
  }
  assert.equal(plans.size, 8);
  assert(windows >= 32, "each of eight houses has four dressed elevations");
  t.diagnostic(`${windows} windows, ${triangles} delivered triangles`);
});

test("roof joint samples agree with independent triangle rays and new trusses meet the existing plate height", () => {
  for (let index = 0; index < 9; index++) {
    const f = fixture(index),
      { main, upper, house, root } = f,
      top = roofFaceHeight(main),
      below = roofFaceHeight(main, false),
      ray = new T.Raycaster();
    for (const [x, z] of [
      [0, -18],
      [-3.1, -20.1],
      [2.8, -16],
      [5.5, -15],
    ]) {
      ray.set(
        new T.Vector3(x, 35, z).add(root.position),
        new T.Vector3(0, -1, 0),
      );
      ray.far = 40;
      const hit = ray.intersectObject(main)[0];
      assert(hit);
      assert(Math.abs(top(x, z) - (hit.point.y - root.position.y)) < 1e-5);
      assert(Math.abs(top(x, z) - below(x, z) - 0.24) < 2e-5);
    }
    assert.equal(house.joints.length, 6);
    for (const joint of house.joints) {
      ray.set(
        new T.Vector3(joint.x, 10.89, joint.z).add(root.position),
        new T.Vector3(0, 1, 0),
      );
      ray.far = 3;
      // Start in the post: an upward ray must leave its delivered top.
      const mats = Object.values(f.materials);
      for (const m of mats) m.side = T.DoubleSide;
      const hits = ray.intersectObject(house.root, true);
      assert(
        hits.length > 0 && hits[0].distance < 2,
        "post rises from the existing plate",
      );
    }
    if (upper) assert(roofFaceHeight(upper, false)(0, -18) > 19);
    cleanup(f);
  }
});

// Geometry reference from published 064c8a9, before extracting shared facade
// code. Quantization ignores sub-ten-micrometre platform rounding; UVs are
// intentionally excluded because this revision repairs their collapsed axes.
test("the shared facade extraction preserves the nine published upper-house constructions", () => {
  const reference = [
    "3aef4ac14ab00484fccd922f21e0535137f2be8b3e22fe75b45cc09d34049998",
    "afc0b72638f86f905d7a60bf0e0871e01340f006e79742462094d98788d0d5f3",
    "1510f8879bd032c36ef23b80509f5e91b9532142229c303394dd556d37140356",
    "57f9eb97e95968c6ae0140a005467d48c8b71bcafe437747cc7820cde818cde2",
    "0f829645cbf690ca8ac6616dae1094e77d248e8634ddc6d202b6dc48b9225872",
    "d94035ecd9aa3ddd1b893e3889d204d81fa22570f58fc84eb43306f2c35264b6",
    "49a234cad6326ae0329e09b27b92defb4544cccce1b5fdf6d3aee30cd7fb6c54",
    "08f138a3286c4bf0fc8398cc78338b573857f486b98e5ec72b8146d4150db336",
    "e717d0dee58c414b7d3bc0a3ce4c63c77ffad5ddb66f7a9743ee84c2cc06ac40",
  ];
  for (let index = 0; index < 9; index++) {
    const f = fixture(index),
      h = createHash("sha256");
    for (const mesh of [...f.house.root.children].sort((a, b) =>
      a.material.name.localeCompare(b.material.name),
    )) {
      h.update(mesh.material.name);
      for (const key of ["position", "normal"])
        h.update(
          JSON.stringify(
            Array.from(mesh.geometry.attributes[key].array, (v) =>
              Math.round(v * 1e5),
            ),
          ),
        );
    }
    assert.equal(h.digest("hex"), reference[index], `court ${index}`);
    cleanup(f);
  }
});
