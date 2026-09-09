import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { spillwayGeometry } from "../src/spillway-art.js";
import { buildWaterfall, updateWaterfalls } from "../src/waterfall-effects.js";
import { createWaterSurface } from "../src/water-surface.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { LEVELS } from "../src/campaign.js";

function cast(mesh, origin, direction, far = 20) {
  mesh.updateMatrixWorld(true);
  return new THREE.Raycaster(
    new THREE.Vector3(...origin),
    new THREE.Vector3(...direction),
    0,
    far,
  ).intersectObject(mesh);
}

test("spillway masonry has an open feed channel, a lower overflow sill and supported climbable banks", () => {
  for (const seed of [0, 47, 183]) {
    const { geometry } = spillwayGeometry(seed),
      mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      );
    assert(geometry.attributes.position.array.every(Number.isFinite));
    assert(geometry.attributes.normal.array.every(Number.isFinite));
    assert(geometry.attributes.position.count / 3 < 15000);
    // Rays at the flowing waterline must clear the rear trough and front sill.
    for (const x of [-2.25, -1.7, -0.6, 0, 0.6, 1.7, 2.25]) {
      assert.equal(cast(mesh, [x, 7.05, -5.1], [0, 0, 1], 2).length, 0);
      const bed = cast(mesh, [x, 8, -4.3], [0, -1, 0])[0];
      assert(Math.abs(bed.point.y - 6.89) < 1e-5);
    }
    for (let i = 0; i < 8; i++) {
      const sill = cast(mesh, [-2.275 + i * 0.65, 8, -3.27], [0, -1, 0])[0];
      assert(Math.abs(sill.point.y - 7.03) < 1e-5);
    }
    for (const side of [-1, 1])
      for (let i = 0; i < 5; i++) {
        const top = cast(mesh, [side * 2.8, 2, -4.1 + i * 1.3], [0, -1, 0])[0];
        assert(
          Math.abs(top.point.y - 0.575) < 1e-5,
          "bank preserves its standing surface",
        );
      }
    geometry.dispose();
    mesh.material.dispose();
  }
});

function gameFixture(level) {
  const g = Object.assign(Object.create(Adventure.prototype), {
    level,
    world: new THREE.Group(),
    waterMeshes: [],
    waterfallEffects: [],
    obstacles: [],
    stoneMat: new THREE.MeshStandardMaterial(),
    groundHeight: () => 0,
    player: new THREE.Group(),
    elapsed: 12,
    store: { data: { settings: { quality: "high" } } },
  });
  g.cameraSurfaces = new CameraSurfaces(g.world);
  const basin = createWaterSurface(g, {
    id: "test",
    kind: "water",
    fall: 0,
    x: 10,
    z: 20,
    baseY: 0,
    width: 5,
    length: 6.2,
  });
  buildWaterfall(g, 0, basin);
  g.cameraSurfaces.rebuild();
  return g;
}

test("spillway replacement keeps camera and movement bounds while drainage moves impact, spray and curtain together", () => {
  for (const level of [LEVELS[0], LEVELS[3], LEVELS[5]]) {
    const g = gameFixture(level),
      f = g.waterfallEffects[0],
      top = f.top;
    assert.equal(g.obstacles.length, 3);
    assert.equal(g.cameraSurfaces.count, 4);
    assert(
      g.cameraSurfaces.entry(
        new THREE.Vector3(10, 3, 18),
        new THREE.Vector3(10, 3, 14),
      ) < 1,
    );
    assert.equal(
      g.cameraSurfaces.entry(
        new THREE.Vector3(14, 3, 18),
        new THREE.Vector3(14, 3, 14),
      ),
      1,
    );
    assert.equal(
      f.basin.material.userData.waterUniforms.impactHalfWidth.value,
      2.15,
    );
    for (const bottom of [0, -0.6, -1.8]) {
      f.basin.position.y = bottom;
      updateWaterfalls(g);
      assert.equal(f.top, top);
      assert.equal(f.flume.position.y, top);
      assert.equal(f.height.value, top - bottom);
      assert.equal(f.impact.position.y, bottom + 0.035);
      assert(f.sprays.every((p) => p.position.y === bottom));
      for (const c of f.curtains) {
        assert(Math.abs(c.position.y - (c.scale.y * 6.9) / 2 - bottom) < 1e-8);
        assert(Math.abs(c.position.y + (c.scale.y * 6.9) / 2 - top) < 1e-8);
      }
    }
    const geo = new Set(),
      mat = new Set();
    g.world.traverse((o) => {
      if (o.geometry) geo.add(o.geometry);
      if (o.material) mat.add(o.material);
    });
    geo.forEach((g) => g.dispose());
    mat.forEach((m) => m.dispose());
    g.stoneMat.dispose();
  }
});

test("deep-reservoir foundations close the exposed gap beneath all three existing solids", () => {
  const g = gameFixture(LEVELS[3]);
  // Rebuild at the same water level over a deep, slightly sloped pool floor.
  g.groundHeight = (x, z) => -8 + 0.02 * x + 0.03 * z;
  buildWaterfall(g, 3, g.waterMeshes[0]);
  const art = g.waterfallEffects[1].art;
  art.root.updateMatrixWorld(true);
  for (const f of art.footings) {
    const x = art.root.position.x + f.x,
      z = art.root.position.z + f.z;
    const ground = g.groundHeight(x, z);
    assert(art.root.position.y + f.bottom < ground - 0.17);
    for (const y of [
      ground + 0.12,
      ground + 1,
      art.root.position.y + f.top - 0.06,
    ]) {
      const hits = cast(art.mesh, [x + f.w / 2 + 1, y, z], [-1, 0, 0], f.w + 2);
      assert(
        hits.length > 0,
        "foundation face is present below the drained surface",
      );
    }
  }
  assert(art.mesh.geometry.attributes.position.count / 3 < 20000);
});
