import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  forgeWallPlan,
  forgeBayContour,
  buildForgeWallBay,
} from "../src/forge-wall-art.js";
import { buildChamberWall } from "../src/chamber-walls.js";
import { gateMaterials } from "../src/sanctuary-gates.js";
import { LEVELS } from "../src/campaign.js";
import { CameraSurfaces } from "../src/camera-collision.js";

function closed(g) {
  const p = g.attributes.position,
    index = g.index,
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
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    assert(normal.lengthSq() > 1e-16, "nondegenerate triangle");
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
    [...edges.values()].every((n) => n === 0),
    "closed oriented edges",
  );
  assert(volume > 0, "outward solid");
  for (const a of Object.values(g.attributes))
    assert(a.array.every(Number.isFinite));
}

test("eight forge bay assemblies have closed fittings within the existing exterior wall clearance", () => {
  const materials = Object.fromEntries(
    ["dark", "metal", "trim", "chamberInset"].map((k) => [
      k,
      new THREE.MeshStandardMaterial(),
    ]),
  );
  const kinds = new Set();
  let parts = 0,
    triangles = 0;
  try {
    for (let stage = 0; stage < 8; stage++) {
      const plan = forgeWallPlan(13, stage),
        root = new THREE.Group();
      kinds.add(plan.kind);
      const contour = forgeBayContour(plan);
      assert(
        THREE.ShapeUtils.area(contour.map((p) => new THREE.Vector2(...p))) > 0,
      );
      buildForgeWallBay(plan, 0, 0, materials, (g, m, x, y, z) => {
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set(x, y, z);
        root.add(mesh);
        return mesh;
      });
      root.updateMatrixWorld(true);
      for (const mesh of root.children) {
        closed(mesh.geometry);
        const box = new THREE.Box3().setFromObject(mesh);
        assert(
          box.min.x >= -plan.radius - 0.2 && box.max.x <= plan.radius + 0.2,
          mesh.name,
        );
        assert(
          box.min.y >= plan.bottom - 0.15 && box.max.y <= plan.top + 0.12,
          mesh.name,
        );
        assert(box.min.z >= -0.14 && box.max.z <= 0.64, mesh.name);
        parts++;
        triangles +=
          (mesh.geometry.index?.count ??
            mesh.geometry.attributes.position.count) / 3;
        mesh.geometry.dispose();
      }
    }
    assert.equal(kinds.size, 8);
    assert(parts > 250 && triangles < 40000);
  } finally {
    Object.values(materials).forEach((m) => m.dispose());
  }
});

test("all 24 built forge wall faces retain sealed bays, dressed surrounds and camera backing", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[4],
    m = gateMaterials(level),
    ray = new THREE.Raycaster();
  const materials = Object.values(m).filter((v) => v?.isMaterial),
    textures = new Set(
      materials.flatMap((m) => Object.values(m).filter((v) => v?.isTexture)),
    );
  t.after(() => {
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  });
  let bays = 0,
    probes = 0;
  for (let stage = 0; stage < 8; stage++)
    for (const side of [-1, 0, 1]) {
      const root = new THREE.Group(),
        game = { level, cameraSurfaces: new CameraSurfaces(root) },
        gate = { stage, root, design: m.design };
      const wall = buildChamberWall(game, gate, m, {
        length: side === 0 ? 13 : 13.8,
        side,
        floor: 0,
      });
      root.updateMatrixWorld(true);
      game.cameraSurfaces.rebuild();
      const matrix = new THREE.Matrix4().makeRotationY(wall.angle);
      matrix.setPosition(...wall.position);
      const point = (x, y, z) =>
          new THREE.Vector3(x, y, z).applyMatrix4(matrix),
        direction = new THREE.Vector3(0, 0, -1).transformDirection(matrix);
      for (const cx of wall.bays) {
        const contour = forgeBayContour(wall),
          shape = contour.map((p) => new THREE.Vector2(...p));
        // Ray the full face, including the spaces between the changed fittings.
        // The backing must be real geometry rather than an opaque front image.
        for (const dx of [-0.86, -0.6, -0.2, 0.2, 0.6, 0.86])
          for (const t of [0.14, 0.32, 0.5, 0.68, 0.86]) {
            const x = cx + wall.radius * dx,
              y = wall.bottom + (wall.top - wall.bottom) * t,
              start = point(x, y, 2);
            ray.set(start, direction);
            const hit = ray.intersectObject(root, true)[0];
            assert(
              hit && hit.distance < 2.2,
              `sealed ${stage}/${side}/${cx}/${dx}/${t}`,
            );
            assert(
              game.cameraSurfaces.entry(start, point(x, y, -1), 0) < 1,
              "camera backing",
            );
            probes++;
          }
        // The midpoint of every perimeter edge belongs to a physical surround.
        for (let i = 0; i < shape.length; i++) {
          const a = shape[i],
            b = shape[(i + 1) % shape.length];
          ray.set(point(cx + (a.x + b.x) / 2, (a.y + b.y) / 2, 2), direction);
          const hit = ray.intersectObject(root, true)[0];
          assert(hit && hit.distance < 1.75, "attached surround");
        }
        bays++;
      }
      root.traverse((o) => o.geometry?.dispose());
    }
  assert.equal(bays, 63);
  assert.equal(probes, 1890);
});
