import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { temperingTerrainWeight } from "../src/tempering-terrain.js";

const map = createMap(LEVELS[4]),
  profile = createTerrainProfile(map, LEVELS[4]);

test("the former eastern railway cut becomes a continuous graded approach", () => {
  // This recorded box previously had a 3.44m rise in a single 1.75m cell.
  for (let z = 330.75; z <= 350; z += profile.step)
    for (let x = 157.5; x <= 171.5; x += profile.step)
      for (const [dx, dz] of [
        [profile.step, 0],
        [0, profile.step],
      ]) {
        const rise = Math.abs(
          profile.height(x + dx, z + dz) - profile.height(x, z),
        );
        assert(rise < 1.2, `${x},${z}: ${rise}`);
      }
  assert(profile.height(161, 343) > 20);
  assert(profile.height(161, 343) < profile.temperingY);
});

test("railway floors, neighboring working cores and lava records retain their shipped values", () => {
  const values = [];
  for (const r of [...map.rooms, ...map.fieldSites])
    for (let dz = -7; dz <= 7; dz += profile.step)
      for (let dx = -7; dx <= 7; dx += profile.step)
        values.push(profile.height(r.x * 7 + dx, r.z * 7 + dz));
  assert.equal(values.length, 2673);
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  // Recorded before changing the track apron at published 2d3d774.
  assert.equal(
    hash(Buffer.from(new Float32Array(values).buffer)),
    "4b0327c2ead0ec55e0d5c4300d09b0535c51298dcf1f66011b89937d111314b7",
  );
  assert.equal(
    hash(
      JSON.stringify({
        features: map.features
          .filter((f) => f.id !== "note-2")
          .map((f) => ({
            id: f.id,
            x: f.x * 7,
            z: f.z * 7,
            y: profile.height(f.x * 7, f.z * 7),
          })),
        waters: profile.waters,
        temperingY: profile.temperingY,
      }),
    ),
    "826dc382eb724bcebad3fd666fed25dd13ad5b914d448f3932ee22096d7c5b2b",
  );
  for (const [x, z] of [
    [84, 406],
    [120, 406],
    [154, 360],
    [147, 336],
  ])
    assert.equal(profile.height(x, z), Math.fround(profile.temperingY));
});

test("the wider apron preserves instrument and water priorities at overlapping sites", () => {
  const map = { rooms: [{ x: 25, z: 56 }], fieldSites: [], sideRooms: [] };
  assert.equal(temperingTerrainWeight(map, [], 175, 392), 0);
  assert.equal(temperingTerrainWeight(map, [], 120, 406), 1);
  assert.equal(temperingTerrainWeight(map, [], 250, 350), 0);
  assert(temperingTerrainWeight(map, [], 161, 343) > 0.9);
  const water = { x: 170, z: 343, width: 6, length: 6 };
  assert.equal(temperingTerrainWeight(map, [water], 170, 343), 0);
});
