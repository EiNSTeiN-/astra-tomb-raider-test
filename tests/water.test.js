import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { waterSites, basinDepression, waterAt } from "../src/hydrology.js";
import {
  createWaterSurface,
  buildWaterSurfaces,
  updateWaterSurfaces,
} from "../src/water-surface.js";
import {
  buildSoundLandmarks,
  updateSoundSources,
} from "../src/sound-landmarks.js";
import { updateWaterfalls } from "../src/waterfall-effects.js";
import { advanceSwimming, restoreWaterArrival } from "../src/water-motion.js";
import { Adventure } from "../src/game.js";
import {
  reflectionCandidate,
  WaterReflection,
} from "../src/water-reflection.js";

test("liquid basins have finite reproducible depth, shallow banks, and protected station foundations", () => {
  let basins = 0;
  for (const level of LEVELS) {
    const map = createMap(level),
      profile = createTerrainProfile(map, level);
    for (const site of profile.waters) {
      assert.ok(Number.isFinite(site.baseY));
      assert.equal(basinDepression(site, site.x + site.width / 2, site.z), 0);
      assert.equal(basinDepression(site, site.x, site.z), site.depth);
      if (site.kind === "water") basins++;
    }
    for (const f of map.features.filter((f) => f.type === "field")) {
      const x = f.x * 7,
        z = f.z * 7,
        y = profile.height(x, z);
      for (const dx of [-6, 0, 6])
        for (const dz of [-2, 0, 2])
          assert.ok(
            Math.abs(
              profile.height(x + dx, z + dz) -
                profile.foundationHeight(x + dx, z + dz),
            ) < 0.00001,
            `${level.id}/${f.id}: station foundation changed`,
          );
    }
    assert.deepEqual(
      waterSites(map, level).map((s) => s.id),
      profile.waters.map((s) => s.id),
    );
  }
  assert.ok(basins > 25);
});
function liquidGame() {
  const g = Object.assign(Object.create(Adventure.prototype), {
    level: LEVELS[3],
    world: new THREE.Group(),
    waterMeshes: [],
    groundHeight: (x, z) =>
      -2.6 * (1 - Math.min(1, Math.max(0, Math.abs(x) - 4) / 3)),
    walkable: () => true,
    obstacles: [],
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    progress: { stage: 0, field: [] },
    audio: { noiseHit() {} },
    cb: { toast() {} },
    elapsed: 0,
    stamina: 100,
    yaw: 0,
    velocityY: 0,
    jumpY: 0,
    grounded: true,
    keys: new Set(),
    store: { data: { settings: { quality: "high" } } },
    tryClimb: () => false,
  });
  createWaterSurface(g, {
    id: "pool",
    kind: "water",
    x: 0,
    z: 0,
    width: 14,
    length: 14,
    baseY: 0,
    stage: 0,
  });
  return g;
}
test("swimming crosses deep water, respects solid cover, and exits onto the shallow bank", () => {
  const g = liquidGame();
  g.player.position.set(0, -2.6, 0);
  restoreWaterArrival(g);
  assert.equal(g.swimming, true);
  assert.equal(g.player.position.y, -0.38);
  g.obstacles = [{ x: 1, z: 0, w: 0.3, d: 4, h: 5 }];
  g.motionLanding = { drop: 4 };
  for (let i = 0; i < 60; i++) {
    g.elapsed += 1 / 60;
    advanceSwimming(g, { x: 1, z: 0 }, 1 / 60, false);
  }
  assert.ok(g.player.position.x < 0.7, "solid pier stops swimming");
  assert.equal(
    g.motionLanding,
    null,
    "a previous landing cannot repeat its sound while swimming",
  );
  g.obstacles = [];
  for (let i = 0; i < 200 && g.swimming; i++) {
    g.elapsed += 1 / 60;
    advanceSwimming(g, { x: 1, z: 0 }, 1 / 60, false);
  }
  assert.equal(g.swimming, false);
  assert.ok(g.player.position.x > 5);
  assert.ok(g.player.position.y >= g.groundHeight(g.player.position.x, 0));
});
test("draining a restored reservoir exposes shallow ground and a saved swimmer resumes at the new surface", () => {
  const g = liquidGame(),
    water = g.waterMeshes[0];
  assert.equal(waterAt(g, 0, 0).depth, 2.6);
  g.progress.field = ["field-0-0", "field-0-1", "field-0-2"];
  for (let i = 0; i < 600; i++) updateWaterSurfaces(g, 1 / 60);
  assert.ok(water.userData.drain > 1.76 && water.userData.drain <= 1.8);
  assert.ok(waterAt(g, 0, 0).depth < 0.85);
  g.player.position.set(0, -2.6, 0);
  restoreWaterArrival(g);
  assert.equal(g.swimming, false);
  g.progress.field = [];
  for (let i = 0; i < 600; i++) updateWaterSurfaces(g, 1 / 60);
  restoreWaterArrival(g);
  assert.equal(g.swimming, true);
  assert.ok(Math.abs(g.player.position.y - (water.position.y - 0.38)) < 1e-6);
});
test("reflection selection ignores hidden, frozen, underwater-facing and distant surfaces and disables below High", () => {
  const g = liquidGame();
  g.player.position.set(0, 0, 3);
  g.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  g.camera.position.set(0, 3, 5);
  g.camera.lookAt(0, 0, 0);
  g.camera.updateMatrixWorld();
  g.world.updateMatrixWorld(true);
  assert.equal(reflectionCandidate(g), g.waterMeshes[0]);
  g.waterMeshes[0].visible = false;
  assert.equal(reflectionCandidate(g), null);
  g.waterMeshes[0].visible = true;
  g.waterMeshes[0].userData.kind = "ice";
  assert.equal(reflectionCandidate(g), null);
  g.waterMeshes[0].userData.kind = "water";
  g.camera.position.y = -1;
  g.camera.updateMatrixWorld();
  assert.equal(reflectionCandidate(g), null);
  g.camera.position.y = 3;
  g.camera.updateMatrixWorld();
  g.player.position.x = 100;
  assert.equal(reflectionCandidate(g), null);
  g.player.position.x = 0;
  g.store.data.settings.quality = "medium";
  assert.equal(reflectionCandidate(g), null);
});

