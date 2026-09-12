import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { masonryFoundation } from "../src/masonry-foundations.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildMonasteryArchitecture } from "../src/monastery-architecture.js";
import { CameraSurfaces } from "../src/camera-collision.js";

test("masonry foundation covers sloping grid cells without changing the cap elevation or expanding its footprint", () => {
  assert.equal(
    masonryFoundation(() => 5, 0, 0, 2, 2),
    null,
  );
  const h = (x, z) => 5 + x * 0.7 - z * 0.4;
  const p = masonryFoundation(h, 0, 0, 2, 2);
  assert(p.bottom < h(-1, 1));
  assert.equal(p.top, 5.035);
  assert(p.width < 2 && p.depth < 2);
  for (let i = 1; i < p.courses.length; i++) {
    const a = p.courses[i - 1],
      b = p.courses[i];
    assert(a.y + a.height / 2 > b.y - b.height / 2);
  }
  assert(p.courses.every((c) => c.height > 0 && c.height <= 0.465));
});

test("all nine built monastery courts carry their exposed post bases into the terrain after batching", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[2],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level);
  const world = new THREE.Group(),
    game = {
      level,
      map,
      world,
      terrainProfile,
      groundHeight: terrainProfile.height,
      obstacles: [],
      cameraSurfaces: new CameraSurfaces(world),
    };
  buildMonasteryArchitecture(game);
  game.cameraSurfaces.rebuild();
  world.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  let tested = 0,
    previousGaps = 0;
  for (const patch of game.monasteryPatches) {
    const base = patch.root.position;
    for (const p of patch.plan.posts) {
      const x = base.x + p.x,
        z = base.z + p.z,
        half = (p.width + 0.22) / 2;
      const center = game.groundHeight(x, z),
        foundation = patch.foundations.find((f) => f.x === p.x && f.z === p.z);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const ground = game.groundHeight(x + dx * half, z + dz * half);
        if (center - ground < 0.14) continue;
        previousGaps++;
        assert(
          foundation,
          `court at ${base.x},${base.z} post ${p.x},${p.z} needs support`,
        );
        assert(foundation.bottom < ground);
        for (const fraction of [0.2, 0.5, 0.8]) {
          const y = ground + (center - 0.08 - ground) * fraction;
          ray.set(
            new THREE.Vector3(x + dx * (half + 0.4), y, z + dz * (half + 0.4)),
            new THREE.Vector3(-dx, 0, -dz),
          );
          const hit = ray.intersectObject(patch.root, true)[0];
          assert(
            hit && hit.distance < 0.65,
            `missing support at ${x},${y},${z}`,
          );
          tested++;
        }
        assert(
          game.cameraSurfaces.entry(
            new THREE.Vector3(x + dx * 2, ground + 0.05, z + dz * 2),
            new THREE.Vector3(x, ground + 0.05, z),
          ) < 1,
        );
      }
    }
  }
  assert(previousGaps > 35 && tested > 100);
  world.traverse((o) => {
    o.geometry?.dispose();
    o.customDepthMaterial?.dispose();
  });
});
