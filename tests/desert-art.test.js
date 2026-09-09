import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  archStoneGeometry,
  solarPanelGeometry,
  pointedArchHeight,
  desertPlan,
  buildDesertArchitecture,
  updateDesertArchitecture,
} from "../src/desert-architecture.js";
import {
  palmGeometry,
  desertPalmLayout,
  PALM_RANGES,
  updateDesertPalms,
} from "../src/desert-palms.js";
import { createLodPatch } from "../src/instance-lod.js";

const triangles = (g) => (g.index?.count ?? g.attributes.position.count) / 3;

test("arch stones are closed, consistently wound, reproducible solids on both sides of the opening", () => {
  for (const side of [-1, 1])
    for (const part of [0, 5, 11]) {
      const args = [
        3.75,
        0.62,
        2.35,
        side,
        part / 12 + 0.002,
        (part + 1) / 12 - 0.002,
      ];
      const g = archStoneGeometry(...args),
        copy = archStoneGeometry(...args),
        p = g.attributes.position;
      assert.deepEqual(p.array, copy.attributes.position.array);
      assert.ok(p.array.every(Number.isFinite));
      assert.ok(g.attributes.normal.array.every(Number.isFinite));
      const edges = new Map();
      const vertex = (i) =>
        [p.getX(i), p.getY(i), p.getZ(i)].map((x) => x.toFixed(5)).join(",");
      let volume = 0;
      for (let i = 0; i < p.count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(p, i),
          b = new THREE.Vector3().fromBufferAttribute(p, i + 1),
          c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
        volume += a.dot(b.cross(c)) / 6;
        for (let j = 0; j < 3; j++) {
          const key = [vertex(i + j), vertex(i + ((j + 1) % 3))]
            .sort()
            .join("|");
          edges.set(key, (edges.get(key) || 0) + 1);
        }
      }
      assert.ok(volume > 0.02, "outward winding encloses positive volume");
      assert.ok(
        [...edges.values()].every((n) => n === 2),
        "every boundary is sealed",
      );
      g.dispose();
      copy.dispose();
    }
});

test("all ten desert courts have distinct authored plans, open crossing axes and clear feature approaches", () => {
  const map = createMap(LEVELS[1]),
    plans = new Set();
  for (const room of map.rooms) {
    const plan = desertPlan(room);
    plans.add(JSON.stringify(plan));
    for (const pier of plan.piers) {
      assert.ok(
        Math.abs(pier.x) - pier.width / 2 > 3,
        "north/south axis has six metres of clearance",
      );
      assert.ok(
        Math.abs(pier.z) - pier.width / 2 > 3,
        "east/west axis has six metres of clearance",
      );
      for (const feature of map.features) {
        const dx = Math.abs(feature.x * 7 - room.x * 7 - pier.x),
          dz = Math.abs(feature.z * 7 - room.z * 7 - pier.z);
        assert.ok(
          dx > (pier.width + 0.25) / 2 + 2 || dz > (pier.width + 0.25) / 2 + 2,
          `${feature.id} remains approachable in court ${room.index}`,
        );
      }
    }
    for (const span of plan.spans)
      assert.ok(
        Math.hypot(span.b.x - span.a.x, span.b.z - span.a.z) - 2.6 >= 3.4,
      );
  }
  assert.equal(plans.size, 10);
});

test("built court collision leaves its arch open while blocking piers and overhead masonry", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const world = new THREE.Group(),
    level = LEVELS[1],
    map = createMap(level);
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    world,
    groundHeight: () => 0,
    obstacles: [],
    cameraSurfaces: new CameraSurfaces(world),
    store: { data: { settings: { quality: "high" } } },
    player: { position: new THREE.Vector3() },
  });
  assert.equal(buildDesertArchitecture(game), true);
  game.cameraSurfaces.rebuild();
  assert.equal(game.desertPatches.length, 10);
  assert.ok(
    game.cameraSurfaces.count < 3600,
    `camera bounds ${game.cameraSurfaces.count}`,
  );
  for (const [i, patch] of game.desertPatches.entries()) {
    const room = map.rooms[i],
      x = room.x * 7,
      z = room.z * 7;
    assert.ok(
      patch.root.children.length <= 2,
      "masonry draws batch by material per court",
    );
    assert.ok(
      patch.triangles < 41000,
      "structural geometry stays within its per-court budget",
    );
    for (const [dx, dz] of [
      [0, 0],
      [0, 14],
      [0, -18],
      [19, 0],
      [-19, 0],
    ])
      assert.ok(
        game.canMove(x + dx, z + dz, 0),
        `court ${i}: clear approach ${dx},${dz}`,
      );
    const clear = game.cameraSurfaces.entry(
      new THREE.Vector3(x, 2, z - 15),
      new THREE.Vector3(x, 2, z - 21),
    );
    assert.equal(clear, 1, `court ${i}: camera passes under central arch`);
    const archY = patch.plan.spring + pointedArchHeight(3.75, 0) + 0.35;
    assert.ok(
      game.cameraSurfaces.entry(
        new THREE.Vector3(x, archY, z - 15),
        new THREE.Vector3(x, archY, z - 21),
      ) < 1,
      `court ${i}: camera hits the arch crown`,
    );
    assert.ok(
      game.cameraSurfaces.entry(
        new THREE.Vector3(x + 5, 2, z - 15),
        new THREE.Vector3(x + 5, 2, z - 21),
      ) < 1,
      `court ${i}: camera hits the pier`,
    );
    assert.equal(game.canMove(x + 5, z - 18, 0), false);
  }
  game.player.position.copy(game.desertPatches[0].detailBounds.center);
  updateDesertArchitecture(game);
  assert.equal(game.desertPatches[0].detail.visible, true);
  game.player.position.set(-500, 0, -500);
  updateDesertArchitecture(game);
  assert.equal(game.desertPatches[0].detail.visible, false);
  assert.equal(
    game.desertPatches[0].root.visible,
    true,
    "detail culling retains structure and collision",
  );
  const geometries = new Set(),
    materials = new Set();
  world.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) materials.add(o.material);
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => {
    m.map?.dispose();
    m.normalMap?.dispose();
    m.roughnessMap?.dispose();
    m.dispose();
  });
});

