import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { waterAt } from "../src/hydrology.js";
import {
  buildWaterSurfaces,
  updateWaterSurfaces,
} from "../src/water-surface.js";

// PlaneGeometry uses the opposite-corner diagonal, while movement samples the
// same grid bilinearly. Both surfaces must contain the water's outer boundary.
function renderedHeight(profile, x, z) {
  const gx = x / profile.step,
    gz = z / profile.step,
    ix = Math.floor(gx),
    iz = Math.floor(gz),
    tx = gx - ix,
    tz = gz - iz,
    a = profile.heights[iz * profile.width + ix],
    b = profile.heights[iz * profile.width + ix + 1],
    c = profile.heights[(iz + 1) * profile.width + ix],
    d = profile.heights[(iz + 1) * profile.width + ix + 1];
  return tx + tz <= 1
    ? a + tx * (b - a) + tz * (c - a)
    : d + (1 - tx) * (c - d) + (1 - tz) * (b - d);
}

test("receiving waters meet dry terrain before their mesh borders, including wave crests and drained wells", () => {
  let boundaries = 0;
  for (const chapter of [0, 3, 5]) {
    const level = LEVELS[chapter],
      map = createMap(level),
      profile = createTerrainProfile(map, level),
      game = {
        level,
        map,
        terrainProfile: profile,
        groundHeight: (x, z) => profile.height(x, z),
        world: new THREE.Group(),
        waterMeshes: [],
        progress: { stage: 0, field: [] },
      };
    buildWaterSurfaces(game);
    for (const water of game.waterMeshes.filter((w) => w.userData.bedWidth)) {
      const s = water.userData;
      for (const side of [-1, 1])
        for (let i = 0; i <= 100; i++)
          for (const [x, z] of [
            [s.x + (side * s.width) / 2, s.z + (i / 100 - 0.5) * s.length],
            [s.x + (i / 100 - 0.5) * s.width, s.z + (side * s.length) / 2],
          ]) {
            for (const height of [
              profile.height(x, z),
              renderedHeight(profile, x, z),
            ])
              assert(
                height > water.position.y + 0.06,
                `${level.id}/${s.id}: an exposed mesh edge at ${x},${z}`,
              );
            assert.equal(waterAt(game, x, z), null);
            boundaries++;
          }
    }
    for (const s of profile.waters.filter((s) => s.fall !== undefined)) {
      const water = waterAt(game, s.x, s.z);
      assert(
        water && water.depth > 0.55,
        "each cascade has a real receiving pool",
      );
    }
    if (chapter === 3) {
      const wells = game.waterMeshes.filter((w) =>
        w.userData.id.startsWith("reservoir-"),
      );
      assert.equal(wells.length, 5);
      game.progress.stage = 10;
      updateWaterSurfaces(game, 100);
      for (const w of wells) {
        assert.equal(w.userData.drain, 1.8);
        assert(w.position.y > -2.3, "a drained well stays above the sea");
        assert(waterAt(game, w.position.x, w.position.z).depth > 2.5);
      }
    }
    if (chapter === 5)
      for (const room of map.rooms.filter((_, i) => i % 2 === 1))
        for (const [dx, dz] of [
          [-7, 9],
          [-15, 16],
          [-6, 4],
        ]) {
          const x = room.x * 7 + dx,
            z = room.z * 7 + dz;
          assert.equal(
            waterAt(game, x, z),
            null,
            "wind working pads have no disconnected puddles",
          );
          assert(
            Math.abs(profile.height(x, z) - profile.foundationHeight(x, z)) <
              1e-5,
          );
        }
    for (const water of game.waterMeshes) {
      water.geometry.dispose();
      water.material.dispose();
    }
  }
  assert(boundaries >= 6000);
});
