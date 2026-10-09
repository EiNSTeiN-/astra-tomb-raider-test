import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildObservatory } from "../src/observatory.js";
import { advanceCharacter, safeArrival } from "../src/character-motion.js";
import {
  stationMeshSolid,
  stationBlocked,
  stationEntry,
} from "../src/field-station-solids.js";
import { shotCover } from "../src/aiming.js";
import {
  captureCableParts,
  cablePartClosed,
} from "../scripts/inspect-cable-parts.js";

test("triangle stations distinguish tapered surfaces, finite height and body margins in point, sound and shot queries", () => {
  const geometry = new THREE.CylinderGeometry(1, 3, 4, 32),
    material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(geometry, material),
    game = Object.assign(Object.create(Adventure.prototype), {
      obstacles: [],
      groundHeight: () => -10,
      walkable: () => true,
    });
  mesh.position.set(20, 5, 30);
  const solid = stationMeshSolid(game, { id: "tapered" }, mesh, {
      bodyPadding: 0.7,
      support: false,
    }),
    ray = new THREE.Raycaster();
  assert.equal(stationBlocked(solid, 20, 0, 30, 1.8), false);
  assert.equal(stationBlocked(solid, 20, 7.02, 30), false);
  assert.equal(
    stationBlocked(solid, 22, 6.8, 30, 0),
    false,
    "empty upper radius",
  );
  assert.equal(stationBlocked(solid, 20.8, 6.8, 30, 0), true);
  assert.equal(stationBlocked(solid, 23.3, 3.1, 30), true, "body margin only");
  assert.equal(stationBlocked(solid, 23.3, 3.1, 30, 0), false);
  assert.equal(
    stationEntry(solid, { x: 23.3, y: 3.1, z: 27 }, { x: 23.3, y: 3.1, z: 33 }),
    null,
  );
  assert(
    game.lineOfSight(
      new THREE.Vector3(23.3, 3.1, 27),
      new THREE.Vector3(23.3, 3.1, 33),
      0,
      0,
    ),
  );
  assert.equal(
    shotCover(
      game,
      new THREE.Vector3(23.3, 3.1, 27),
      new THREE.Vector3(23.3, 3.1, 33),
    ),
    1,
  );
  for (const y of [2.5, 3.01, 4.2, 6.98, 7.5])
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8,
        n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)),
        from = new THREE.Vector3(20, y, 30).addScaledVector(n, 5),
        to = new THREE.Vector3(20, y, 30).addScaledVector(n, -5);
      ray.set(from, n.clone().negate());
      ray.far = 10;
      const hit = ray.intersectObject(mesh)[0],
        entry = stationEntry(solid, from, to);
      if (hit) assert(Math.abs(entry - hit.distance / 10) < 1e-6);
      else assert.equal(entry, null);
    }
  geometry.dispose();
  material.dispose();
  // CPU records survive release of the source rendering resources.
  assert.equal(stationBlocked(solid, 20, 4, 30), true);
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
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    world,
    obstacles: [],
    groundHeight: (x, z) => terrain.height(x, z),
    walkable: () => true,
    progress: { stage: 0, field: [], alignments: {} },
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    audio: { tone() {} },
    grounded: true,
    velocityY: 0,
    jumpY: 0,
  });
  t.after(() => {
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) materials.add(o.material);
    });
    for (const m of materials)
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    for (const tex of textures) tex.dispose();
  });
  return game;
}

