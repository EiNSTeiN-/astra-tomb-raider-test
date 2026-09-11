import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import {
  createCavernProfile,
  cavernClear,
  crystalRestoration,
} from "../src/cavern-profile.js";
import {
  cavernChunks,
  quartzGeometry,
  stalactiteGeometry,
  mineralBedGeometry,
} from "../src/cavern-geometry.js";
import { rockGroundHeight } from "../src/nature-rocks.js";
import { buildCaverns, updateCaverns } from "../src/caverns.js";
import {
  buildSoundLandmarks,
  updateSoundSources,
} from "../src/sound-landmarks.js";
import { CameraSurfaces, constrainCamera } from "../src/camera-collision.js";
import { Adventure } from "../src/game.js";
import { normalizeSave } from "../src/storage.js";
import { coursePlan } from "../src/traversal-courses.js";

const level = LEVELS[6],
  map = createMap(level),
  terrain = createTerrainProfile(map, level);
const profile = createCavernProfile(map, terrain);
function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile: terrain,
    world,
    progress: { stage: 0, field: [] },
    elapsed: 0,
    player: { position: new THREE.Vector3(56, 26, 56) },
    obstacles: [],
    flames: [],
    items: [],
    waterMeshes: [],
    skyBridges: [],
    cameraSurfaces: new CameraSurfaces(world),
  });
  buildCaverns(game);
  buildSoundLandmarks(game);
  game.cameraSurfaces.rebuild();
  t.after(() =>
    world.traverse((o) => {
      o.geometry?.dispose();
    }),
  );
  return game;
}

test("every mineral-bed perimeter stays below both the visible triangles and sampled floor", (t) => {
  const game = fixture(t);
  let probes = 0;
  for (const patch of game.cavernPatches)
    for (const [index, center] of patch.centers.entries()) {
      const geometry = mineralBedGeometry(
          center.x,
          center.z,
          terrain.height,
          patch.index + index + 1,
        ),
        p = geometry.attributes.position;
      for (let i = 0; i < 32; i++)
        for (let step = 0; step < 6; step++) {
          const a = 97 + i,
            b = 97 + ((i + 1) % 32),
            u = step / 6,
            x = center.x + p.getX(a) * (1 - u) + p.getX(b) * u,
            z = center.z + p.getZ(a) * (1 - u) + p.getZ(b) * u,
            y = center.y + p.getY(a) * (1 - u) + p.getY(b) * u;
          assert(
            y <= rockGroundHeight(terrain, x, z) + 1e-5,
            `Exposed mineral rim at ${x},${z}`,
          );
          probes++;
        }
      geometry.dispose();
    }
  assert(probes > 6000);
});

test("cave vaults preserve headroom over every map route and seal at all four world edges", () => {
  assert.deepEqual(createCavernProfile(map, terrain).heights, profile.heights);
  let minimum = Infinity;
  for (let z = 1; z < map.size - 1; z++)
    for (let x = 1; x < map.size - 1; x++) {
      if (!map.grid[z][x]) continue;
      for (const dx of [-2.9, 0, 2.9])
        for (const dz of [-2.9, 0, 2.9]) {
          const px = x * 7 + dx,
            pz = z * 7 + dz;
          minimum = Math.min(
            minimum,
            profile.height(px, pz) - terrain.height(px, pz),
          );
        }
    }
  assert.ok(minimum > 14, `lowest route headroom ${minimum}`);
  for (const f of map.features.filter((f) => f.kind === "climb")) {
    const plan = coursePlan(level, f),
      base = terrain.height(f.x * 7, f.z * 7);
    for (let u = -13.5; u <= 8.5; u += 0.5) {
      const p = plan.transform(u, f.stage % 2 ? -9 : -8);
      assert.ok(
        profile.height(p.x, p.z) > base + plan.pivot.h + 1.5,
        `${f.id}: buried rope support`,
      );
    }
  }
  for (let p = 0; p <= terrain.extent; p += 1.75)
    for (const [x, z] of [
      [0, p],
      [p, 0],
      [terrain.extent, p],
      [p, terrain.extent],
    ])
      assert.ok(
        profile.height(x, z) < terrain.height(x, z) - 0.5,
        `unsealed edge ${x},${z}`,
      );
});