test("an immersed camera does not capture a lower surface, and reflections return outside the higher pool", () => {
  const g = liquidGame(),
    lower = g.waterMeshes[0],
    upper = createWaterSurface(g, {
      id: "upper",
      kind: "water",
      x: 0,
      z: 0,
      width: 6,
      length: 6,
      baseY: 1.5,
    });
  g.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  g.camera.position.set(0, 0.5, 2);
  g.camera.lookAt(0, 0, 0);
  g.world.updateMatrixWorld(true);
  const reflection = new WaterReflection(g);
  reflection.reflector.onBeforeRender = () => {};
  reflection.render();
  assert.equal(reflection.selected, null);
  assert.equal(reflection.captures, 0);
  assert.equal(lower.material.userData.waterUniforms.mirrorWeight.value, 0);
  g.camera.position.x = 4;
  g.camera.lookAt(0, 0, 0);
  reflection.render();
  assert.equal(reflection.selected, lower);
  assert.equal(reflection.captures, 1);
  g.player.position.y = 1.2;
  g.camera.position.set(0, 3, 2);
  g.camera.lookAt(0, 1.5, 0);
  reflection.render();
  assert.equal(reflection.selected, upper);
  assert.equal(reflection.captures, 2);
  reflection.dispose();
});

test("the ocean remains above a lower basin and agrees with the sampled water level", () => {
  const g = liquidGame(),
    basin = {
      id: "lower",
      kind: "water",
      x: 0,
      z: 0,
      width: 6,
      length: 6,
      baseY: -1,
    };
  g.waterMeshes = [];
  g.world.clear();
  g.terrainProfile = { waters: [basin] };
  createWaterSurface(g, basin);
  const sea = createWaterSurface(g, {
    id: "sea",
    kind: "water",
    sea: true,
    x: 0,
    z: 0,
    width: 30,
    length: 30,
    baseY: 0,
  });
  g.world.updateMatrixWorld(true);
  const sample = waterAt(g, 0, 0),
    ray = new THREE.Raycaster(
      new THREE.Vector3(0, 2, 0),
      new THREE.Vector3(0, -1, 0),
    );
  assert.equal(sample.water, sea);
  assert.equal(ray.intersectObject(sea)[0].point.y, sample.y);
});
test("one reflection capture is budgeted every three active frames and restores hidden water even after a render error", () => {
  const g = liquidGame();
  g.player.position.set(0, 0, 3);
  g.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  g.camera.position.set(0, 3, 5);
  g.camera.lookAt(0, 0, 0);
  g.camera.updateMatrixWorld();
  g.world.updateMatrixWorld(true);
  const mirror = new WaterReflection(g);
  let captures = 0;
  mirror.reflector.onBeforeRender = () => {
    captures++;
    assert.equal(g.waterMeshes[0].visible, false);
  };
  for (let i = 0; i < 9; i++) mirror.render();
  assert.equal(captures, 4);
  assert.equal(g.waterMeshes[0].visible, true);
  mirror.reflector.onBeforeRender = () => {
    throw Error("render failed");
  };
  g.paused = true;
  assert.throws(() => mirror.render(), /render failed/);
  assert.equal(g.waterMeshes[0].visible, true);
  assert.equal(g.avatar.visible, true);
  mirror.dispose();
});

