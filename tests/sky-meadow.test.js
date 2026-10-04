import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  skyMeadowSpecimens,
  seatMeadowPlant,
  meadowPlantAllowed,
  buildSkyMeadow,
  updateSkyMeadow,
} from "../src/sky-meadow.js";
import { buildGroundCover } from "../src/groundcover.js";

const shapes = skyMeadowSpecimens();

test("alpine detail tiers retain leaf roots and seed heads inside their wind-expanded bounds", () => {
  assert.equal(shapes.length, 3);
  for (const shape of shapes) {
    const near = shape.tiers[0].attributes.position;
    let previous = Infinity;
    for (const geometry of shape.tiers) {
      const p = geometry.attributes.position,
        bend = geometry.attributes.meadowBend;
      assert.ok(p.count < previous);
      previous = p.count;
      for (const attribute of Object.values(geometry.attributes))
        assert.ok(attribute.array.every(Number.isFinite));
      for (let i = 0; i < p.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(p, i);
        assert.ok(point.y >= 0 && point.y < 1.06);
        assert.ok(bend.getX(i) >= 0 && bend.getX(i) <= 1);
        if (point.y === 0) assert.equal(bend.getX(i), 0);
        for (const direction of [-1, 1]) {
          const windy = point
            .clone()
            .add(new THREE.Vector3(direction * 0.11, 0, direction * 0.065));
          assert.ok(geometry.boundingBox.containsPoint(windy));
          assert.ok(geometry.boundingSphere.containsPoint(windy));
        }
      }
      // Lower tiers simplify curves but retain the tip positions. Seed heads
      // are actual closed meshes, included in the conservative reach radius.
      if (shape.variant !== 2) {
        const headVertices = [];
        for (let i = 0; i < p.count; i++)
          if (geometry.attributes.color.getX(i) > 0.4)
            headVertices.push(p.getY(i));
        assert.ok(headVertices.length >= 120);
        assert.ok(headVertices.every((y) => y > 0.3 && y < 1.06));
      }
    }
    assert.ok(shape.radius < 0.85 && shape.roots.length > 50);
    assert.ok(shape.height > (shape.variant === 2 ? 0.15 : 0.8));
    assert.ok(near.count > shape.tiers[2].attributes.position.count * 3);
  }
});

test("every tier's actual roots seat beneath independently raycast terrain triangles", () => {
  const step = 0.875,
    height = (x, z) =>
      4 + x * 0.065 - z * 0.05 + Math.sin(x * 2.2) * Math.cos(z * 1.7) * 0.07,
    geometry = new THREE.PlaneGeometry(step * 24, step * 24, 24, 24);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++)
    position.setY(i, height(position.getX(i), position.getZ(i)));
  const terrain = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  terrain.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(),
    worldPoint = new THREE.Vector3();
  let checked = 0;
  for (const shape of shapes)
    for (const yaw of [0, 0.71, 2.8])
      for (const size of [0.7, 1.2]) {
        const placed = seatMeadowPlant({ step, height }, shape, {
          x: 0.36,
          z: 1.27,
          size,
          yaw,
        });
        assert.ok(placed);
        for (const tier of shape.tiers) {
          const p = tier.attributes.position;
          for (let i = 0; i < p.count; i++) {
            if (tier.attributes.meadowBend.getX(i) !== 0) continue;
            worldPoint.fromBufferAttribute(p, i).applyMatrix4(placed.matrix);
            ray.set(
              new THREE.Vector3(worldPoint.x, 20, worldPoint.z),
              new THREE.Vector3(0, -1, 0),
            );
            const hit = ray.intersectObject(terrain)[0];
            assert.ok(hit);
            assert.ok(
              worldPoint.y <= hit.point.y - 0.008,
              `floating root: ${worldPoint.y - hit.point.y}`,
            );
            assert.ok(worldPoint.y > hit.point.y - shape.height * size * 0.5);
            checked++;
          }
        }
        assert.ok(
          placed.position.y + shape.height * size >
            height(0.36, 1.27) + shape.height * size * 0.6,
        );
      }
  assert.ok(checked > 10000);
  for (const shape of shapes)
    assert.equal(
      seatMeadowPlant({ height: (x) => (x < 0 ? 0 : 4) }, shape, {
        x: 0,
        z: 0,
        size: 1,
        yaw: 0,
      }),
      null,
    );
  geometry.dispose();
  terrain.material.dispose();
});

function meadowGame() {
  return {
    level: { biome: "sky", seed: 43 },
    world: new THREE.Group(),
    map: {
      size: 14,
      grid: Array.from({ length: 14 }, () => Array(14).fill(1)),
      features: [{ type: "mechanism", x: 7, z: 7 }],
      enemies: [{ x: 10, z: 11 }],
      spawn: { x: 1, z: 1 },
    },
    terrainProfile: {
      extent: 84,
      height: () => 4,
      geology: { depth: () => 0 },
      waters: [{ x: 21, z: 35, width: 6, length: 8 }],
      trail: (x) => (Math.abs(x - 30) < 1 ? 1 : 0),
    },
    obstacles: [{ x: 40, z: 22, w: 2, d: 4, h: 4 }],
    items: [{ discovery: { x: 18, z: 65, stance: { x: 18, z: 68 } } }],
    discoverySettings: [{ modules: [{ x: 60, z: 24, w: 3, d: 2 }] }],
    fieldGates: [{ root: { position: new THREE.Vector3(68, 4, 50) } }],
    naturePatches: [],
    camera: { position: new THREE.Vector3(16, 7, 16) },
    elapsed: 3,
    store: { data: { settings: { quality: "high" } } },
  };
}

