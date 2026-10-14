import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  buildCoastalWallArt,
  coastalWallRecord,
} from "../src/coastal-wall-art.js";
import { HYDRAULIC_TRIALS } from "../src/hydraulic-rules.js";
import { buildChamberWall } from "../src/chamber-walls.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { mergeArchitecture } from "../src/visuals.js";

function fixture() {
  const root = new THREE.Group();
  const materials = Object.fromEntries(
    ["wall", "trim", "dark", "metal", "inlay", "chamberInset"].map((key) => [
      key,
      new THREE.MeshStandardMaterial(),
    ]),
  );
  const add = (geometry, material, x, y, z) => {
    geometry.deleteAttribute("color");
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  return { root, materials, add };
}

test("eight distinct records copy the actual capacities, target marks and directed return valves", () => {
  const records = Array.from({ length: 8 }, (_, i) => coastalWallRecord(i + 1));
  assert.equal(new Set(records.map((p) => p.motif)).size, 8);
  for (const record of records) {
    const trial = HYDRAULIC_TRIALS[record.stage];
    assert.deepEqual(record.capacity, trial.capacity);
    assert.deepEqual(record.target, trial.target);
    assert.deepEqual(record.links, trial.links);
    record.capacity[0] = -1;
    record.links[0][0] = -1;
    record.centers[0][0] = -100;
    assert.equal(
      coastalWallRecord(record.stage).capacity[0],
      trial.capacity[0],
    );
    assert.deepEqual(coastalWallRecord(record.stage).links, trial.links);
    assert(coastalWallRecord(record.stage).centers[0][0] > -5);
  }
  for (const stage of [-1, 0, 9, 1.5])
    assert.throws(() => coastalWallRecord(stage), RangeError);
});

test("closed decorative beds join the recessed backing and every vertex stays behind the old inner wall face", () => {
  for (let stage = 1; stage < 9; stage++) {
    const { root, materials, add } = fixture();
    const plan = buildCoastalWallArt(stage, materials, add);
    root.updateMatrixWorld(true);
    const bed = new THREE.Box3().setFromObject(root.children[0]);
    assert(
      bed.max.z > -0.14 && bed.min.z < -0.14,
      "bed crosses the recessed core face",
    );
    for (const mesh of root.children) {
      for (const attribute of Object.values(mesh.geometry.attributes))
        assert(attribute.array.every(Number.isFinite));
      const bounds = new THREE.Box3().setFromObject(mesh);
      assert(bounds.min.z >= -0.41 && bounds.max.z < 0, `depth ${stage}`);
      assert(bounds.min.x >= -6 && bounds.max.x <= 6, `width ${stage}`);
      assert(bounds.min.y > 1 && bounds.max.y < 6.3, `height ${stage}`);
      assert(
        bounds.max.z >= -0.347,
        "each part joins its ceramic or stone backing",
      );
    }
    for (const vessel of plan.vessels)
      assert.equal(
        vessel.targetY,
        -0.7 + (1.4 * vessel.target) / vessel.capacity,
      );
    assert.deepEqual(
      plan.channels.flatMap((c) => c.directions).sort(),
      HYDRAULIC_TRIALS[stage].links.map((p) => [...p]).sort(),
    );
    root.traverse((o) => o.geometry?.dispose());
    Object.values(materials).forEach((m) => m.dispose());
  }
});

test("rear records retain a sealed backing and camera interception after material batching", () => {
  for (let stage = 1; stage < 9; stage++) {
    const { root, materials } = fixture();
    const cameraSurfaces = new CameraSurfaces(root),
      game = { level: { biome: "water", seed: 491 }, cameraSurfaces };
    const wall = buildChamberWall(
      game,
      { root, stage, design: { motion: "sink" } },
      materials,
      { length: 13, side: 0, floor: 0 },
    );
    assert.equal(wall.coastalRecord.stage, stage);
    mergeArchitecture(root);
    cameraSurfaces.rebuild();
    root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (const x of [-5.45, -3.2, -1.6, 0, 1.6, 3.2, 5.45])
      for (const y of [1.35, 2.3, 3.45, 4.6, 5.82]) {
        const start = new THREE.Vector3(x, y, -4.5),
          end = new THREE.Vector3(x, y, -7.5);
        ray.set(start, new THREE.Vector3(0, 0, -1));
        const hit = ray.intersectObject(root, true)[0];
        assert(
          hit && hit.distance > 1.4 && hit.distance < 1.88,
          `sealed ${stage}/${x}/${y}`,
        );
        const cameraDistance = 3 * cameraSurfaces.entry(start, end, 0);
        assert(
          cameraDistance > 1.4 && cameraDistance < 1.88,
          `camera ${stage}/${x}/${y}`,
        );
      }
    assert(root.children.filter((o) => o.isMesh).length <= 6);
    root.traverse((o) => o.geometry?.dispose());
    Object.values(materials).forEach((m) => m.dispose());
  }
});

test("original counterweight rear wall and all coastal side walls retain their blind bays", () => {
  for (let stage = 0; stage < 9; stage++)
    for (const side of [-1, 0, 1]) {
      if (stage > 0 && side === 0) continue;
      const { root, materials } = fixture();
      const wall = buildChamberWall(
        { level: { biome: "water", seed: 491 } },
        { root, stage, design: { motion: "sink" } },
        materials,
        { length: side ? 13.8 : 13, side, floor: 0 },
      );
      assert.equal(wall.coastalRecord, undefined);
      assert(wall.bays.length >= 3);
      root.traverse((o) => o.geometry?.dispose());
      Object.values(materials).forEach((m) => m.dispose());
    }
});