test("all 374 observatory masonry kernels agree with the delivered closed parts and their independent surface rays", async (t) => {
  const game = fixture(t),
    observer = await captureCableParts(() => buildObservatory(game)),
    ray = new THREE.Raycaster();
  let solids = 0,
    rays = 0,
    vertices = 0,
    marks = 0,
    markRays = 0;
  try {
    game.world.updateMatrixWorld(true);
    for (const patch of game.observatories) {
      const parts = observer.partsFor({
        fixed: patch.root,
        winchRoot: patch.detail,
        ornaments: [],
      });
      observer.update(parts);
      assert.equal(patch.stationSolids.length, 34);
      for (const solid of patch.stationSolids) {
        const kernel = solid.triangles.solids[0],
          count = kernel.shape.triangles.length * 3,
          matches = parts.filter(
            (p) =>
              p.mesh.geometry.attributes.position.count === count &&
              p.bounds.min.distanceTo(solid.bounds.min) < 3e-5 &&
              p.bounds.max.distanceTo(solid.bounds.max) < 3e-5,
          );
        assert.equal(
          matches.length,
          1,
          `${patch.index}/${solid.observatoryPart}`,
        );
        const part = matches[0],
          position = part.mesh.geometry.attributes.position,
          point = new THREE.Vector3();
        assert(cablePartClosed(part));
        assert.equal(solid.supportable, true);
        for (let i = 0; i < count; i++) {
          point
            .fromBufferAttribute(position, i)
            .applyMatrix4(part.mesh.matrixWorld);
          const physical = kernel.shape.triangles[Math.floor(i / 3)].vertices[
            i % 3
          ]
            .clone()
            .applyMatrix4(kernel.matrix);
          assert(
            point.distanceTo(physical) < 3e-5,
            "kernel follows the actual expanded buffer",
          );
          vertices++;
        }
        const b = solid.bounds,
          center = new THREE.Vector3(solid.x, 0, solid.z);
        for (const t of [0.07, 0.53, 0.93])
          for (let angle = 0; angle < 12; angle++) {
            center.y = THREE.MathUtils.lerp(b.min.y, b.max.y, t);
            const normal = new THREE.Vector3(
                Math.sin((angle * Math.PI) / 6),
                0,
                Math.cos((angle * Math.PI) / 6),
              ),
              from = center.clone().addScaledVector(normal, 7),
              to = center.clone().addScaledVector(normal, -7);
            ray.set(from, normal.clone().negate());
            ray.near = 0;
            ray.far = 14;
            const hit = ray.intersectObject(part.mesh)[0],
              entry = stationEntry(solid, from, to);
            assert(hit && entry !== null);
            assert(
              Math.abs(entry - hit.distance / 14) < 3e-6,
              `${solid.observatoryPart} surface`,
            );
            rays++;
          }
        for (const [x, z] of [
          [solid.x, solid.z],
          [b.max.x + 0.05, b.max.z + 0.05],
        ]) {
          const from = new THREE.Vector3(x, b.max.y + 2, z),
            to = new THREE.Vector3(x, b.min.y - 2, z);
          ray.set(from, new THREE.Vector3(0, -1, 0));
          ray.far = from.y - to.y;
          const hit = ray.intersectObject(part.mesh)[0],
            entry = stationEntry(solid, from, to);
          if (hit) assert(Math.abs(entry - hit.distance / ray.far) < 3e-6);
          else assert.equal(entry, null);
          rays++;
        }
        solids++;
      }
      assert.equal(patch.meridianMarks.length, 18);
      for (const mark of patch.meridianMarks) {
        const matches = parts.filter(
          (p) =>
            p.mesh.geometry.attributes.position.count === 132 &&
            Math.abs((p.bounds.min.x + p.bounds.max.x) / 2 - mark.x) < 0.005 &&
            Math.abs((p.bounds.min.z + p.bounds.max.z) / 2 - mark.z) < 0.005,
        );
        assert.equal(matches.length, 1, `meridian ${patch.index}/${marks}`);
        const part = matches[0];
        assert(cablePartClosed(part));
        for (let ix = -3; ix <= 3; ix++)
          for (const dz of [-0.012, 0, 0.012]) {
            const x = mark.x + (mark.width * ix) / 10,
              z = mark.z + dz,
              ground = game.groundHeight(x, z);
            ray.set(
              new THREE.Vector3(x, ground + 0.08, z),
              new THREE.Vector3(0, -1, 0),
            );
            ray.near = 0;
            ray.far = 0.2;
            const top = ray.intersectObject(part.mesh)[0];
            assert(
              top &&
                top.point.y - ground > -0.012 &&
                top.point.y - ground < 0.012,
              `inlay top ${patch.index}/${marks}: ${top?.point.y - ground}`,
            );
            ray.set(
              new THREE.Vector3(x, ground - 0.08, z),
              new THREE.Vector3(0, 1, 0),
            );
            const bottom = ray.intersectObject(part.mesh)[0];
            assert(
              bottom && bottom.point.y < ground - 0.02,
              "metal thickness is buried",
            );
            markRays += 2;
          }
        marks++;
      }
    }
    assert.equal(solids, 374);
    assert.equal(rays, 14212);
    assert(vertices > 350000);
    assert.equal(marks, 198);
    assert.equal(markRays, 8316);
    t.diagnostic(JSON.stringify({ solids, rays, vertices, marks, markRays }));
  } finally {
    observer.dispose();
  }
});

test("sustained legal ground movement and older-position recovery clear real pedestal and column surfaces", (t) => {
  const game = fixture(t);
  buildObservatory(game);
  let approaches = 0;
  for (const patch of game.observatories) {
    const targets = [
      { x: patch.root.position.x, z: patch.root.position.z, start: 6 },
      ...patch.foundations
        .filter((f) => f.kind === "column" && [0, 3].includes(f.column))
        .map((f) => ({
          x: patch.root.position.x + f.x,
          z: patch.root.position.z + f.z,
          start: 3,
        })),
    ];
    for (const target of targets)
      for (let face = 0; face < 4; face++) {
        const angle = (face * Math.PI) / 2,
          n = { x: Math.sin(angle), z: Math.cos(angle) };
        let start;
        for (const d of [
          target.start,
          target.start + 0.5,
          target.start + 1,
          target.start + 2,
        ]) {
          const x = target.x + n.x * d,
            z = target.z + n.z * d;
          if (game.canMove(x, z, 0)) {
            start = { x, z };
            break;
          }
        }
        if (!start) continue;
        game.player.position.set(
          start.x,
          game.groundHeight(start.x, start.z),
          start.z,
        );
        Object.assign(game, {
          grounded: true,
          velocityY: 0,
          jumpY: 0,
          jumpBuffer: 0,
          airVelocity: null,
        });
        for (let frame = 0; frame < 90; frame++)
          advanceCharacter(game, { x: -n.x * 5, z: -n.z * 5 }, 1 / 60);
        const p = game.player.position;
        assert(game.canMove(p.x, p.z, game.jumpY));
        assert(
          !patch.stationSolids.some((s) => stationBlocked(s, p.x, p.y, p.z)),
        );
        const before = p.clone();
        for (let frame = 0; frame < 30; frame++)
          advanceCharacter(game, { x: -n.x * 5, z: -n.z * 5 }, 1 / 60);
        assert(p.distanceTo(before) < 0.02, "sustained input stops at masonry");
        approaches++;
      }
  }
  assert(approaches >= 100);
  const patch = game.observatories[9],
    x = patch.root.position.x,
    z = patch.root.position.z + 3.9;
  assert.equal(
    game.canMove(x, z, 0),
    false,
    "old generic 3.8 m box allowed this position",
  );
  const before = structuredClone(game.progress),
    arrival = safeArrival(game, { x, y: game.groundHeight(x, z), z });
  assert(arrival);
  assert(
    game.canMove(
      arrival.x,
      arrival.z,
      arrival.y - game.groundHeight(arrival.x, arrival.z),
    ),
  );
  assert.deepEqual(game.progress, before);
  t.diagnostic(JSON.stringify({ approaches, arrival }));
});
