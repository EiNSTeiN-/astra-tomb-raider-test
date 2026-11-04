import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {
  monasteryBracketPlan,
  monasteryBracketGeometry,
} from "../src/monastery-brackets.js";
import { closedComponentMeshes } from "../scripts/inspect-explorer-solids-browser.js";
import { RoofCamera } from "../src/roof-camera.js";
import {
  stationMeshSolid,
  stationBlocked,
  stationSupport,
} from "../src/field-station-solids.js";

test("nine bracket profiles close their actual beam-clipped solids, keep UV area and preserve empty space", () => {
  const forms = new Set(),
    parent = new T.Group(),
    material = new T.MeshBasicMaterial(),
    bearer = new T.Mesh(new T.BoxGeometry(8, 0.6, 0.7), material);
  bearer.position.y = 10;
  parent.add(bearer);
  try {
    for (let index = 0; index < 9; index++) {
      const plan = monasteryBracketPlan(index, "main");
      forms.add(JSON.stringify(plan));
      const { geometry } = monasteryBracketGeometry(bearer, parent, {
          ...plan,
          axis: "x",
          direction: 1,
          start: -3,
          cross: 0,
        }),
        mesh = new T.Mesh(geometry, material),
        game = { obstacles: [], groundHeight: () => 0 };
      parent.add(mesh);
      const closed = closedComponentMeshes([mesh]);
      try {
        assert.equal(closed.stats.openTriangles, 0);
        assert(closed.stats.closedTriangles > 20);
        for (const a of Object.values(geometry.attributes))
          assert(a.array.every(Number.isFinite));
        const uv = geometry.attributes.uv;
        for (let i = 0; i < uv.count; i += 3) {
          const [a, b, c] = [0, 1, 2].map((j) =>
            new T.Vector2().fromBufferAttribute(uv, i + j),
          );
          assert(Math.abs(b.clone().sub(a).cross(c.clone().sub(a))) > 1e-10);
        }
        const camera = new RoofCamera(geometry),
          solid = stationMeshSolid(game, { id: "bracket" }, mesh, {
            supportRadius: 0,
            bodySupport: false,
          }),
          x = -3 + plan.reach * 0.1,
          y = 9.706 - plan.drop * 0.5,
          a = new T.Vector3(x, y, -1),
          b = new T.Vector3(x, y, 1);
        assert(camera.entry(a, b, 0) < 0.5);
        assert(stationBlocked(solid, x, y, 0, 0, 0));
        for (const y of [5, 11]) {
          assert.equal(
            camera.entry(new T.Vector3(x, y, -1), new T.Vector3(x, y, 1), 0.1),
            null,
          );
          assert(!stationBlocked(solid, x, y, 0, 0.1, 0));
        }
        assert.equal(
          stationSupport(solid, x, 0, 20, 0.4),
          null,
          "a narrow bracket is not a body landing",
        );
        const open = geometry.clone();
        open.setAttribute(
          "position",
          new T.Float32BufferAttribute(
            geometry.attributes.position.array.slice(9),
            3,
          ),
        );
        const control = new T.Mesh(open, material),
          reader = closedComponentMeshes([control]);
        assert(reader.stats.openTriangles > 0);
        reader.dispose();
        open.dispose();
      } finally {
        closed.dispose();
        mesh.removeFromParent();
        geometry.dispose();
      }
    }
    assert.equal(forms.size, 9);
  } finally {
    bearer.geometry.dispose();
    material.dispose();
  }
});
