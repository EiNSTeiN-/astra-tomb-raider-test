import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { buildTempleArchitecture } from "../src/temple-architecture.js";
import { buildDesertArchitecture } from "../src/desert-architecture.js";
import { buildPalaceArchitecture } from "../src/palace-architecture.js";

for (const [index, build, collection, extra] of [
  [0, buildTempleArchitecture, "templePatches", 0.25],
  [1, buildDesertArchitecture, "desertPatches", 0.25],
  [3, buildPalaceArchitecture, "palacePatches", 0],
])
  test(`${LEVELS[index].id} court footings close exposed gaps after batching and stop the camera`, (t) => {
    t.mock.method(
      THREE.TextureLoader.prototype,
      "load",
      () => new THREE.Texture(),
    );
    const level = LEVELS[index],
      map = createMap(level),
      terrainProfile = createTerrainProfile(map, level),
      world = new THREE.Group(),
      game = {
        level,
        map,
        world,
        terrainProfile,
        groundHeight: terrainProfile.height,
        obstacles: [],
        cameraSurfaces: new CameraSurfaces(world),
        stoneMat: new THREE.MeshStandardMaterial(),
        darkMat: new THREE.MeshStandardMaterial(),
      };
    build(game);
    game.cameraSurfaces.rebuild();
    world.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    let checks = 0,
      joints = 0;
    for (const patch of game[collection]) {
      const base = patch.root.position;
      for (const p of patch.plan.piers || patch.plan.columns) {
        const x = base.x + p.x,
          z = base.z + p.z,
          half = (p.width + extra) / 2,
          center = game.groundHeight(x, z),
          footing = patch.foundations.find((f) => f.x === p.x && f.z === p.z);
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          // Off-center face rays exercise the actual solid backing and courses,
          // rather than merely checking a calculated foundation bounding box.
          for (const u of [-0.3, 0, 0.3]) {
            const px = x + dz * u * p.width,
              pz = z + dx * u * p.width,
              ground = game.groundHeight(px + dx * half, pz + dz * half);
            if (center - ground <= 0.15) continue;
            assert(footing, `${level.id} ${x},${z}: unsupported footing`);
            assert(footing.bottom < ground);
            for (const fraction of [0.2, 0.5, 0.8]) {
              const y = ground + (center - 0.08 - ground) * fraction;
              ray.set(
                new THREE.Vector3(
                  px + dx * (half + 0.4),
                  y,
                  pz + dz * (half + 0.4),
                ),
                new THREE.Vector3(-dx, 0, -dz),
              );
              const hit = ray.intersectObject(patch.root, true)[0];
              assert(
                hit && hit.distance < 0.7,
                `open stonework at ${px},${y},${pz}`,
              );
              checks++;
            }
            assert(
              game.cameraSurfaces.entry(
                new THREE.Vector3(
                  px + dx * (half + 1),
                  ground + 0.05,
                  pz + dz * (half + 1),
                ),
                new THREE.Vector3(px, ground + 0.05, pz),
              ) < 1,
            );
          }
          if (index === 1) {
            for (const y of [0.35, 0.4, 0.47]) {
              ray.set(
                new THREE.Vector3(
                  x + dx * (half + 0.4),
                  center + y,
                  z + dz * (half + 0.4),
                ),
                new THREE.Vector3(-dx, 0, -dz),
              );
              const hit = ray.intersectObject(patch.root, true)[0];
              assert(
                hit && hit.distance < 0.7,
                `shaft floats above its cap at ${x},${z}`,
              );
              joints++;
            }
          }
        }
      }
    }
    assert(checks > 60);
    if (index === 1) assert.equal(joints, 108 * 4 * 3);
    world.traverse((o) => {
      o.geometry?.dispose();
      o.customDepthMaterial?.dispose();
    });
  });
