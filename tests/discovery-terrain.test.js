import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";

// All 18 pickup-centre elevations in each affected chapter, recorded from the
// shipped ae0ef6d terrain. Discovery ids and the main/field floors stay fixed.
const centres = {
  verdant: "47a897f8198dfd1a5f9e3c11d95880c3c1e54ef7804b7b7f16c19079b2f0a176",
  frost: "ba0e7cec781bce4162da74ed5bb6a3fb20d1208b145554d10d3b8e2d666a54d7",
  embers: "35a6adbf242cf3d389a1a27a296ead4d7044f3496dd194c70cdf4ad3d3a36643",
  crystal: "9841f049ba4587754fead41219728c6c732392ff52d9786e25e0c7e3520f4149",
  eclipse: "69be535230ec7852729f0e7fce303ec10f8dd681341af59bcb5e80b282ae627f",
};
for (const [id, digest] of Object.entries(centres))
  test(`${id} discovery landings retain every pickup elevation`, () => {
    const level = LEVELS.find((l) => l.id === id),
      map = createMap(level),
      profile = createTerrainProfile(map, level),
      values = map.sideRooms.map((r) => profile.height(r.x * 7, r.z * 7));
    assert.equal(values.length, 18);
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(new Float32Array(values).buffer))
        .digest("hex"),
      digest,
    );
  });

test("recorded discovery terrace cuts become graded approaches around level pickup landings", () => {
  for (const [chapter, indices] of [
    [2, [4, 8, 10, 15, 16]],
    [4, [10]],
    [6, [10, 17]],
    [7, [7, 11]],
  ]) {
    const level = LEVELS[chapter],
      map = createMap(level),
      p = createTerrainProfile(map, level);
    for (const index of indices) {
      const r = map.sideRooms[index],
        x = r.x * 7,
        z = r.z * 7,
        floor = p.height(x, z);
      for (let dz = -1.75; dz <= 1.75; dz += p.step)
        for (let dx = -1.75; dx <= 1.75; dx += p.step)
          assert.equal(
            p.height(x + dx, z + dz),
            floor,
            `${level.id} landing ${index}`,
          );
      // Check both directions through the entire immediate approach, including
      // the neighbouring landing between snow note 4 and cache 15.
      for (let dz = -7; dz <= 7; dz += p.step)
        for (let dx = -7; dx <= 7; dx += p.step)
          for (const [a, b] of [
            [p.step, 0],
            [0, p.step],
          ]) {
            const rise = Math.abs(
              p.height(x + dx + a, z + dz + b) - p.height(x + dx, z + dz),
            );
            assert(rise < 1.35, `${level.id} discovery ${index}: ${rise}`);
          }
    }
  }
});