test("plants reserve their whole leaning reach around equipment, door motion, water, rocks and trails", () => {
  const game = meadowGame(),
    rocks = [
      new THREE.Box3(
        new THREE.Vector3(10, 4, 25),
        new THREE.Vector3(13, 6, 27),
      ),
    ];
  for (const [x, z] of [
    [41.7, 26],
    [60.3, 71.4],
    [72.7, 77],
    [18, 68],
    [18.9, 65],
    [62.1, 24],
    [24.7, 35],
    [59, 50],
    [68, 59],
    [10, 27.6],
    [31.6, 10],
  ])
    assert.equal(
      meadowPlantAllowed(game, x, z, 0.8, rocks),
      false,
      `${x}, ${z}`,
    );
  assert.ok(meadowPlantAllowed(game, 35, 35, 0.8, rocks));
  // A leaf's collider moves as the door opens, while the planted layout must
  // remain independent of its saved amount and current animation frame.
  for (const position of [
    [68, 56.5],
    [73.9, 52],
    [61.8, 47.7],
  ]) {
    game.obstacles.push({
      x: position[0],
      z: position[1],
      w: 0.5,
      d: 3,
      h: 7.5,
    });
    assert.equal(
      meadowPlantAllowed(game, position[0], position[1], 0.8),
      false,
    );
    game.obstacles.pop();
  }
});

test("the meadow is stable across quality, save states and unrelated reservations, with matched depth wind", () => {
  const first = meadowGame();
  buildGroundCover(first);
  assert.equal(first.grassPatches.length, 0);
  buildSkyMeadow(first);
  assert.ok(first.skyMeadow.stats.placed > 500);
  assert.ok(first.skyMeadow.stats.variants.every((n) => n > 60));
  const original = first.skyMeadow.plants.map((p) => p.matrix.toArray());
  const counts = [];
  for (const quality of ["high", "medium", "low"]) {
    first.store.data.settings.quality = quality;
    updateSkyMeadow(first, 1);
    counts.push(
      first.skyMeadow.patches.reduce(
        (n, p) => n + p.counts.reduce((a, b) => a + b, 0),
        0,
      ),
    );
    assert.deepEqual(
      first.skyMeadow.plants.map((p) => p.matrix.toArray()),
      original,
    );
  }
  assert.ok(counts[0] > counts[2]);
  first.elapsed = 9;
  updateSkyMeadow(first);
  assert.equal(first.skyMeadow.time.value, 9);
  for (const patch of first.skyMeadow.patches)
    for (const mesh of patch.tiers.flat()) {
      const compile = (material) => {
        const shader = {
          uniforms: {},
          vertexShader: "#include <common>\n#include <begin_vertex>",
          fragmentShader: "#include <common>\n#include <alphatest_fragment>",
        };
        material.onBeforeCompile(shader);
        return shader;
      };
      const surface = compile(mesh.material),
        depth = compile(mesh.customDepthMaterial);
      assert.equal(surface.vertexShader, depth.vertexShader);
      assert.equal(surface.uniforms.meadowTime, first.skyMeadow.time);
      assert.equal(depth.uniforms.meadowTime, first.skyMeadow.time);
    }
  const second = meadowGame();
  second.store.data.settings.quality = "low";
  second.obstacles.push({ x: 72, z: 54, w: 1, d: 2, h: 7.5 });
  buildSkyMeadow(second);
  assert.deepEqual(
    second.skyMeadow.plants.map((p) => p.matrix.toArray()),
    original,
  );
  const third = meadowGame();
  third.obstacles.push({ x: 35, z: 35, w: 2, d: 2, h: 2 });
  buildSkyMeadow(third);
  const retained = new Set(third.skyMeadow.plants.map((p) => p.x + "," + p.z));
  assert.ok(retained.size < first.skyMeadow.plants.length);
  for (const p of first.skyMeadow.plants)
    if (retained.has(p.x + "," + p.z))
      assert.deepEqual(
        third.skyMeadow.plants
          .find((q) => q.x === p.x && q.z === p.z)
          .matrix.toArray(),
        p.matrix.toArray(),
      );
  first.camera.position.set(1000, 7, 1000);
  updateSkyMeadow(first, 1);
  assert.ok(
    first.skyMeadow.patches.every((p) => p.counts.every((n) => n === 0)),
  );
  first.level.biome = "snow";
  buildSkyMeadow(first);
  assert.equal(first.skyMeadow, null);
  for (const game of [first, second, third])
    game.world.traverse((mesh) => {
      mesh.dispose?.();
      mesh.geometry?.dispose();
      mesh.material?.dispose();
      mesh.customDepthMaterial?.dispose();
    });
});
