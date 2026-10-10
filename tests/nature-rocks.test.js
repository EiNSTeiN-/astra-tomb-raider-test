import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import {
  stoneShape,
  stoneFootprint,
  seatStone,
} from "../src/stone-grounding.js";
import {
  natureRockAllowed,
  placeNatureRock,
  rockGroundHeight,
} from "../src/nature-rocks.js";
import { windLayout, windPosition } from "../src/wind-rules.js";
import { LEVELS, createMap, random } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";

const doc = await new NodeIO().read(
  new URL(
    "../public/assets/models/rock_moss_set_01/optimized.glb",
    import.meta.url,
  ).pathname,
);
const shapes = doc
  .getRoot()
  .listNodes()
  .filter((n) => n.getMesh())
  .map((n) => {
    const p = n.getMesh().listPrimitives()[0],
      geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        p.getAttribute("POSITION").getArray().slice(),
        3,
      ),
    );
    geometry.setIndex(
      new THREE.BufferAttribute(p.getIndices().getArray().slice(), 1),
    );
    const normalized = stoneShape(
      geometry,
      new THREE.Matrix4().fromArray(n.getWorldMatrix()),
    );
    normalized.geometry.scale(2.6, 2.6, 2.6);
    geometry.dispose();
    return stoneFootprint(normalized.geometry);
  });
