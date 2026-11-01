import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { desertRouteDistance } from "../src/desert-geology.js";
import { rockGroundHeight, natureRockAllowed } from "../src/nature-rocks.js";
import { stoneFootprint } from "../src/stone-grounding.js";
import {
  scoriaGeometry,
  volcanicMantleLayout,
  buildVolcanicMantle,
} from "../src/volcanic-mantle.js";

const level = LEVELS[4],
  map = createMap(level),
  profile = createTerrainProfile(map, level);
const game = () => ({
  level,
  map,
  terrainProfile: profile,
  obstacles: [],
  world: new THREE.Group(),
  darkMat: new THREE.MeshStandardMaterial(),
  naturePatches: [],
});

test("scoria deposits reserve their complete footprints beyond walking cells and working sites", () => {
  const g = game(),
    before = JSON.stringify(map),
    fragments = volcanicMantleLayout(g);
  assert(fragments.length > 1000);
  assert.deepEqual(volcanicMantleLayout(g), fragments);
  for (const fragment of fragments) {
    assert(
      desertRouteDistance(map, fragment.x, fragment.z) >= fragment.radius + 2.8,
    );
    assert(natureRockAllowed(g, fragment.x, fragment.z, fragment.radius));
    assert(profile.court(fragment.x, fragment.z) <= 0.18);
    assert(fragment.size > 0 && fragment.size < 1.48);
  }
  assert.equal(JSON.stringify(map), before);
  assert.deepEqual(volcanicMantleLayout({ ...g, level: LEVELS[0] }), []);
  g.darkMat.dispose();
});

test("each scoria shape fits within the reserved footprint with finite closed triangle surfaces", () => {
  for (let variant = 0; variant < 12; variant++) {
    const geometry = scoriaGeometry(
        variant % 3,
        Math.floor(variant / 3) * 0.35,
      ),
      p = geometry.attributes.position;
    assert.equal(p.count / 3, 80);
    for (const n of p.array) assert(Number.isFinite(n));
    for (const n of geometry.attributes.normal.array)
      assert(Number.isFinite(n));
    assert.equal(geometry.boundingBox.min.y, 0);
    assert(geometry.boundingBox.max.y > 0.4);
    const bounds = geometry.boundingBox;
    assert(
      Math.hypot(
        Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
        Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)),
      ) < 1.55,
    );
    const edges = new Map();
    for (let i = 0; i < p.count; i += 3) {
      const keys = [0, 1, 2].map((j) =>
        [p.getX(i + j), p.getY(i + j), p.getZ(i + j)].join(","),
      );
      for (let j = 0; j < 3; j++) {
        const a = keys[j],
          b = keys[(j + 1) % 3],
          key = [a, b].sort().join("|"),
          count = edges.get(key) || [0, 0];
        count[0]++;
        count[1] += a < b ? 1 : -1;
        edges.set(key, count);
      }
    }
    assert(
      [...edges.values()].every(
        ([count, winding]) => count === 2 && winding === 0,
      ),
    );
    const shape = stoneFootprint(geometry, { edgeProbes: true });
    assert(shape.underside.length > 50);
    geometry.dispose();
  }
});

test("placed scoria has buried undersides and stable physical matrices separate from range compaction", () => {
  const g = game();
  buildVolcanicMantle(g);
  const { patches, stats } = g.volcanicMantle;
  assert(stats.placed > 500);
  assert.equal(
    stats.candidates,
    stats.placed + stats.reserved + stats.unsupported,
  );
  // Terrain fitting can leave an angle/form combination unused. More than the
  // three flat forms must survive, without exceeding the shared shape budget.
  assert(patches.length > 3 && patches.length <= 12);
  let checked = 0;
  for (const patch of patches) {
    assert.equal(patch.kind, "rock");
    assert(patch.volcanicMantle);
    const shape = stoneFootprint(patch.tiers[0][0].geometry, {
      edgeProbes: true,
    });
    for (let i = 0; i < patch.matrices.length; i += 13) {
      const matrix = new THREE.Matrix4().fromArray(
          new Float32Array(patch.matrices[i].elements),
        ),
        point = new THREE.Vector3();
      for (const root of shape.underside) {
        point.copy(root).applyMatrix4(matrix);
        assert(point.y - rockGroundHeight(profile, point.x, point.z) < 0.0001);
      }
      const p = shape.geometry.attributes.position,
        a = new THREE.Vector3(),
        b = a.clone(),
        c = a.clone(),
        u = a.clone(),
        v = a.clone();
      for (let face = 0; face < p.count; face += 3) {
        a.fromBufferAttribute(p, face);
        b.fromBufferAttribute(p, face + 1);
        c.fromBufferAttribute(p, face + 2);
        if (u.copy(b).sub(a).cross(v.copy(c).sub(a)).y >= -1e-8) continue;
        for (let j = 0; j <= 5; j++)
          for (let k = 0; k <= 5 - j; k++) {
            point
              .copy(a)
              .multiplyScalar(1 - (j + k) / 5)
              .addScaledVector(b, j / 5)
              .addScaledVector(c, k / 5)
              .applyMatrix4(matrix);
            assert(point.y - profile.surfaceHeight(point.x, point.z) < 0.0001);
          }
      }
      checked++;
    }
  }
  assert(checked > 50);
  const resources = new Set();
  g.world.traverse((o) => {
    for (const r of [o.geometry, o.material, o.customDepthMaterial])
      if (r) resources.add(r);
    if (o.isInstancedMesh) resources.add(o);
  });
  resources.forEach((r) => r.dispose());
  g.darkMat.dispose();
});
