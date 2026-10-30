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
    // Forecourts replace some former banks with walking ground. Include cell
    // centres as well as vertices so the remaining banks retain broad coverage.
    for (const offset of [0, 0.5])
      for (let z = 1; z + offset <= p.width - 2; z++)
        for (let x = 1; x + offset <= p.width - 2; x++) {
          const wx = (x + offset) * p.step,
            wz = (z + offset) * p.step,
            d = desertRouteDistance(map, wx, wz);
          if (d > 0 && d <= 5.25) {
            slopes.push(
              Math.hypot(
                (p.surfaceHeight(wx + p.step, wz) -
                  p.surfaceHeight(wx - p.step, wz)) /
                  (2 * p.step),
                (p.surfaceHeight(wx, wz + p.step) -
                  p.surfaceHeight(wx, wz - p.step)) /
                  (2 * p.step),
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
