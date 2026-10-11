import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  desertCoverSpecimens,
  desertCoverAllowed,
  buildDesertGroundcover,
  updateDesertGroundcover,
  disposeDesertGroundcover,
} from "../src/desert-groundcover.js";
import { seatMeadowPlant } from "../src/sky-meadow.js";
import { disposeInstanceBuffers } from "../src/instance-lod.js";
import { terrainTriangleReader } from "../scripts/inspect-desert-groundcover-browser.js";

test("delivered triangle observer agrees with ray intersections on transformed, overlapping terrain and empty ground", () => {
  const terrain = [0, 3].map((y) => {
      const geometry = new THREE.PlaneGeometry(18, 16, 6, 5);
      geometry.rotateX(-Math.PI / 2);
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++)
        positions.setY(
          i,
          Math.sin(positions.getX(i)) * 0.3 + positions.getZ(i) * 0.2,
        );
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      );
      mesh.position.set(2, y, -1);
      mesh.rotation.y = 0.31;
      mesh.updateMatrixWorld(true);
      return mesh;
    }),
    height = terrainTriangleReader(terrain),
    ray = new THREE.Raycaster();
  let samples = 0,
    missing = 0;
  for (let x = -12.2; x < 16; x += 0.71)
    for (let z = -14.3; z < 13; z += 0.73) {
      ray.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(terrain)[0];
      if (hit) {
        assert(Math.abs(height(x, z) - hit.point.y) < 1e-8);
        samples++;
      } else {
        assert.equal(height(x, z), null);
        missing++;
      }
    }
  assert(samples > 400 && missing > 400);
  for (const mesh of terrain) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});

test("dry leaves retain buried roots against independent terrain triangles and conservative wind bounds", () => {
  const specimens = desertCoverSpecimens(),
    step = 0.875,
    height = (x, z) =>
      4 + x * 0.065 - z * 0.05 + Math.sin(x * 2.2) * Math.cos(z * 1.7) * 0.07,
    geometry = new THREE.PlaneGeometry(step * 24, step * 24, 24, 24);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++)
    positions.setY(i, height(positions.getX(i), positions.getZ(i)));
  const terrain = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    ),
    ray = new THREE.Raycaster();
  terrain.updateMatrixWorld(true);
  let samples = 0;
  for (const shape of specimens) {
    let count = Infinity;
    for (const tier of shape.tiers) {
      assert(tier.attributes.position.count < count);
      count = tier.attributes.position.count;
      for (const attribute of Object.values(tier.attributes))
        assert(attribute.array.every(Number.isFinite));
      const p = tier.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(p, i);
        for (const direction of [-1, 1]) {
          const windy = point
            .clone()
            .add(new THREE.Vector3(direction * 0.035, 0, direction * 0.018));
          assert(
            tier.boundingBox.clone().expandByScalar(1e-6).containsPoint(windy),
          );
          assert(tier.boundingSphere.containsPoint(windy));
        }
      }
    }
    for (const yaw of [0, 0.71, 2.8])
      for (const size of [0.72, 1.27]) {
        const placed = seatMeadowPlant({ step, height }, shape, {
          x: 0.36,
          z: 1.27,
          size,
          yaw,
        });
        assert(placed);
        for (const root of shape.roots) {
          const point = root.clone().applyMatrix4(placed.matrix);
          ray.set(
            new THREE.Vector3(point.x, 20, point.z),
            new THREE.Vector3(0, -1, 0),
          );
          const hit = ray.intersectObject(terrain)[0];
          assert(hit);
          assert(
            point.y <= hit.point.y - 0.008,
            `floating root ${point.y - hit.point.y}`,
          );
          assert(point.y > hit.point.y - shape.height * size * 0.5);
          samples++;
        }
      }
    shape.tiers.forEach((g) => g.dispose());
  }
  assert(samples > 1000);
  geometry.dispose();
  terrain.material.dispose();
});

