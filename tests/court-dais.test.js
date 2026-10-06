import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { buildCourtDais } from "../src/court-dais.js";
import { courtDaisFloor, courtWalkingHeight } from "../src/court-dais-rules.js";
import { supportAt, advanceCharacter } from "../src/character-motion.js";
import { restoreTraversal } from "../src/traversal.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  buildGuardian,
  navigateGuardian,
  startDodge,
  updateDodge,
} from "../src/combat.js";
import { guardianFooting } from "../src/guardian-patrols.js";
import { animateGuardian } from "../src/guardian-art.js";

function fixture(level) {
  const map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile,
    world,
    groundHeight: terrainProfile.height,
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    obstacles: [],
    cameraSurfaces: new CameraSurfaces(world),
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(),
    jumpY: 0,
    velocityY: 0,
    grounded: true,
    yaw: 0,
    elapsed: 0,
    stamina: 100,
    keys: new Set(),
    touchMove: { x: 0, z: 0 },
    audio: { tone() {}, noiseHit() {} },
    rng: () => 0.5,
    enemies: [],
    progress: { stage: 0, field: [], defeated: [] },
    traversalCourses: [],
    items: [],
    waterMeshes: [],
    skyBridges: [],
  });
  for (const room of map.rooms.filter((r) => r.index > 1))
    buildCourtDais(game, room);
  game.cameraSurfaces.rebuild();
  world.updateMatrixWorld(true);
  return game;
}
function dispose(game) {
  game.world.traverse((o) => o.geometry?.dispose());
  for (const m of Object.values(game.courtDaisMaterials)) m.dispose();
  game.stoneMat.dispose();
  game.darkMat.dispose();
  game.goldMat.dispose();
}

test("every delivered dais has a fitted foundation and roofs within 5 mm of all three walking surfaces", () => {
  const ray = new THREE.Raycaster(),
    styles = new Set(),
    motifs = new Set();
  let count = 0,
    rays = 0;
  for (const level of LEVELS) {
    const game = fixture(level);
    for (const dais of game.courtDaises) {
      styles.add(dais.style);
      motifs.add(dais.motif);
      const bounds = new THREE.Box3().setFromObject(dais.root);
      assert(
        bounds.min.x >= dais.x - 4.50001 && bounds.max.x <= dais.x + 4.50001,
      );
      assert(
        bounds.min.z >= dais.z - 4.50001 && bounds.max.z <= dais.z + 4.50001,
      );
      assert(bounds.max.y <= dais.base + 0.51601);
      assert(dais.root.children.length <= 4, "bounded material batches");
      for (let ix = 0; ix < 25; ix++)
        for (let iz = 0; iz < 25; iz++) {
          const x = dais.x - 4.499 + (ix * 8.998) / 24,
            z = dais.z - 4.499 + (iz * 8.998) / 24,
            floor = supportAt(game, x, z),
            ground = game.groundHeight(x, z);
          ray.set(
            new THREE.Vector3(x, dais.base + 1, z),
            new THREE.Vector3(0, -1, 0),
          );
          const hit = ray.intersectObject(dais.root, true)[0];
          assert(hit, level.id + " missing tread");
          assert(
            Math.abs(hit.point.y - floor.height) <= 0.00501,
            level.id + " roof/feet mismatch",
          );
          assert.equal(courtWalkingHeight(game, x, z), floor.height);
          assert(
            dais.bottom < ground - 0.17,
            "foundation below the complete terrain footprint",
          );
          assert(game.canMove(x, z, floor.height - ground));
          rays++;
        }
      for (const mesh of dais.root.children) {
        assert(mesh.geometry.attributes.position.array.every(Number.isFinite));
        if (mesh.material === game.courtDaisMaterials.metal)
          assert(
            [...mesh.geometry.attributes.normal.array]
              .filter((_, i) => i % 3 === 1)
              .every((y) => y > 0.999),
            "inlay faces upward",
          );
      }
      count++;
    }
    dispose(game);
  }
  assert.equal(count, 61);
  assert.equal(rays, 38125);
  assert.equal(styles.size, 8);
  assert.equal(motifs.size, 8);
});

test("walking ascends and descends every dais on both axes without jumping, penetration or a phantom lip", () => {
  let paths = 0;
  for (const level of LEVELS) {
    const game = fixture(level);
    for (const dais of game.courtDaises)
      for (const axis of ["x", "z"])
        for (const sign of [-1, 1]) {
          const p = game.player.position,
            velocity = new THREE.Vector3();
          p.set(dais.x, dais.base, dais.z);
          p[axis] += sign * 5.2;
          p.y = game.groundHeight(p.x, p.z);
          game.grounded = true;
          game.velocityY = 0;
          velocity[axis] = -sign * 4;
          let peak = 0;
          for (let frame = 0; frame < 162; frame++) {
            advanceCharacter(game, velocity, 1 / 60);
            const floor = courtDaisFloor(game, p.x, p.z);
            assert(
              Math.abs(p.y - floor.height) < 1e-7,
              level.id + " stair penetration",
            );
            assert(game.grounded);
            peak = Math.max(peak, p.y - dais.base);
          }
          assert(Math.abs(peak - 0.515) < 1e-7);
          assert(Math.abs(p[axis] - dais[axis]) > 5, "complete departure");
          paths++;
        }
    dispose(game);
  }
  assert.equal(paths, 244);
});

