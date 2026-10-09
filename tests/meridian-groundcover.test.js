import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  meridianCoverSpecimens,
  meridianCoverAllowed,
  buildMeridianGroundcover,
  updateMeridianGroundcover,
} from "../src/meridian-groundcover.js";
import { seatMeadowPlant } from "../src/sky-meadow.js";
import { disposeInstanceBuffers } from "../src/instance-lod.js";

test("meridian leaves retain buried roots against independent terrain triangles and conservative wind bounds", () => {
  const specimens = meridianCoverSpecimens(),
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
            .add(new THREE.Vector3(direction * 0.04, 0, direction * 0.025));
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
    level: { biome: "eclipse", seed: 937 },
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
    fieldGates: [{ root: { position: new THREE.Vector3(75, 4, 75) } }],
    discoverySettings: [{ modules: [{ x: 50, z: 75, w: 4, d: 3 }] }],
    items: [{ discovery: { x: 65, z: 65, stance: { x: 65, z: 68 } } }],
    camera: { position: new THREE.Vector3(40, 7, 40) },
    store: { data: { settings: { quality: "high" } } },
  };
}

test("meridian habitat keeps trail centers, dome interiors, gates, discoveries, water and rock extents clear", () => {
  const g = game(),
    rocks = [
      new THREE.Box3(
        new THREE.Vector3(10, 4, 25),
        new THREE.Vector3(13, 6, 27),
      ),
    ];
  for (const [x, z] of [
    [40, 49],
    [28, 11],
    [75, 75],
    [75, 86],
    [65, 68],
    [50, 75],
    [24.6, 70],
    [51, 20],
    [13.5, 27],
  ])
    assert.equal(meridianCoverAllowed(g, x, z, 0.8, rocks), false, `${x},${z}`);
  assert(meridianCoverAllowed(g, 40, 35, 0.8, rocks));
  g.terrainProfile.court = () => 1;
  assert.equal(meridianCoverAllowed(g, 40, 35, 0.8, rocks), false);
});

test("groundcover stays deterministic through gate motion and quality changes and releases instance buffers", () => {
  const a = game(),
    b = game();
  buildMeridianGroundcover(a);
  b.obstacles.push({ x: 75, z: 78, w: 1, d: 5, h: 3 });
  b.progress = { completed: true, field: ["field-0-0"] };
  buildMeridianGroundcover(b);
  const poses = (g) =>
    g.meridianGroundcover.plants.map((p) => p.matrix.toArray());
  assert(a.meridianGroundcover.plants.length > 200);
  assert.deepEqual(poses(a), poses(b));
  for (const p of a.meridianGroundcover.plants)
    assert(
      Math.abs(p.z - 49) >
        1.5 + a.meridianGroundcover.specimens[p.variant].radius * p.size,
    );
  const before = poses(a);
  a.store.data.settings.quality = "low";
  updateMeridianGroundcover(a, 1);
  assert.deepEqual(poses(a), before);
  const meshes = a.meridianGroundcover.patches.flatMap((p) => p.tiers.flat());
  let released = 0;
  meshes.forEach((m) => m.addEventListener("dispose", () => released++));
  assert.equal(disposeInstanceBuffers(a.world), meshes.length);
  assert.equal(released, meshes.length);
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
    g.meridianGroundcover.specimens.forEach((s) =>
      s.tiers.forEach((t) => t.dispose()),
    );
  }
});
