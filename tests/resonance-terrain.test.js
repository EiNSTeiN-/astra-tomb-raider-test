import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { RESONANCE_TRIALS } from "../src/resonance-rules.js";
import { waterAt } from "../src/hydrology.js";

function fixture() {
  const level = LEVELS[6],
    map = createMap(level),
    profile = createTerrainProfile(map, level);
  return {
    map,
    profile,
    groundHeight: profile.surfaceHeight,
    waterMeshes: profile.waters.map((s) => ({
      userData: s,
      position: { x: s.x, y: s.baseY, z: s.z },
    })),
  };
}

test("all 33 crystal instruments and complete working margins clear reservoir wave crests", (t) => {
  const game = fixture();
  let nodes = 0,
    probes = 0,
    covered = 0,
    minimumGap = Infinity;
  for (const f of game.map.features.filter((f) => f.type === "mechanism"))
    for (const [dx, dz] of RESONANCE_TRIALS[f.stage].positions) {
      const x = f.x * 7 + dx,
        z = f.z * 7 + dz;
      nodes++;
      for (const [centerZ, radius] of [
        [z, 1.42],
        [z + 1.9, 0.65],
      ])
        for (let i = 0; i < 64; i++) {
          const a = (i * Math.PI) / 32,
            px = x + Math.cos(a) * radius,
            pz = centerZ + Math.sin(a) * radius;
          assert.equal(waterAt(game, px, pz), null, "occupied working margin");
          for (const w of game.waterMeshes) {
            const s = w.userData;
            if (
              Math.abs(px - s.x) > s.width / 2 ||
              Math.abs(pz - s.z) > s.length / 2
            )
              continue;
            const gap = game.groundHeight(px, pz) - w.position.y;
            minimumGap = Math.min(minimumGap, gap);
            // The three surface harmonics have a combined amplitude of .051 m.
            assert(gap >= 0.071, "a wave crest can cover the working ground");
            covered++;
          }
          probes++;
        }
    }
  assert.equal(nodes, 33);
  assert.equal(probes, 4224);
  assert(covered > 100);
  t.diagnostic(
    `${probes} footprint probes, ${covered} inside water bounds; minimum dry margin ${minimumGap} m`,
  );
});

test("the reproduced submerged wheel centres are above their unchanged water planes", () => {
  const game = fixture();
  for (const [x, z, oldFloor, waterY] of [
    [57, 179, 14.563368388584681, 15.999115295410157],
    [195, 305, 9.550593376159668, 10.789776130987667],
  ]) {
    assert(oldFloor + 1.07 < waterY, "recorded previous wheel is submerged");
    assert(game.groundHeight(x, z) > waterY + 0.071);
    assert(game.groundHeight(x, z + 1.9) > waterY + 0.071);
    assert.equal(waterAt(game, x, z + 1.9), null);
  }
});

test("all four crystal reservoirs retain visible water away from the instruments", (t) => {
  const game = fixture();
  let wet = 0;
  for (const water of game.waterMeshes) {
    const s = water.userData;
    let count = 0,
      deepest = 0;
    for (let x = s.x - s.width / 2; x <= s.x + s.width / 2; x += 0.5)
      for (let z = s.z - s.length / 2; z <= s.z + s.length / 2; z += 0.5) {
        const depth = water.position.y - game.groundHeight(x, z);
        if (depth > 0.075) count++;
        deepest = Math.max(deepest, depth);
      }
    assert(count > 20, "the reservoir must retain a visible pool");
    assert(
      deepest > 0.35,
      "the preserved instruments must not erase the basin",
    );
    wet += count;
    t.diagnostic(`${s.id}: ${count} wet samples, maximum depth ${deepest} m`);
  }
  assert.equal(game.waterMeshes.length, 4);
  assert(wet > 100);
});
