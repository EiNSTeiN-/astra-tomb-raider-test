import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildObservatory } from "../src/observatory.js";
import { observatoryEnclosurePlan } from "../src/observatory-enclosures.js";
import {
  stationSolid,
  stationContains,
  stationBlocked,
  stationEntry,
} from "../src/field-station-solids.js";
import { CameraSurfaces } from "../src/camera-collision.js";

test("rotated finite solids agree with independently transformed rendered boxes, including empty AABB corners", () => {
  const game = { obstacles: [], groundHeight: () => 0 },
    group = new THREE.Group(),
    feature = { id: "rotated-wall" },
    geometry = new THREE.BoxGeometry(6, 4, 1.2),
    material = new THREE.MeshBasicMaterial(),
    ray = new THREE.Raycaster();
  group.position.set(20, 0, 30);
  for (const angle of [0, Math.PI / 4, Math.PI / 2, -Math.PI / 3]) {
    const solid = stationSolid(game, feature, group, [6, 4, 1.2], [0, 3, 0], {
        angle,
      }),
      mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(20, 3, 30);
    mesh.rotation.y = angle;
    mesh.updateMatrixWorld(true);
    for (const [x, z] of [
      [0, 0],
      [2.8, 0.3],
      [3.5, 0],
      [0, 1.1],
      [2.7, 1.3],
    ]) {
      const point = new THREE.Vector3(x, 3, z).applyMatrix4(
        new THREE.Matrix4().makeRotationY(angle),
      );
      point.x += 20;
      point.z += 30;
      assert.equal(
        stationContains(solid, point.x, point.z),
        Math.abs(x) < 3 && Math.abs(z) < 0.6,
      );
      assert.equal(stationBlocked(solid, point.x, 0, point.z, 0.8), false);
      assert.equal(stationBlocked(solid, point.x, 5.1, point.z), false);
      const from = point.clone().add(new THREE.Vector3(0, 5, 0)),
        to = point.clone().add(new THREE.Vector3(0, -5, 0));
      ray.set(from, to.clone().sub(from).normalize());
      const hit = ray.intersectObject(mesh)[0],
        entry = stationEntry(solid, from, to);
      if (hit) assert(Math.abs(entry - hit.distance / 10) < 1e-6);
      else assert.equal(entry, null);
    }
    const across = new THREE.Vector3(0, 0, 1).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        angle,
      ),
      from = mesh.position.clone().addScaledVector(across, 3),
      to = mesh.position.clone().addScaledVector(across, -3);
    ray.set(from, across.clone().negate());
    assert(
      Math.abs(
        stationEntry(solid, from, to) -
          ray.intersectObject(mesh)[0].distance / 6,
      ) < 1e-6,
    );
  }
  geometry.dispose();
  material.dispose();
});

function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[7],
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    world = new THREE.Group();
  const game = {
    level,
    map,
    world,
    groundHeight: (x, z) => terrain.height(x, z),
    progress: { stage: 0, field: [], alignments: {} },
    obstacles: [],
    cameraSurfaces: new CameraSurfaces(world),
  };
  buildObservatory(game);
  world.updateMatrixWorld(true);
  game.cameraSurfaces.rebuild();
  t.after(() => {
    const materials = new Set();
    world.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) materials.add(o.material);
    });
    materials.forEach((m) => m.dispose());
  });
  return game;
}

test("all eleven enclosures have distinct plans, buried full beds and open forward bays", (t) => {
  const game = fixture(t);
  assert.equal(
    new Set(
      game.observatories.map((p) =>
        JSON.stringify(observatoryEnclosurePlan(p.index).bays),
      ),
    ).size,
    11,
  );
  for (const patch of game.observatories) {
    for (const wall of patch.enclosure.walls) {
      assert(wall.bay >= 3 && wall.bay <= 7);
      assert(wall.solids.every((s) => s.frame && s.observatoryEnvelope));
      const normal = new THREE.Vector3(
        Math.sin(wall.yaw),
        0,
        Math.cos(wall.yaw),
      );
      for (let i = 0; i <= 20; i++)
        for (const depth of [-0.67, 0.67]) {
          const px = (i / 20 - 0.5) * wall.width,
            x =
              patch.root.position.x +
              wall.cx +
              px * Math.cos(wall.yaw) +
              depth * normal.x,
            z =
              patch.root.position.z +
              wall.cz -
              px * Math.sin(wall.yaw) +
              depth * normal.z;
          assert(patch.base + wall.bottom <= game.groundHeight(x, z) - 0.23);
        }
    }
    for (let z = 4.6; z <= 15; z += 0.4)
      for (const x of [-1.5, 0, 1.5])
        assert(
          !patch.enclosure.solids.some((s) =>
            stationBlocked(
              s,
              patch.root.position.x + x,
              patch.base,
              patch.root.position.z + z,
            ),
          ),
          `closed entrance ${patch.index}`,
        );
  }
});

test("delivered batched masonry closes body-height joints while clerestory slots remain real ray openings", (t) => {
  const game = fixture(t),
    ray = new THREE.Raycaster();
  let wallRays = 0,
    windows = 0;
  for (const patch of game.observatories)
    for (const wall of patch.enclosure.walls) {
      const normal = new THREE.Vector3(
          Math.sin(wall.yaw),
          0,
          Math.cos(wall.yaw),
        ),
        point = (px, py) =>
          new THREE.Vector3(
            patch.root.position.x + wall.cx + px * Math.cos(wall.yaw),
            patch.base + py,
            patch.root.position.z + wall.cz - px * Math.sin(wall.yaw),
          );
      for (let i = 1; i < 20; i++)
        for (const y of [0.2, 0.71, 1.3])
          for (const side of [-1, 1]) {
            const target = point((i / 20 - 0.5) * wall.width, y),
              from = target.clone().addScaledVector(normal, side * 2);
            ray.set(from, normal.clone().multiplyScalar(-side));
            ray.far = 2.3;
            const hit = ray.intersectObject(patch.enclosure.group, true)[0];
            assert(
              hit && hit.distance <= 1.51,
              `open wall ${patch.index}/${wall.bay}`,
            );
            assert(
              wall.solids.some(
                (s) =>
                  stationEntry(
                    s,
                    from,
                    target.clone().addScaledVector(normal, -side * 2),
                  ) !== null,
              ),
            );
            assert(game.cameraSurfaces.entry(from, target) < 1);
            wallRays++;
          }
      for (const opening of wall.openings)
        for (const side of [-1, 1]) {
          const center = point(
              (opening.left + opening.right) / 2,
              (opening.bottom + opening.top) / 2,
            ),
            from = center.clone().addScaledVector(normal, side * 2);
          ray.set(from, normal.clone().multiplyScalar(-side));
          ray.far = 2.3;
          assert.equal(
            ray.intersectObject(patch.enclosure.group, true).length,
            0,
            `covered slot ${patch.index}/${wall.bay}`,
          );
          assert(
            wall.solids.every(
              (s) =>
                stationEntry(
                  s,
                  from,
                  center.clone().addScaledVector(normal, -side * 2),
                ) === null,
            ),
          );
          windows++;
        }
    }
  assert(wallRays > 3000);
  assert(windows > 60);
});
