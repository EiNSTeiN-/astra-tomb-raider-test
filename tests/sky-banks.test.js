import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { skyBankDrop, skyBridgePathWeight } from "../src/sky-banks.js";
import { spanCoordinates } from "../src/sky-bridge-rules.js";

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

// The bridge-fringe repair changes 3,159 walking vertices: 3,115 rise beneath
// parallel paths and 44 nearby erosion samples lower slightly. Other shipped
// walking vertices and every recorded working pad retain their earlier heights.
test("sky walking terrain retains the approved bridge-fringe grading", () => {
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
    "685a887f5d1fa59a9e3b70e16f3d8b7367abe60b6f339a4bccdb76ad6d7a7ac8",
  );
});

test("walking vertices beyond the affected bridge fringes retain their shipped heights", () => {
  const values = [];
  for (let iz = 0; iz < profile.width; iz++)
    for (let ix = 0; ix < profile.width; ix++) {
      const x = ix * profile.step,
        z = iz * profile.step;
      if (!map.grid[Math.round(z / 7)]?.[Math.round(x / 7)]) continue;
      if (
        profile.bridges.some((b) => {
          const p = spanCoordinates(b, x, z);
          return (
            p.along >= -4 &&
            p.along <= p.length + 4 &&
            Math.abs(p.across) > 2.5 &&
            Math.abs(p.across) < 15
          );
        })
      )
        continue;
      values.push(profile.heights[iz * profile.width + ix]);
    }
  assert.equal(values.length, 82606);
  // Recorded from ee5e4bf before the parallel walking paths were regraded.
  assert.equal(
    heightsDigest(values),
    "3ffa16b104ec647ca0b03bad122b956710cbdfad880303ab33390a32f66b1ce3",
  );
});

test("path protection leaves the full bridge ravine and outer nonwalking cliffs intact", () => {
  const bridge = { ax: 0, az: 0, bx: 42, bz: 0 };
  for (let along = 0; along <= 42; along += 1.5) {
    for (let across = -4.5; across <= 4.5; across += 0.25)
      assert.equal(skyBridgePathWeight(bridge, along, across, 0), 1);
    for (const across of [-11, -6.5, 6.5, 11]) {
      assert.equal(skyBridgePathWeight(bridge, along, across, 0), 0);
      assert.equal(skyBridgePathWeight(bridge, along, across, 0.75), 0);
    }
    for (let across = -12; across <= 12; across += 0.25)
      assert.equal(skyBridgePathWeight(bridge, along, across, 2.5), 1);
  }
});

test("path margins and excavation fringes blend continuously on both sides of a span", () => {
  const bridge = { ax: 0, az: 0, bx: 42, bz: 0 };
  for (const sign of [-1, 1]) {
    let previous = 1;
    for (let across = 4.5; across <= 6.5; across += 0.01) {
      const weight = skyBridgePathWeight(bridge, 21, sign * across, 0);
      assert(weight >= 0 && weight <= previous);
      assert(previous - weight < 0.008);
      previous = weight;
    }
    previous = 0;
    for (let distance = 0.75; distance <= 2.5; distance += 0.01) {
      const weight = skyBridgePathWeight(bridge, 21, sign * 10, distance);
      assert(weight >= previous && weight <= 1);
      assert(weight - previous < 0.009);
      previous = weight;
    }
  }
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
