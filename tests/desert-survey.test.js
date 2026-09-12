import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { supportAt } from "../src/character-motion.js";
import { finishFieldTask, buildFieldStation } from "../src/field-world.js";
import {
  buildDesertSurvey,
  updateDesertSurvey,
  surveyInteract,
  controlSurveyScope,
  frameSurveyScope,
  leaveSurveyScope,
  surveySightedMonument,
} from "../src/desert-survey.js";
import {
  SURVEY_LOOKOUTS,
  SURVEY_MONUMENTS,
  surveyBearing,
  surveyRayCrossing,
  surveyDoorMatches,
  normalizeDesertSurvey,
  surveyDeckAt,
  surveyBlocked,
  surveyCeiling,
  surveyOccludes,
  surveyVisible,
  surveySavePosition,
  restoreSurveyArrival,
} from "../src/desert-survey-rules.js";
const map = createMap(LEVELS[1]),
  terrain = createTerrainProfile(map, LEVELS[1]);
function fixture(progress = { stage: 0 }) {
  const store = new SaveStore({
      getItem: () =>
        JSON.stringify({ version: 1, levels: { sands: progress } }),
      setItem() {},
    }),
    world = new THREE.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level: LEVELS[1],
    map: structuredClone(map),
    terrainProfile: terrain,
    store,
    progress: store.level("sands"),
    world,
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    cameraSurfaces: new CameraSurfaces(world),
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    groundHeight: terrain.height,
    walkable: () => true,
    obstacles: [],
    waterMeshes: [],
    traversalCourses: [],
    keys: new Set(),
    grounded: true,
    jumpY: 0,
    velocityY: 0,
    health: 100,
    elapsed: 0,
    explored: new Set(),
    audio: { tone() {} },
    cb: { toast() {} },
    save() {
      this.saves = (this.saves || 0) + 1;
    },
    damage(n) {
      this.health -= n;
    },
  });
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
    createElementNS: () => ({
      addEventListener() {},
      removeEventListener() {},
      set src(value) {},
    }),
  };
  try {
    g.items = g.map.features.filter((f) => f.surveyHeight !== undefined);
    for (const f of g.items) {
      f.group = new THREE.Group();
      f.group.position.set(f.x * 7, 0, f.z * 7);
      g.world.add(f.group);
      buildFieldStation(g, f, f.group);
    }
    buildDesertSurvey(g);
  } finally {
    globalThis.document = old;
  }
  g.cameraSurfaces.rebuild();
  place(g, 0);
  g.camera = new THREE.PerspectiveCamera();
  g.yaw = 0;
  g.pitch = 0.25;
  g.touchMove = { x: 0, z: 0 };
  return g;
}