test("rendered roof triangles face the cavity, meet without seams and match collision heights", () => {
  const geometries = cavernChunks(profile),
    material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map((g) => new THREE.Mesh(g, material));
  const shared = new Map();
  for (const g of geometries) {
    const p = g.attributes.position,
      n = g.attributes.normal;
    assert.ok(p.array.every(Number.isFinite));
    assert.ok(n.array.every(Number.isFinite));
    for (let i = 0; i < p.count; i++) {
      assert.ok(n.getY(i) < 0);
      const key = `${p.getX(i)},${p.getZ(i)}`;
      if (shared.has(key)) assert.equal(p.getY(i), shared.get(key));
      shared.set(key, p.getY(i));
    }
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    for (let i = 0; i < g.index.count; i += 3) {
      a.fromBufferAttribute(p, g.index.getX(i));
      b.fromBufferAttribute(p, g.index.getX(i + 1));
      c.fromBufferAttribute(p, g.index.getX(i + 2));
      assert.ok(b.sub(a).cross(c.sub(a)).y < 0);
    }
  }
  for (const f of map.features) {
    const x = f.x * 7 + 0.37,
      z = f.z * 7 + 0.61;
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, terrain.height(x, z) + 1, z),
      new THREE.Vector3(0, 1, 0),
    );
    const hit = ray.intersectObjects(meshes)[0];
    assert.ok(hit, `roof missing over ${f.id}`);
    assert.ok(Math.abs(hit.point.y - profile.height(x, z)) < 1e-4);
  }
  geometries.forEach((g) => g.dispose());
  material.dispose();
});

test("character headroom, sight and the swept camera stop below the physical roof", (t) => {
  const game = fixture(t),
    x = 56,
    z = 57,
    roof = game.cavernProfile.height(x, z),
    floor = terrain.height(x, z);
  assert.equal(game.canMove(x, z, 0), true);
  assert.equal(game.canMove(x, z, roof - floor - 0.5), false);
  assert.equal(game.canMove(x, z, roof - floor - 2), true);
  const start = new THREE.Vector3(x, floor + 1.3, z),
    end = new THREE.Vector3(x, roof + 5, z);
  const camera = constrainCamera(start, end, game.cameraSurfaces, (p) =>
    cavernClear(game, p.x, p.y, p.z, 0.28),
  );
  assert.ok(camera.y < roof - 0.28 && camera.y > floor + 5);
  assert.equal(game.lineOfSight(start, end), false);
});

test("quartz has closed outward prism faces and stalactites taper to supported tips", () => {
  const g = quartzGeometry(0.7, 6, 0.2),
    p = g.attributes.position;
  let volume = 0;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    volume += a.dot(b.cross(c)) / 6;
  }
  assert.ok(volume > 4 && volume < 9);
  assert.ok(g.attributes.normal.array.every(Number.isFinite));
  const s = stalactiteGeometry(0.8, 3.2, 2);
  s.computeBoundingBox();
  assert.equal(s.boundingBox.min.y, 0);
  assert.ok(Math.abs(s.boundingBox.max.y - 3.2) < 1e-6);
  g.dispose();
  s.dispose();
});

