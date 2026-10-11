import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createTerrainSurfaceSampler } from "../src/terrain-surface.js";
import { Adventure } from "../src/game.js";
import { palmGeometry, palmSeatHeight } from "../src/desert-palms.js";

function terrain(profile) {
  const extent = (profile.width - 1) * profile.step,
    geometry = new THREE.PlaneGeometry(
      extent,
      extent,
      profile.width - 1,
      profile.width - 1,
    );
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(extent / 2, 0, extent / 2);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setY(i, profile.height(p.getX(i), p.getZ(i)));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  mesh.updateMatrixWorld(true);
  return mesh;
}

test("surface support and the actual game ground getter match independent delivered triangle rays on diagonal cells and boundaries", () => {
  const profile = {
      width: 17,
      step: 1.75,
      height: (x, z) =>
        3 + Math.sin(x * 0.47) * Math.cos(z * 0.38) * 1.1 + x * 0.04 - z * 0.02,
    },
    mesh = terrain(profile),
    surface = createTerrainSurfaceSampler(profile),
    game = {
      terrainProfile: { ...profile, surfaceHeight: surface },
      level: { biome: "desert" },
    },
    ray = new THREE.Raycaster();
  let samples = 0,
    oldMismatch = 0;
  for (let z = 0.13; z < 28; z += 0.63)
    for (let x = 0.17; x < 28; x += 0.71) {
      ray.set(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0];
      assert(hit);
      assert(Math.abs(surface(x, z) - hit.point.y) < 1e-6);
      assert(
        Math.abs(
          Adventure.prototype.groundHeight.call(game, x, z) - hit.point.y,
        ) < 1e-6,
      );
      if (Math.abs(profile.height(x, z) - hit.point.y) > 0.015) oldMismatch++;
      samples++;
    }
  assert(samples > 1500 && oldMismatch > 100);
  for (const [x, z] of [
    [-5, 6],
    [33, 6],
    [6, -5],
    [6, 33],
    [28, 28],
  ]) {
    ray.set(
      new THREE.Vector3(
        Math.max(0, Math.min(28, x)),
        50,
        Math.max(0, Math.min(28, z)),
      ),
      new THREE.Vector3(0, -1, 0),
    );
    assert(
      Math.abs(surface(x, z) - ray.intersectObject(mesh)[0].point.y) < 1e-6,
    );
  }
  mesh.geometry.dispose();
  mesh.material.dispose();
});

test("ground getter retains unspecialized fields and cooled lava support", () => {
  const game = {
    terrainProfile: { height: () => -0.5 },
    level: { biome: "volcano" },
    waterMeshes: [
      {
        position: new THREE.Vector3(5, 2, 5),
        userData: { kind: "lava", cooled: true, width: 4, length: 4 },
      },
    ],
  };
  assert.equal(Adventure.prototype.groundHeight.call(game, 0, 0), -0.5);
  assert.equal(Adventure.prototype.groundHeight.call(game, 5, 5), 2);
});

test("palm root seating includes a triangular valley inside an edge whose endpoints are higher", () => {
  const profile = {
      width: 2,
      step: 1,
      height: (x, z) => 1 - x - z + 2 * x * z,
    },
    height = createTerrainSurfaceSampler(profile),
    mesh = terrain(profile),
    a = new THREE.Vector3(0.2, 0, 0.6),
    b = new THREE.Vector3(0.8, 0, 0.6),
    palm = { x: 0, z: 0, y: 0.3, angle: 0, scale: 1 },
    y = palmSeatHeight(palm, [[a, b]], height, 1),
    ray = new THREE.Raycaster();
  assert(Math.abs(y + 0.04) < 1e-8);
  for (let i = 0; i <= 64; i++) {
    const p = a.clone().lerp(b, i / 64);
    ray.set(new THREE.Vector3(p.x, 10, p.z), new THREE.Vector3(0, -1, 0));
    assert(y <= ray.intersectObject(mesh)[0].point.y - 0.039999);
  }
  mesh.geometry.dispose();
  mesh.material.dispose();
});

test("all palm root rings remain buried against independent slope rays through their rotation and scale range", () => {
  const profile = {
      width: 17,
      step: 1,
      height: (x, z) =>
        2 + Math.sin(x * 0.9) * Math.cos(z * 0.8) * 1.4 + x * 0.1 - z * 0.04,
    },
    surface = createTerrainSurfaceSampler(profile),
    mesh = terrain(profile),
    ray = new THREE.Raycaster();
  let samples = 0;
  for (let variant = 0; variant < 3; variant++) {
    const geometries = [0, 1, 2].map((tier) => palmGeometry(variant, tier)),
      rings = geometries.map(({ trunk }) => {
        const p = trunk.attributes.position,
          uv = trunk.attributes.uv,
          roots = [];
        for (let i = 0; i < p.count; i++)
          if (uv.getY(i) === 0)
            roots.push(new THREE.Vector3().fromBufferAttribute(p, i));
        return roots;
      });
    for (const angle of [0, 0.71, 2.8])
      for (const scale of [0.85, 1.35]) {
        const palm = {
            x: 7.73,
            z: 6.27,
            y: surface(7.73, 6.27) - 0.35,
            angle,
            scale,
          },
          y = palmSeatHeight(palm, rings, surface, 1),
          matrix = new THREE.Matrix4().compose(
            new THREE.Vector3(palm.x, y, palm.z),
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              angle,
            ),
            new THREE.Vector3(scale, scale, scale),
          );
        matrix.fromArray(new Float32Array(matrix.elements));
        for (const ring of rings)
          for (let i = 0; i < ring.length; i++)
            for (let j = 0; j <= 16; j++) {
              const p = ring[i]
                .clone()
                .lerp(ring[(i + 1) % ring.length], j / 16)
                .applyMatrix4(matrix);
              ray.set(
                new THREE.Vector3(p.x, 30, p.z),
                new THREE.Vector3(0, -1, 0),
              );
              const hit = ray.intersectObject(mesh)[0];
              assert(hit && p.y <= hit.point.y - 0.025);
              samples++;
            }
      }
    for (const shape of geometries) {
      shape.trunk.dispose();
      shape.foliage.dispose();
    }
  }
  assert(samples > 8000);
  mesh.geometry.dispose();
  mesh.material.dispose();
});
