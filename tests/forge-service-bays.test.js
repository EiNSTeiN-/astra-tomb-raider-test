import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildForgeServiceBay } from "../src/forge-service-bays.js";
import { forgeWallPlan, forgeBayContour } from "../src/forge-wall-art.js";
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

function samples(mesh) {
  const g = mesh.geometry,
    p = g.attributes.position,
    edges = [],
    points = [];
  for (let i = 0; i < (g.index?.count ?? p.count); i += 3) {
    const triangle = [0, 1, 2].map((j) =>
      new THREE.Vector3()
        .fromBufferAttribute(p, g.index ? g.index.getX(i + j) : i + j)
        .applyMatrix4(mesh.matrixWorld),
    );
    points.push(...triangle);
    for (let j = 0; j < 3; j++)
      edges.push([triangle[j], triangle[(j + 1) % 3]]);
  }
  return { points, edges, bounds: new THREE.Box3().setFromObject(mesh) };
}

test("neighbouring cast plates shift the wear pattern without stretching it or changing their construction", () => {
  const m = Object.fromEntries(
    ["metal", "trim", "dark"].map((k) => [k, new THREE.MeshStandardMaterial()]),
  );
  try {
    for (let stage = 0; stage < 8; stage++) {
      const roots = [0, 1].map((bay) => {
        const root = new THREE.Group();
        buildForgeServiceBay(
          forgeWallPlan(13, stage),
          0,
          bay,
          m,
          (g, material, x, y, z) => {
            const mesh = new THREE.Mesh(g, material);
            mesh.position.set(x, y, z);
            root.add(mesh);
            return mesh;
          },
        );
        return root;
      });
      const [a, b] = roots.map((root) => root.children[0].geometry);
      assert.deepEqual(
        a.attributes.position.array,
        b.attributes.position.array,
      );
      assert.deepEqual(a.attributes.normal.array, b.attributes.normal.array);
      for (let i = 0; i < a.attributes.uv.count; i++) {
        assert(
          Math.abs(b.attributes.uv.getX(i) - a.attributes.uv.getX(i) - 0.37) <
            1e-6,
        );
        assert(
          Math.abs(b.attributes.uv.getY(i) - a.attributes.uv.getY(i) - 0.23) <
            1e-6,
        );
      }
      roots.forEach((root) => root.traverse((o) => o.geometry?.dispose()));
    }
  } finally {
    Object.values(m).forEach((m) => m.dispose());
  }
});

function connected(meshes) {
  const data = meshes.map(samples),
    ray = new THREE.Raycaster(),
    direction = new THREE.Vector3(1, 0.173, 0.211).normalize();
  function inside(point, mesh, bounds) {
    if (!bounds.containsPoint(point)) return false;
    ray.set(point, direction);
    ray.far = Infinity;
    const hit = ray.intersectObject(mesh, false)[0];
    return (
      hit &&
      hit.face.normal
        .clone()
        .transformDirection(mesh.matrixWorld)
        .dot(direction) > 0
    );
  }
  function crosses(source, target) {
    for (const [a, b] of source.edges) {
      const d = b.clone().sub(a),
        length = d.length();
      if (length < 1e-9) continue;
      ray.set(a, d.divideScalar(length));
      ray.far = length;
      if (ray.intersectObject(target, false).length) return true;
    }
    return false;
  }
  function touch(a, b) {
    if (!data[a].bounds.intersectsBox(data[b].bounds)) return false;
    return (
      data[a].points.some((p) => inside(p, meshes[b], data[b].bounds)) ||
      data[b].points.some((p) => inside(p, meshes[a], data[a].bounds)) ||
      crosses(data[a], meshes[b]) ||
      crosses(data[b], meshes[a])
    );
  }
  const attached = new Set([0]);
  for (let previous = -1; previous !== attached.size;) {
    previous = attached.size;
    for (let i = 1; i < meshes.length; i++)
      if (!attached.has(i) && [...attached].some((j) => touch(i, j)))
        attached.add(i);
  }
  return attached;
}

