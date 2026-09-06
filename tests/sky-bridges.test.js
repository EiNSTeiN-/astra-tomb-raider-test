import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { advanceCharacter, supportAt } from "../src/character-motion.js";
import { restoreTraversal } from "../src/traversal.js";
import { normalizeSave } from "../src/storage.js";
import { migrateSkyRoute } from "../src/sky-layout.js";
import {
  buildSkyBridges,
  updateSkyBridges,
  recoverSkyBridgeFall,
  restoreSkyBridgeArrival,
} from "../src/sky-bridges.js";
import {
  spanCoordinates,
  bridgeDeckY,
  bridgeDeployed,
  skyDeckAt,
} from "../src/sky-bridge-rules.js";

function fixture(t, stage = 9) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[5],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile: profile,
    world,
    groundHeight: profile.height,
    obstacles: [],
    cameraSurfaces: new CameraSurfaces(world),
    stoneMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    progress: { stage, field: [], routeVersion: 1 },
    elapsed: 0,
    player: { position: new THREE.Vector3() },
    audio: { tone() {}, noiseHit() {} },
    cb: { toast() {} },
    stamina: 100,
    traversalCourses: [],
  });
  buildSkyBridges(game);
  game.cameraSurfaces.rebuild();
  t.after(() => {
    world.traverse((o) => o.geometry?.dispose());
  });
  return game;
}

test("sky spans cross real ravines, join their banks exactly, and retain every ordered station", (t) => {
  const game = fixture(t),
    profile = game.terrainProfile;
  assert.equal(game.skyBridges.length, 18);
  assert.equal(game.map.features.filter((f) => f.type === "field").length, 27);
  for (const b of game.skyBridges) {
    const c = spanCoordinates(b, b.bx, b.bz);
    assert.ok(c.length > 40 && c.length < 43);
    assert.equal(profile.height(b.ax, b.az), b.ay);
    assert.equal(profile.height(b.bx, b.bz), b.by);
    assert.ok(
      bridgeDeckY(b, c.length / 2) -
        profile.height((b.ax + b.bx) / 2, (b.az + b.bz) / 2) >
        23.9,
    );
    for (const gap of b.gaps)
      assert.ok(gap.end - gap.start > 1.5 && gap.end - gap.start < 1.61);
    assert.equal(
      game.skyBridgeSources.filter((s) => s.id.startsWith(b.id)).length,
      2,
    );
    if (b.requires)
      assert.ok(game.map.features.some((f) => f.id === b.requires));
  }
  for (let stage = 0; stage < 9; stage++) {
    const stations = game.map.features.filter(
      (f) => f.type === "field" && f.stage === stage,
    );
    assert.deepEqual(
      stations.map((f) => f.step),
      [0, 1, 2],
    );
    const from = game.map.rooms[stage],
      to = game.map.rooms[stage + 1];
    const along = stations.map(
      (f) =>
        (f.x - from.x) * (to.x - from.x) + (f.z - from.z) * (to.z - from.z),
    );
    assert.ok(along[0] > 0 && along[1] > along[0] && along[2] > along[1]);
  }
});

