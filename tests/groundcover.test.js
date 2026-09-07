import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { random } from "../src/campaign.js";
import { createLodPatch, updateLodPatch } from "../src/instance-lod.js";
import {
  buildGroundCover,
  createGrassGeometries,
  updateGroundCover,
} from "../src/groundcover.js";
import { inWindCourt } from "../src/wind-rules.js";

test("sky machinery clears its grass footprint without moving surrounding plants", () => {
  const make = (features) => ({
    level: { biome: "sky", seed: 43 },
    world: new THREE.Group(),
    map: {
      grid: Array.from({ length: 12 }, () => Array(12).fill(1)),
      fieldSites: [],
      features,
    },
    terrainProfile: {
      extent: 70,
      court: () => 0,
      height: () => 0,
      geology: { depth: () => 0 },
    },
    groundHeight: () => 0,
  });
  const before = make([]),
    after = make([{ type: "mechanism", x: 5, z: 4 }]);
  buildGroundCover(before);
  buildGroundCover(after);
  const positions = (g) =>
    g.grassPatches
      .flatMap((p) => p.positions.map((v) => v.toArray()))
      .sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  const original = positions(before),
    retained = positions(after);
  assert.ok(
    retained.length < original.length,
    "plants intersecting the court are removed",
  );
  assert.deepEqual(
    retained,
    original.filter(([x, , z]) => !inWindCourt(after.map, x, z)),
  );
  for (const g of [before, after])
    g.world.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      o.geometry?.dispose();
      o.material?.dispose();
    });
});

test("grass detail preserves blade heights and wind coordinates with bounded distant geometry", () => {
  for (const jungle of [true, false]) {
    const rng = random(543),
      reference = random(543);
    const geometries = createGrassGeometries(rng, jungle);
    for (let i = 0; i < (jungle ? 60 : 36) * 6; i++) reference();
    assert.equal(
      rng(),
      reference(),
      "extra tiers must not alter the placement random sequence",
    );
    const near = geometries[0];
    assert.deepEqual(
      geometries.map((g) => g.attributes.position.count / 3),
      jungle ? [180, 60, 24] : [108, 36, 18],
    );
    for (const geometry of geometries) {
      for (const attribute of Object.values(geometry.attributes))
        assert.ok(attribute.array.every(Number.isFinite));
      for (let i = 0; i < geometry.attributes.position.count; i++) {
        assert.equal(
          geometry.attributes.position.getY(i),
          near.attributes.position.getY(i),
        );
        assert.equal(
          geometry.attributes.uv.getY(i),
          near.attributes.uv.getY(i),
        );
      }
      const bounds = new THREE.Box3().setFromBufferAttribute(
        geometry.attributes.position,
      );
      assert.ok(bounds.max.y < 0.51 && bounds.min.y === 0);
      assert.ok(geometry.boundingSphere.radius < 1.5);
    }
  }
});

test("packed LOD draws retain each plant's color through tier changes, culling, and crossfades", () => {
  const positions = [5, 20, 50].map((x) => new THREE.Vector3(x, 0, 0));
  const colors = [0xff0000, 0x00ff00, 0x0000ff].map((c) => new THREE.Color(c));
  const patch = createLodPatch(
    new THREE.Group(),
    createGrassGeometries(random(4), true).map((geometry) => [
      { geometry, material: new THREE.MeshStandardMaterial() },
    ]),
    positions.map((p) => new THREE.Matrix4().makeTranslation(p.x, 0, 0)),
    positions,
    { colors, planar: true },
  );
  const camera = new THREE.Vector3(0, 200, 0);
  const verify = () => {
    for (const mesh of patch.tiers.flat()) {
      const matrix = new THREE.Matrix4(),
        color = new THREE.Color();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        mesh.getColorAt(i, color);
        assert.equal(
          color.getHex(),
          colors[
            positions.findIndex((p) => p.x === matrix.elements[12])
          ].getHex(),
        );
      }
    }
  };
  updateLodPatch(patch, camera, [12, 24, 38]);
  assert.deepEqual(
    patch.counts,
    [1, 1, 0],
    "planar culling matches the grass shader even above the ground",
  );
  verify();
  camera.x = 35;
  updateLodPatch(patch, camera, [12, 24, 38], 0.1);
  assert.deepEqual(patch.counts, [1, 2, 1]);
  verify();
  updateLodPatch(patch, camera, [12, 24, 38], 0.3);
  assert.deepEqual(patch.counts, [0, 2, 1]);
  verify();
  camera.x = 1000;
  updateLodPatch(patch, camera, [12, 24, 38], 0.3);
  assert.ok(patch.tiers.flat().every((m) => m.count === 0 && !m.visible));
});