test("eight service-cover designs form closed, connected construction inside the old inner bay and sill", () => {
  const m = Object.fromEntries(
    ["metal", "trim", "dark"].map((k) => [
      k,
      new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
    ]),
  );
  let parts = 0,
    triangles = 0,
    controls = 0;
  try {
    for (let stage = 0; stage < 8; stage++) {
      const plan = forgeWallPlan(13, stage),
        root = new THREE.Group();
      buildForgeServiceBay(plan, 0, 2, m, (g, material, x, y, z) => {
        const mesh = new THREE.Mesh(g, material);
        mesh.position.set(x, y, z);
        root.add(mesh);
        return mesh;
      });
      root.updateMatrixWorld(true);
      const contour = forgeBayContour(plan).map(
        ([x, y]) => new THREE.Vector2(x * 0.72, 1.45 + (y - 1.2) * 0.76),
      );
      for (const mesh of root.children) {
        closed(mesh.geometry);
        for (const point of samples(mesh).points) {
          assert(
            point.z >= -0.57 && point.z <= -0.4105,
            `${mesh.name}: old depth reservation`,
          );
          assert(THREE.ShapeUtils.isClockWise(contour) === false);
          // Polygon winding query independent of the cover's own silhouette.
          let winding = false;
          for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
            const a = contour[i],
              b = contour[j];
            if (
              a.y > point.y !== b.y > point.y &&
              point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
            )
              winding = !winding;
          }
          assert(winding, `${mesh.name}: fitting escapes the existing frame`);
        }
        parts++;
        triangles +=
          (mesh.geometry.index?.count ??
            mesh.geometry.attributes.position.count) / 3;
      }
      const cover = new THREE.Box3().setFromObject(root.children[0]);
      assert(
        cover.min.z < -0.4655 && cover.max.z > -0.4655,
        "cover enters the delivered panel face",
      );
      assert.equal(
        connected(root.children).size,
        root.children.length,
        `unattached ${plan.kind} part`,
      );
      const bolt = root.children.find((m) => m.name.endsWith("cover bolt"));
      bolt.position.z -= 0.2;
      root.updateMatrixWorld(true);
      assert(
        !connected(root.children).has(root.children.indexOf(bolt)),
        "lifted fastener control must be detached",
      );
      controls++;
      root.children.forEach((mesh) => mesh.geometry.dispose());
    }
    assert(triangles < 25000, "bounded added geometry");
    assert.equal(controls, 8);
    console.log(
      `${parts} closed parts, ${triangles} triangles, ${controls} lifted controls`,
    );
  } finally {
    Object.values(m).forEach((m) => m.dispose());
  }
});

test("all 21 delivered inner service bays retain sealed backs and camera contact after batching", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const m = gateMaterials(LEVELS[4]),
    ray = new THREE.Raycaster();
  t.after(() => {
    const textures = new Set();
    for (const mat of Object.values(m).filter((v) => v?.isMaterial)) {
      for (const value of Object.values(mat))
        if (value?.isTexture) textures.add(value);
      mat.dispose();
    }
    textures.forEach((t) => t.dispose());
  });
  let bays = 0;
  for (let stage = 0; stage < 8; stage++) {
    const root = new THREE.Group(),
      game = { level: LEVELS[4], cameraSurfaces: new CameraSurfaces(root) },
      gate = { stage, root, design: m.design };
    const wall = buildChamberWall(game, gate, m, {
      length: 13,
      side: 0,
      floor: 0,
    });
    root.updateMatrixWorld(true);
    game.cameraSurfaces.rebuild();
    const frame = new THREE.Matrix4()
        .makeRotationY(wall.angle)
        .setPosition(...wall.position),
      inverse = frame.clone().invert();
    assert.equal(wall.serviceBays.length, wall.bays.length);
    for (const [i, cx] of wall.bays.entries()) {
      const service = wall.serviceBays[i],
        y = (service.bottom + service.top) / 2,
        from = new THREE.Vector3(cx, y, -1).applyMatrix4(frame),
        to = new THREE.Vector3(cx, y, 0).applyMatrix4(frame);
      ray.set(from, to.clone().sub(from).normalize());
      ray.far = 1;
      const hit = ray.intersectObject(root, true)[0];
      assert(hit);
      const z = hit.point.clone().applyMatrix4(inverse).z;
      assert(
        z < -0.48 && z >= -0.57,
        "raised fitting is delivered in front of the old panel",
      );
      assert.notEqual(hit.object.material, m.chamberInset);
      assert(
        Math.abs(game.cameraSurfaces.entry(from, to, 0) - hit.distance) < 1e-5,
      );
      bays++;
    }
    root.traverse((o) => o.geometry?.dispose());
  }
  assert.equal(bays, 21);
});
