import test from "node:test";
import assert from "node:assert/strict";
import { boxEntry } from "../src/camera-collision.js";
import { galleryCameraSight } from "../src/gallery-camera-sight.js";

test("gallery sight retains full-box occlusion at margins and during gate retraction", () => {
  let seed = 77419,
    comparisons = 0,
    blocked = 0;
  const random = () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32,
    solids = Array.from({ length: 32 }, (_, i) => {
      const x = random() * 32 - 16,
        y = random() * 12 - 9,
        z = random() * 32 - 16;
      return {
        min: { x, y, z },
        max: {
          x: x + 0.1 + random() * 4,
          y: y + 0.4 + random() * 4,
          z: z + 0.1 + random() * 4,
        },
      };
    }),
    gate = { min: { x: 58, y: -7, z: -40.2 }, max: { x: 61, y: -3, z: -40 } },
    game = {
      sunkenGallery: { solids: [...solids, gate], profile: { bells: [] } },
    };
  for (const drop of [0, 1.5, 5]) {
    gate.min.y = -7 - drop;
    gate.max.y = -3 - drop;
    const rays = Array.from({ length: 500 }, () => [
      { x: random() * 50 - 25, y: random() * 22 - 15, z: random() * 50 - 25 },
      { x: random() * 50 - 25, y: random() * 22 - 15, z: random() * 50 - 25 },
    ]);
    for (const box of game.sunkenGallery.solids)
      for (const axis of ["x", "y", "z"])
        for (const side of ["min", "max"])
          for (const epsilon of [-1e-10, 0, 1e-10]) {
            const start = {},
              end = {},
              along = axis === "x" ? "z" : "x";
            for (const name of ["x", "y", "z"])
              start[name] = end[name] = (box.min[name] + box.max[name]) / 2;
            start[axis] = end[axis] =
              box[side][axis] + (side === "min" ? -0.02 : 0.02) + epsilon;
            start[along] = box.min[along] - 2;
            end[along] = box.max[along] + 2;
            rays.push([start, end]);
          }
    for (const [start, end] of rays) {
      const expected = !game.sunkenGallery.solids.some((box) => {
        const entry = boxEntry(start, end, box, 0.02);
        return entry !== null && entry < 0.999999;
      });
      assert.equal(
        galleryCameraSight(game, start, end),
        expected,
        JSON.stringify({ drop, start, end }),
      );
      if (!expected) blocked++;
      comparisons++;
    }
    assert.equal(
      galleryCameraSight(
        game,
        { x: 59.5, y: -5, z: -42 },
        { x: 59.5, y: -5, z: -38 },
      ),
      drop === 5,
    );
  }
  assert.equal(comparisons, 3282);
  assert(blocked > 100, "the reference includes obstructed rays");
});
