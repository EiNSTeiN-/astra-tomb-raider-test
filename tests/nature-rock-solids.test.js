import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import {
  NatureRockSolids,
  NATURE_BODY_RADIUS,
} from "../src/nature-rock-solids.js";
import { stoneShape } from "../src/stone-grounding.js";
import { Adventure } from "../src/game.js";
import { advanceCharacter, supportAt } from "../src/character-motion.js";
import { shotCover } from "../src/aiming.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import {
  createLodPatch,
  updateLodPatch,
  disposeInstanceBuffers,
} from "../src/instance-lod.js";

const doc = await new NodeIO().read(
  new URL(
    "../public/assets/models/rock_moss_set_01/optimized.glb",
    import.meta.url,
  ).pathname,
);
const shapes = doc
  .getRoot()
  .listNodes()
  .filter((n) => n.getMesh())
  .map((n) => {
    const p = n.getMesh().listPrimitives()[0],
      geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        p.getAttribute("POSITION").getArray().slice(),
        3,
      ),
    );
    geometry.setIndex(
      new THREE.BufferAttribute(p.getIndices().getArray().slice(), 1),
    );
    const shape = stoneShape(
      geometry,
      new THREE.Matrix4().fromArray(n.getWorldMatrix()),
    );
    geometry.dispose();
    shape.geometry.scale(2.6, 2.6, 2.6);
    shape.geometry.computeBoundingBox();
    return shape.geometry;
  });
function patch(geometry, matrices) {
  return { kind: "rock", matrices, tiers: [[{ geometry }]] };
}
function transform(x, y, z, yaw = 0, size = 1, squash = 1) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3(size, size * squash, size),
  );
}
function game(solids, ground = () => 0) {
  return Object.assign(Object.create(Adventure.prototype), {
    natureRockSolids: solids,
    groundHeight: ground,
    walkable: () => true,
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    obstacles: [],
    audio: { tone() {} },
    grounded: true,
    velocityY: 0,
    jumpY: 0,
    map: { spawn: { x: 10, z: 10 } },
  });
}
test("point supports and cover rays agree with the six delivered scans under rotation, scale and desert squash", () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    ray = new THREE.Raycaster();
  let supportSamples = 0,
    raySamples = 0;
  for (const geometry of shapes)
    for (const yaw of [0, 0.7, 2.8])
      for (const squash of [0.6, 1]) {
        const matrix = transform(37, 5, -42, yaw, 1.3, squash),
          solids = new NatureRockSolids([patch(geometry, [matrix])]);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(matrix);
        mesh.updateMatrixWorld(true);
        const bounds = geometry.boundingBox.clone().applyMatrix4(matrix);
        for (let ix = 1; ix < 8; ix++)
          for (let iz = 1; iz < 8; iz++) {
            const x = THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, ix / 8),
              z = THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, iz / 8);
            const from = new THREE.Vector3(x, bounds.max.y + 3, z),
              to = new THREE.Vector3(x, bounds.min.y - 3, z);
            ray.set(from, new THREE.Vector3(0, -1, 0));
            const hit = ray.intersectObject(mesh)[0],
              support = solids.support(x, z);
            assert.equal(!!support, !!hit);
            if (hit) {
              assert(Math.abs(support.height - hit.point.y) < 2e-6);
              assert(
                Math.abs(
                  solids.entry(from, to) - hit.distance / from.distanceTo(to),
                ) < 2e-6,
              );
              const disk = solids.support(x, z, Infinity, NATURE_BODY_RADIUS);
              assert.equal(
                solids.blocked(x, disk.height, z),
                false,
                "feet on the highest disk surface clear stone",
              );
              supportSamples++;
            } else assert.equal(solids.entry(from, to), null);
            raySamples++;
          }
        for (const [dx, dz] of [
          [1, 0],
          [1, 1],
          [0, 1],
        ]) {
          const center = bounds.getCenter(new THREE.Vector3()),
            from = center.clone().add(new THREE.Vector3(dx * 4, 0, dz * 4)),
            to = center.clone().add(new THREE.Vector3(-dx * 4, 0, -dz * 4));
          ray.set(from, to.clone().sub(from).normalize());
          const hit = ray.intersectObject(mesh)[0],
            entry = solids.entry(from, to);
          if (hit && hit.distance <= from.distanceTo(to))
            assert(Math.abs(entry - hit.distance / from.distanceTo(to)) < 2e-6);
          else assert.equal(entry, null);
        }
      }
  material.dispose();
  assert.equal(raySamples, 1764);
  assert(supportSamples > 800);
});

