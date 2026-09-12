import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createRuinRoot } from "../src/ruin-roots.js";
import { buildRuinGrowth } from "../src/ruin-growth.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";

const vertexKey = (x, y, z) => [x, y, z].map((v) => v.toFixed(5)).join(",");

test("ruin roots have closed, outward-facing ends and bury their tapered soil entry on slopes", () => {
  const points = [
    new THREE.Vector3(0, 0.08, 0),
    new THREE.Vector3(2, 0.8, 0),
    new THREE.Vector3(3, 3.3, 0.3),
    new THREE.Vector3(3.4, 6.3, 0),
    new THREE.Vector3(3.3, 8.8, 0.2),
  ];
  const original = points.map((p) => p.toArray());
  for (const ground of [() => 0, (x, z) => x * 0.2 - z * 0.6]) {
    const { curve, geometry, ring } = createRuinRoot(points, 0.2, ground);
    assert.deepEqual(
      points.map((p) => p.toArray()),
      original,
    );
    assert.deepEqual(
      curve.points.slice(1).map((p) => p.toArray()),
      original.slice(1),
    );
    assert(ring.every(([x, y, z]) => y < ground(x, z) - 0.1));
    for (const a of Object.values(geometry.attributes))
      assert(a.array.every(Number.isFinite));
    const p = geometry.attributes.position,
      idx = geometry.index,
      edges = new Map();
    let volume = 0;
    for (let i = 0; i < idx.count; i += 3) {
      const ids = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)],
        vertices = ids.map((j) =>
          new THREE.Vector3().fromBufferAttribute(p, j),
        );
      const [a, b, c] = vertices;
      assert(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-13);
      volume += a.dot(b.clone().cross(c)) / 6;
      for (let j = 0; j < 3; j++) {
        const key = [
          vertexKey(...vertices[j].toArray()),
          vertexKey(...vertices[(j + 1) % 3].toArray()),
        ]
          .sort()
          .join("|");
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    assert(volume > 0);
    assert(
      [...edges.values()].every((n) => n === 2),
      "an open seam or end remains",
    );
    assert.equal(idx.count / 3, 660);
    for (const end of [0, 1]) {
      const start = idx.count - 60 + end * 30,
        [a, b, c] = [0, 1, 2].map((offset) =>
          new THREE.Vector3().fromBufferAttribute(p, idx.getX(start + offset)),
        ),
        normal = b.sub(a).cross(c.sub(a)).normalize();
      assert(normal.dot(curve.getTangentAt(end)) * (end ? 1 : -1) > 0.99);
    }
    // The narrow end grows into the full root within its first sixth.
    const end = curve.getPointAt(0),
      middle = curve.getPointAt(8 / 32);
    assert(
      Math.abs(
        new THREE.Vector3().fromBufferAttribute(p, 0).distanceTo(end) - 0.05,
      ) < 1e-6,
    );
    assert(
      Math.abs(
        new THREE.Vector3().fromBufferAttribute(p, 8 * 11).distanceTo(middle) -
          0.2,
      ) < 1e-6,
    );
    geometry.dispose();
  }
});

test("all 54 soil entry rings remain buried and present in the merged nine-court world", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[0],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    game = {
      level,
      map,
      terrainProfile,
      groundHeight: terrainProfile.height,
      world: new THREE.Group(),
    };
  buildRuinGrowth(game);
  assert.equal(game.growthPatches.length, 9);
  let roots = 0;
  for (const patch of game.growthPatches) {
    assert.equal(
      patch.rootGroup.children.length,
      1,
      "root wood remains one material batch",
    );
    const p = patch.rootGroup.children[0].geometry.attributes.position,
      vertices = new Set();
    for (let i = 0; i < p.count; i++)
      vertices.add(vertexKey(p.getX(i), p.getY(i), p.getZ(i)));
    for (const root of patch.roots) {
      assert.equal(root.ring.length, 11);
      for (const [x, y, z] of root.ring) {
        assert(
          y < game.groundHeight(x, z) - 0.1,
          `exposed root cut at ${x},${z}`,
        );
        assert(
          vertices.has(vertexKey(x, y, z)),
          "the inspected endpoint was lost during batching",
        );
      }
      roots++;
    }
  }
  assert.equal(roots, 54);
  game.world.traverse((o) => o.geometry?.dispose());
});
