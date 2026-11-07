import test from "node:test";
import { coastalSaltbushSpecimen } from "../src/coastal-saltbush.js";
import {
  coastalShoreHeight,
  coastalShoreDistance,
  coastalShoreShrubAllowed,
} from "../src/coastal-shore-plan.js";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  coastalCoverSpecimens,
  coastalCoverAllowed,
  buildCoastalGroundcover,
  updateCoastalGroundcover,
  disposeCoastalGroundcover,
} from "../src/coastal-groundcover.js";
import { seatMeadowPlant } from "../src/sky-meadow.js";
import { disposeInstanceBuffers } from "../src/instance-lod.js";

test("coastal leaves retain buried roots against independent terrain triangles and conservative wind bounds", () => {
  const specimens = coastalCoverSpecimens(),
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
            .add(new THREE.Vector3(direction * 0.025, 0, direction * 0.018));
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
    level: { biome: "water", seed: 937 },
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

test("coastal habitat keeps route lanes, hydraulic operators, masonry, gates, discoveries, water and rocks clear", () => {
  const g = game(),
    rocks = [
      new THREE.Box3(
        new THREE.Vector3(10, 4, 25),
        new THREE.Vector3(13, 6, 27),
      ),
    ];
  for (const [x, z] of [
    [40, 49],
    [70, 41],
    [47, 40],
    [75, 75],
    [75, 86],
    [65, 68],
    [50, 75],
    [24.6, 70],
    [51, 20],
    [13.5, 27],
  ])
    assert.equal(coastalCoverAllowed(g, x, z, 0.8, rocks), false, `${x},${z}`);
  assert(coastalCoverAllowed(g, 40, 35, 0.8, rocks));
  g.terrainProfile.court = () => 1;
  assert.equal(coastalCoverAllowed(g, 40, 35, 0.8, rocks), false);
});

test("groundcover stays deterministic through gate motion and quality changes and releases instance buffers", () => {
  const a = game(),
    b = game();
  buildCoastalGroundcover(a);
  b.obstacles.push({ x: 75, z: 78, w: 1, d: 5, h: 3 });
  // The gate reservation stays clear in both closed and restored progress.
  b.progress = { completed: true, field: ["field-0-0"] };
  buildCoastalGroundcover(b);
  const poses = (g) =>
    g.coastalGroundcover.plants.map((p) => p.matrix.toArray());
  assert(a.coastalGroundcover.plants.length > 50);
  assert.deepEqual(poses(a), poses(b));
  for (const p of a.coastalGroundcover.plants)
    assert(
      Math.abs(p.z - 49) >
        1.5 + a.coastalGroundcover.specimens[p.variant].radius * p.size,
    );
  const before = poses(a);
  a.store.data.settings.quality = "low";
  updateCoastalGroundcover(a, 1);
  assert.deepEqual(poses(a), before);
  const meshes = a.coastalGroundcover.patches.flatMap((p) => p.tiers.flat());
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
    for (const specimen of g.coastalGroundcover.specimens)
      for (const source of specimen.tiers)
        source.addEventListener("dispose", () => sourceDisposals++);
    disposeCoastalGroundcover(g);
    disposeCoastalGroundcover(g);
    assert.equal(sourceDisposals, 12);
    assert.equal(g.coastalGroundcover, null);
  }
});

test("dry shore placement measures full walking-cell footprints and rejects wet or steep shrub beds", () => {
  const map = { grid: Array.from({ length: 7 }, () => Array(7).fill(0)) };
  map.grid[2][2] = map.grid[2][3] = 1;
  const profile = { step: 0.5, height: () => 0.4 };
  assert.equal(coastalShoreDistance(map, 14, 14), 0);
  assert.equal(coastalShoreDistance(map, 25.5, 14), 1);
  assert(Math.abs(coastalShoreDistance(map, 25.5, 18.5) - Math.SQRT2) < 1e-12);
  for (let z = 7; z <= 28; z += 0.7)
    for (let x = 7; x <= 35; x += 0.7) {
      const expected = Math.hypot(
        Math.max(0, 10.5 - x, x - 24.5),
        Math.max(0, 10.5 - z, z - 17.5),
      );
      if (expected <= 5)
        assert(Math.abs(coastalShoreDistance(map, x, z) - expected) < 1e-12);
    }
  assert(!coastalShoreShrubAllowed(map, profile, 24.9, 14, 0.6));
  assert(coastalShoreShrubAllowed(map, profile, 25.7, 14, 0.6));
  assert(!coastalShoreShrubAllowed(map, profile, 30, 14, 0.6));
  profile.height = () => -1.6;
  assert(!coastalShoreShrubAllowed(map, profile, 25.7, 14, 0.6));
  profile.height = (x) => 0.4 + (x - 25.7) * 0.6;
  assert(!coastalShoreShrubAllowed(map, profile, 25.7, 14, 0.6));
  profile.height = () => NaN;
  assert(!coastalShoreShrubAllowed(map, profile, 25.7, 14, 0.6));
});

test("new shrubs keep all delivered foliage outside the walking footprint while soft shore growth remains reserved and rooted", (t) => {
  const g = game();
  for (const row of g.map.grid) row.fill(0, 8);
  buildCoastalGroundcover(g);
  t.after(() => {
    disposeInstanceBuffers(g.world);
    const geometries = new Set(),
      materials = new Set();
    g.world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) materials.add(o.material);
      if (o.customDepthMaterial) materials.add(o.customDepthMaterial);
    });
    geometries.forEach((o) => o.dispose());
    materials.forEach((o) => o.dispose());
    disposeCoastalGroundcover(g);
    g.world.clear();
  });
  const cover = g.coastalGroundcover;
  assert(cover.stats.shore > 0 && cover.stats.variants[3] > 0);
  let shrubVertices = 0;
  const point = new THREE.Vector3(),
    matrix = new THREE.Matrix4();
  for (const plant of cover.plants) {
    const shape = cover.specimens[plant.variant];
    assert(coastalCoverAllowed(g, plant.x, plant.z, shape.radius * plant.size));
    if (plant.variant !== 3) continue;
    assert(plant.shore);
    matrix.fromArray(new Float32Array(plant.matrix.elements));
    for (const geometry of shape.tiers) {
      const p = geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        point.fromBufferAttribute(p, i).applyMatrix4(matrix);
        // The fixture's contiguous land cells form this exact closed rectangle.
        const clearance = Math.hypot(
          Math.max(0, -3.5 - point.x, point.x - 52.5),
          Math.max(0, -3.5 - point.z, point.z - 94.5),
        );
        assert(
          clearance > 0.19,
          "actual shrub vertices leave the walking edge clear",
        );
        shrubVertices++;
      }
    }
  }
  assert(shrubVertices > 1000);
  t.diagnostic(
    JSON.stringify({
      shorePlants: cover.stats.shore,
      shrubs: cover.stats.variants[3],
      shrubVertices,
    }),
  );
});

