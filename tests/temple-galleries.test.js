import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import {
  buildTempleArchitecture,
  templePlan,
} from "../src/temple-architecture.js";
import { templeGalleryPlan } from "../src/temple-galleries.js";
import {
  stationBlocked,
  stationEntry,
  stationSupport,
} from "../src/field-station-solids.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { safeArrival } from "../src/character-motion.js";
import { Adventure } from "../src/game.js";

test("nine gallery footprints differ while facade and bird bearings stay fixed", () => {
  const plans = createMap(LEVELS[0]).rooms.map(templePlan);
  assert.equal(new Set(plans.map((p) => JSON.stringify(p.piers))).size, 9);
  for (const plan of plans) {
    assert.deepEqual(
      plan.piers.slice(0, 6).map(({ x, z }) => [x, z]),
      [-19, -12, -5.5, 5.5, 12, 19].map((x) => [x, -18]),
    );
    assert.deepEqual(plan.piers.slice(6, 8), [
      { x: -19, z: 18, width: 2.9 },
      { x: 19, z: 18, width: 2.9 },
    ]);
    for (const p of plan.piers)
      assert(
        Math.abs(p.x) + (p.width + 0.25) / 2 + 0.6 < 24.5,
        "outer gallery contacts must fit the existing walking court",
      );
  }
  const plan = templeGalleryPlan(0);
  plan.wings[0].bearings[0].x = 100;
  assert.equal(templeGalleryPlan(0).wings[0].bearings[0].x, -21);
  assert.throws(() => templeGalleryPlan(9), RangeError);
});

test("batched galleries have real supports, open bays, finite contact and safe save recovery", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[0],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile,
    world,
    obstacles: [],
    groundHeight: terrainProfile.surfaceHeight,
    cameraSurfaces: new CameraSurfaces(world),
  });
  t.after(() => {
    const geometries = new Set(game.templeCaptureGeometry),
      materials = new Set(),
      textures = new Set();
    world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of [o.material, o.customDepthMaterial].flat())
        if (m) {
          materials.add(m);
          for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
        }
    });
    geometries.forEach((g) => g.dispose());
    textures.forEach((v) => v.dispose());
    materials.forEach((m) => m.dispose());
  });
  buildTempleArchitecture(game);
  game.cameraSurfaces.rebuild();
  let supports = 0,
    bays = 0,
    occupied = 0;
  for (const patch of game.templePatches) {
    const c = patch.root.position;
    for (const gallery of patch.galleries) {
      const { solid, points, spans } = gallery;
      assert(solid.bounds.min.y > -Infinity && solid.bounds.max.y < Infinity);
      for (const pier of points) {
        const x = c.x + pier.x,
          z = c.z + pier.z,
          y = game.groundHeight(x, z);
        assert(
          stationBlocked(solid, x, y + 0.7, z),
          "pier is physically occupied",
        );
        const hit = new THREE.Raycaster(
          new THREE.Vector3(x, y + 30, z),
          new THREE.Vector3(0, -1, 0),
        ).intersectObject(patch.root, true)[0];
        const support = stationSupport(solid, x, z, Infinity, 0.4);
        assert(
          hit && support !== null && Math.abs(hit.point.y - support) < 1e-5,
          `rendered support ${solid.fieldStation}/${pier.x}/${pier.z}`,
        );
        supports++;
      }
      for (const span of spans) {
        const x = c.x + (span.a.x + span.b.x) / 2,
          z = c.z + (span.a.z + span.b.z) / 2,
          angle = Math.atan2(span.b.z - span.a.z, span.b.x - span.a.x),
          normal = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
        for (let d = -3; d <= 3; d += 0.5) {
          const px = x + normal.x * d,
            pz = z + normal.z * d;
          assert(
            !stationBlocked(solid, px, game.groundHeight(px, pz), pz),
            "broad gallery bounds must leave walking bays empty",
          );
        }
        const from = new THREE.Vector3(
            x,
            game.groundHeight(x, z) + 1.6,
            z,
          ).addScaledVector(normal, -3),
          to = from.clone().addScaledVector(normal, 6);
        assert.equal(
          stationEntry(solid, from, to),
          null,
          "open bay sight and sound",
        );
        assert.equal(
          game.cameraSurfaces.entry(from, to, 0),
          1,
          "open bay camera passage",
        );
        if (span.roof) {
          const height = stationSupport(solid, x, z, Infinity, 0.4);
          assert(height !== null);
          const rendered = new THREE.Raycaster(
            new THREE.Vector3(x, height + 5, z),
            new THREE.Vector3(0, -1, 0),
          ).intersectObject(patch.root, true)[0];
          assert(
            rendered && Math.abs(rendered.point.y - height) < 1e-5,
            "a roof joint retains rendered stone beneath its support",
          );
          const saved = { x, y: height, z };
          assert.deepEqual(
            safeArrival(game, saved),
            saved,
            "valid gallery roof save retained",
          );
        }
        bays++;
      }
      for (const pier of points.slice(1, 3)) {
        const saved = { x: c.x + pier.x, z: c.z + pier.z };
        saved.y = game.groundHeight(saved.x, saved.z);
        assert(!game.canMove(saved.x, saved.z, 0));
        const recovered = safeArrival(game, saved);
        assert(
          recovered &&
            Math.hypot(recovered.x - saved.x, recovered.z - saved.z) <= 3.75,
          "occupied saves recover nearby",
        );
        assert(
          game.canMove(
            recovered.x,
            recovered.z,
            recovered.y - game.groundHeight(recovered.x, recovered.z),
          ),
        );
        occupied++;
      }
    }
    assert.equal(patch.root.children.filter((o) => o.isMesh).length, 1);
  }
  assert.equal(supports, 52);
  assert.equal(bays, 39);
  assert.equal(occupied, 26);
  assert.equal(game.obstacles.filter((o) => o.templeGallery).length, 13);
});
