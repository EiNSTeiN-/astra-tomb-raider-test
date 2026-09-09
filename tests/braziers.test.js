import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import {
  buildBrazier,
  finishBraziers,
  updateBraziers,
} from "../src/braziers.js";
import { buildFireEffects, updateFireEffects } from "../src/effects.js";
import { buildSoundLandmarks } from "../src/sound-landmarks.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { safeArrival } from "../src/character-motion.js";

function fixture(level = LEVELS[0]) {
  const map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile,
    world,
    groundHeight: terrainProfile.height,
    darkMat: new THREE.MeshStandardMaterial({
      map: new THREE.Texture(),
      normalMap: new THREE.Texture(),
      roughnessMap: new THREE.Texture(),
    }),
    items: [],
    waterMeshes: [],
    flames: [],
    obstacles: [],
    traversalCourses: [],
    player: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(55, 1.5, 0.1, 400),
    elapsed: 0,
    paused: false,
    store: { data: { settings: { quality: "high" } } },
    progress: { stage: 0, field: [] },
  });
  world.add(game.player);
  game.cameraSurfaces = new CameraSurfaces(world);
  for (const [i, room] of map.rooms.entries())
    for (const side of [-1, 1])
      buildBrazier(
        game,
        room.x * 7 + side * 8,
        room.z * 7 - 9,
        `court-${i}-${side}`,
      );
  finishBraziers(game);
  game.cameraSurfaces.rebuild();
  return game;
}

test("all 154 courtyard braziers retain their fire anchors and have grounded, solid, camera-safe supports", (t) => {
  let count = 0;
  const budgets = [],
    motifs = new Set();
  for (const level of LEVELS) {
    const game = fixture(level),
      kit = game.brazierKit;
    assert.deepEqual(
      game.brazierStats.map((s) => s.calls),
      [4, 4],
    );
    assert(
      game.brazierStats[0].triangles < 18000 &&
        game.brazierStats[1].triangles < 1400,
    );
    for (const tier of kit.tiers)
      for (const { geometry } of tier) {
        for (const a of Object.values(geometry.attributes))
          assert(a.array.every(Number.isFinite));
        assert(
          geometry.boundingBox.min.y >= -0.061 &&
            geometry.boundingBox.max.y < 2.91,
        );
        assert(
          geometry.boundingBox.min.x > -0.83 &&
            geometry.boundingBox.max.x < 0.83,
        );
        assert(
          geometry.boundingBox.min.z > -0.83 &&
            geometry.boundingBox.max.z < 0.83,
        );
      }
    const metal = kit.tiers[0].find((p) => p.material === kit.materials.metal)
      .geometry.attributes.position.array;
    motifs.add(
      createHash("sha256").update(new Uint8Array(metal.buffer)).digest("hex"),
    );
    assert.equal(
      kit.materials.stone.map,
      game.darkMat.map,
      "reuse existing images and GPU textures",
    );
    assert.equal(kit.materials.recess.normalMap, game.darkMat.normalMap);
    for (const b of game.braziers) {
      count++;
      const c = b.group.position;
      assert.deepEqual(b.fire.getWorldPosition(new THREE.Vector3()).toArray(), [
        c.x,
        game.groundHeight(c.x, c.z) + 3.1,
        c.z,
      ]);
      assert(!game.canMove(c.x, c.z, 0));
      for (const [dx, dz] of [
        [1.35, 0],
        [-1.35, 0],
        [0, 1.35],
        [0, -1.35],
      ])
        assert(
          game.canMove(c.x + dx, c.z + dz, 0),
          `${level.id}/${b.id}: blocked approach`,
        );
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6,
          x = c.x + Math.sin(a) * 0.6,
          z = c.z + Math.cos(a) * 0.6;
        assert(
          c.y - 0.06 - game.groundHeight(x, z) < 0.04,
          `${level.id}/${b.id}: floating plinth`,
        );
      }
      const arrival = safeArrival(game, { x: c.x, y: c.y, z: c.z });
      assert(
        arrival &&
          game.canMove(
            arrival.x,
            arrival.z,
            arrival.y - game.groundHeight(arrival.x, arrival.z),
          ),
      );
      assert(
        game.cameraSurfaces.entry(
          c.clone().add(new THREE.Vector3(0, 1.5, -3)),
          c.clone().add(new THREE.Vector3(0, 1.5, 3)),
        ) < 1,
      );
    }
    budgets.push({
      biome: level.biome,
      ...game.brazierStats[0],
      distant: game.brazierStats[1].triangles,
    });
  }
  assert.equal(count, 154);
  assert.equal(motifs.size, 8);
  t.diagnostic(JSON.stringify(budgets));
});

