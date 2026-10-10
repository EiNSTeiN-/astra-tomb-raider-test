import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TriangleSolids } from "../src/triangle-solids.js";
import {
  stationMeshSolid,
  stationSupport,
  stationSolid,
  stationBlocked,
} from "../src/field-station-solids.js";
import { advanceCharacter } from "../src/character-motion.js";

test("a body touching a tapered side cannot stand in empty space, while real tops and raw surface probes remain available", () => {
  const geometry = new THREE.CylinderGeometry(0.6, 0.95, 6, 24),
    material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(geometry, material),
    game = { obstacles: [], groundHeight: () => 0 },
    ray = new THREE.Raycaster();
  mesh.position.set(20, 4, 30);
  const solid = stationMeshSolid(game, { id: "tapered" }, mesh, {
      bodyPadding: 0.7,
    }),
    x = 21.62,
    z = 30,
    former = solid.triangles.support(x, z, Infinity, 0.7);
  assert(former && former.height > 1 && former.height < 3);
  assert.equal(
    solid.triangles.blocked(x, former.height, z, 1.8, 0.7),
    false,
    "the old side query could create a collision-clear artificial foothold",
  );
  ray.set(new THREE.Vector3(x, 8, z), new THREE.Vector3(0, -1, 0));
  ray.far = 10;
  assert.equal(
    ray.intersectObject(mesh).length,
    0,
    "no rendered stone beneath this foot",
  );
  assert.equal(stationSupport(solid, x, z, Infinity, 0.55), null);
  assert.equal(
    stationSupport(solid, 20, 30, 7, 0.55),
    7,
    "the real cap still holds a landing",
  );
  assert.equal(
    stationSupport(solid, 20, 30, 3, 0.55),
    null,
    "an overhead cap cannot catch a lower foot",
  );
  for (const offset of [0, 0.75, 0.86]) {
    ray.set(new THREE.Vector3(20 + offset, 8, 30), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh)[0];
    assert(hit);
    assert(
      Math.abs(stationSupport(solid, 20 + offset, 30) - hit.point.y) < 1e-6,
      "point probes retain the actual side or top under their coordinates",
    );
  }
  geometry.dispose();
  material.dispose();
});

test("walkable-face selection measures the world slope after upright rotation and unequal horizontal/vertical scaling", () => {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(1, 1, 0),
  ]);
  for (const [horizontal, vertical, walkable] of [
    [1, 1, true],
    [0.5, 2, false],
    [2, 0.5, true],
  ])
    for (const yaw of [0, 0.63, -1.2]) {
      const matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(20, 3, 30),
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            yaw,
          ),
          new THREE.Vector3(horizontal, vertical, horizontal),
        ),
        kernel = new TriangleSolids([{ geometry, matrices: [matrix] }]),
        point = new THREE.Vector3(0.25, 0.25, 0.25).applyMatrix4(matrix),
        raw = kernel.support(point.x, point.z),
        filtered = kernel.support(point.x, point.z, Infinity, 0, 0.65);
      assert(raw && Math.abs(raw.height - point.y) < 1e-6);
      assert.equal(filtered !== null, walkable);
      if (filtered) assert(Math.abs(filtered.height - raw.height) < 1e-6);
    }
  geometry.dispose();
});

test("a jump clears the edge of an overhead field cap, while a broad ceiling stops its head without creating an airborne landing", () => {
  for (const [x, width, edge] of [
    [21.35, 2, true],
    [20, 4, false],
  ]) {
    const game = {
        obstacles: [],
        player: new THREE.Group(),
        groundHeight: () => 0,
        grounded: true,
        jumpY: 0,
        velocityY: 0,
        audio: { tone() {} },
      },
      group = new THREE.Group();
    group.position.set(20, 0, 30);
    stationSolid(game, { id: "overhead" }, group, [width, 0.2, 3], [0, 2, 0]);
    game.canMove = (px, pz, y) =>
      !game.obstacles.some((o) => stationBlocked(o, px, y, pz));
    game.player.position.set(x, 0, 30);
    assert(game.canMove(x, 30, 0));
    let peak = 0;
    for (let frame = 0; frame < 100; frame++) {
      advanceCharacter(game, { x: 0, z: 0 }, 1 / 60, frame === 0);
      const p = game.player.position;
      assert(
        game.canMove(p.x, p.z, p.y),
        "the rising or falling body remains clear",
      );
      peak = Math.max(peak, p.y);
    }
    assert(game.grounded && Math.abs(game.jumpY) < 1e-8);
    if (edge) {
      assert(game.player.position.x > 21.4 && game.player.position.x < 21.55);
      assert(peak > 1.4, "a clear edge preserves the normal jump arc");
    } else {
      assert.equal(game.player.position.x, x);
      assert(peak < 0.12, "an enclosed head cannot pass through the cap");
    }
  }
});