test("all eighteen spans can be crossed in both directions at carrying speed through the character physics", (t) => {
  const game = fixture(t);
  for (const b of game.skyBridges)
    for (const direction of [1, -1]) {
      const c = spanCoordinates(b, b.bx, b.bz),
        start = direction === 1 ? -1 : c.length + 1;
      const x = b.ax + c.ux * start,
        z = b.az + c.uz * start;
      game.player.position.set(x, game.groundHeight(x, z), z);
      Object.assign(game, {
        grounded: true,
        velocityY: 0,
        airVelocity: null,
        jumpBuffer: 0,
        coyote: 0,
        fallPeak: game.player.position.y,
      });
      let jumps = 0,
        finished = false;
      for (let frame = 0; frame < 900; frame++) {
        const p = spanCoordinates(
          b,
          game.player.position.x,
          game.player.position.z,
        );
        if (direction === 1 ? p.along > c.length + 0.8 : p.along < -0.8) {
          finished = true;
          break;
        }
        const jump =
          game.grounded &&
          b.gaps.some((g) => {
            const d = direction === 1 ? g.start - p.along : p.along - g.end;
            return d > 0 && d < 1.15;
          });
        if (jump) jumps++;
        advanceCharacter(
          game,
          { x: c.ux * 4.6 * direction, z: c.uz * 4.6 * direction },
          1 / 60,
          jump,
        );
        assert.equal(
          recoverSkyBridgeFall(game),
          false,
          `${b.id} direction ${direction}: crossing fell`,
        );
      }
      assert.ok(
        finished,
        `${b.id} direction ${direction}: must reach the far bank`,
      );
      assert.equal(jumps, b.gaps.length);
    }
});

test("missing boards remove physical support and a missed jump returns to the last bank without advancing objectives", (t) => {
  const game = fixture(t),
    b = game.skyBridges.find((b) => b.gaps.length),
    c = spanCoordinates(b, b.bx, b.bz),
    gap = b.gaps[0],
    s = (gap.start + gap.end) / 2;
  assert.equal(skyDeckAt(game, b.ax + c.ux * s, b.az + c.uz * s), null);
  for (const bank of ["a", "b"]) {
    b.lastBank = bank;
    game.player.position.set(
      b.ax + c.ux * s,
      bridgeDeckY(b, s),
      b.az + c.uz * s,
    );
    game.grounded = false;
    game.velocityY = 0;
    game.airVelocity = null;
    game.jumpBuffer = 0;
    game.coyote = 0;
    let caught = false;
    for (let i = 0; i < 120; i++) {
      advanceCharacter(game, { x: 0, z: 0 }, 1 / 60);
      if (recoverSkyBridgeFall(game)) {
        caught = true;
        break;
      }
    }
    assert.ok(caught);
    assert.equal(game.grounded, true);
    const restored = spanCoordinates(
      b,
      game.player.position.x,
      game.player.position.z,
    ).along;
    assert.ok(bank === "a" ? restored < 0 : restored > c.length);
    assert.ok(game.canMove(game.player.position.x, game.player.position.z, 0));
    assert.equal(game.progress.stage, 9);
    assert.deepEqual(game.progress.field, []);
  }
});

test("winch progress unfolds only its linked span and changes the actual moving camera surfaces", (t) => {
  const game = fixture(t, 0),
    b = game.skyBridges.find((b) => b.stage === 2 && b.section === 1),
    c = spanCoordinates(b, b.bx, b.bz);
  assert.equal(b.open, 0);
  game.world.updateMatrixWorld(true);
  for (const [i, half] of b.halves.entries()) {
    const bounds = new THREE.Box3().setFromObject(half);
    assert.ok(
      bounds.max.y > (i ? b.by : b.ay) + 15,
      "both halves fold above their banks",
    );
  }
  assert.equal(bridgeDeployed(game.progress, b), false);
  assert.equal(skyDeckAt(game, (b.ax + b.bx) / 2, (b.az + b.bz) / 2), null);
  const start = new THREE.Vector3(b.ax + c.ux * 0.1, b.ay, b.az + c.uz * 0.1);
  assert.equal(
    game.canMove(
      start.x,
      start.z,
      start.y - game.groundHeight(start.x, start.z),
    ),
    false,
  );
  game.progress.stage = 2;
  game.progress.field = [b.requires];
  game.player.position.copy(start);
  updateSkyBridges(game, 1);
  assert.ok(b.open > 0 && b.open < 0.995);
  assert.ok(b.halves[0].rotation.x < 0);
  assert.equal(
    game.skyBridges.find((q) => q.stage === 2 && q.section === 2).open,
    0,
  );
  updateSkyBridges(game, 10);
  game.world.updateMatrixWorld(true);
  assert.equal(b.open, 1);
  assert.ok(Math.abs(b.halves[0].rotation.x) < 1e-8);
  assert.equal(
    game.canMove(
      start.x,
      start.z,
      start.y - game.groundHeight(start.x, start.z),
    ),
    true,
  );
  const s = c.length * 0.2,
    x = b.ax + c.ux * s,
    z = b.az + c.uz * s,
    y = bridgeDeckY(b, s);
  assert.ok(
    game.cameraSurfaces.entry(
      new THREE.Vector3(x, y + 2, z),
      new THREE.Vector3(x, y - 2, z),
    ) < 1,
  );
  assert.ok(game.skyBridgeSources.length <= 36);
});

