import test from "node:test";
import assert from "node:assert/strict";
import { inspectSolar } from "../scripts/verify-solar-browser.js";

test("solar approach observer uses the delivered receiver rather than a decorative mechanism plinth", () => {
  const feature = { id: "mechanism-0", type: "mechanism", x: 10, z: 10 },
    receiver = { x: 12, z: 11 },
    queries = [],
    game = {
      solarSites: [{ feature, receiver, mirrors: [] }],
      solarSources: [],
      items: [],
      map: { features: [feature] },
      traversalCourses: [],
      cameraSurfaces: { count: 0 },
      renderer: { getContext: () => ({}), info: { programs: [] } },
      canMove(x, z, height) {
        queries.push([x, z, height]);
        return x === 84 && z === 77 && height === 0;
      },
    };
  const result = inspectSolar(game);
  assert.deepEqual(result.approaches, [
    { id: feature.id, approach: "receiver console", clear: true },
  ]);
  assert.deepEqual(queries, [[84, 77, 0]]);
  game.canMove = () => false;
  assert.equal(inspectSolar(game).approaches[0].clear, false);
});