test("ground cover uses camera range, follows quality changes, and clears state in bare biomes", () => {
  const game = {
    level: { biome: "jungle", seed: 43 },
    world: new THREE.Group(),
    map: {
      grid: Array.from({ length: 12 }, () => Array(12).fill(1)),
      fieldSites: [{ x: 3, z: 3 }],
    },
    terrainProfile: { extent: 70, court: () => 0, trail: () => 0 },
    groundHeight: () => 0,
    elapsed: 4,
    player: { position: new THREE.Vector3(1000, 0, 1000) },
    camera: { position: new THREE.Vector3(20, 3, 20) },
    store: { data: { settings: { quality: "high" } } },
  };
  buildGroundCover(game);
  const original = game.grassPatches.flatMap((patch) =>
    patch.matrices.map((matrix, i) => ({
      matrix: matrix.toArray(),
      color: patch.colors[i].toArray(),
    })),
  );
  assert.ok(original.length > 100);
  game.camera.position.set(1000, 3, 1000);
  updateGroundCover(game);
  assert.ok(
    game.grassPatches.every((p) => p.states === null),
    "never-visible patches skip individual plant work",
  );
  game.camera.position.set(20, 3, 20);
  updateGroundCover(game);
  assert.equal(game.grassWind.value, 4);
  assert.equal(game.grassRange.value, 85);
  const highCount = game.grassPatches.reduce(
    (n, p) => n + p.counts.reduce((a, b) => a + b, 0),
    0,
  );
  assert.equal(highCount, original.length);
  game.store.data.settings.quality = "low";
  updateGroundCover(game);
  assert.equal(game.grassRange.value, 38);
  const lowCount = game.grassPatches.reduce(
    (n, p) => n + p.counts.reduce((a, b) => a + b, 0),
    0,
  );
  assert.ok(lowCount > 0 && lowCount < highCount);
  for (const patch of game.grassPatches)
    for (let i = 0; i < patch.positions.length; i++) {
      const p = patch.positions[i];
      assert.ok(
        Math.hypot(p.x - 21, p.z - 21) >= 3.3,
        "stations retain working space",
      );
      assert.equal(
        patch.states[i].tier < 3,
        Math.hypot(p.x - 20, p.z - 20) < 38,
      );
    }
  buildGroundCover(game);
  assert.deepEqual(
    game.grassPatches.flatMap((patch) =>
      patch.matrices.map((matrix, i) => ({
        matrix: matrix.toArray(),
        color: patch.colors[i].toArray(),
      })),
    ),
    original,
  );
  updateGroundCover(game);
  game.camera.position.set(1000, 3, 1000);
  updateGroundCover(game, 0.1);
  assert.ok(
    game.grassPatches.some((p) => p.counts.some((n) => n > 0)),
    "leaving a patch preserves its in-progress fade",
  );
  updateGroundCover(game, 0.3);
  assert.ok(game.grassPatches.every((p) => p.counts.every((n) => n === 0)));
  game.camera.position.set(20, 3, 20);
  updateGroundCover(game, 0.3);
  assert.equal(
    game.grassPatches.reduce(
      (n, p) => n + p.counts.reduce((a, b) => a + b, 0),
      0,
    ),
    original.filter(
      ({ matrix }) => Math.hypot(matrix[12] - 20, matrix[14] - 20) < 38 - 0.75,
    ).length,
    "returning restores plants inside the range's hysteresis band",
  );
  game.level.biome = "desert";
  buildGroundCover(game);
  updateGroundCover(game);
  assert.equal(game.grassPatches.length, 0);
  assert.equal(game.grassWind, null);
  assert.equal(game.grassRange, null);
});
