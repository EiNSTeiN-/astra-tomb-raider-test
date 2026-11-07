import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  closedMeshReader,
  inspectExplorerSolids,
  poseSupportCandidates,
} from "../scripts/inspect-explorer-solids-browser.js";
import { supportAt } from "../src/character-motion.js";
import { stationSolid } from "../src/field-station-solids.js";

test("stationary-pose candidates preserve support inside their declared region, including wide remote caps and padded edges", () => {
  const full = { groundHeight: () => -10, obstacles: [] },
    root = new THREE.Group();
  for (let i = -12; i <= 12; i++) {
    root.position.set(i * 4, 0, (i % 3) * 3);
    stationSolid(
      full,
      { id: `station-${i}` },
      root,
      [i === 10 ? 90 : 2, 2, 2],
      [0, i % 4, 0],
      { supportRadius: i === -2 ? 1.3 : undefined },
    );
    full.obstacles.push({ x: i * 5, z: 1, w: 1, d: 1, h: 12, climbable: true });
  }
  const unknown = { fieldStation: "unknown", supportable: false };
  full.obstacles.push(unknown);
  const region = { min: { x: -3, z: -3 }, max: { x: 3, z: 3 } },
    candidates = poseSupportCandidates(full.obstacles, region),
    filtered = { ...full, obstacles: candidates };
  assert(candidates.length < full.obstacles.length / 2);
  assert(candidates.includes(unknown));
  assert(
    candidates.includes(
      full.obstacles.find((o) => o.x === 40 && o.fieldStation),
    ),
  );
  for (let i = 0; i < 600; i++)
    for (const radius of [0, 0.4]) {
      const x = (((i * 137) % 997) / 997) * 6 - 3,
        z = (((i * 251) % 991) / 991) * 6 - 3;
      assert.deepEqual(
        supportAt(filtered, x, z, 4, radius),
        supportAt(full, x, z, 4, radius),
      );
    }
});

test("delivered oblique winding distinguishes overlapping closed pieces, empty gaps and thin contacts after batching and translation", () => {
  const a = new THREE.BoxGeometry(2, 2, 2).toNonIndexed(),
    b = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
  b.translate(1, 0, 0);
  const geometry = mergeGeometries([a, b], false),
    material = new THREE.MeshBasicMaterial(),
    mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(20, 3, 30);
  mesh.rotation.y = 0.71;
  const read = closedMeshReader([mesh]),
    point = (x, y, z) =>
      new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld);
  assert.equal(read(point(-2, 0, 0)), null);
  assert.equal(read(point(4, 0, 0)), null);
  assert(Math.abs(read(point(-0.5, 0, 0)) - 0.5) < 1e-5);
  assert(Math.abs(read(point(0.5, 0, 0)) - 0.5) < 1e-5);
  assert(read(point(0, 0.995, 0)) < 0.006);
  for (const g of [a, b, geometry]) g.dispose();
  material.dispose();
});

test("a closed ring retains its real empty interior rather than its bounding box", () => {
  const shape = new THREE.Shape()
      .moveTo(-2, -2)
      .lineTo(2, -2)
      .lineTo(2, 2)
      .lineTo(-2, 2)
      .closePath(),
    hole = new THREE.Path()
      .moveTo(-1, -1)
      .lineTo(-1, 1)
      .lineTo(1, 1)
      .lineTo(1, -1)
      .closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 1,
      bevelEnabled: false,
    }),
    material = new THREE.MeshBasicMaterial(),
    mesh = new THREE.Mesh(geometry, material),
    read = closedMeshReader([mesh]);
  assert.equal(read(new THREE.Vector3(0, 0, 0.5)), null);
  assert(read(new THREE.Vector3(1.5, 0, 0.5)) > 0.49);
  assert.equal(read(new THREE.Vector3(3, 0, 0.5)), null);
  geometry.dispose();
  material.dispose();
});

test("bounds rejection preserves exact inside/outside classification of separated boxes in a rotated world frame", () => {
  const material = new THREE.MeshBasicMaterial(),
    root = new THREE.Group(),
    boxes = [-2, 2].map((x) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1), material);
      mesh.position.x = x;
      root.add(mesh);
      return mesh;
    });
  root.position.set(37, -4, 81);
  root.rotation.set(0.21, 0.73, -0.13);
  root.updateMatrixWorld(true);
  const read = closedMeshReader(boxes);
  for (let i = 0; i < 600; i++) {
    const local = new THREE.Vector3(
        ((i * 137) % 997) / 73 - 6.7,
        ((i * 251) % 991) / 131 - 3.7,
        ((i * 353) % 983) / 211 - 2.3,
      ),
      inside = [-2, 2].some(
        (x) =>
          Math.abs(local.x - x) < 1 &&
          Math.abs(local.y) < 1.5 &&
          Math.abs(local.z) < 0.5,
      ),
      depth = read(local.clone().applyMatrix4(root.matrixWorld));
    assert.equal(depth !== null, inside, `sample ${i}: ${local.toArray()}`);
    if (inside) assert(Number.isFinite(depth) && depth > 0);
  }
  assert.equal(closedMeshReader([])(new THREE.Vector3()), null);
  for (const mesh of boxes) mesh.geometry.dispose();
  material.dispose();
});

test("body records follow bone deformation and report real embedded vertices without changing source geometry", () => {
  const geometry = new THREE.BoxGeometry(2, 2, 2),
    material = new THREE.MeshBasicMaterial(),
    obstacle = new THREE.Mesh(geometry, material),
    bodyGeometry = new THREE.BufferGeometry();
  bodyGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([2, 0, 0, 2, 0.2, 0, 2, 0, 0.2], 3),
  );
  bodyGeometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(Array(12).fill(0), 4),
  );
  bodyGeometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  );
  const bone = new THREE.Bone(),
    mesh = new THREE.SkinnedMesh(bodyGeometry, material),
    avatar = new THREE.Group();
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  avatar.add(mesh);
  const game = { avatar, rig: { model: avatar } },
    read = closedMeshReader([obstacle]);
  assert.equal(inspectExplorerSolids(game, read).embedded, 0);
  bone.position.x = -2;
  const r = inspectExplorerSolids(game, read);
  assert.equal(r.samples, 3);
  assert.equal(r.embedded, 3);
  assert(r.deepest > 0.99);
  assert.equal(bodyGeometry.attributes.position.getX(0), 2);
  mesh.skeleton.dispose();
  geometry.dispose();
  bodyGeometry.dispose();
  material.dispose();
});
