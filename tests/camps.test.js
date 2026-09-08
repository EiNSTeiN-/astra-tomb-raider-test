import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { campMaterials, CAMP_FABRIC } from "../src/camp-materials.js";
import { buildCamp, updateCamps } from "../src/camps.js";
import { buildFireEffects, updateFireEffects } from "../src/effects.js";
import { buildSoundLandmarks } from "../src/sound-landmarks.js";
import { Adventure } from "../src/game.js";
import { safeArrival } from "../src/character-motion.js";
import { buildTorch, useTorch } from "../src/torch.js";
import { SaveStore } from "../src/storage.js";
function fixture(level = LEVELS[0]) {
  const map = createMap(level),
    terrain = createTerrainProfile(map, level),
    store = new SaveStore({ getItem: () => null, setItem() {} });
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    store,
    progress: store.level(level.id),
    world: new THREE.Group(),
    groundHeight: terrain.height,
    obstacles: [],
    traversalCourses: [],
    flames: [],
    items: [],
    waterMeshes: [],
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(55, 1.5, 0.1, 400),
    elapsed: 0,
    health: 40,
    stamina: 12,
    grounded: true,
    keys: new Set(),
    audio: { tone() {} },
    cb: { toast() {} },
    save() {
      this.saved = (this.saved || 0) + 1;
    },
    lineOfSight: () => true,
  });
  game.campMaterials = campMaterials(
    level.biome,
    (_name, color) => new THREE.MeshStandardMaterial({ color }),
  );
  game.world.add(game.player);
  return game;
}
function add(game, feature) {
  const group = new THREE.Group();
  group.position.set(
    feature.x * 7,
    game.groundHeight(feature.x * 7, feature.z * 7),
    feature.z * 7,
  );
  game.world.add(group);
  feature.group = group;
  game.items.push(feature);
  return buildCamp(game, feature, group);
}

test("all chapter camps retain their flame anchors and clear approaches around finite, bounded props", (t) => {
  let count = 0,
    maxTriangles = 0,
    maxCalls = 0;
  for (const level of LEVELS) {
    const game = fixture(level);
    for (const feature of game.map.features.filter((f) => f.type === "camp")) {
      const camp = add(game, feature);
      count++;
      maxTriangles = Math.max(maxTriangles, camp.stats.triangles);
      maxCalls = Math.max(maxCalls, camp.stats.calls);
      game.world.updateMatrixWorld(true);
      assert.deepEqual(
        camp.fire.getWorldPosition(new THREE.Vector3()).toArray(),
        [
          feature.x * 7,
          game.groundHeight(feature.x * 7, feature.z * 7) + 0.75,
          feature.z * 7,
        ],
      );
      let triangles = 0;
      for (const root of [camp.solid, camp.fine])
        root.traverse((mesh) => {
          if (!mesh.isMesh) return;
          for (const attribute of Object.values(mesh.geometry.attributes))
            assert(attribute.array.every(Number.isFinite));
          const positions = mesh.geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            const p = new THREE.Vector3()
              .fromBufferAttribute(positions, i)
              .applyMatrix4(mesh.matrixWorld)
              .sub(camp.group.position);
            assert(
              p.x > -1.2 && p.x < 2.68 && p.z > -1.2 && p.z < 1.45,
              `${level.id}/${feature.id}: prop escapes footprint ${p.toArray()}`,
            );
          }
          triangles += (mesh.geometry.index?.count ?? positions.count) / 3;
        });
      assert(triangles < 32000);
      for (const [dx, dz] of [
        [-1.8, 0],
        [0, -1.8],
        [0, 1.8],
        [1.8, 0],
      ])
        assert(
          game.canMove(feature.x * 7 + dx, feature.z * 7 + dz, 0),
          `${level.id}/${feature.id}: camp approach blocked`,
        );
      assert(
        !game.canMove(camp.obstacle.x, camp.obstacle.z, 0),
        "supply chest must be solid",
      );
      const p = {
        x: camp.obstacle.x,
        y: game.groundHeight(camp.obstacle.x, camp.obstacle.z),
        z: camp.obstacle.z,
      };
      const recovered = safeArrival(game, p);
      assert(recovered);
      assert(
        game.canMove(
          recovered.x,
          recovered.z,
          recovered.y - game.groundHeight(recovered.x, recovered.z),
        ),
      );
    }
  }
  assert.equal(new Set(Object.values(CAMP_FABRIC)).size, 8);
  t.diagnostic(JSON.stringify({ count, maxTriangles, maxCalls }));
});

