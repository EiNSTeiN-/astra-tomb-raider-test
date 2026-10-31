import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import {
  skyBankDrop,
  skyBankExtension,
  skyBridgePathWeight,
  createSkyShoulders,
} from "../src/sky-banks.js";
import { Adventure } from "../src/game.js";
import { courierCorridor } from "../src/courier-rules.js";
import { spanCoordinates } from "../src/sky-bridge-rules.js";

const level = LEVELS[5],
  map = createMap(level),
  profile = createTerrainProfile(map, level);
const digest = (data) => createHash("sha256").update(data).digest("hex");
const heightsDigest = (values) =>
  digest(Buffer.from(new Float32Array(values).buffer));

test("sky shoulders extend into varied upper lobes before descending monotonically into the ravine", () => {
  const contours = [];
  for (let z = 0; z < profile.extent; z += 11.3)
    for (let x = 0; x < profile.extent; x += 9.7) {
      assert.equal(skyBankDrop(x, z, 0, level.seed), 0);
      const extension = skyBankExtension(x, z, level.seed);
      assert(extension >= 1.25 && extension <= 9.75);
      assert.equal(skyBankDrop(x, z, extension, level.seed), 0);
      const cap = skyBankDrop(x, z, 1.75, level.seed);
      assert(cap >= 0 && cap < 0.3, `Abrupt cap at ${x},${z}: ${cap}`);
      let previous = 0;
      let contour;
      for (let distance = 0.25; distance <= 36; distance += 0.25) {
        const drop = skyBankDrop(x, z, distance, level.seed);
        assert(drop >= previous && drop <= 64);
        if (contour === undefined && drop >= 3) contour = distance;
        previous = drop;
      }
      contours.push(contour);
    }
  assert(Math.max(...contours) - Math.min(...contours) > 7);
});

test("new island lobes blend away from every receiving shore and bridge approach", () => {
  const layout = createSkyShoulders(map, profile.waters, level.seed);
  for (const w of profile.waters)
    for (const x of [w.x - w.width / 2 - 2, w.x, w.x + w.width / 2 + 2])
      for (const z of [w.z - w.length / 2 - 2, w.z, w.z + w.length / 2 + 2])
        assert.equal(layout.extension(x, z), 0);
  for (const bridge of map.bridges) {
    const p = spanCoordinates(bridge, bridge.ax, bridge.az);
    for (let along = 0; along <= p.length; along += 1.75)
      for (const across of [-12, -5, 0, 5, 12]) {
        const x = bridge.ax + p.ux * along + p.uz * across,
          z = bridge.az + p.uz * along - p.ux * across;
        assert(layout.extension(x, z) < 1e-20);
        assert.equal(profile.walkableBank(x, z), false);
      }
  }
  const water = [];
  for (let iz = 0; iz < profile.width; iz++)
    for (let ix = 0; ix < profile.width; ix++) {
      const x = ix * profile.step,
        z = iz * profile.step;
      if (
        profile.waters.some(
          (w) =>
            Math.abs(x - w.x) <= w.width / 2 + 2 &&
            Math.abs(z - w.z) <= w.length / 2 + 2,
        )
      )
        water.push(profile.heights[iz * profile.width + ix]);
    }
  assert.equal(water.length, 672);
  // Recorded on a66c837 before the island outlines changed.
  assert.equal(
    heightsDigest(water),
    "fce90a76e781c1517e41e0442a175b657d2d5a809ac9353b67ca2ad38f789aa0",
  );
});

test("flat new shelves outside the old grid accept the ordinary movement footprint", () => {
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile: profile,
    groundHeight: profile.surfaceHeight,
    obstacles: [],
    jumpY: 0,
  });
  let accessible = 0;
  for (let z = 14; z < profile.extent - 14; z += 3.5)
    for (let x = 14; x < profile.extent - 14; x += 3.5) {
      if (map.grid[Math.round(z / 7)]?.[Math.round(x / 7)]) continue;
      if (courierCorridor(map, x, z)) continue;
      if (
        profile.geology.referenceHeight(x, z) - profile.surfaceHeight(x, z) >
        0.02
      )
        continue;
      if (!game.canMove(x, z, 0)) continue;
      assert(profile.walkableBank(x, z));
      for (const dx of [-0.45, 0.45])
        for (const dz of [-0.45, 0.45]) assert(game.walkable(x + dx, z + dz));
      accessible++;
    }
  assert(accessible > 200, `Only ${accessible} usable new shelf samples`);
  for (const [x, z] of [
    [-1, 0],
    [0, -1],
    [profile.extent + 1, 0],
    [0, profile.extent + 1],
  ])
    assert.equal(profile.walkableBank(x, z), false);
});

test("all delivered courier-corridor terrain vertices retain their heights outside the ordinary grid", () => {
  const values = [];
  for (let iz = 0; iz < profile.width; iz++)
    for (let ix = 0; ix < profile.width; ix++) {
      const x = ix * profile.step,
        z = iz * profile.step;
      if (!courierCorridor(map, x, z)) continue;
      values.push(profile.heights[iz * profile.width + ix]);
      assert.equal(profile.walkableBank(x, z), false);
    }
  assert.equal(values.length, 6692);
  // All actual courier land, landings and underlying chasm on a66c837.
  assert.equal(
    heightsDigest(values),
    "0daf05401cddd1a78857e70e62b9f5ac80f5e523f6185e1b7673585caa7b04e7",
  );
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
