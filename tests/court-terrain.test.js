import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { courtTerrain } from "../src/court-terrain.js";

test("overlapping discovery pads join gradually while their small landings and remote ground remain fixed", () => {
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
  for (let x = 23; x <= 25; x++) assert.equal(heights[32 * 70 + x], 0);
  for (let x = 43; x <= 45; x++) assert.equal(heights[32 * 70 + x], 6);
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
// 2c14f7d intentionally restored eight sampled vertices beneath crystal
// instrument margins. Require those exact raised values, then substitute only
// their recorded preceding values to retain the original complete-core digest.
const crystalDryMargins = [
  [155, 206.5, 70, 20.96193504333496, 20.962411880493164],
  [315, 56, 175, 14.561964988708496, 15.13120174407959],
  [316, 57.75, 175, 15.11526870727539, 15.48974323272705],
  [317, 59.5, 175, 15.882604598999023, 15.986976623535156],
  [479, 360.5, 189, 10.87144947052002, 11.018095016479492],
  [639, 196, 301, 9.593827247619629, 10.159408569335938],
  [640, 197.75, 301, 10.060240745544434, 10.461645126342773],
  [641, 199.5, 301, 10.918656349182129, 10.935784339904785],
];
for (const [chapter, digest] of Object.entries(coreDigests))
  test(
    chapter === "crystal"
      ? "crystal terrain retains dry instrument corrections and every other recorded working-core vertex"
      : `${chapter} regrading retains every terrain vertex in the main and field working cores`,
    () => {
      const level = LEVELS.find((l) => l.id === chapter),
        map = createMap(level),
        p = createTerrainProfile(map, level),
        values = [];
      for (const r of [...map.rooms, ...map.fieldSites])
        for (let z = -7; z <= 7; z += p.step)
          for (let x = -7; x <= 7; x += p.step) {
            const px = r.x * 7 + x,
              pz = r.z * 7 + z;
            let height = Math.fround(p.height(px, pz));
            const exception =
              chapter === "crystal"
                ? crystalDryMargins.find(([index]) => index === values.length)
                : null;
            if (exception) {
              const [, ex, ez, before, after] = exception;
              assert.equal(px, ex);
              assert.equal(pz, ez);
              assert.equal(height, after, `dry working margin ${px},${pz}`);
              assert(
                after > before,
                "instrument repair must only raise ground",
              );
              height = before;
            }
            values.push(height);
          }
      assert(values.length > 2500);
      if (chapter === "crystal") assert.equal(values.length, 2673);
      assert.equal(
        createHash("sha256")
          .update(Buffer.from(new Float32Array(values).buffer))
          .digest("hex"),
        digest,
      );
    },
  );

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
