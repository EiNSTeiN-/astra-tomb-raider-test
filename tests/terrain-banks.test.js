import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { desertRouteDistance } from "../src/desert-geology.js";

// The later court-joining pass intentionally regrades the old discontinuities
// inside walking cells. Working-pad baseline digests are checked separately in
// court-terrain.test.js; these checks continue to bound enclosing path slopes.
for (const chapter of ["verdant", "frost", "embers", "crystal", "eclipse"]) {
  test(`${chapter} broad banks avoid the repeated steep path edges`, () => {
    const level = LEVELS.find((l) => l.id === chapter),
      map = createMap(level),
      p = createTerrainProfile(map, level),
      slopes = [];
    for (let z = 0; z < p.width; z++)
      for (let x = 0; x < p.width; x++) {
        const i = z * p.width + x,
          d = desertRouteDistance(map, x * p.step, z * p.step);
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
    slopes.sort((a, b) => a - b);
    assert(slopes.length > 9000);
    // Baseline 95th percentile was 1.38–1.92 m rise per metre, revealing
    // widespread cliffs at corridor edges. Local authored cuts may be steeper.
    assert(slopes[Math.floor(slopes.length * 0.95)] < 0.85);
    assert(slopes.filter((s) => s > 1).length < slopes.length * 0.02);
  });
}