test("a woody shrub rejects narrow terrain ridges that would bury its lower branches", () => {
  const shape = coastalSaltbushSpecimen(),
    height = (x) => 0.4 * Math.exp(-((x / 0.04) ** 2)),
    profile = { step: 0.01, height: (x, z) => height(x) },
    pose = { x: 0, z: 0, size: 1, yaw: 0 },
    geometry = new THREE.PlaneGeometry(2, 2, 200, 2);
  geometry.rotateX(-Math.PI / 2);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i)));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    terrain = new THREE.Mesh(geometry, material),
    ray = new THREE.Raycaster();
  try {
    assert.equal(seatMeadowPlant(profile, shape, pose), null);
    const control = seatMeadowPlant(
      profile,
      { ...shape, maxRootSpan: undefined },
      pose,
    );
    assert(control, "the preceding canopy-height budget admits this ridge");
    let buriedBranches = 0;
    const points = shape.tiers[0].attributes.position,
      point = new THREE.Vector3();
    for (let i = 0; i < points.count; i++) {
      if (points.getY(i) <= 0.1 || points.getY(i) > 0.3) continue;
      point.fromBufferAttribute(points, i).applyMatrix4(control.matrix);
      ray.set(
        new THREE.Vector3(point.x, 2, point.z),
        new THREE.Vector3(0, -1, 0),
      );
      const hit = ray.intersectObject(terrain, false)[0];
      if (hit && point.y < hit.point.y - 0.005) buriedBranches++;
    }
    assert(
      buriedBranches > 0,
      "actual lower branch triangles expose the negative control",
    );
  } finally {
    geometry.dispose();
    material.dispose();
    shape.tiers.forEach((g) => g.dispose());
  }
});

test("shore plants use the visible saddle triangles rather than the lower blended movement field", () => {
  const step = 1.75,
    profile = {
      step,
      height: (x, z) => x / step + z / step - (2 * x * z) / (step * step),
    },
    shape = coastalSaltbushSpecimen(),
    pose = { x: step / 2, z: step / 2, size: 1, yaw: 0 },
    surface = { height: (x, z) => coastalShoreHeight(profile, x, z) },
    geometry = new THREE.PlaneGeometry(step, step, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(step / 2, 0, step / 2);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setY(i, profile.height(p.getX(i), p.getZ(i)));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    terrain = new THREE.Mesh(geometry, material),
    ray = new THREE.Raycaster(),
    point = new THREE.Vector3();
  try {
    assert(Math.abs(profile.height(pose.x, pose.z) - 0.5) < 1e-12);
    assert(Math.abs(surface.height(pose.x, pose.z) - 1) < 1e-12);
    const seated = seatMeadowPlant(surface, shape, pose),
      control = seatMeadowPlant(profile, shape, pose);
    assert(seated && control);
    let rooted = 0,
      clearBranches = 0,
      controlBuried = 0;
    for (const g of shape.tiers) {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0.3) continue;
        point.fromBufferAttribute(pos, i).applyMatrix4(seated.matrix);
        ray.set(
          new THREE.Vector3(point.x, 3, point.z),
          new THREE.Vector3(0, -1, 0),
        );
        const hit = ray.intersectObject(terrain, false)[0];
        assert(hit);
        if (pos.getY(i) === 0) {
          assert(point.y < hit.point.y - 0.005);
          assert(point.y > hit.point.y - 0.07);
          rooted++;
        }
        if (pos.getY(i) > 0.1) {
          assert(point.y > hit.point.y);
          clearBranches++;
        }
        point.fromBufferAttribute(pos, i).applyMatrix4(control.matrix);
        if (pos.getY(i) > 0.1 && point.y < hit.point.y - 0.005) controlBuried++;
      }
    }
    assert(rooted > 0 && clearBranches > 0 && controlBuried > 0);
  } finally {
    geometry.dispose();
    material.dispose();
    shape.tiers.forEach((g) => g.dispose());
  }
});
