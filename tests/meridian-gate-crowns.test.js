import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildMeridianGateCrown } from "../src/meridian-gate-crowns.js";
import { stationBlocked, stationSupport } from "../src/field-station-solids.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { SaveStore } from "../src/storage.js";
import { buildFieldGates } from "../src/field-world.js";
import { buildObservatory } from "../src/observatory.js";

function fixture(t, stage) {
  const world = new THREE.Group(),
    root = new THREE.Group();
  root.position.set(21, 3, 35);
  world.add(root);
  const game = {
    world,
    level: LEVELS[7],
    obstacles: [],
    groundHeight: () => 0,
    cameraSurfaces: new CameraSurfaces(world),
  };
  const materials = Object.fromEntries(
    ["wall", "trim", "metal"].map((k) => [k, new THREE.MeshStandardMaterial()]),
  );
  const crown = buildMeridianGateCrown(game, { root, stage }, materials);
  game.cameraSurfaces.rebuild();
  world.updateMatrixWorld(true);
  t.after(() => {
    world.traverse((o) => o.geometry?.dispose());
    Object.values(materials).forEach((m) => m.dispose());
  });
  return { game, root, crown };
}

function checkClosed(placement) {
  const faces = placement.shape.triangles,
    edges = new Map();
  let volume = 0;
  const key = (p) =>
    p
      .toArray()
      .map((v) => Math.round(v * 1e6))
      .join(",");
  for (const face of faces) {
    const [a, b, c] = face.vertices;
    assert(
      b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-16,
      "no collapsed triangle",
    );
    volume += a.dot(b.clone().cross(c)) / 6;
    const v = [a, b, c].map(key);
    for (let i = 0; i < 3; i++) {
      const k = [v[i], v[(i + 1) % 3]].sort().join("|");
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  assert(
    [...edges.values()].every((n) => n === 2),
    "each closed component has paired edges",
  );
  assert(volume > 1e-8, "outward faces enclose positive volume");
}

test("all ten batched crowns retain closed stone and bronze, seated fields and physical rendered support", (t) => {
  const silhouettes = new Set();
  let probes = 0,
    parts = 0;
  for (let stage = 0; stage < 10; stage++) {
    const { crown, root } = fixture(t, stage),
      solid = crown.solid;
    silhouettes.add(JSON.stringify(crown.plan.fields));
    assert.equal(
      crown.root.children.length,
      3,
      "batch by three existing materials",
    );
    assert.equal(solid.triangles.solids.length, crown.parts);
    assert(solid.bounds.min.y > root.position.y + 8.3);
    assert(solid.bounds.max.y < root.position.y + 11.1);
    for (const part of solid.triangles.solids) {
      checkClosed(part);
      parts++;
    }
    const ray = new THREE.Raycaster(),
      down = new THREE.Vector3(0, -1, 0);
    for (let i = 0; i <= 70; i++)
      for (const dz of [-0.8, 0, 0.8]) {
        const x = root.position.x - 7 + i * 0.2,
          z = root.position.z + 6.5 + dz;
        ray.set(new THREE.Vector3(x, 30, z), down);
        ray.far = 30;
        const hit = ray.intersectObject(crown.root, true)[0],
          support = stationSupport(solid, x, z);
        assert(hit && support !== null);
        assert(
          Math.abs(hit.point.y - support) < 0.00005,
          "support follows actual batched triangles",
        );
        probes++;
        assert.equal(
          stationBlocked(solid, x, 0, z, 1.8),
          false,
          "no invisible column below elevated stone",
        );
      }
    // Every field starts inside the continuous jamb-to-jamb bearing. Its core
    // and both dressed faces overlap, while its lower edge meets that bearing.
    for (const field of crown.plan.fields) {
      const bottom = Math.min(...field.map((p) => p[1]));
      assert.equal(bottom, 0.34);
      const x =
        root.position.x + field.reduce((n, p) => n + p[0] / field.length, 0);
      for (const z of [6.5, 5.76, 7.24])
        assert(
          stationBlocked(
            solid,
            x,
            root.position.y + 8.72,
            root.position.z + z,
            0.02,
            0,
          ),
        );
    }
  }
  assert.equal(silhouettes.size, 10);
  assert(probes >= 2130);
  assert.equal(parts, 641);
});

test("camera sections protect crown faces while retaining the open lunar notch and gable corners", (t) => {
  for (const stage of [0, 2, 4, 6, 9]) {
    const { game, root, crown } = fixture(t, stage),
      from = new THREE.Vector3(),
      to = new THREE.Vector3();
    for (const x of [-6, -3, 0, 3, 6]) {
      const y = root.position.y + 8.55;
      from.set(root.position.x + x, y, root.position.z + 10);
      to.set(root.position.x + x, y, root.position.z + 3);
      assert(
        game.cameraSurfaces.entry(from, to, 0.1) < 1,
        "bearing blocks the swept camera",
      );
    }
    assert(crown.cameraSections > 30);
    from.set(root.position.x, root.position.y + 11.25, root.position.z + 10);
    to.set(root.position.x, root.position.y + 11.25, root.position.z + 3);
    assert.equal(
      game.cameraSurfaces.entry(from, to, 0),
      1,
      "open sky remains clear",
    );
    if (stage === 2) {
      from.y = to.y = root.position.y + 9.55;
      assert.equal(
        game.cameraSurfaces.entry(from, to, 0.1),
        1,
        "lunar centre notch is real air",
      );
      assert.equal(
        stationBlocked(
          crown.solid,
          root.position.x,
          from.y,
          root.position.z + 6.5,
          0.05,
          0.1,
        ),
        false,
      );
    }
    if (stage === 0 || stage === 6) {
      from.x = to.x = root.position.x + 6.6;
      from.y = to.y = root.position.y + 10.4;
      assert.equal(
        game.cameraSurfaces.entry(from, to, 0.1),
        1,
        "no box over the empty gable corner",
      );
    }
  }
});

test("continuous roof rotation envelopes clear all ten crowns on the delivered Meridian terrain", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[7],
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    world = new THREE.Group();
  const store = new SaveStore({ getItem: () => null, setItem() {} }),
    game = {
      level,
      map,
      world,
      store,
      terrainProfile: terrain,
      progress: store.level(level.id),
      obstacles: [],
      items: map.features.filter((f) => f.type === "mechanism"),
      groundHeight: (x, z) => terrain.height(x, z),
      player: new THREE.Group(),
      elapsed: 0,
      cameraSurfaces: new CameraSurfaces(world),
    };
  t.after(() => {
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of [o.material].flat().filter(Boolean)) materials.add(m);
    });
    for (const m of materials)
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((x) => x.dispose());
  });
  buildFieldGates(game);
  buildObservatory(game);
  world.updateMatrixWorld(true);
  const crownBounds = game.fieldGates.map((g) => ({
    stage: g.stage,
    box: new THREE.Box3(
      new THREE.Vector3().copy(g.crown.solid.bounds.min),
      new THREE.Vector3().copy(g.crown.solid.bounds.max),
    ),
  }));
  // Rodrigues rotation writes each world coordinate as C + A cos(t) + B sin(t).
  // Endpoints and derivative roots give its complete range over an interval.
  // The union of all vertex ranges contains every triangle at every angle.
  const range = (c, a, b, low, high) => {
    const value = (t) => c + a * Math.cos(t) + b * Math.sin(t),
      values = [value(low), value(high)],
      turn = Math.atan2(b, a);
    for (let k = -2; k <= 2; k++) {
      const t = turn + k * Math.PI;
      if (t > low && t < high) values.push(value(t));
    }
    return [Math.min(...values), Math.max(...values)];
  };
  let intervals = 0,
    vertices = 0,
    panels = 0;
  for (const p of game.observatories)
    for (const { pivot, axis } of p.petals) {
      const mesh = pivot.children.find((m) => m.isMesh),
        position = mesh.geometry.attributes.position,
        linear = new THREE.Matrix3().setFromMatrix4(p.root.matrixWorld),
        coefficients = [];
      mesh.updateMatrix();
      for (let i = 0; i < position.count; i++) {
        const v = new THREE.Vector3()
            .fromBufferAttribute(position, i)
            .applyMatrix4(mesh.matrix),
          projection = axis.clone().multiplyScalar(axis.dot(v)),
          a = v.clone().sub(projection).applyMatrix3(linear),
          b = axis.clone().cross(v).negate().applyMatrix3(linear),
          c = projection.add(pivot.position).applyMatrix4(p.root.matrixWorld);
        coefficients.push({ a, b, c });
        vertices++;
      }
      function envelope(low, high) {
        const box = new THREE.Box3();
        for (const { a, b, c } of coefficients)
          for (const coordinate of ["x", "y", "z"]) {
            const r = range(
              c[coordinate],
              a[coordinate],
              b[coordinate],
              low,
              high,
            );
            box.min[coordinate] = Math.min(box.min[coordinate], r[0]);
            box.max[coordinate] = Math.max(box.max[coordinate], r[1]);
          }
        return box.expandByScalar(0.00002);
      }
      const end = Math.PI * 0.78;
      for (let i = 0; i < 32; i++) {
        const low = (end * i) / 32,
          high = (end * (i + 1)) / 32,
          box = envelope(low, high);
        for (const angle of [low, (low + high) / 2, high]) {
          const rotation = new THREE.Quaternion().setFromAxisAngle(
            axis,
            -angle,
          );
          for (let vertex = 0; vertex < position.count; vertex += 97) {
            const actual = new THREE.Vector3()
              .fromBufferAttribute(position, vertex)
              .applyMatrix4(mesh.matrix)
              .applyQuaternion(rotation)
              .add(pivot.position)
              .applyMatrix4(p.root.matrixWorld);
            assert(
              box.containsPoint(actual),
              "analytic envelope contains independent Three.js rotation samples",
            );
          }
        }
        for (const crown of crownBounds)
          assert(
            !box.intersectsBox(crown.box),
            `room ${p.index}, crown ${crown.stage}, continuous roof interval ${i}`,
          );
        intervals++;
      }
      panels++;
    }
  assert.equal(panels, 86);
  assert.equal(intervals, 2752);
  assert.equal(vertices, 134848);
  // The bound observer must reject an occupied crown point independently of
  // the all-clear scene. This is deliberately inside its continuous bearing.
  const occupied = game.fieldGates[0].root.position
    .clone()
    .add(new THREE.Vector3(0, 8.55, 6.5));
  assert(crownBounds[0].box.containsPoint(occupied));
});
