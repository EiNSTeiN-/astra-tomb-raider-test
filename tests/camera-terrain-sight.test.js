import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createTerrainSurfaceSampler } from "../src/terrain-surface.js";
import { terrainCameraClear } from "../src/camera-terrain-sight.js";
import { cameraBodyVisibility } from "../src/camera-body-frame.js";

test("body sight detects intervening terrain even when the camera and central arm clear it", () => {
  const game = {
      terrainProfile: { step: 1 },
      groundHeight: (x) => Math.max(0, 1 - Math.abs(x - 1)),
    },
    camera = new THREE.Vector3(2, 1.1, 0),
    boot = { position: new THREE.Vector3(0, 0.03, 0), radius: 0 },
    chest = { position: new THREE.Vector3(0, 1.5, 0), radius: 0 };
  assert(terrainCameraClear(game, chest.position, camera));
  assert.equal(terrainCameraClear(game, boot.position, camera), false);
  assert.equal(cameraBodyVisibility(null, camera, [boot, chest], game), 0.5);
  assert.equal(cameraBodyVisibility(null, camera, [boot, chest]), 1);
});

test("terrain grid and diagonal crossings agree with independent rays through delivered triangle faces", () => {
  const profile = {
      width: 5,
      step: 1,
      height: (x, z) =>
        Math.sin(x * 1.7 + z * 0.8) * 0.7 + Math.cos(z * 2.1) * 0.35,
    },
    groundHeight = createTerrainSurfaceSampler(profile),
    game = { terrainProfile: profile, groundHeight },
    geometry = new THREE.PlaneGeometry(4, 4, 4, 4);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(2, 0, 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++)
    positions.setY(i, profile.height(positions.getX(i), positions.getZ(i)));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(geometry, material),
    ray = new THREE.Raycaster();
  let blocked = 0,
    clear = 0;
  try {
    for (const x of [0.15, 0.85, 1.2, 2.65, 3.8])
      for (const z of [0.2, 0.9, 1.4, 2.8, 3.7])
        for (const [cx, cz] of [
          [0.1, 0.3],
          [3.9, 0.1],
          [0.2, 3.8],
          [3.7, 3.9],
        ])
          for (const lift of [0.035, 0.35, 1.5]) {
            const start = new THREE.Vector3(x, groundHeight(x, z) + lift, z),
              end = new THREE.Vector3(cx, groundHeight(cx, cz) + 0.4, cz),
              direction = end.clone().sub(start);
            ray.set(start, direction.clone().normalize());
            ray.far = direction.length();
            const hit = ray.intersectObject(mesh, false).length > 0;
            assert.equal(terrainCameraClear(game, start, end), !hit);
            if (hit) blocked++;
            else clear++;
          }
    assert(blocked > 50 && clear > 50);
  } finally {
    geometry.dispose();
    material.dispose();
  }
});

test("a joint margin may leave its initial bank but cannot look through a later ridge", () => {
  const start = new THREE.Vector3(0, -0.02, 0),
    camera = new THREE.Vector3(3, 0.5, 0),
    game = { terrainProfile: { step: 1 }, groundHeight: () => 0 };
  assert(terrainCameraClear(game, start, camera));
  game.groundHeight = (x) => Math.max(0, 0.6 - Math.abs(x - 2) * 0.6);
  assert.equal(terrainCameraClear(game, start, camera), false);
});

test("terrain-only clothing targets do not dilute a registered prop obstruction", () => {
  const point = new THREE.Vector3(0, 0.5, 0),
    camera = new THREE.Vector3(0, 1.5, 5),
    game = { groundHeight: () => 0 },
    targets = [
      { position: point, radius: 0 },
      ...Array.from({ length: 100 }, () => ({
        position: point,
        radius: 0,
        terrainOnly: true,
      })),
    ];
  assert.equal(
    cameraBodyVisibility({ entry: () => 0 }, camera, targets, game),
    0,
  );
});
