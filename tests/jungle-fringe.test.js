import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createMap, LEVELS } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import {
  buildJungleFringe,
  jungleFringeGeometry,
  jungleFringeLayout,
  jungleFringeProfile,
} from "../src/jungle-fringe.js";

const level = LEVELS[0],
  map = createMap(level),
  profile = createTerrainProfile(map, level);
test("outer woodland is reproducible, diverse and entirely beyond the playable ground", () => {
  const trees = jungleFringeLayout(map, level, profile),
    fringe = jungleFringeProfile(map, profile);
  assert.deepEqual(trees, jungleFringeLayout(map, level, profile));
  assert(trees.length > 800 && trees.length < 1300);
  assert.equal(new Set(trees.map((t) => t.variant)).size, 2);
  for (const t of trees) {
    assert(fringe.distance(t.x, t.z) >= 9 && fringe.distance(t.x, t.z) <= 99);
    assert([t.x, t.y, t.z, t.rotation, t.scale].every(Number.isFinite));
    assert(t.scale > 1 && t.scale < 2.2);
  }
  for (const other of LEVELS.slice(1))
    assert.deepEqual(jungleFringeLayout(map, other, profile), []);
});

test("the four banks join the full terrain boundary and each other without holes or inverted faces", () => {
  const geometries = [0, 1, 2, 3].map((side) =>
    jungleFringeGeometry(map, profile, side),
  );
  const stride = Math.round((map.size * 7) / profile.step) + 1;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let side = 0; side < 4; side++) {
    const g = geometries[side],
      p = g.attributes.position,
      next = geometries[(side + 1) % 4].attributes.position;
    for (let i = 0; i < stride; i++)
      assert(Math.abs(p.getY(i) - profile.height(p.getX(i), p.getZ(i))) < 1e-5);
    for (let row = 0; row < p.count / stride; row++) {
      a.fromBufferAttribute(p, row * stride + stride - 1);
      b.fromBufferAttribute(next, row * stride);
      assert(a.distanceTo(b) < 1e-6);
    }
    for (let i = 0; i < g.index.count; i += 3) {
      a.fromBufferAttribute(p, g.index.getX(i));
      b.fromBufferAttribute(p, g.index.getX(i + 1));
      c.fromBufferAttribute(p, g.index.getX(i + 2));
      assert(b.sub(a).cross(c.sub(a)).y > 0);
    }
    for (const attr of Object.values(g.attributes))
      assert([...attr.array].every(Number.isFinite));
  }
  geometries.forEach((g) => g.dispose());
});

test("every outer tree sits on the actual bank triangles, and another biome clears the state", () => {
  const material = new THREE.MeshStandardMaterial(),
    world = new THREE.Group();
  const game = {
    map,
    level,
    terrainProfile: profile,
    terrainMeshes: [{ material }],
    world,
  };
  buildJungleFringe(game);
  const fringe = game.jungleFringe,
    ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  for (const tree of fringe.trees) {
    ray.ray.origin.set(tree.x, tree.y + 50, tree.z);
    const hit = ray.intersectObjects(fringe.root.children, false)[0];
    assert(hit);
    assert(Math.abs(hit.point.y - tree.y - 0.2) < 1e-6);
  }
  assert.equal(fringe.root.children.length, 4);
  game.level = LEVELS[1];
  buildJungleFringe(game);
  assert.equal(game.jungleFringe, null);
  fringe.root.traverse((o) => o.geometry?.dispose());
  material.dispose();
});