test("camp fire effects preserve torch access, one positioned ambient voice, rest and saved checkpoint behavior", () => {
  const game = fixture(),
    feature = game.map.features.find((f) => f.id === "camp-0"),
    camp = add(game, feature),
    p = camp.group.position;
  game.player.position.copy(p).add(new THREE.Vector3(-1.8, 0, 0));
  game.player.position.y = game.groundHeight(
    game.player.position.x,
    game.player.position.z,
  );
  game.map = { ...game.map, rooms: [] };
  buildSoundLandmarks(game);
  assert.equal(game.soundSources.length, 1);
  const source = game.soundSources[0];
  assert.equal(source.kind, "fire");
  assert.deepEqual(
    [source.x, source.y, source.z],
    camp.fire.getWorldPosition(new THREE.Vector3()).toArray(),
  );
  buildTorch(game);
  buildFireEffects(game);
  assert.equal(camp.fire.material, game.campEffects.fire);
  assert.equal(camp.fire.geometry.parameters.height, 1.2);
  assert.equal(useTorch(game), true);
  assert.equal(game.progress.torch, true);
  game.nearest = feature;
  game.interact();
  assert.equal(game.health, 100);
  assert.equal(game.stamina, 100);
  assert.equal(game.progress.medkits, 3);
  assert.deepEqual(game.checkpoint, {
    x: game.player.position.x,
    z: game.player.position.z,
  });
  assert(game.saved >= 2);
  updateCamps(game);
  updateFireEffects(game);
  assert(
    game.fireLights.some(
      (l) =>
        l.visible &&
        l.position.distanceTo(camp.fire.getWorldPosition(new THREE.Vector3())) <
          0.001,
    ),
  );
  const light = game.fireLights.find((l) => l.visible);
  const intensity = light.intensity;
  game.paused = true;
  game.elapsed += 1;
  updateCamps(game);
  updateFireEffects(game);
  assert.equal(light.intensity, intensity);
});

test("camp animation freezes on pause, distance controls detail and particles, and resource ownership is local to the chapter", () => {
  const game = fixture(),
    camp = add(
      game,
      game.map.features.find((f) => f.id === "camp-0"),
    );
  game.player.position.copy(camp.group.position);
  game.elapsed = 2;
  updateCamps(game);
  assert.equal(game.campTime.value, 2);
  assert(camp.fine.visible && camp.smoke.visible && camp.sparks.visible);
  game.paused = true;
  game.elapsed = 5;
  updateCamps(game);
  assert.equal(game.campTime.value, 2);
  game.paused = false;
  game.store.data.settings.quality = "low";
  game.player.position.x += 25;
  updateCamps(game);
  assert(!camp.fine.visible && !camp.smoke.visible && !camp.sparks.visible);
  assert(camp.solid.visible && camp.fire.visible);
  game.player.position.x += 100;
  updateCamps(game);
  assert(!camp.solid.visible && !camp.ash.visible && !camp.fire.visible);
  const other = fixture();
  add(
    other,
    other.map.features.find((f) => f.id === "camp-0"),
  );
  assert.notEqual(other.campTime, game.campTime);
  assert.notEqual(other.campMaterials.wood, game.campMaterials.wood);
  assert.notEqual(other.campEffects.fire, game.campEffects.fire);
});
