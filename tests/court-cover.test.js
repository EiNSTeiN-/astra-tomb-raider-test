import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { supportAt, safeArrival } from "../src/character-motion.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { buildCourtCover } from "../src/court-cover.js";

function fixture(level) {
  const map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    world,
    terrainProfile,
    groundHeight: terrainProfile.height,
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    obstacles: [],
    cameraSurfaces: new CameraSurfaces(world),
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    jumpY: 0,
    yaw: 0,
    audio: { tone() {} },
    grounded: true,
    items: [],
    waterMeshes: [],
    skyBridges: [],
  });
  for (const room of map.rooms.filter((r) => r.index % 3 === 1))
    buildCourtCover(game, room);
  game.cameraSurfaces.rebuild();
  world.updateMatrixWorld(true);
  return game;
}
function dispose(game) {
  game.world.traverse((o) => o.geometry?.dispose());
  for (const material of new Set(Object.values(game.courtCoverMaterials)))
    material?.dispose();
  game.stoneMat.dispose();
  game.darkMat.dispose();
}

test("all 25 delivered cover roofs match their standing surfaces, including former phantom edges", () => {
  const ray = new THREE.Raycaster();
  let count = 0,
    rays = 0;
  for (const level of LEVELS) {
    const game = fixture(level);
    for (const cover of game.courtCovers) {
      const { x, z, top } = cover.plan;
      for (let ix = 0; ix <= 16; ix++)
        for (let iz = 0; iz <= 6; iz++) {
          const px = x - 3.799 + (ix * 7.598) / 16,
            pz = z - 0.999 + (iz * 1.998) / 6;
          ray.set(
            new THREE.Vector3(px, top + 1, pz),
            new THREE.Vector3(0, -1, 0),
          );
          const hit = ray.intersectObject(cover.root, true)[0];
          assert(hit, level.id + " roof at " + px + "," + pz);
          assert(
            Math.abs(hit.point.y - top) <= 0.00501,
            "roof/support mismatch",
          );
          assert.equal(supportAt(game, px, pz).height, top);
          rays++;
        }
      const bounds = new THREE.Box3().setFromObject(cover.root);
      assert(bounds.min.x >= x - 3.80001 && bounds.max.x <= x + 3.80001);
      assert(bounds.min.z >= z - 1.00001 && bounds.max.z <= z + 1.00001);
      assert(bounds.max.y <= top + 0.00001);
      assert(cover.root.children.length <= 4, "bounded material batches");
      count++;
    }
    dispose(game);
  }
  assert.equal(count, 25);
  assert.equal(rays, 2975);
});

test("all cover foundations close the recorded sloping-ground gaps after geometry batching", () => {
  const ray = new THREE.Raycaster();
  let rays = 0,
    sloped = 0;
  for (const level of LEVELS) {
    const game = fixture(level);
    for (const cover of game.courtCovers) {
      const { x, z, bottom, base } = cover.plan;
      if (base - bottom > 0.21) sloped++;
      for (const side of [-1, 1])
        for (const along of [-0.85, -0.4, 0, 0.4, 0.85]) {
          for (const axis of ["x", "z"]) {
            const px = x + (axis === "x" ? side * 3.7 : along * 3.7),
              pz = z + (axis === "z" ? side * 0.88 : along * 0.88),
              ground = game.groundHeight(px, pz);
            assert(bottom < ground - 0.17);
            const start = new THREE.Vector3(px, ground + 0.015, pz);
            start[axis] += side * 0.6;
            const direction = new THREE.Vector3();
            direction[axis] = -side;
            ray.set(start, direction);
            const hit = ray.intersectObject(cover.root, true)[0];
            assert(
              hit && hit.distance < 0.65,
              level.id + " unsupported footing",
            );
            rays++;
          }
        }
    }
    dispose(game);
  }
  assert.equal(rays, 500);
  assert(sloped >= 10, "real campaign slopes exercised");
});

test("each regional cover blocks ground movement and supports mantling, occupied arrivals and departure", () => {
  const styles = new Set(),
    motifs = new Set();
  let count = 0;
  for (const level of LEVELS) {
    const game = fixture(level);
    for (const cover of game.courtCovers) {
      const { x, z, base, top } = cover.plan;
      styles.add(cover.style);
      motifs.add(cover.motif);
      assert.equal(game.canMove(x, z, 0), false);
      assert.equal(game.canMove(x, z, top - base), true);
      game.player.position.set(x, game.groundHeight(x, z + 2.3), z + 2.3);
      game.climb = null;
      assert(game.tryClimb(0, -1), level.id + " mantle");
      assert.equal(game.climb.end.y, top);
      assert.equal(
        supportAt(game, game.climb.end.x, game.climb.end.z).surface,
        cover.obstacle,
      );
      const arrival = safeArrival(game, { x, z, y: top });
      assert(Math.hypot(arrival.x - x, arrival.z - z) < 1e-8);
      assert(Math.abs(arrival.y - top) < 1e-8);
      assert.equal(supportAt(game, x, z + 1.01).surface, null);
      const below = new THREE.Vector3(x, base + 0.6, z + 3),
        inward = new THREE.Vector3(x, base + 0.6, z);
      assert(game.cameraSurfaces.entry(below, inward, 0) < 1);
      assert.equal(game.lineOfSight(below, inward, 0, 0), false);
      count++;
    }
    dispose(game);
  }
  assert.equal(count, 25);
  assert.equal(styles.size, 8);
  assert.equal(motifs.size, 8);
});

test("the relocated foundry walls leave valve working rows clear and older occupied elevations retain clear arrival coordinates", () => {
  const game = fixture(LEVELS[4]);
  for (const cover of game.courtCovers) {
    const { x, z } = cover.plan;
    assert.equal(cover.obstacle.h, 1.3);
    assert.equal(cover.obstacle.w, 3.8);
    assert.equal(cover.obstacle.d, 1);
    // The first thermal row starts at room z + 8.5. The rear of the
    // relocated parapet is room z + 4, leaving a 4.5 m working strip.
    assert.equal(z % 7, 3);
    assert(game.canMove(x, z + 4, 0));
    const oldZ = z + 4,
      oldBase = game.groundHeight(x, oldZ),
      arrival = safeArrival(game, { x, z: oldZ, y: oldBase + 1.3 });
    assert.equal(arrival.x, x);
    assert.equal(arrival.z, oldZ);
    assert.equal(arrival.y, oldBase + 1.3);
    assert.equal(supportAt(game, x, oldZ).height, oldBase);
  }
  dispose(game);
});
