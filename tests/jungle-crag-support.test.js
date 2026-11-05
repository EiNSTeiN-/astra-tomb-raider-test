import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  jungleCragSupport,
  jungleCragSupportGeometry,
} from "../src/jungle-crag-support.js";
import { createTerrainSurfaceSampler } from "../src/terrain-surface.js";
import { terrainTriangleReader } from "../scripts/inspect-desert-groundcover-browser.js";
import { TriangleSolids } from "../src/triangle-solids.js";
import {
  stationMeshSolid,
  stationSupport,
  stationBlocked,
} from "../src/field-station-solids.js";
import { supportAt, advanceCharacter } from "../src/character-motion.js";

test("a high remote cliff edge cannot suspend the body while centred treads and low steps retain support", () => {
  function fixture(y) {
    const game = { groundHeight: () => 0, obstacles: [], map: {} },
      geometry = new THREE.BoxGeometry(0.2, 0.2, 2),
      material = new THREE.MeshBasicMaterial(),
      mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0.35, y, 0);
    const solid = stationMeshSolid(game, { id: "edge" }, mesh, {
      supportRadius: 0.4,
    });
    solid.jungleCrag = solid.terrainFootholds = true;
    return { game, solid, geometry, material };
  }
  const high = fixture(2),
    low = fixture(0.3);
  try {
    assert(
      Math.abs(stationSupport(high.solid, 0, 0, 3, 0.55, 0.65) - 2.1) < 1e-6,
      "the unguarded disk control must touch the high cap",
    );
    assert.equal(supportAt(high.game, 0, 0, 3, 0.55).height, 0);
    assert(
      Math.abs(supportAt(high.game, 0.35, 0, 3, 0.55).height - 2.1) < 1e-6,
    );
    assert(
      Math.abs(supportAt(high.game, 0.35, 0, 3, 0, 0.65).height - 2.1) < 1e-6,
    );
    assert(
      stationBlocked(high.solid, 0.35, 2, 0, 0.01, 0),
      "rejecting a remote perch retains the closed physical rock",
    );
    assert(Math.abs(supportAt(low.game, 0, 0, 1, 0.55).height - 0.4) < 1e-6);
    Object.assign(high.game, {
      player: new THREE.Group(),
      grounded: true,
      velocityY: 0,
      jumpY: 2.1,
      fallPeak: 2.1,
      audio: { tone() {} },
      walkable: () => true,
      terrainProfile: {},
      canMove: (x, z, height) =>
        height >= -1e-6 && !stationBlocked(high.solid, x, height, z),
    });
    high.game.player.position.set(0, 2.1, 0);
    for (let i = 0; i < 180; i++) {
      advanceCharacter(high.game, { x: 0, z: 0 }, 1 / 60);
      const p = high.game.player.position;
      assert(high.game.canMove(p.x, p.z, p.y));
    }
    assert(high.game.grounded);
    assert.equal(
      high.game.player.position.y,
      0,
      "an unsupported high edge descends to real ground",
    );
    high.solid.jungleCrag = false;
    assert(
      Math.abs(supportAt(high.game, 0, 0, 3, 0.55).height - 2.1) < 1e-6,
      "authored finite caps keep their existing landing policy",
    );
  } finally {
    for (const f of [high, low]) {
      f.geometry.dispose();
      f.material.dispose();
    }
  }
});

test("cliff walking faces are clipped against both actual terrain triangles, retaining exposed ledge ends", () => {
  const heights = [0, 1, 1, 0],
    profile = {
      width: 2,
      step: 2,
      extent: 2,
      height: (x, z) => heights[Math.round(z / 2) * 2 + Math.round(x / 2)],
    };
  profile.surfaceHeight = createTerrainSurfaceSampler(profile);
  const terrain = new THREE.PlaneGeometry(2, 2, 1, 1)
      .rotateX(-Math.PI / 2)
      .translate(1, 0, 1),
    material = new THREE.MeshBasicMaterial(),
    cap = new THREE.BoxGeometry(2, 0.2, 2),
    mesh = new THREE.Mesh(cap, material);
  mesh.position.set(1, 0.5, 1);
  const p = terrain.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setY(i, profile.height(p.getX(i), p.getZ(i)));
  const read = terrainTriangleReader([new THREE.Mesh(terrain, material)]),
    exposed = jungleCragSupport(profile, [mesh]),
    closed = new TriangleSolids([
      { geometry: cap, matrices: [mesh.matrixWorld] },
    ]),
    geometry = jungleCragSupportGeometry(profile, [mesh]);
  try {
    let visible = 0,
      buried = 0;
    for (let iz = 1; iz < 40; iz++)
      for (let ix = 1; ix < 40; ix++) {
        const x = ix / 20,
          z = iz / 20,
          ground = read(x, z),
          actual = exposed.support(x, z, 1, 0, 0.65);
        assert(ground !== null);
        assert(
          Math.abs(closed.support(x, z, 1, 0, 0.65).height - 0.6) < 1e-6,
          "uncut control retains the buried cap",
        );
        if (0.6 - ground > 0.006) {
          assert(actual);
          assert(Math.abs(actual.height - 0.6) < 1e-6);
          visible++;
        }
        if (0.6 - ground < 0.004) {
          assert.equal(actual, null);
          buried++;
        }
      }
    assert(visible > 100 && buried > 100);
    assert.equal(
      exposed.support(1, 1, 1, 0.3, 0.65),
      null,
      "a body disk cannot use the buried back",
    );
    const points = geometry.attributes.position;
    let area = 0;
    for (let i = 0; i < points.count; i += 3)
      area += new THREE.Triangle(
        ...[0, 1, 2].map((j) =>
          new THREE.Vector3().fromBufferAttribute(points, i + j),
        ),
      ).getArea();
    assert(
      area > 0.5 && area < 2,
      "mixed faces retain only their exposed area",
    );
    for (let i = 0; i < points.count; i++)
      assert(points.getY(i) - read(points.getX(i), points.getZ(i)) >= 0.00499);
    assert(
      closed.blocked(1, 0.5, 1, 0, 0),
      "support trimming retains the closed wall volume",
    );
    // Raising the source above the ridge must expose its whole top.
    mesh.position.y = 1.2;
    const lifted = jungleCragSupport(profile, [mesh]);
    assert(Math.abs(lifted.support(1, 1, 2, 0, 0.65).height - 1.3) < 1e-6);
  } finally {
    geometry.dispose();
    terrain.dispose();
    cap.dispose();
    material.dispose();
  }
});