test("disk support includes an interior uphill extremum rather than a coarse set of radial samples", () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-5, -5, -5, 5, 1, -5, 0, 2, 5], 3),
  );
  const solids = new NatureRockSolids([patch(geometry, [new THREE.Matrix4()])]);
  // Plane y = .6x + .4z: the maximum is on the circle in its gradient direction.
  assert(
    Math.abs(
      solids.support(0, 0, Infinity, 0.55).height - 0.55 * Math.hypot(0.6, 0.4),
    ) < 1e-7,
  );
  geometry.dispose();
});

test("the recorded crystal body overlap is blocked without moving or deleting its scanned rock", () => {
  const matrix = new THREE.Matrix4().fromArray([
    -0.5377783306207935, 0, 1.2068518754453317, 0, 0, 1.3212482666596772, 0, 0,
    -1.2068518754453317, 0, -0.5377783306207935, 0, 206.19616611830423,
    -1.2335501034113856, 386.45825943816453, 1,
  ]);
  const geometry = shapes.find(
    (s) =>
      Math.abs(
        s.boundingBox.max.y * matrix.elements[5] +
          matrix.elements[13] -
          0.33715358612628643,
      ) < 1e-6,
  );
  assert(geometry);
  const positions = geometry.attributes.position.array.slice(),
    before = matrix.toArray();
  const solids = new NatureRockSolids([patch(geometry, [matrix])]);
  const profile = createTerrainProfile(createMap(LEVELS[6]), LEVELS[6]),
    g = game(solids, profile.height);
  const old = new THREE.Vector3(
    207.18644397687285,
    -0.38521863492618924,
    387.6004782269666,
  );
  assert.equal(g.canMove(old.x, old.z, 0), false);
  g.natureRockSolids = null;
  assert.equal(
    g.canMove(old.x, old.z, 0),
    true,
    "negative control reproduces the old legal overlap",
  );
  g.natureRockSolids = solids;
  const boot = new THREE.Vector3(
    206.99429546691343,
    -0.24223834077811227,
    387.2045650034924,
  );
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(matrix);
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
      boot,
      new THREE.Vector3(0.314, 0.913, 0.259).normalize(),
    ),
    hits = ray.intersectObject(mesh),
    unique = hits.filter(
      (h, i) => !i || h.distance - hits[i - 1].distance > 1e-6,
    );
  assert.equal(
    unique.length % 2,
    1,
    "the independently observed delivered boot point is inside the scan",
  );
  g.player.position.copy(old);
  assert(g.restoreNatureArrival({ x: old.x, z: old.z, height: 0 }));
  assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
  assert(g.player.position.distanceTo(old) < 2);
  const settled = g.player.position.clone();
  assert.equal(
    g.restoreNatureArrival({ x: settled.x, z: settled.z, height: g.jumpY }),
    false,
  );
  assert.deepEqual(geometry.attributes.position.array, positions);
  assert.deepEqual(matrix.toArray(), before);
  material.dispose();
});

test("low stones step, high sides stop, jumps land on a real surface and saved rock elevation survives asynchronous restoration", () => {
  for (const top of [0.2, 1.2]) {
    const geometry = new THREE.BoxGeometry(2, top + 0.2, 2),
      matrix = transform(0, (top - 0.2) / 2, 0),
      solids = new NatureRockSolids([patch(geometry, [matrix])]),
      g = game(solids);
    g.player.position.set(-3, 0, 0);
    for (let i = 0; i < 150; i++) advanceCharacter(g, { x: 3, z: 0 }, 1 / 60);
    if (top === 0.2) {
      assert(g.player.position.x > 3);
      assert(g.grounded);
      assert(Math.abs(g.player.position.y) < 1e-8);
    } else {
      assert(g.player.position.x < -1 - NATURE_BODY_RADIUS + 0.051);
      assert.equal(g.player.position.y, 0);
    }
    g.player.position.set(0, top + 0.3, 0);
    g.grounded = false;
    g.velocityY = -1;
    for (let i = 0; i < 50; i++) advanceCharacter(g, { x: 0, z: 0 }, 1 / 60);
    assert(g.grounded);
    assert(Math.abs(g.player.position.y - top) < 1e-7);
    assert(g.canMove(0, 0, g.jumpY));
    g.player.position.y = 0;
    assert(g.restoreNatureArrival({ x: 0, z: 0, height: top }));
    assert(Math.abs(g.player.position.y - top) < 1e-7);
    assert.equal(g.restoreNatureArrival({ x: 0, z: 0, height: top }), false);
    assert.equal(
      supportAt(g, 2, 0).surface,
      null,
      "support ends at the delivered footprint",
    );
    geometry.dispose();
  }
});

