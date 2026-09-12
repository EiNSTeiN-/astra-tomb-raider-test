import test from "node:test";
import assert from "node:assert/strict";
import { stationLatheGeometry } from "../src/field-station-geometry.js";

test("flat pedestal caps keep one planar texture scale across every radial wedge", () => {
  for (const sides of [6, 8, 10, 12, 16]) {
    const geometry = stationLatheGeometry(
      [
        [0, 0],
        [1, 0],
        [1, 0.7],
        [0, 0.7],
      ],
      sides,
      true,
    );
    const p = geometry.attributes.position,
      uv = geometry.attributes.uv;
    let caps = 0,
      walls = 0;
    for (let i = 0; i < p.count; i += 3) {
      const flat = p.getY(i) === p.getY(i + 1) && p.getY(i) === p.getY(i + 2);
      for (let j = i; j < i + 3; j++) {
        assert(Number.isFinite(uv.getX(j)) && Number.isFinite(uv.getY(j)));
        if (flat) {
          assert(Math.abs(uv.getX(j) - p.getX(j) / 2) < 1e-6);
          assert(Math.abs(uv.getY(j) - p.getZ(j) / 2) < 1e-6);
          caps++;
        } else {
          assert(Math.abs(uv.getY(j) - p.getY(j) / 2) < 1e-6);
          walls++;
        }
      }
    }
    assert(caps > 0 && walls > 0);
    geometry.dispose();
  }
});
