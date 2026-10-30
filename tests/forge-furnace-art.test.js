import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  furnaceCrownPlan,
  furnaceShellGeometry,
  buildFurnaceCrown,
  buildFurnaceCoolant,
  forgeGantryPlan,
  forgeGantryGeometry,
} from "../src/forge-furnace-art.js";
import {
  stationAssemblySolid,
  stationSupport,
  stationBlocked,
} from "../src/field-station-solids.js";

const stacks = [14, 16, 12, 15, 13, 17, 14, 16, 20];
function closed(geometry) {
  const p = geometry.attributes.position,
    index = geometry.index,
    edges = new Map();
  let volume = 0;
  const key = (v) =>
    v
      .toArray()
      .map((x) => Math.round(x * 1e6))
      .join(",");
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const [a, b, c] = [0, 1, 2].map((j) =>
      new THREE.Vector3().fromBufferAttribute(
        p,
        index ? index.getX(i + j) : i + j,
      ),
    );
    assert(
      b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-16,
      "nondegenerate sheet triangle",
    );
    volume += a.dot(b.clone().cross(c)) / 6;
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const x = key(u),
        y = key(v),
        pair = [x, y].sort().join("/");
      edges.set(pair, (edges.get(pair) || 0) + (x < y ? 1 : -1));
    }
  }
  assert(
    [...edges.values()].every((v) => v === 0),
    "closed oriented edges",
  );
  assert(volume > 0, "outward solid volume");
  for (const a of Object.values(geometry.attributes))
    assert(a.array.every(Number.isFinite));
}
function crown(index, side, material) {
  const plan = furnaceCrownPlan(index, side, stacks[index] + side * 2.1 - 6.2),
    root = new THREE.Group();
  const meshes = buildFurnaceCrown(plan, material, (g, m, x, y, z) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  });
  root.updateMatrixWorld(true);
  return { plan, root, meshes };
}

test("eighteen furnace crowns have closed skins, fitted bands and genuinely open smoke outlets", () => {
  const material = new THREE.MeshStandardMaterial(),
    names = new Set(),
    ray = new THREE.Raycaster();
  let triangles = 0;
  try {
    for (let index = 0; index < 9; index++)
      for (const side of [0, 1]) {
        const { plan, root, meshes } = crown(index, side, material);
        names.add(plan.name);
        for (const mesh of meshes) {
          closed(mesh.geometry);
          triangles +=
            (mesh.geometry.index?.count ??
              mesh.geometry.attributes.position.count) / 3;
        }
        const box = new THREE.Box3().setFromObject(root);
        assert(
          box.min.x >= -4.15 &&
            box.max.x <= 4.15 &&
            box.min.z >= -3.65 &&
            box.max.z <= 3.65,
        );
        // The ends of the raised seams tuck into the firebox bearing by <5 cm.
        assert(box.min.y >= -0.05 && box.max.y <= plan.height + 0.001);
        const [x, y, z] = plan.outlet;
        ray.set(new THREE.Vector3(x, y + 1, z), new THREE.Vector3(0, -1, 0));
        assert.equal(
          ray.intersectObject(root, true).length,
          0,
          "outlet is open through the hood, not a capped stack",
        );
        const rim = plan.rings.at(-1);
        ray.ray.origin.x = x + rim.w / 2 - 0.08;
        assert(
          ray.intersectObject(root, true).length > 0,
          "the same top has a real rim",
        );
        meshes.forEach((m) => m.geometry.dispose());
      }
  } finally {
    material.dispose();
  }
  assert.equal(names.size, 9);
  assert(triangles < 65000);
});

test("horizontal smelting shoulders retain metal thickness instead of coincident inner and outer faces", () => {
  const plan = furnaceCrownPlan(5, 0, 10.8),
    geometry = furnaceShellGeometry(plan.rings),
    material = new THREE.MeshStandardMaterial(),
    mesh = new THREE.Mesh(geometry, material),
    ray = new THREE.Raycaster();
  let steps = 0;
  try {
    for (let i = 0; i < plan.rings.length - 1; i++) {
      const a = plan.rings[i],
        b = plan.rings[i + 1];
      if (a.y !== b.y) continue;
      // Probe the overlap of the outer ledge and inner underside, beyond the
      // vertical wall's thickness rather than inside that taller wall.
      const x =
          (Math.min(a.w, b.w) / 2 + Math.max(a.w, b.w) / 2 - 0.16) / 2 + a.x,
        z = a.z;
      ray.set(new THREE.Vector3(x, a.y + 0.4, z), new THREE.Vector3(0, -1, 0));
      const upper = ray.intersectObject(mesh)[0];
      ray.set(new THREE.Vector3(x, a.y - 0.4, z), new THREE.Vector3(0, 1, 0));
      const lower = ray.intersectObject(mesh)[0];
      assert(upper && lower, "both faces of the ledge exist");
      assert(
        Math.abs(upper.point.y - lower.point.y - 0.16) < 1e-5,
        "16 cm physical plate thickness",
      );
      steps++;
    }
  } finally {
    geometry.dispose();
    material.dispose();
  }
  assert.equal(steps, 4);
});

