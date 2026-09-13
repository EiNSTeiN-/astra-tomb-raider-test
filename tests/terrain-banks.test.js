import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { desertRouteDistance } from "../src/desert-geology.js";

// Walking vertices recorded before the bank change at 6911d07. Cell edges
// coincide with these vertices, protecting the entire interpolated save floor.
const walkingDigests = {
  verdant: "ed6884adc29f298c5eb4874087c1112092c93537f8e13f5e5c43afb4c497a1b0",
  frost: "66eded837278199f0a41719ae20c5866497059185dcccf9a28544b4a46aca46f",
  embers: "c729e912c11be7fd1b9a2e33234ed17910b01faeeb21ac16e8d8bb83852d4903",
  crystal: "0c821ae6856c87f596004812259d6f35918319192541146d7fcc2017476d6747",
  eclipse: "6609783743e77666867199a0ce20e602fb67bbef82a848477336eea0bd9a5387",
};
for (const [chapter, digest] of Object.entries(walkingDigests)) {
  test(`${chapter} broad banks keep the saved walking surface and remove the repeated steep path edges`, () => {
    const level = LEVELS.find((l) => l.id === chapter),
      map = createMap(level),
      p = createTerrainProfile(map, level),
      walking = [],
      slopes = [];
    for (let z = 0; z < p.width; z++)
      for (let x = 0; x < p.width; x++) {
        const i = z * p.width + x,
          d = desertRouteDistance(map, x * p.step, z * p.step);
        if (d === 0) walking.push(p.heights[i]);
        if (
          d > 0 &&
          d <= 5.25 &&
          x > 0 &&
          z > 0 &&
          x < p.width - 1 &&
          z < p.width - 1
        ) {
          slopes.push(
            Math.hypot(
              (p.heights[i + 1] - p.heights[i - 1]) / (2 * p.step),
              (p.heights[i + p.width] - p.heights[i - p.width]) / (2 * p.step),
            ),
          );
        }
      }
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(new Float32Array(walking).buffer))
        .digest("hex"),
      digest,
    );
    slopes.sort((a, b) => a - b);
    assert(slopes.length > 9000);
    // Baseline 95th percentile was 1.38–1.92 m rise per metre, revealing
    // widespread cliffs at corridor edges. Local authored cuts may be steeper.
    assert(slopes[Math.floor(slopes.length * 0.95)] < 0.85);
    assert(slopes.filter((s) => s > 1).length < slopes.length * 0.02);
  });
}
