import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { courtTerrain } from "../src/court-terrain.js";

test("overlapping pads join gradually while their working cores and remote ground remain fixed", () => {
  const terraces = [
      { x: 24, z: 32, radius: 14, y: 0 },
      { x: 44, z: 32, radius: 14, y: 6 },
    ],
    heights = courtTerrain(70, 1, terraces, () => 0);
  assert(heights.every(Number.isFinite));
  assert.deepEqual(
    heights,
    courtTerrain(70, 1, terraces, () => 0),
  );
  for (let x = 20; x <= 28; x++) assert.equal(heights[32 * 70 + x], 0);
  for (let x = 40; x <= 48; x++) assert.equal(heights[32 * 70 + x], 6);
  for (let x = 24; x < 44; x++) {
    const rise = heights[32 * 70 + x + 1] - heights[32 * 70 + x];
    assert(rise >= 0 && rise < 1, `Abrupt join at ${x}: ${rise}`);
  }
  assert.equal(heights[0], 0);
});

// All 1.75m terrain vertices in the 14m-square work areas of every main court
// and field site, recorded from the shipped 32c28c6 terrain before regrading.
const coreDigests = {
  verdant: "dfac211dbf2f1271e1c8a85b99143e3f96b854673ac9a056f3e0109e47ec9049",
  frost: "c48cf0d015fd407fe93909d17c923e151cf754c32fa9eb49689a3ea28e228c1c",
  embers: "4b0327c2ead0ec55e0d5c4300d09b0535c51298dcf1f66011b89937d111314b7",
  crystal: "23c27003aa42c05e746782549952d381ba62b49d372e7c8d518dd2819cac1bd6",
  eclipse: "6ca65eaa6cf5fdcdfcbb57e77bd4ae4368e7142ab7c24999403a5fd312a36418",
};
for (const [chapter, digest] of Object.entries(coreDigests))
  test(`${chapter} regrading retains every terrain vertex in the main and field working cores`, () => {
    const level = LEVELS.find((l) => l.id === chapter),
      map = createMap(level),
      p = createTerrainProfile(map, level),
      values = [];
    for (const r of [...map.rooms, ...map.fieldSites])
      for (let z = -7; z <= 7; z += p.step)
        for (let x = -7; x <= 7; x += p.step)
          values.push(p.height(r.x * 7 + x, r.z * 7 + z));
    assert(values.length > 2500);
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(new Float32Array(values).buffer))
        .digest("hex"),
      digest,
    );
  });

test("the recorded snow and crystal court discontinuities become gentler inclines", () => {
  for (const [chapter, points] of [
    [
      2,
      [
        [329, 196],
        [329, 268],
      ],
    ],
    [
      6,
      [
        [343, 79],
        [60, 314],
      ],
    ],
  ]) {
    const level = LEVELS[chapter],
      p = createTerrainProfile(createMap(level), level);
    for (const [x, z] of points) {
      const rise = Math.abs(p.height(x, z + 1.75) - p.height(x, z));
      // The previous rises at these exact intervals were 2.09–6.83m.
      assert(rise < 1, `${level.id} cliff at ${x},${z}: ${rise}`);
    }
  }
});