test("braziers keep one positioned fire voice and the shared four-light budget while fire animation freezes on pause", () => {
  const game = fixture(),
    first = game.braziers[0];
  game.map = { ...game.map, rooms: [] };
  buildSoundLandmarks(game);
  assert.equal(game.soundSources.length, game.braziers.length);
  for (const [i, b] of game.braziers.entries())
    assert.deepEqual(
      [game.soundSources[i].x, game.soundSources[i].y, game.soundSources[i].z],
      b.fire.getWorldPosition(new THREE.Vector3()).toArray(),
    );
  const material = first.fire.material,
    geometry = first.fire.geometry;
  buildFireEffects(game);
  assert.equal(first.fire.material, material);
  assert.equal(first.fire.geometry, geometry);
  assert.equal(game.fireLights.length, 4);
  game.player.position
    .copy(first.group.position)
    .add(new THREE.Vector3(2, 0, 0));
  game.camera.position
    .copy(game.player.position)
    .add(new THREE.Vector3(0, 4, 4));
  game.elapsed = 2;
  updateBraziers(game);
  updateFireEffects(game);
  assert.equal(game.brazierTime.value, 2);
  const light = game.fireLights.find(
    (l) =>
      l.visible &&
      l.position.distanceTo(first.fire.getWorldPosition(new THREE.Vector3())) <
        0.001,
  );
  assert(light);
  const intensity = light.intensity;
  game.paused = true;
  game.elapsed = 7;
  updateBraziers(game);
  updateFireEffects(game);
  assert.equal(game.brazierTime.value, 2);
  assert.equal(light.intensity, intensity);
  assert(
    Math.abs(
      new THREE.Vector3(0, 1, 0).applyQuaternion(first.fire.quaternion).y - 1,
    ) < 1e-8,
    "flame stays upright under an elevated camera",
  );
});

test("brazier detail crossfades per instance without moving its anchor, then culls distant geometry and particles", () => {
  const game = fixture(),
    b = game.braziers[0],
    c = b.group.position.clone(),
    patch = game.brazierPatch;
  game.player.position.copy(c);
  updateBraziers(game);
  assert.equal(patch.states[0].tier, 0);
  assert(b.smoke.visible && b.sparks.visible);
  const matrix = patch.matrices[0].clone();
  game.player.position.x += 40;
  updateBraziers(game, 0.15);
  assert.equal(patch.states[0].tier, 1);
  assert.equal(patch.states[0].blend, 0.5);
  assert(!b.smoke.visible && !b.sparks.visible && b.fire.visible);
  updateBraziers(game, 0.15);
  assert.equal(patch.states[0].blend, 1);
  game.store.data.settings.quality = "low";
  game.player.position.x += 70;
  updateBraziers(game);
  assert.equal(patch.states[0].tier, 2);
  assert(!b.fire.visible);
  assert(patch.matrices[0].equals(matrix));
  for (const [i, tier] of patch.tiers.entries())
    for (const [j, mesh] of tier.entries()) {
      assert.equal(
        mesh.geometry.attributes.position,
        game.brazierKit.tiers[i][j].geometry.attributes.position,
      );
      assert(mesh.castShadow && mesh.receiveShadow);
      assert(mesh.customDepthMaterial.userData.instanceLod);
    }
});
