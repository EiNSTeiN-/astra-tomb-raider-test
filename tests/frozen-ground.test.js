import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile, buildTerrainSurface } from "../src/terrain.js";
import {
  buildWaterSurfaces,
  createWaterSurface,
} from "../src/water-surface.js";
import { waterAt } from "../src/hydrology.js";
import { frozenGroundUniforms } from "../src/frozen-ground.js";

test("frozen puddles share the delivered walking surface instead of a raised ice sheet", async (t) => {
  t.mock.method(THREE.TextureLoader.prototype, "load", (_, loaded) => {
    const texture = new THREE.Texture();
    queueMicrotask(() => loaded?.(texture));
    return texture;
  });
  const level = LEVELS[2],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    game = {
      level,
      map,
      terrainProfile: profile,
      groundHeight: profile.surfaceHeight,
      world: new THREE.Group(),
      waterMeshes: [],
    },
    before = profile.heights.slice(),
    sites = profile.waters.filter((site) => site.kind === "ice"),
    ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  buildTerrainSurface(game);
  buildWaterSurfaces(game);
  await game.terrainTexturesReady;
  game.world.updateMatrixWorld(true);
  const top = (x, z) => {
    ray.ray.origin.set(x, 1000, z);
    const hits = ray.intersectObject(game.world, true);
    assert(hits.length, "terrain must provide a visible walking surface");
    return hits[0].point.y;
  };
  try {
    assert.equal(sites.length, 4);
    assert.deepEqual(profile.heights, before);
    for (const site of sites)
      for (const [dx, dz] of [
        [0, 0],
        [-5, -3],
        [5, 3],
        [-3, 5],
        [3, -5],
      ]) {
        const x = site.x + dx,
          z = site.z + dz;
        assert(Math.abs(top(x, z) - game.groundHeight(x, z)) < 1e-5);
        assert.equal(
          waterAt(game, x, z),
          null,
          "frozen ground cannot trigger swimming",
        );
      }
    // Control: the former flat plane produces a real 25 mm render/support gap.
    const old = createWaterSurface(game, sites[0]);
    game.world.updateMatrixWorld(true);
    assert(
      top(sites[0].x, sites[0].z) - game.groundHeight(sites[0].x, sites[0].z) >
        0.02,
    );
    old.removeFromParent();
    old.geometry.dispose();
    old.material.dispose();
    const uniforms = game.terrainMeshes[0].material.userData.terrainUniforms;
    assert.equal(uniforms.frozenCenters.value.length, sites.length);
    assert.deepEqual(
      uniforms.frozenCenters.value.map((v) => v.toArray()),
      frozenGroundUniforms(sites).frozenCenters.value.map((v) => v.toArray()),
    );
    assert.equal(
      new Set(uniforms.frozenShapes.value.map((v) => v.toArray().join())).size,
      sites.length,
    );
    assert.deepEqual(
      frozenGroundUniforms([{ kind: "water" }]).frozenCenters.value,
      [],
    );
  } finally {
    for (const mesh of game.terrainMeshes) mesh.geometry.dispose();
    const material = game.terrainMeshes[0].material;
    for (const texture of [
      material.map,
      material.normalMap,
      material.roughnessMap,
      ...material.userData.additionalTextures,
    ])
      texture.dispose();
    material.dispose();
  }
});
