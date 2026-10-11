import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile, buildTerrainSurface } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { terrainBodyClear } from "../src/terrain-body-clearance.js";
import { terrainTriangleReader } from "../scripts/inspect-desert-groundcover-browser.js";

for (const level of LEVELS) {
  test(`${level.id} standing and camera ground use the delivered triangle planes`, async (t) => {
    t.mock.method(THREE.TextureLoader.prototype, "load", (url, onLoad) => {
      const texture = new THREE.Texture();
      queueMicrotask(() => onLoad?.(texture));
      return texture;
    });
    const map = createMap(level),
      profile = createTerrainProfile(map, level),
      game = Object.assign(Object.create(Adventure.prototype), {
        level,
        map,
        terrainProfile: profile,
        world: new THREE.Group(),
        waterMeshes: [],
      });
    buildTerrainSurface(game);
    await game.terrainTexturesReady;
    t.after(() => {
      const materials = new Set(),
        textures = new Set();
      game.world.traverse((mesh) => {
        mesh.geometry?.dispose();
        for (const material of [mesh.material].flat().filter(Boolean))
          materials.add(material);
      });
      for (const material of materials) {
        for (const value of Object.values(material))
          if (value?.isTexture) textures.add(value);
        material.dispose();
      }
      for (const texture of textures) texture.dispose();
    });
    const delivered = terrainTriangleReader(game.terrainMeshes);
    // The carved grid also contains submerged banks, cliff approaches and
    // space beneath raised traversal decks. Its every cell is not a bare-floor
    // standing target. Retain the terrain clearance at the authored court centres.
    for (const room of map.rooms)
      assert(
        terrainBodyClear(
          game,
          room.x * 7,
          game.groundHeight(room.x * 7, room.z * 7),
          room.z * 7,
        ),
        `court ${room.index} retains its terrain body clearance`,
      );
    let samples = 0,
      holes = 0,
      precedingMismatch = 0,
      maximum = 0;
    for (let z = 1; z < map.size - 1; z++)
      for (let x = 1; x < map.size - 1; x++) {
        if (!map.grid[z][x]) continue;
        for (const dx of [
          -3.49, -2.77, -1.31, -0.29, 0, 0.43, 1.57, 2.91, 3.49,
        ])
          for (const dz of [
            -3.49, -2.57, -1.07, -0.17, 0, 0.59, 1.63, 2.83, 3.49,
          ]) {
            const px = x * 7 + dx,
              pz = z * 7 + dz,
              height = delivered(px, pz);
            // The water chapter cuts deliberate openings into its underground
            // gallery. Its own floors/decks supply support inside those holes.
            if (height === null) {
              holes++;
              continue;
            }
            const error = Math.abs(game.groundHeight(px, pz) - height);
            maximum = Math.max(maximum, error);
            assert(error < 1e-5, `standing root misses ground at ${px},${pz}`);
            assert.equal(
              game.cameraSpace(new THREE.Vector3(px, height + 0.3, pz)),
              true,
            );
            assert.equal(
              game.cameraSpace(new THREE.Vector3(px, height + 0.26, pz)),
              false,
            );
            if (Math.abs(profile.height(px, pz) - height) > 0.015)
              precedingMismatch++;
            samples++;
          }
      }
    assert(
      samples > 100000,
      "sample every carved walking cell, including diagonal interiors",
    );
    assert.equal(
      holes,
      level.id === "tides" ? 57 : 0,
      "retain exactly the existing gallery cuts",
    );
    if (level.id !== "sands")
      assert(
        precedingMismatch > 300,
        "the bilinear control must expose the support defect",
      );
    t.diagnostic(
      `${samples} ground probes, ${holes} intentional gallery openings, max error ${maximum} m; ${precedingMismatch} bilinear mismatches`,
    );
  });
}
