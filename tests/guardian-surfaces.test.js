import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  guardianPauldronGeometry,
  guardianSurfaceData,
} from "../src/guardian-surfaces.js";
import { buildGuardian } from "../src/combat.js";
import { LEVELS } from "../src/campaign.js";

test("guardian shoulder castings are closed, outward facing and stay inside the armor envelope", () => {
  for (const detail of [false, true])
    for (const side of [-1, 1])
      for (let layer = 0; layer < 3; layer++) {
        const g = guardianPauldronGeometry(detail, layer, side),
          p = g.attributes.position,
          indices = g.index.array,
          edges = new Map();
        let volume = 0;
        const a = new THREE.Vector3(),
          b = new THREE.Vector3(),
          c = new THREE.Vector3();
        for (let i = 0; i < indices.length; i += 3) {
          a.fromBufferAttribute(p, indices[i]);
          b.fromBufferAttribute(p, indices[i + 1]);
          c.fromBufferAttribute(p, indices[i + 2]);
          volume += a.dot(b.clone().cross(c)) / 6;
          assert(b.clone().sub(a).cross(c.clone().sub(a)).length() > 1e-8);
          for (let j = 0; j < 3; j++) {
            const x = indices[i + j],
              y = indices[i + ((j + 1) % 3)],
              key = [Math.min(x, y), Math.max(x, y)].join(",");
            edges.set(key, (edges.get(key) || 0) + 1);
          }
        }
        assert(volume > 0.025 && volume < 0.11);
        assert([...edges.values()].every((v) => v === 2));
        assert(g.attributes.normal.array.every(Number.isFinite));
        assert(g.boundingBox.min.y >= -0.16);
        assert(g.boundingBox.max.y <= 0.17);
        assert(g.boundingBox.max.x <= 0.336);
        assert(g.boundingBox.max.z <= 0.326);
        g.dispose();
      }
});

test("deposits distinguish sheltered ledges and feet from exposed armor without nonfinite masks", () => {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 2, 0);
  guardianSurfaceData(g);
  const n = g.attributes.normal,
    w = g.attributes.guardianSurface;
  for (let i = 0; i < n.count; i++) {
    assert(w.getX(i) >= 0 && w.getX(i) <= 1);
    assert(w.getY(i) >= 0 && w.getY(i) <= 1);
    if (n.getY(i) > 0.9) {
      assert.equal(w.getX(i), 0);
      assert(w.getY(i) > 0.7);
    }
    if (n.getY(i) < -0.9) assert(w.getX(i) > 0.65);
  }
  const foot = new THREE.BoxGeometry(0.3, 0.2, 0.4);
  guardianSurfaceData(foot);
  assert(foot.attributes.guardianSurface.getX(0) > 0.3);
  g.dispose();
  foot.dispose();
});

test("both guardian detail tiers retain finite surface data bound to the actual skinned vertices", () => {
  const game = {
    world: new THREE.Group(),
    stoneMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    groundHeight: () => 0,
    rng: () => 0.5,
    level: LEVELS[0],
  };
  for (const kind of ["warden", "hunter", "sentry", "bulwark"]) {
    const e = buildGuardian(game, { id: kind, kind, x: 0, z: 0 });
    for (const tier of e.art.tiers)
      for (const g of tier) {
        const w = g.attributes.guardianSurface;
        assert.equal(w.count, g.attributes.position.count);
        assert(w.array.every(Number.isFinite));
        assert(w.array.every((v) => v >= 0 && v <= 1));
      }
    const before = e.art.tiers[0][0].attributes.guardianSurface.array.slice();
    e.art.bones.LeftArm.rotation.z = 0.8;
    e.group.updateMatrixWorld(true);
    assert.deepEqual(
      e.art.tiers[0][0].attributes.guardianSurface.array,
      before,
    );
  }
});