function game() {
  return {
    level: { biome: "desert", seed: 937 },
    elapsed: 3,
    world: new THREE.Group(),
    map: {
      size: 14,
      grid: Array.from({ length: 14 }, () => Array(14).fill(1)),
      rooms: [{ x: 4, z: 4, index: 0 }],
      paths: [
        [
          { x: 0, z: 7 },
          { x: 14, z: 7 },
        ],
      ],
      features: [{ type: "mechanism", x: 10, z: 3 }],
      enemies: [],
      spawn: { x: 1, z: 1 },
      frozenStair: { x: 3, z: 9 },
      bellHoist: { x: 11, z: 12 },
    },
    terrainProfile: {
      extent: 98,
      step: 1.75,
      court: () => 0,
      height: () => 4,
      waters: [{ x: 21, z: 70, width: 6, length: 8 }],
    },
    groundHeight: () => 4,
    obstacles: [{ x: 50, z: 20, w: 3, d: 3, h: 4 }],
    naturePatches: [],
    palmLayout: [{ x: 20, z: 35, scale: 1.2 }],
    fieldGates: [{ root: { position: new THREE.Vector3(75, 4, 75) } }],
    discoverySettings: [{ modules: [{ x: 50, z: 75, w: 4, d: 3 }] }],
    items: [{ discovery: { x: 65, z: 65, stance: { x: 65, z: 68 } } }],
    camera: { position: new THREE.Vector3(40, 7, 40) },
    store: { data: { settings: { quality: "high" } } },
  };
}

test("dry habitat keeps trails, optical controls, palm trunks, gates, discoveries, water and rocks clear", () => {
  const g = game(),
    rocks = [
      new THREE.Box3(
        new THREE.Vector3(10, 4, 25),
        new THREE.Vector3(13, 6, 27),
      ),
    ];
  for (const [x, z] of [
    [40, 49],
    [21, 70],
    [20, 35],
    [75, 75],
    [75, 86],
    [65, 68],
    [50, 75],
    [24.6, 70],
    [51, 20],
    [13.5, 27],
  ])
    assert.equal(desertCoverAllowed(g, x, z, 0.8, rocks), false, `${x},${z}`);
  assert(desertCoverAllowed(g, 40, 35, 0.8, rocks));
  g.terrainProfile.court = () => 1;
  assert.equal(desertCoverAllowed(g, 40, 35, 0.8, rocks), false);
});

test("groundcover stays deterministic through gate motion and quality changes and releases instance buffers", () => {
  const a = game(),
    b = game();
  buildDesertGroundcover(a);
  b.obstacles.push({ x: 75, z: 78, w: 1, d: 5, h: 3 });
  b.progress = { completed: true, field: ["field-0-0"] };
  buildDesertGroundcover(b);
  const poses = (g) =>
    g.desertGroundcover.plants.map((p) => p.matrix.toArray());
  assert(a.desertGroundcover.plants.length > 50);
  assert(
    a.desertGroundcover.specimens.every((s) => s.height > 0 && s.height < 1.1),
  );
  assert.deepEqual(poses(a), poses(b));
  for (const p of a.desertGroundcover.plants)
    assert(
      Math.abs(p.z - 49) >
        1.5 + a.desertGroundcover.specimens[p.variant].radius * p.size,
    );
  const before = poses(a);
  const highVisible = a.desertGroundcover.patches.reduce(
    (sum, patch) => sum + patch.counts.reduce((n, count) => n + count, 0),
    0,
  );
  a.store.data.settings.quality = "low";
  updateDesertGroundcover(a, 1);
  const lowVisible = a.desertGroundcover.patches.reduce(
    (sum, patch) => sum + patch.counts.reduce((n, count) => n + count, 0),
    0,
  );
  assert(lowVisible < highVisible);
  assert.deepEqual(poses(a), before);
  const meshes = a.desertGroundcover.patches.flatMap((p) => p.tiers.flat());
  let released = 0;
  meshes.forEach((m) => m.addEventListener("dispose", () => released++));
  assert.equal(disposeInstanceBuffers(a.world), meshes.length);
  assert.equal(released, meshes.length);
  disposeInstanceBuffers(b.world);
  for (const g of [a, b]) {
    const geometry = new Set(),
      material = new Set();
    g.world.traverse((o) => {
      if (o.geometry) geometry.add(o.geometry);
      if (o.material) material.add(o.material);
      if (o.customDepthMaterial) material.add(o.customDepthMaterial);
    });
    geometry.forEach((o) => o.dispose());
    material.forEach((o) => o.dispose());
    let sourceDisposals = 0;
    for (const specimen of g.desertGroundcover.specimens)
      for (const source of specimen.tiers)
        source.addEventListener("dispose", () => sourceDisposals++);
    disposeDesertGroundcover(g);
    disposeDesertGroundcover(g);
    assert.equal(sourceDisposals, 9);
    assert.equal(g.desertGroundcover, null);
  }
});
