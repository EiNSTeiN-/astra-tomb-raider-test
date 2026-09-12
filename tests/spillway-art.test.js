import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { spillwayGeometry } from "../src/spillway-art.js";
import { buildWaterfall, updateWaterfalls } from "../src/waterfall-effects.js";
import { createWaterSurface } from "../src/water-surface.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";

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
    // The trough is open; the new reservoir feeds it through three open ports.
    for (const x of [-2.25, -1.7, -0.6, 0, 0.6, 1.7, 2.25]) {
      assert.equal(cast(mesh, [x, 7.05, -5.1], [0, 0, 1], 1.55).length, 0);
      const bed = cast(mesh, [x, 8, -4.3], [0, -1, 0])[0];
      assert(Math.abs(bed.point.y - 6.89) < 1e-5);
    }
    for (const x of [-1.7, 0, 1.7])
      assert.equal(cast(mesh, [x, 7.07, -6.4], [0, 0, 1], 2).length, 0);
    for (const x of [-1.55, 0, 1.55]) {
      assert.equal(cast(mesh, [x, 7.05, -3.5], [0, 0, 1], 0.6).length, 0);
      const sill = cast(mesh, [x, 8, -3.27], [0, -1, 0])[0];
      assert(Math.abs(sill.point.y - 7.03) < 1e-5);
    }
    for (const x of [-2.28, -0.775, 0.775, 2.28])
      assert(
        cast(mesh, [x, 7.05, -3.5], [0, 0, 1], 0.6).length > 0,
        "raised crests separate the three spill channels",
      );
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

function gameFixture(level, site, profile) {
  const g = Object.assign(Object.create(Adventure.prototype), {
    level,
    world: new THREE.Group(),
    waterMeshes: [],
    waterfallEffects: [],
    obstacles: [],
    stoneMat: new THREE.MeshStandardMaterial(),
    groundHeight: profile ? (x, z) => profile.height(x, z) : () => 0,
    terrainProfile: profile,
    player: new THREE.Group(),
    elapsed: 12,
    store: { data: { settings: { quality: "high" } } },
  });
  g.cameraSurfaces = new CameraSurfaces(g.world);
  const basin = createWaterSurface(
    g,
    site || {
      id: "test",
      kind: "water",
      fall: 0,
      x: 10,
      z: 20,
      baseY: 0,
      width: 5,
      length: 6.2,
    },
  );
  buildWaterfall(g, site?.fall ?? 0, basin);
  g.cameraSurfaces.rebuild();
  return g;
}

test("deep cascades obstruct their service face and crown while drainage moves impact, spray and curtain together", () => {
  for (const level of [LEVELS[0], LEVELS[3], LEVELS[5]]) {
    const g = gameFixture(level),
      f = g.waterfallEffects[0],
      top = f.top;
    assert.equal(g.obstacles.length, 3);
    assert(g.cameraSurfaces.count > 4);
    assert(
      g.cameraSurfaces.entry(
        new THREE.Vector3(10, 3, 12),
        new THREE.Vector3(10, 3, 14),
      ) < 1,
      "the deep service face stops the camera",
    );
    assert(
      g.cameraSurfaces.entry(
        new THREE.Vector3(12.38, 7.88, 10),
        new THREE.Vector3(12.38, 7.88, 15),
      ) < 1,
      "the crown's support stops the camera",
    );
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

test("all nine cascade reservoirs have buried full-footprint foundations and open supplied headers", () => {
  let count = 0;
  for (const level of [LEVELS[0], LEVELS[3], LEVELS[5]]) {
    const map = createMap(level),
      profile = createTerrainProfile(map, level);
    for (const site of profile.waters.filter((s) => s.fall !== undefined)) {
      const g = gameFixture(level, site, profile),
        f = g.waterfallEffects[0],
        art = f.art,
        header = art.header;
      g.world.updateMatrixWorld(true);
      assert.equal(site.x, site.room.x * 7 - 12);
      for (const footing of art.footings)
        for (let ix = 0; ix <= 8; ix++)
          for (let iz = 0; iz <= 8; iz++) {
            const x =
                art.root.position.x + footing.x + (ix / 8 - 0.5) * footing.w,
              z = art.root.position.z + footing.z + (iz / 8 - 0.5) * footing.d;
            assert(
              profile.height(x, z) - (art.root.position.y + footing.bottom) >=
                0.17999,
              `${level.id}/${site.id}: foundation must enter the terrain across its footprint`,
            );
          }
      const nozzle = header.root.localToWorld(header.nozzle.clone()),
        jetBox = new THREE.Box3().setFromObject(header.jet),
        waterY = header.water.getWorldPosition(new THREE.Vector3()).y;
      assert(Math.abs(jetBox.max.y - nozzle.y) < 1e-5);
      assert(jetBox.min.y < waterY && jetBox.max.y > waterY);
      assert(waterY > f.flume.position.y);
      const ray = new THREE.Raycaster(
        nozzle.clone().add(new THREE.Vector3(0, -0.1, 0)),
        new THREE.Vector3(0, 1, 0),
        0,
        0.4,
      );
      assert.equal(
        ray
          .intersectObject(header.root, true)
          .filter((hit) => !hit.object.material.transparent).length,
        0,
        "the nozzle has an open bore rather than a closed end cap",
      );
      const geometries = new Set(),
        materials = new Set();
      g.world.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) materials.add(o.material);
      });
      for (const geometry of geometries) {
        assert(geometry.attributes.position.array.every(Number.isFinite));
        geometry.dispose();
      }
      materials.forEach((m) => m.dispose());
      count++;
    }
  }
  assert.equal(count, 9);
});

test("deep-reservoir foundations close the exposed gap beneath all three existing solids", () => {
  const g = gameFixture(LEVELS[3]);
  // Rebuild at the same water level over a deep, slightly sloped pool floor.
  g.groundHeight = (x, z) => -8 + 0.02 * x + 0.03 * z;
  g.cameraSurfaces = new CameraSurfaces(g.world);
  buildWaterfall(g, 3, g.waterMeshes[0]);
  g.cameraSurfaces.rebuild();
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
      assert(
        g.cameraSurfaces.entry(
          new THREE.Vector3(x + f.w / 2 + 1, y, z),
          new THREE.Vector3(x - f.w / 2 - 1, y, z),
        ) < 1,
        "the camera cannot pass through the submerged foundation",
      );
    }
  }
  assert(art.mesh.geometry.attributes.position.count / 3 < 20000);
});