test("coolant vents have real open bores and clear every furnace hood", () => {
  const material = new THREE.MeshStandardMaterial(),
    ray = new THREE.Raycaster();
  try {
    for (let index = 0; index < 9; index++)
      for (const side of [0, 1]) {
        const { root, meshes } = crown(index, side, material);
        const coolant = buildFurnaceCoolant(side, material, (g, m) => {
          const mesh = new THREE.Mesh(g, m);
          root.add(mesh);
          return mesh;
        });
        root.updateMatrixWorld(true);
        const outlet = coolant.meshes[1],
          tip = new THREE.Vector3(...coolant.tip);
        closed(outlet.geometry);
        ray.set(
          tip.clone().add(new THREE.Vector3(0, 0.01, 0)),
          new THREE.Vector3(0, -1, 0),
        );
        assert.equal(ray.intersectObject(outlet).length, 0, "open bore");
        ray.ray.origin.x += 0.27;
        assert(ray.intersectObject(outlet).length > 0, "visible annular lip");
        for (const dx of [-0.3, 0, 0.3]) {
          ray.set(
            tip.clone().add(new THREE.Vector3(dx, 0.01, 0)),
            new THREE.Vector3(0, 1, 0),
          );
          assert.equal(
            ray.intersectObject(root, true).length,
            0,
            "steam rises clear of the hood and branch",
          );
        }
        for (const mesh of [...meshes, ...coolant.meshes])
          mesh.geometry.dispose();
      }
  } finally {
    material.dispose();
  }
});

test("furnace support and obstruction follow the delivered shell and leave clear space below and above", () => {
  const material = new THREE.MeshStandardMaterial(),
    ray = new THREE.Raycaster();
  let hits = 0,
    open = 0;
  try {
    for (let index = 0; index < 9; index++)
      for (const side of [0, 1]) {
        const { plan, root, meshes } = crown(index, side, material);
        root.position.set(30, 7, -5);
        root.updateMatrixWorld(true);
        const game = { obstacles: [], groundHeight: () => 7 },
          solid = stationAssemblySolid(game, { id: "furnace-test" }, meshes, {
            bodyPadding: 0.65,
          });
        for (const dx of [-3.8, -3.2, -2.3, 0, 2.3, 3.2, 3.8])
          for (const dz of [-3.1, -2.4, 0, 2.4, 3.1]) {
            const x = 30 + dx,
              z = -5 + dz;
            ray.set(
              new THREE.Vector3(x, 7 + plan.height + 1, z),
              new THREE.Vector3(0, -1, 0),
            );
            const hit = ray.intersectObject(root, true)[0],
              support = stationSupport(solid, x, z);
            if (hit) {
              assert(
                support !== null && Math.abs(support - hit.point.y) < 1e-5,
                "rendered roof height",
              );
              hits++;
            } else {
              assert.equal(support, null, "open roof column");
              open++;
            }
          }
        assert.equal(stationBlocked(solid, 30, 3, -5, 1.8), false);
        assert.equal(
          stationBlocked(solid, 30, 7 + plan.height + 0.1, -5, 1.8),
          false,
        );
        assert.equal(
          stationBlocked(solid, 34, 7.3, -5, 1.8),
          true,
          "lower hood face obstructs a body",
        );
        meshes.forEach((m) => m.geometry.dispose());
      }
  } finally {
    material.dispose();
  }
  assert(hits > 400 && open >= 18);
});

test("all nine gantry profiles seat on both piers and suspend the cross-shaft from their actual center bearing", () => {
  const crowns = [12, 11.5, 12.8, 13.2, 11.8, 14, 12.4, 11.3, 15],
    profiles = new Set();
  for (let index = 0; index < 9; index++) {
    const plan = forgeGantryPlan(index, crowns[index]);
    const { points, bearing } = plan;
    const geometry = forgeGantryGeometry(plan);
    closed(geometry);
    const material = new THREE.MeshBasicMaterial(),
      mesh = new THREE.Mesh(geometry, material),
      ray = new THREE.Raycaster();
    for (let i = 1; i < points.length - 1; i++) {
      const p = new THREE.Vector2(...points[i]),
        incoming = p
          .clone()
          .sub(new THREE.Vector2(...points[i - 1]))
          .normalize(),
        outgoing = new THREE.Vector2(...points[i + 1]).sub(p).normalize(),
        direction = incoming.add(outgoing).normalize(),
        normal = new THREE.Vector2(-direction.y, direction.x);
      // Probe both halves of each fitted joint. Separate rectangular beams
      // leave the outer half open even though both beams are closed solids.
      for (const side of [-1, 1]) {
        const sample = p.clone().addScaledVector(normal, side * 0.5);
        ray.set(
          new THREE.Vector3(sample.x, sample.y, 5),
          new THREE.Vector3(0, 0, -1),
        );
        const hit = ray.intersectObject(mesh)[0];
        assert(
          hit && Math.abs(hit.point.z - 1.65) < 1e-5,
          "continuous front face at fitted joint",
        );
      }
    }
    material.dispose();
    geometry.dispose();
    profiles.add(JSON.stringify(points));
    assert(
      Math.abs(points[0][0] + 5.8) < 1e-9 &&
        Math.abs(points[0][1] - 8.8) < 1e-9,
    );
    assert(
      Math.abs(points.at(-1)[0] - 5.8) < 1e-9 &&
        Math.abs(points.at(-1)[1] - 8.8) < 1e-9,
    );
    assert(bearing > 9.3 && bearing <= crowns[index]);
    const a = new THREE.Vector2(0, bearing);
    assert(
      points.slice(1).some((b, i) => {
        const p = new THREE.Vector2(...points[i]),
          q = new THREE.Vector2(...b),
          d = q.clone().sub(p),
          f = Math.max(0, Math.min(1, a.clone().sub(p).dot(d) / d.lengthSq()));
        return p.addScaledVector(d, f).distanceTo(a) < 1e-9;
      }),
    );
  }
  assert.equal(profiles.size, 9);
});