test("water reflections refresh after camera recovery, turning, resizing and drainage while retaining the idle budget", () => {
  const g = liquidGame();
  g.player.position.set(0, 0, 3);
  g.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  g.camera.position.set(0, 3, 5);
  g.camera.lookAt(0, 0, 0);
  g.camera.updateMatrixWorld();
  g.world.updateMatrixWorld(true);
  const mirror = new WaterReflection(g),
    water = g.waterMeshes[0];
  mirror.reflector.onBeforeRender = () => {};
  mirror.render();
  function next(changed) {
    const before = mirror.captures;
    mirror.frame = 3; // A frame that the normal cadence would skip.
    mirror.render();
    assert.equal(mirror.captures, before + Number(changed));
    assert.equal(water.visible, true);
  }
  next(false);
  g.camera.position.x += 0.1;
  next(false);
  g.camera.position.x += 0.2;
  next(true);
  next(false);
  g.camera.rotateY(THREE.MathUtils.degToRad(1));
  next(false);
  g.camera.rotateY(THREE.MathUtils.degToRad(2));
  next(true);
  g.camera.aspect = 0.6;
  g.camera.updateProjectionMatrix();
  next(true);
  water.position.y -= 0.02;
  next(true);
  g.store.data.settings.quality = "medium";
  next(false);
  assert.equal(water.material.userData.waterUniforms.mirrorWeight.value, 0);
  g.store.data.settings.quality = "high";
  next(true);
  assert.equal(water.material.userData.waterUniforms.mirrorWeight.value, 1);

  // A failed capture must not mark the new viewpoint as reusable.
  const before = mirror.capturePosition.clone();
  g.camera.position.x += 1;
  g.camera.updateMatrixWorld();
  mirror.reflector.onBeforeRender = () => {
    throw Error("capture interrupted");
  };
  mirror.frame = 3;
  assert.throws(() => mirror.render(), /capture interrupted/);
  assert.deepEqual(mirror.capturePosition, before);
  mirror.reflector.onBeforeRender = () => {};
  next(true);
  next(false);
  mirror.dispose();
});

test("a waterfall shares its enclosing reservoir and follows the restored drain level visually and acoustically", () => {
  const g = liquidGame();
  g.waterMeshes = [];
  g.world.clear();
  g.map = { size: 61, rooms: [] };
  const pool = {
    id: "pool",
    kind: "water",
    x: 0,
    z: 0,
    width: 15,
    length: 15,
    baseY: 0,
    stage: 0,
  };
  const basin = {
    id: "basin",
    kind: "water",
    x: 0,
    z: 0,
    width: 5,
    length: 6.2,
    baseY: 0,
    fall: 0,
  };
  g.terrainProfile = { waters: [pool, basin] };
  buildWaterSurfaces(g);
  assert.equal(g.waterMeshes.filter((w) => !w.userData.sea).length, 1);
  const water = g.waterMeshes[0];
  assert.equal(water.userData.waterfallSite, basin);
  g.progress.field = ["field-0-0", "field-0-1", "field-0-2"];
  updateWaterSurfaces(g, 100);
  assert.equal(
    water.position.y,
    -1.8,
    "completed work restores immediately on load",
  );
  g.flames = [];
  g.items = [];
  g.stoneMat = new THREE.MeshStandardMaterial();
  buildSoundLandmarks(g);
  updateWaterfalls(g);
  updateSoundSources(g);
  const fall = g.waterfallEffects[0];
  const source = g.soundSources.find((s) => s.waterfallId === 0);
  assert.ok(Math.abs(source.y - (water.position.y + 1.85)) < 1e-6);
  for (const curtain of fall.curtains) {
    const halfHeight =
      (curtain.geometry.parameters.height * curtain.scale.y) / 2;
    assert.ok(
      Math.abs(curtain.position.y - halfHeight - water.position.y) < 1e-6,
    );
    assert.ok(Math.abs(curtain.position.y + halfHeight - fall.top) < 1e-6);
  }
  for (const spray of fall.sprays)
    assert.equal(spray.position.y, water.position.y);
});