function place(g, i) {
  const p = SURVEY_LOOKOUTS[i];
  g.player.position.set(p.x, g.terrainProfile.surveyBases[i] + 4, p.z + 1.2);
  g.jumpY = 4;
  g.grounded = true;
}
function aim(g, i, target = i) {
  const p = g.desertSurvey.controls[i].group.position.clone();
  p.y += 1.57;
  const a = surveyBearing(p, g.desertSurvey.monuments[target]);
  g.yaw = a.yaw;
  g.pitch = a.pitch;
  frameSurveyScope(g);
}
test("desert bearings intersect at the search court and only ordered seals match", () => {
  const a = surveyBearing(
    { ...SURVEY_LOOKOUTS[0], y: 0 },
    { ...SURVEY_MONUMENTS[0], y: 0 },
  );
  const b = surveyBearing(
    { ...SURVEY_LOOKOUTS[1], y: 0 },
    { ...SURVEY_MONUMENTS[1], y: 0 },
  );
  const cross = surveyRayCrossing(a.yaw, b.yaw);
  assert(Math.abs(cross.x - 300) < 1e-8);
  assert(Math.abs(cross.z - 280) < 1e-8);
  assert.deepEqual([0, 1, 2, 3].map(surveyDoorMatches), [
    false,
    false,
    true,
    false,
  ]);
  assert.equal(surveyRayCrossing(0, 0), null);
});
test("saved angles are finite and recorded flags derive from earned field progress", () => {
  const n = normalizeDesertSurvey(
    {
      angles: [
        [Infinity, 0],
        [42, 99],
      ],
      recorded: [true, true],
    },
    { stage: 0, field: [] },
  );
  assert.equal(n.angles[0], null);
  assert.equal(n.angles[1][1], 0.65);
  assert.deepEqual(n.recorded, [false, false]);
  assert.deepEqual(normalizeDesertSurvey(null, { stage: 1 }).recorded, [
    true,
    true,
  ]);
  const store = new SaveStore({ getItem: () => null, setItem() {} });
  assert.equal(store.level("verdant").desertSurvey, null);
  assert.deepEqual(store.level("sands").desertSurvey.recorded, [false, false]);
});
test("lookout platforms support the player and reject walking through their base", () => {
  const g = fixture(),
    p = g.player.position;
  assert.equal(supportAt(g, p.x, p.z, p.y).height, p.y);
  assert(surveyBlocked(g, 385, 252, terrain.surveyBases[0]));
  assert(!surveyBlocked(g, p.x, p.z, p.y));
  const roof = g.desertSurvey.solids.find(
    (s) => s.x === 311 && s.z === 276.4 && s.bottom > 1,
  );
  assert(roof);
  assert.equal(
    surveyCeiling(g, 311, 276, roof.bottom - 2, roof.bottom),
    roof.bottom - 1.8,
  );
  assert.equal(
    surveyOccludes(g, { x: 400, y: 40, z: 230 }, { x: 410, y: 40, z: 240 }),
    false,
  );
});
test("instrument requires matching visible monument and cannot finish by generic Use", () => {
  const g = fixture();
  assert.equal(finishFieldTask(g, g.items[0]), false);
  assert(g.desertSurvey.focus);
  assert.deepEqual(g.progress.field, []);
  aim(g, 0, 2);
  surveyInteract(g);
  assert.deepEqual(g.progress.field, []);
  aim(g, 0);
  assert.equal(surveySightedMonument(g), 0);
  surveyInteract(g);
  assert.deepEqual(g.progress.field, ["field-0-0"]);
  assert.equal(g.desertSurvey.focus, null);
  assert(g.avatar.visible);
  place(g, 1);
  surveyInteract(g);
  aim(g, 1);
  assert.equal(surveySightedMonument(g), 1);
  surveyInteract(g);
  assert.deepEqual(g.progress.field, ["field-0-0", "field-0-1"]);
  const y = g.desertSurvey.doors[0].y;
  g.player.position.set(289, y, 281.8);
  surveyInteract(g);
  assert.equal(g.progress.field.length, 2);
  assert.equal(finishFieldTask(g, g.items[2]), false);
  g.player.position.x = 311;
  surveyInteract(g);
  assert.equal(g.progress.field.length, 3);
  for (let i = 0; i < 30; i++) updateDesertSurvey(g, 0.1);
  assert.equal(g.desertSurvey.doors[2].open, 1);
  assert(!surveyBlocked(g, 311, 280, y));
});
test("scope motion, cancellation and pause preserve earned progress and standing position", () => {
  const g = fixture(),
    p = g.player.position.clone();
  surveyInteract(g);
  const yaw = g.yaw;
  controlSurveyScope(g, 1, 1, -1);
  assert(g.yaw < yaw);
  assert(g.player.position.equals(p));
  assert(!g.avatar.visible);
  g.keys.add("Space");
  controlSurveyScope(g, 0.02, 0, 0);
  assert.equal(g.desertSurvey.focus, null);
  assert(g.avatar.visible);
  assert(!g.keys.has("Space"));
  assert.equal(g.progress.field.length, 0);
  surveyInteract(g);
  leaveSurveyScope(g);
  assert(g.avatar.visible);
  assert(g.desertSurvey.saved.angles[0].every(Number.isFinite));
});
test("optical visibility crosses inaccessible terrain but rejects actual occlusion", () => {
  const g = fixture();
  g.walkable = () => false;
  const a = new THREE.Vector3(385, terrain.surveyBases[0] + 5.57, 252),
    b = g.desertSurvey.monuments[0];
  assert(surveyVisible(g, a, b));
  const x = (a.x + b.x) / 2,
    z = (a.z + b.z) / 2;
  g.desertSurvey.solids.push({ x, z, w: 3, d: 3, bottom: -20, top: 40 });
  assert(!surveyVisible(g, a, b));
});
test("the shared save writer stores supported world height and restores unsafe arrivals", () => {
  const g = fixture();
  g.grounded = false;
  g.player.position.y += 2;
  const safe = surveySavePosition(g);
  assert.equal(safe.y, terrain.surveyBases[0] + 4);
  Adventure.prototype.save.call(g);
  assert(Math.abs(g.progress.position.height - 4) < 0.001);
  g.player.position.set(385, terrain.height(385, 252), 252);
  restoreSurveyArrival(g);
  assert(g.grounded);
  assert(
    !surveyBlocked(
      g,
      ...[g.player.position.x, g.player.position.z, g.player.position.y],
    ),
  );
  assert(Math.abs(g.jumpY - 4) < 0.001);
  const p = g.player.position.clone();
  restoreSurveyArrival(g);
  assert(g.player.position.equals(p));
});

test("scope camera updates do not erase the next frame's instrument movement sound", () => {
  const g = fixture();
  surveyInteract(g);
  frameSurveyScope(g);
  updateDesertSurvey(g, 0.02);
  controlSurveyScope(g, 0.02, 1, 0);
  frameSurveyScope(g);
  updateDesertSurvey(g, 0.02);
  assert(g.desertSurvey.sources[0].activity > 0);
  g.paused = true;
  updateDesertSurvey(g, 0.02);
  assert.equal(g.desertSurvey.sources[0].activity, 0);
});