test("older ground saves lift in place on each exposed tier; elevated instruments keep their height and mantle priority", () => {
  let arrivals = 0,
    instruments = 0;
  for (const level of LEVELS) {
    const game = fixture(level);
    for (const dais of game.courtDaises) {
      for (const [offset, height] of [
        [4.15, 0.115],
        [3.5, 0.315],
        [2.5, 0.515],
        [0, 0.515],
      ])
        for (const oldHeight of [undefined, 0, height]) {
          const x = dais.x + offset,
            z = dais.z;
          game.progress.position = {
            x,
            z,
            ...(oldHeight === undefined ? {} : { height: oldHeight }),
          };
          game.player.position.set(x, game.groundHeight(x, z), z);
          restoreTraversal(game);
          assert.equal(game.player.position.x, x);
          assert.equal(game.player.position.z, z);
          assert(
            Math.abs(game.player.position.y - (dais.base + height)) < 1e-7,
          );
          arrivals++;
        }
      if (["snow", "sky"].includes(level.biome)) {
        const tower = {
          x: dais.x,
          z: dais.z,
          w: level.biome === "snow" ? 3.8 : 3,
          d: 3,
          h: 3.1,
          climbable: true,
        };
        game.obstacles.push(tower);
        game.player.position.set(dais.x, dais.base + 0.315, dais.z + 4);
        game.climb = null;
        assert(game.tryClimb(0, -1));
        assert.equal(game.climb.end.y, dais.base + tower.h);
        game.progress.position = { x: dais.x, z: dais.z, height: tower.h };
        game.player.position.set(dais.x, dais.base, dais.z);
        restoreTraversal(game);
        assert.equal(game.player.position.y, dais.base + tower.h);
        game.obstacles.pop();
        instruments++;
      }
    }
    dispose(game);
  }
  assert.equal(arrivals, 732);
  assert.equal(instruments, 15);
});

test("legacy arrival still rejects a solid instrument, and shallow steps occlude rays through their stone", () => {
  const game = fixture(LEVELS[0]),
    dais = game.courtDaises[0];
  game.obstacles.push({ x: dais.x, z: dais.z, w: 0.7, d: 0.7, h: 2 });
  game.progress.position = { x: dais.x, z: dais.z, height: 0 };
  game.player.position.set(dais.x, dais.base, dais.z);
  restoreTraversal(game);
  const p = game.player.position;
  assert(Math.hypot(p.x - dais.x, p.z - dais.z) > 0.7);
  assert(game.canMove(p.x, p.z, p.y - game.groundHeight(p.x, p.z)));
  assert.equal(
    game.lineOfSight(
      new THREE.Vector3(dais.x + 5, dais.base + 0.04, dais.z),
      new THREE.Vector3(dais.x + 4, dais.base + 0.04, dais.z),
      0,
      0,
    ),
    false,
  );
  dispose(game);
});

test("guardians cross regional low steps with raised roots and planted feet; dodge uses the same floor", () => {
  for (const level of LEVELS) {
    const game = fixture(level),
      dais = game.courtDaises[0],
      enemy = buildGuardian(game, {
        id: "dais-guardian",
        x: dais.x / 7,
        z: (dais.z + 5.2) / 7,
      });
    game.enemies.push(enemy);
    const target = new THREE.Vector3(dais.x, dais.base, dais.z - 5.2);
    let peak = 0;
    for (let frame = 0; frame < 180; frame++) {
      const previous = enemy.group.position.clone();
      navigateGuardian(game, enemy, target, 1 / 30);
      const p = enemy.group.position;
      game.camera.position.copy(p).add(new THREE.Vector3(0, 4, 8));
      game.elapsed += 1 / 30;
      animateGuardian(game, enemy, 1 / 30);
      assert(guardianFooting(game, enemy, p.x, p.z));
      assert.equal(p.y, courtWalkingHeight(game, p.x, p.z));
      peak = Math.max(peak, p.y - dais.base);
      if (!enemy.art.step && p.distanceTo(previous) < 0.001)
        for (const foot of enemy.art.feet)
          assert(
            foot.y >=
              courtWalkingHeight(game, foot.x, foot.z) +
                0.17 * enemy.art.scale -
                0.025,
          );
    }
    assert(peak > 0.51);
    assert(enemy.group.position.z < dais.z - 4.8);
    game.player.position.set(dais.x + 2, dais.base + 0.515, dais.z);
    game.jumpY = 0.515;
    assert(startDodge(game));
    for (let frame = 0; frame < 40; frame++) {
      updateDodge(game, 1 / 60);
      assert(
        Math.abs(
          game.player.position.y -
            courtWalkingHeight(
              game,
              game.player.position.x,
              game.player.position.z,
            ),
        ) < 1e-7,
      );
      if (!game.dodge) break;
    }
    assert.equal(game.dodge, null);
    game.dodgeCooldown = 0;
    game.stamina = 100;
    game.player.position.set(dais.x, dais.base + 3.1, dais.z);
    game.jumpY = 3.1;
    assert.equal(
      startDodge(game),
      false,
      "a raised instrument above the pavement retains its existing restriction",
    );
    dispose(game);
  }
});
