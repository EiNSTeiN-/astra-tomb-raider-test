import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { advanceSwimming, restoreWaterArrival } from "../src/water-motion.js";
import {
  resetDiving,
  updateDiveView,
  divingHint,
  DIVE_AIR,
} from "../src/diving.js";
import { waterAt } from "../src/hydrology.js";
import { normalizeSave, defaults } from "../src/storage.js";
import { scoreBar } from "../src/audio.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildTideArchive, archiveInteract } from "../src/tide-archive.js";

function diver() {
  const water = new THREE.Mesh();
  Object.assign(water.userData, { kind: "water", width: 20, length: 20 });
  const game = {
    level: LEVELS[3],
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    keys: new Set(),
    groundHeight: () => -8,
    canMove: () => true,
    waterMeshes: [water],
    swimming: true,
    grounded: false,
    elapsed: 0,
    stamina: 100,
    yaw: 0,
    cb: { toast() {}, update() {} },
    damage() {},
    audio: { noiseHit() {}, tone() {} },
    tryClimb: () => false,
  };
  resetDiving(game);
  game.player.position.y = -0.38;
  return game;
}
function step(g, seconds, input = { x: 0, z: 0 }, rise = false) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    g.elapsed += 1 / 60;
    advanceSwimming(g, input, 1 / 60, rise);
  }
}

test("diving descends to a bounded floor, holds depth, and rises to a breathable surface", () => {
  const g = diver();
  g.keys.add("KeyX");
  g.carrying = true;
  step(g, 1);
  assert.equal(g.diving, false);
  assert.match(divingHint(g).label, /carried component/);
  g.carrying = false;
  step(g, 3);
  assert.equal(g.diving, true);
  assert.ok(Math.abs(g.player.position.y + 7.6) < 1e-6);
  assert.ok(g.diveAir < DIVE_AIR - 2.9);
  g.keys.clear();
  const y = g.player.position.y;
  step(g, 1);
  assert.equal(
    g.player.position.y,
    y,
    "neutral buoyancy lets players inspect a case",
  );
  step(g, 2.5, undefined, true);
  assert.equal(g.diving, false);
  assert.ok(Math.abs(g.player.position.y + 0.38) < 0.1);
  step(g, 2);
  assert.equal(g.diveAir, DIVE_AIR);
});

test("diagonal diving preserves speed and cannot cross solid walls or rise through overhead cover", () => {
  const g = diver();
  g.keys.add("KeyX");
  const start = g.player.position.clone();
  step(g, 1, { x: 1, z: 0 });
  assert.ok(Math.abs(start.distanceTo(g.player.position) - 3.1) < 1e-6);
  g.keys.clear();
  g.canMove = (x, z, height) => x < 2.5 && height < 6;
  step(g, 1, { x: 1, z: 0 });
  assert.ok(g.player.position.x < 2.5);
  step(g, 1, undefined, true);
  assert.ok(g.player.position.y < -2, "overhead cover is solid");
});

test("air exhaustion warns, overrides descent with recovery ascent, and cannot start another empty-lung dive", () => {
  const g = diver();
  const messages = [];
  let hits = 0;
  g.cb.toast = (message) => messages.push(message);
  g.damage = () => hits++;
  g.keys.add("KeyX");
  step(g, 3);
  step(g, 31);
  assert.equal(messages.filter((m) => m.includes("Air running low")).length, 1);
  assert.ok(hits > 0);
  assert.ok(
    g.player.position.y > -7,
    "exhaustion makes upward progress despite held descent",
  );
  step(g, 2);
  assert.equal(g.diving, false);
  g.diveAir = 0;
  g.keys.add("KeyX");
  step(g, 0.5);
  assert.equal(g.diving, false);
});

test("a saved diver recovers at the current surface and archive records normalize independently", () => {
  const g = diver();
  g.keys.add("KeyX");
  step(g, 2);
  g.waterMeshes[0].position.y = -1.8;
  restoreWaterArrival(g);
  assert.equal(g.diving, false);
  assert.equal(g.diveAir, DIVE_AIR);
  assert.equal(g.player.position.y, -2.18);
  const save = defaults();
  save.levels.tides = {
    stage: 3,
    archive: ["tide-3", "tide-0", "tide-3", "tide-5", null],
    field: ["field-2-0"],
  };
  save.levels.verdant = { archive: ["tide-0"] };
  const restored = normalizeSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(restored.levels.tides.archive, ["tide-3", "tide-0"]);
  assert.deepEqual(restored.levels.verdant.archive, []);
  assert.deepEqual(restored.levels.tides.field, ["field-2-0"]);
  assert.deepEqual(normalizeSave(restored).levels, restored.levels);
});

test("camera immersion restores exact surface atmosphere and dive music retains only quiet chapter harmony", () => {
  const g = diver();
  g.scene = new THREE.Scene();
  const background = new THREE.Color(0xabcdee);
  g.scene.background = background;
  g.scene.fog = new THREE.FogExp2(0x987654, 0.0022);
  g.daylightSky = new THREE.Group();
  g.camera = new THREE.PerspectiveCamera();
  g.camera.position.set(0, -3, 0);
  updateDiveView(g);
  assert.equal(g.daylightSky.visible, false);
  assert.ok(g.scene.fog.density > 0.06);
  g.camera.position.y = 1;
  updateDiveView(g);
  assert.equal(g.daylightSky.visible, true);
  assert.equal(g.scene.background, background);
  assert.equal(g.scene.fog.color.getHex(), 0x987654);
  assert.equal(g.scene.fog.density, 0.0022);
  for (let bar = 0; bar < 8; bar++) {
    const events = scoreBar("water", 3, bar, "explore", "dive");
    assert.ok(events.every((e) => ["pad", "bass"].includes(e.voice)));
  }
});

test("five distinct archive wells remain submerged after drainage and require close three-dimensional recovery", () => {
  const g = diver();
  g.map = createMap(g.level);
  const profile = createTerrainProfile(g.map, g.level);
  g.groundHeight = profile.height;
  g.waterMeshes = profile.waters
    .filter((w) => w.id.startsWith("reservoir"))
    .map((w) => {
      const mesh = new THREE.Mesh();
      mesh.position.set(w.x, w.baseY, w.z);
      Object.assign(mesh.userData, w);
      return mesh;
    });
  g.world = new THREE.Group();
  g.stoneMat = new THREE.MeshStandardMaterial();
  g.soundSources = [];
  g.progress = { archive: [] };
  let saves = 0;
  g.save = () => saves++;
  g.state = () => ({});
  buildTideArchive(g);
  assert.equal(g.tideArchive.length, 5);
  const depths = new Set();
  for (const site of g.tideArchive) {
    const { x, z } = site.position;
    depths.add(Math.round(waterAt(g, x, z).depth * 10));
    site.water.position.y -= 1.8;
    assert.ok(site.water.position.y - site.position.y > 2, site.record.id);
    g.player.position.set(x, site.water.position.y - 0.38, z);
    g.diving = true;
    assert.equal(archiveInteract(g), false, "cannot recover from the surface");
    g.player.position.copy(site.position).add(new THREE.Vector3(0, 0.5, 1));
    assert.equal(archiveInteract(g), true);
    assert.equal(archiveInteract(g), false, "no duplicate reward");
    assert.equal(site.source.activity, 0);
    assert.equal(site.buoy.visible, false);
    assert.equal(site.bubbles.visible, false);
  }
  assert.equal(depths.size, 5);
  assert.equal(saves, 5);
  assert.equal(g.progress.archive.length, 5);
});