test("mineral clusters leave feature approaches, guardian spawns and their visible sound fronts clear", (t) => {
  const game = fixture(t);
  for (const enemy of map.enemies)
    assert(game.canMove(enemy.x * 7, enemy.z * 7, 0), enemy.id);
  assert.equal(game.cavernPatches.length, 9);
  assert.equal(game.cavernSources.length, 42);
  assert.equal(
    game.cavernPatches.reduce((n, p) => n + p.centers.length, 0),
    33,
  );
  for (const patch of game.cavernPatches)
    for (const center of patch.centers)
      for (const f of map.features)
        assert.ok(Math.hypot(center.x - f.x * 7, center.z - f.z * 7) >= 7);
  for (const s of game.soundSources.filter((s) => s.cavernRoom !== undefined)) {
    const center = game.cavernPatches[s.cavernRoom].centers[s.cavernCluster];
    assert.equal(s.x, center.x + s.faceX * 2.45);
    assert.equal(s.y, center.y + 3);
    assert.equal(s.z, center.z + s.faceZ * 2.35);
    assert.ok(
      game.lineOfSight(
        new THREE.Vector3(
          s.x + s.faceX * 4,
          terrain.height(s.x + s.faceX * 4, s.z + s.faceZ * 4),
          s.z + s.faceZ * 4,
        ),
        new THREE.Vector3(s.x, s.y - 1.4, s.z),
      ),
      s.id,
    );
  }
});

test("saved resonance work controls the same gradual mineral glow and positional drone", (t) => {
  const game = fixture(t),
    patch = game.cavernPatches[1],
    source = game.soundSources.find((s) => s.id === "crystal-1");
  assert.equal(patch.restoration.value, 0);
  assert.equal(source.activity, 0.4);
  game.progress.field = ["field-0-0"];
  updateCaverns(game, 0.4);
  updateSoundSources(game);
  assert.ok(patch.restoration.value > 0 && patch.restoration.value < 1 / 3);
  assert.equal(source.activity, 0.4 + 0.6 * patch.restoration.value);
  const saved = normalizeSave({
    version: 1,
    levels: { crystal: { stage: 1, field: [] } },
  }).levels.crystal;
  assert.equal(crystalRestoration(saved, 1), 1);
  assert.equal(crystalRestoration(saved, 2), 0);
  game.progress = saved;
  updateCaverns(game, 100);
  updateSoundSources(game);
  assert.equal(patch.restoration.value, 1);
  assert.equal(source.activity, 1);
  assert.equal(game.cavernLights.length, 4);
  assert.ok(game.cavernLights.every((l) => !l.castShadow));
});

test("drip streaks, impact rings and sound follow the same drained water surface", (t) => {
  const game = fixture(t),
    site = game.cavernDrips.sites[0],
    ground = terrain.height(site.x, site.z);
  game.waterMeshes = [
    {
      position: { x: site.x, y: ground + 2, z: site.z },
      userData: { kind: "water", width: 4, length: 4 },
    },
  ];
  updateCaverns(game, 0.1);
  updateSoundSources(game);
  const source = game.soundSources.find((s) => s.id === site.id);
  assert.equal(site.floor, ground + 2.06);
  assert.equal(site.ring.position.y, site.floor);
  assert.equal(source.y, site.floor + 0.3);
  game.waterMeshes[0].position.y = ground - 1;
  game.elapsed = 2;
  updateCaverns(game, 0.1);
  updateSoundSources(game);
  assert.equal(site.floor, ground + 0.06);
  assert.equal(source.y, site.floor + 0.3);
  assert.ok(
    game.cavernDrips.drops.geometry.attributes.position.array.every(
      Number.isFinite,
    ),
  );
});

test("switching chapters clears cavern geometry references, light slots, emitters and collision", (t) => {
  const game = fixture(t);
  game.level = LEVELS[0];
  assert.equal(buildCaverns(game), false);
  assert.equal(game.cavernProfile, null);
  assert.equal(game.cavernDrips, null);
  for (const list of [
    "cavernMeshes",
    "cavernPatches",
    "cavernLights",
    "cavernSources",
  ])
    assert.equal(game[list].length, 0);
  assert.equal(cavernClear(game, 56, 300, 57), true);
});