test("visible plank tops agree with support heights along both sagging bridge halves", (t) => {
  const game = fixture(t),
    ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  game.world.updateMatrixWorld(true);
  for (const b of game.skyBridges) {
    const c = spanCoordinates(b, b.bx, b.bz),
      n = Math.ceil(c.length / 0.8),
      step = c.length / n;
    for (const index of [4, 11, n - 12, n - 5]) {
      const s = (index + 0.5) * step,
        x = b.ax + c.ux * s,
        z = b.az + c.uz * s,
        floor = skyDeckAt(game, x, z);
      if (!floor) continue;
      ray.ray.origin.set(x, floor.height + 8, z);
      const hit = ray.intersectObjects(b.halves, true)[0];
      assert.ok(hit, `${b.id}: visible plank`);
      assert.ok(
        Math.abs(hit.point.y - floor.height) < 0.003,
        `${b.id}: physics and rendered sag agree`,
      );
    }
  }
});

test("sky saves retain a supported bridge position, rescue airborne arrivals, and migrate old locations once", (t) => {
  const game = fixture(t),
    b = game.skyBridges[0],
    c = spanCoordinates(b, b.bx, b.bz),
    s = c.length * 0.4;
  const x = b.ax + c.ux * s,
    z = b.az + c.uz * s,
    y = bridgeDeckY(b, s);
  game.progress.position = { x, z, height: y - game.groundHeight(x, z) };
  const saved = normalizeSave({ version: 1, levels: { sky: game.progress } })
    .levels.sky;
  game.progress = saved;
  game.player.position.set(x, game.groundHeight(x, z), z);
  restoreTraversal(game);
  restoreSkyBridgeArrival(game);
  assert.ok(Math.abs(game.player.position.y - y) < 0.000001);
  assert.equal(game.player.position.x, x);
  assert.equal(game.player.position.z, z);
  assert.equal(saved.routeVersion, 1);
  game.progress.position.height += 1;
  game.player.position.set(x, game.groundHeight(x, z), z);
  restoreTraversal(game);
  restoreSkyBridgeArrival(game);
  assert.ok(
    spanCoordinates(b, game.player.position.x, game.player.position.z).along <
      0,
  );
  const old = {
    stage: 4,
    field: ["field-4-0"],
    found: ["note-0"],
    completed: false,
    time: 520,
    position: { x: 220, z: 50 },
    checkpoint: { x: 220, z: 40 },
    traversal: { id: "field-0-0", ledge: 2 },
  };
  assert.equal(migrateSkyRoute(old, game.map), true);
  assert.deepEqual(old.field, ["field-4-0"]);
  assert.deepEqual(old.found, ["note-0"]);
  assert.equal(old.time, 520);
  assert.equal(old.traversal, null);
  assert.equal(old.routeVersion, 1);
  const once = JSON.stringify(old);
  assert.equal(migrateSkyRoute(old, game.map), false);
  assert.equal(JSON.stringify(old), once);
  game.level = LEVELS[0];
  buildSkyBridges(game);
  assert.deepEqual(game.skyBridges, []);
  assert.deepEqual(game.skyBridgeSources, []);
  assert.equal(game.skyTether, null);
});