test("solar panels retain physical carving depth and three different ray patterns", () => {
  const panels = [0, 1, 2].map((variant) =>
    solarPanelGeometry(3, 2.5, variant),
  );
  for (const g of panels) {
    g.computeBoundingBox();
    assert.ok(g.boundingBox.max.z - g.boundingBox.min.z > 0.13);
    assert.ok(g.attributes.normal.array.every(Number.isFinite));
  }
  assert.notDeepEqual(
    panels[0].attributes.position.array,
    panels[1].attributes.position.array,
  );
  assert.notDeepEqual(
    panels[1].attributes.position.array,
    panels[2].attributes.position.array,
  );
  panels.forEach((g) => g.dispose());
});

test("palm tiers preserve crown shape, remain finite, and reduce geometry at each distance", () => {
  for (let variant = 0; variant < 3; variant++) {
    const tiers = [0, 1, 2].map((tier) => palmGeometry(variant, tier)),
      budgets = [29200, 8600, 3000];
    let previous = Infinity;
    for (let tier = 0; tier < 3; tier++) {
      const { trunk, foliage } = tiers[tier],
        count = triangles(trunk) + triangles(foliage);
      assert.ok(count <= budgets[tier] && count < previous);
      previous = count;
      for (const g of [trunk, foliage]) {
        assert.ok(g.attributes.position.array.every(Number.isFinite));
        assert.ok(g.attributes.normal.array.every(Number.isFinite));
        g.computeBoundingBox();
      }
      assert.ok(
        Math.abs(
          foliage.boundingBox.max.y - tiers[0].foliage.boundingBox.max.y,
        ) < 0.12,
      );
      assert.ok(
        foliage.boundingBox.min.y > 5,
        "leaflets stay attached to the elevated crown",
      );
    }
    tiers.forEach(({ trunk, foliage }) => {
      trunk.dispose();
      foliage.dispose();
    });
  }
});

test("seventy palm placements are reproducible, grounded, separated, and outside traversable map cells", () => {
  const level = LEVELS[1],
    map = createMap(level),
    ground = (x, z) => x * 0.01 + z * 0.005;
  const layout = desertPalmLayout(map, ground, level.seed);
  assert.equal(layout.length, 70);
  assert.deepEqual(layout, desertPalmLayout(map, ground, level.seed));
  for (const [i, p] of layout.entries()) {
    assert.equal(map.grid[p.z / 7][p.x / 7], 0);
    assert.equal(p.y, ground(p.x, p.z) - 0.35);
    for (const other of layout.slice(i + 1))
      assert.ok(Math.hypot(other.x - p.x, other.z - p.z) >= 9);
  }
});

test("palms select detail using horizontal distance, crossfade, and clear beyond the chapter's draw range", () => {
  const material = new THREE.MeshStandardMaterial(),
    geometries = [0, 1, 2].map(() => new THREE.BoxGeometry(1, 1, 1));
  const position = new THREE.Vector3(0, 10, 0),
    matrix = new THREE.Matrix4().makeTranslation(...position.toArray());
  const patch = createLodPatch(
    new THREE.Group(),
    geometries.map((geometry) => [{ geometry, material }]),
    [matrix],
    [position],
    { planar: true },
  );
  const game = {
    palmPatches: [patch],
    player: { position: new THREE.Vector3(0, 80, 0) },
    store: { data: { settings: { quality: "high" } } },
    palmWind: { value: 0 },
    elapsed: 7,
  };
  updateDesertPalms(game);
  assert.deepEqual(patch.counts, [1, 0, 0]);
  assert.equal(game.palmWind.value, 7);
  game.player.position.x = PALM_RANGES.high[0] + 5;
  updateDesertPalms(game, 0.1);
  assert.deepEqual(patch.counts, [1, 1, 0]);
  updateDesertPalms(game, 0.2);
  assert.deepEqual(patch.counts, [0, 1, 0]);
  game.player.position.x = PALM_RANGES.high[2] + 5;
  updateDesertPalms(game, 0);
  assert.deepEqual(patch.counts, [0, 0, 0]);
  for (const tier of patch.tiers)
    for (const mesh of tier) {
      mesh.geometry.dispose();
      mesh.customDepthMaterial.dispose();
    }
  geometries.forEach((g) => g.dispose());
  material.dispose();
});