function gaps(shape, matrix, profile, divisions = 6) {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(shape.geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(matrix);
  mesh.updateMatrixWorld(true);
  const box = shape.bounds.clone().applyMatrix4(matrix),
    ray = new THREE.Raycaster(),
    samples = [];
  // Independent world-space rays do not repeat the local grid used for fitting.
  for (let iz = 1; iz < divisions; iz++)
    for (let ix = 1; ix < divisions; ix++) {
      const x = THREE.MathUtils.lerp(box.min.x, box.max.x, ix / divisions),
        z = THREE.MathUtils.lerp(box.min.z, box.max.z, iz / divisions);
      ray.set(
        new THREE.Vector3(x, box.min.y - 5, z),
        new THREE.Vector3(0, 1, 0),
      );
      const hit = ray.intersectObject(mesh)[0];
      if (hit) samples.push(hit.point.y - profile.height(x, z));
    }
  material.dispose();
  return samples;
}

test("ground scans can fit below high calcite pendants while tall scans remain reserved", () => {
  const geometry = new THREE.BoxGeometry(2, 2, 2).translate(0, 1, 0);
  const shape = stoneFootprint(geometry);
  const game = {
    map: { size: 61, features: [], enemies: [], spawn: { x: 10, z: 10 } },
    terrainProfile: { height: () => 5, waters: [] },
    obstacles: [
      { x: 120, z: 140, w: 3, d: 3, h: 20, bottom: 14, cavernFormation: true },
    ],
  };
  assert.equal(
    natureRockAllowed(game, 120, 140, 2),
    false,
    "unknown heights retain the reservation",
  );
  const placed = placeNatureRock(game, shape, {
    x: 120,
    z: 140,
    size: 1,
    yaw: 0,
  });
  assert(placed.matrix, "a ground scan fits below the ceiling");
  assert(placed.position.y + shape.bounds.max.y < game.obstacles[0].bottom);
  assert.equal(
    placeNatureRock(game, shape, { x: 120, z: 140, size: 5, yaw: 0 }).reason,
    "reserved",
  );
  game.obstacles[0].bottom = 5;
  assert.equal(
    placeNatureRock(game, shape, { x: 120, z: 140, size: 1, yaw: 0 }).reason,
    "reserved",
  );
  geometry.dispose();
});

test("the observed cloud-cliff rock seats its narrow underside against rendered terrain", () => {
  const shape = shapes.find(
      (s) =>
        s.geometry.attributes.position.count === 1305 &&
        s.geometry.index.count / 3 === 2116,
    ),
    profile = createTerrainProfile(createMap(LEVELS[5]), LEVELS[5]),
    ground = { height: (x, z) => rockGroundHeight(profile, x, z) },
    // Actual Float32 instance transform from the span 13 approach camera.
    observed = new THREE.Matrix4().fromArray([
      -1.2680180072784424, 0, -0.07774396985769272, 0, 0, 1.2703990936279297, 0,
      0, 0.07774396985769272, 0, -1.2680180072784424, 0, 216.47341918945312,
      27.934051513671875, 262.4482116699219, 1,
    ]);
  assert(shape);
  assert(
    shape.underside.every((point) => {
      const p = point.clone().applyMatrix4(observed);
      return p.y < ground.height(p.x, p.z);
    }),
    "the original coarse fitting samples miss the defect",
  );
  const before = gaps(shape, observed, ground, 32);
  assert(before.length > 600);
  assert(Math.max(...before) > 0.6, "observed hanging edge must be reproduced");
  const fitted = stoneFootprint(shape.geometry, { edgeProbes: true }),
    placed = seatStone(ground, fitted, {
      x: observed.elements[12],
      z: observed.elements[14],
      size: observed.elements[5],
      yaw: Math.atan2(observed.elements[8], observed.elements[0]),
    });
  assert(placed, "a supported part of this scan remains visible");
  const after = gaps(fitted, placed.matrix, ground, 32);
  assert(after.length > 600);
  assert(
    Math.max(...after) < -0.007,
    "independent underside rays must meet soil",
  );
  assert(placed.exposed > 0.12);
});

test("the observed volcanic rail-side scan cannot retain its hanging underside", () => {
  const profile = createTerrainProfile(createMap(LEVELS[4]), LEVELS[4]);
  const ground = { height: (x, z) => rockGroundHeight(profile, x, z) };
  // Actual Float32 placement from the volcanic terrain ray inspection.
  const matrix = new THREE.Matrix4().fromArray([
    0.0572814866900444, 0, -1.384880542755127, 0, 0, 1.3860647678375244, 0, 0,
    1.384880542755127, 0, 0.0572814866900444, 0, 133.7328643798828,
    20.676868438720703, 416.2366638183594, 1,
  ]);
  const cases = shapes.map((shape) => ({
    shape,
    gap: Math.max(...gaps(shape, matrix, ground, 32)),
  }));
  const observed = cases.sort(
    (a, b) =>
      Math.abs(a.gap - 0.8100347091019948) -
      Math.abs(b.gap - 0.8100347091019948),
  )[0];
  assert(
    Math.abs(observed.gap - 0.8100347091019948) < 0.003,
    "reproduce the delivered scan's 81cm hanging edge",
  );
  const fitted = stoneFootprint(observed.shape.geometry, { edgeProbes: true });
  const placed = seatStone(ground, fitted, {
    x: matrix.elements[12],
    z: matrix.elements[14],
    size: matrix.elements[5],
    yaw: Math.atan2(matrix.elements[8], matrix.elements[0]),
  });
  if (placed)
    assert(Math.max(...gaps(fitted, placed.matrix, ground, 32)) < -0.007);
  else assert.equal(placed, null, "an almost submerged scan is omitted");
});

test("the six delivered rock undersides fit shallow slopes without altering their source geometry", () => {
  assert.equal(shapes.length, 6);
  for (const shape of shapes) {
    const positions = shape.geometry.attributes.position.array.slice(),
      index = shape.geometry.index.array.slice();
    for (const slope of [0, 0.12, -0.12])
      for (const yaw of [0, 0.7, 2.8]) {
        const profile = { height: (x, z) => 4 + x * slope + z * 0.04 };
        const placed = seatStone(profile, shape, {
          x: 5,
          z: 7,
          size: 1.1,
          yaw,
        });
        assert(placed);
        const samples = gaps(shape, placed.matrix, profile);
        assert(Math.min(...samples) < 0, "stone must make contact");
        assert(
          samples.filter((y) => y <= 0.03).length / samples.length > 0.8,
          "most of the underside must be embedded",
        );
        assert(placed.exposed > 0.1, "fitting must not hide the stone");
        assert(placed.matrix.elements.every(Number.isFinite));
      }
    assert.deepEqual(shape.geometry.attributes.position.array, positions);
    assert.deepEqual(shape.geometry.index.array, index);
    assert.equal(
      seatStone({ height: (x) => (x < 0 ? 0 : 8) }, shape, {
        x: 0,
        z: 0,
        size: 1,
        yaw: 0,
      }),
      null,
    );
  }
});

test("decorative stone footprints leave space around game features, guardians, structures, water and map edges", () => {
  const game = {
    map: {
      size: 100,
      features: [{ x: 10, z: 10 }],
      enemies: [{ x: 20, z: 20 }],
      spawn: { x: 5, z: 5 },
    },
    obstacles: [{ x: 210, z: 210, w: 2, d: 3 }],
    terrainProfile: {
      height: () => 0,
      waters: [{ x: 280, z: 280, width: 10, length: 12 }],
    },
  };
  const before = JSON.stringify(game);
  for (const [x, z] of [
    [0.5, 10],
    [699.5, 10],
    [70, 70],
    [73.7, 70],
    [140, 140],
    [142.9, 140],
    [35, 35],
    [212.9, 210],
    [285.9, 280],
  ]) {
    assert(!natureRockAllowed(game, x, z, 1), `${x},${z}`);
    assert.equal(
      placeNatureRock(game, shapes[0], { x, z, size: 1, yaw: 0.4 }).reason,
      "reserved",
    );
  }
  assert(natureRockAllowed(game, 350, 350, 1));
  assert(
    placeNatureRock(game, shapes[0], { x: 350, z: 350, size: 1, yaw: 0.4 })
      .matrix,
  );
  assert.equal(
    JSON.stringify(game),
    before,
    "placement must not mutate gameplay state",
  );
});

test("delivered stone footprints leave camera and approach room around all wind working pads", () => {
  const level = LEVELS.find((level) => level.biome === "sky"),
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    game = { map, terrainProfile, obstacles: [], windSites: [] };
  for (const feature of map.features.filter(
    (feature) => feature.type === "mechanism",
  )) {
    const layout = windLayout(feature.stage),
      nodes = [];
    for (let index = 0; index < layout.values.length; index++) {
      const p = windPosition(layout, index),
        x = feature.x * 7 + p.x,
        z = feature.z * 7 + p.z + 1.52;
      nodes.push({
        control: layout.fixed.includes(index)
          ? null
          : {
              group: {
                position: new THREE.Vector3(x, terrainProfile.height(x, z), z),
              },
            },
      });
    }
    game.windSites.push({
      nodes,
      tablet: {
        group: {
          position: new THREE.Vector3(
            feature.x * 7 - 10.5,
            0,
            feature.z * 7 + 20.1,
          ),
        },
      },
    });
  }
  const controls = game.windSites.flatMap((site) => [
    site.tablet,
    ...site.nodes.map((node) => node.control).filter(Boolean),
  ]);
  assert.equal(controls.length, 119);
  let samples = 0;
  for (const control of controls)
    for (const shape of shapes) {
      const b = shape.bounds,
        radius = Math.hypot(
          Math.max(Math.abs(b.min.x), Math.abs(b.max.x)),
          Math.max(Math.abs(b.min.z), Math.abs(b.max.z)),
        );
      for (let orbit = 0; orbit < 8; orbit++) {
        const yaw = (orbit * Math.PI) / 4,
          x = control.group.position.x + Math.sin(yaw) * 6.9,
          z = control.group.position.z + Math.cos(yaw) * 6.9;
        assert.equal(natureRockAllowed(game, x, z, radius), false);
        assert.equal(
          placeNatureRock(game, shape, { x, z, size: 1, yaw }).reason,
          "reserved",
        );
        samples++;
      }
    }
  assert.equal(samples, 5712);
  // Independent observed body-ray hit outside the third court: ordinary
  // feature/obstacle reservations allowed it, but its working camera must not.
  const hit = { x: 337.360801366003, z: 170.20697942926014 };
  assert.equal(
    natureRockAllowed({ ...game, windSites: [] }, hit.x, hit.z, 0.5),
    true,
  );
  assert.equal(natureRockAllowed(game, hit.x, hit.z, 0.5), false);
  let remaining = 0;
  for (let z = 30; z < map.size * 7 - 30; z += 10)
    for (let x = 30; x < map.size * 7 - 30; x += 10)
      if (natureRockAllowed(game, x, z, 1)) remaining++;
  assert(
    remaining > 100,
    "rocks can still dress the landscape away from working pads",
  );
});

test("rock fitting stays deterministic across the seven affected chapter terrains", (t) => {
  const counts = [];
  for (const level of LEVELS.filter((l) => l.biome !== "desert")) {
    const map = createMap(level),
      terrainProfile = createTerrainProfile(map, level),
      game = { level, map, terrainProfile, obstacles: [] },
      rng = random(level.seed + 921),
      placed = [];
    for (let i = 0; i < 1500 && placed.length < 24; i++) {
      const room = map.rooms[i % map.rooms.length],
        a = rng() * Math.PI * 2,
        r = 9 + rng() * 13,
        options = {
          x: room.x * 7 + Math.cos(a) * r,
          z: room.z * 7 + Math.sin(a) * r,
          size: 0.6 + rng() * 0.8,
          yaw: rng() * Math.PI * 2,
        },
        shape = shapes[i % shapes.length];
      const stone = placeNatureRock(game, shape, options);
      assert.deepEqual(placeNatureRock(game, shape, options), stone);
      if (stone.reason) continue;
      const sample = gaps(shape, stone.matrix, terrainProfile);
      assert(Math.min(...sample) < 0.03, `${level.id}: unsupported stone`);
      assert(
        sample.filter((y) => y <= 0.03).length / sample.length > 0.65,
        `${level.id}: mostly hanging underside`,
      );
      placed.push(stone);
    }
    assert.equal(
      placed.length,
      24,
      `${level.id}: insufficient usable stone sites`,
    );
    counts.push({ biome: level.biome, placed: placed.length });
  }
  t.diagnostic(JSON.stringify(counts));
});

test("rock support respects visible terrain triangles at a non-planar coastal bank corner", () => {
  const profile = { step: 1, height: (x, z) => 4 * x * z },
    geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0.5, 0, 0.5);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++)
    position.setY(i, profile.height(position.getX(i), position.getZ(i)));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(geometry, material),
    ray = new THREE.Raycaster();
  for (const [x, z] of [
    [0.2, 0.2],
    [0.4, 0.5],
    [0.7, 0.4],
    [0.8, 0.9],
  ]) {
    ray.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh)[0];
    assert(hit);
    assert(
      Math.abs(
        rockGroundHeight(profile, x, z) -
          Math.min(profile.height(x, z), hit.point.y),
      ) < 1e-6,
    );
  }
  assert.equal(rockGroundHeight(profile, 0.5, 0.5), 0);
  assert.equal(profile.height(0.5, 0.5), 1);
  geometry.dispose();
  material.dispose();
});
