import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { skyBankDrop } from "../src/sky-banks.js";

const level = LEVELS[5],
  map = createMap(level),
  profile = createTerrainProfile(map, level);
const digest = (data) => createHash("sha256").update(data).digest("hex");
const heightsDigest = (values) =>
  digest(Buffer.from(new Float32Array(values).buffer));

test("sky shoulders have a shallow, varied cap before descending into the ravine", () => {
  const caps = [];
  for (let z = 0; z < profile.extent; z += 11.3)
    for (let x = 0; x < profile.extent; x += 9.7) {
      assert.equal(skyBankDrop(x, z, 0, level.seed), 0);
      const cap = skyBankDrop(x, z, 1.75, level.seed);
      assert(cap > 0.9 && cap < 2, `Abrupt cap at ${x},${z}: ${cap}`);
      caps.push(cap);
      let previous = 0;
      for (let distance = 0.25; distance <= 36; distance += 0.25) {
        const drop = skyBankDrop(x, z, distance, level.seed);
        assert(drop >= previous && drop <= 64);
        previous = drop;
      }
    }
  assert(Math.max(...caps) - Math.min(...caps) > 0.6);
});

test("shoulder shaping retains the previously shipped deep ravine beyond 26 metres", () => {
  for (const distance of [26, 27.5, 30, 36])
    for (const [x, z, seed] of [
      [0, 0, 0],
      [119, 350, level.seed],
      [-20, 7, 43],
    ])
      assert.equal(
        skyBankDrop(x, z, distance, seed),
        (1 - Math.exp(-distance * 0.72)) * (24 + Math.min(40, distance * 2)),
      );
});

// Recorded from d4bf68e before reshaping the nonwalking cliff shoulders.
test("sky bank shaping preserves every shipped walking-grid terrain vertex", () => {
  const values = [];
  for (let iz = 0; iz < profile.width; iz++)
    for (let ix = 0; ix < profile.width; ix++)
      if (
        map.grid[Math.round((iz * profile.step) / 7)]?.[
          Math.round((ix * profile.step) / 7)
        ]
      )
        values.push(profile.heights[iz * profile.width + ix]);
  assert.equal(values.length, 93632);
  assert.equal(
    heightsDigest(values),
    "588f38680834e445d1c8e6be985a831373b10ddbe7f35ecf12a1000df79c3722",
  );
});

test("sky machinery, discovery pads, reservoirs and all bridge metadata retain their shipped elevations", () => {
  const values = [];
  for (const f of map.features)
    for (let z = -1; z <= 1; z += 0.25)
      for (let x = -1; x <= 1; x += 0.25)
        values.push(profile.height(f.x * 7 + x, f.z * 7 + z));
  assert.equal(values.length, 4779);
  assert.equal(
    heightsDigest(values),
    "90be632040ef7c08802b60f68aeb7598b6b39f610247bb72a2a6e934818d1533",
  );
  assert.equal(profile.bridges.length, 18);
  assert.equal(profile.waters.length, 3);
  assert.equal(
    digest(JSON.stringify(profile.bridges)),
    "e59a84d9e32564159b62713e2de136c741e4b3a6f110eb88b5b992e34af1ed51",
  );
  assert.equal(
    digest(JSON.stringify(profile.waters)),
    "9887186bf7c1560d6ec83902d6f8ab0c508d40580a2ea7adfab3bc00e055916c",
  );
});