test("the lens, sound/sight and shots respect the raw scan, and LOD buffer repacking cannot change solids", () => {
  const geometry = new THREE.BoxGeometry(2, 2, 2),
    matrix = transform(0, 1, 0),
    p = patch(geometry, [matrix]),
    solids = new NatureRockSolids([p]),
    g = game(solids);
  assert.equal(g.cameraSpace(new THREE.Vector3(1.15, 1, 0)), false);
  assert.equal(g.cameraSpace(new THREE.Vector3(1.4, 1, 0)), true);
  const from = new THREE.Vector3(-4, 1, 0),
    to = new THREE.Vector3(4, 1, 0);
  assert.equal(g.lineOfSight(from, to, 0, 0), false);
  assert(Math.abs(shotCover(g, from, to) - 0.375) < 1e-8);
  assert.equal(solids.entry(new THREE.Vector3(0, 1, 0), to), 0);
  assert.equal(solids.entry(from.clone().setY(3), to.clone().setY(3)), null);
  p.tiers[0][0].count = 0;
  p.tiers[0][0].instanceMatrix = { array: new Float32Array(16) };
  matrix.elements[12] = 100;
  assert.equal(solids.blocked(0, 0, 0), true);
  assert.equal(solids.solids.length, 1);
  assert.equal(solids.shapeCount, 1);
  geometry.dispose();
});

test("real LOD patches share one scan kernel, retain each immutable placement and distinguish different triangle indexes", () => {
  const geometry = shapes[0],
    material = new THREE.MeshStandardMaterial(),
    world = new THREE.Group();
  const source = [[{ geometry, material }]],
    patches = [];
  for (let i = 0; i < 24; i++) {
    const matrices = [transform(i * 40, 0, 0), transform(i * 40 + 5, 0, 0)],
      positions = matrices.map((m) =>
        new THREE.Vector3().setFromMatrixPosition(m),
      );
    const p = createLodPatch(world, source, matrices, positions);
    p.kind = "rock";
    patches.push(p);
  }
  const solids = new NatureRockSolids(patches);
  assert.equal(solids.shapeCount, 1);
  assert.equal(solids.solids.length, 48);
  assert(solids.solids.every((s) => s.shape === solids.solids[0].shape));
  const before = solids.support(0, 0).height;
  for (const p of patches)
    updateLodPatch(p, new THREE.Vector3(5, 0, 0), [3], 1 / 60);
  assert.equal(solids.support(0, 0).height, before);
  assert.equal(solids.solids[0].matrix.elements[12], 0);
  const other = new THREE.BufferGeometry();
  other.setAttribute("position", geometry.attributes.position);
  other.setIndex(geometry.index.clone());
  const different = new NatureRockSolids([
    ...patches,
    patch(other, [transform(0, 0, 10)]),
  ]);
  assert.equal(
    different.shapeCount,
    2,
    "shared positions with a separate triangle index are separate kernels",
  );
  assert.equal(disposeInstanceBuffers(world), 24);
  world.traverse((o) => {
    o.geometry?.dispose();
    o.customDepthMaterial?.dispose();
  });
  material.dispose();
  other.dispose();
});

test("a saved ground arrival above a buried rock retains the soil instead of lowering the feet to the scan", () => {
  const geometry = new THREE.BoxGeometry(2, 0.2, 2),
    matrix = transform(0, -0.13528950301299502, 0);
  const g = game(new NatureRockSolids([patch(geometry, [matrix])]));
  assert(g.natureRockSolids.support(0, 0).height < -0.035);
  assert.equal(g.restoreNatureArrival({ x: 0, z: 0, height: 0 }), false);
  assert.equal(g.player.position.y, 0);
  assert.equal(g.jumpY, 0);
  geometry.dispose();
});
