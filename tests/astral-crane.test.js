import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { advanceCharacter, supportAt } from "../src/character-motion.js";
import { finishFieldTask } from "../src/field-world.js";
import { carryingComponent } from "../src/expeditions.js";
import { canAim } from "../src/aiming.js";
import { canCrouch } from "../src/stealth.js";
import { torchHandsBusy } from "../src/torch.js";
import {
  normalizeAstralCrane,
  stepAstralCrane,
  craneClearance,
  cranePayload,
  craneBlocked,
  craneOccludes,
  craneFoundationWeight,
} from "../src/astral-crane-rules.js";
import {
  buildAstralCrane,
  controlAstralCrane,
  craneInteract,
  updateAstralCrane,
  craneObjective,
} from "../src/astral-crane.js";
const level = LEVELS.find((l) => l.id === "eclipse");
const surveyed = { stage: 6, field: ["field-6-0", "field-6-1"] };
const seated = { angle: Math.PI / 2, height: 4.2, seated: true };
function ticks(s, n, swing = 0, lift = 0) {
  for (let i = 0; i < n; i++) stepAstralCrane(s, 1 / 60, swing, lift);
}
test("the braked crane requires both clearances and a lowered spindle at the socket", () => {
  const s = normalizeAstralCrane(null, surveyed);
  ticks(s, 300, 1);
  assert(s.angle < 0.44);
  assert.match(craneClearance(0.55, s.height), /fork/);
  ticks(s, 160, 0, 1);
  assert(s.height > 5.3 && s.height < 5.5);
  ticks(s, 80, 1);
  assert(s.angle > 0.64 && s.angle < 0.66);
  ticks(s, 300, 0, 1);
  assert(s.height <= 6); // cannot lift through the inspection lintel
  ticks(s, 100, 1);
  assert(s.angle < 0.9 && s.angle > 0.89);
  ticks(s, 100, 0, 1);
  assert(s.height > 8.8);
  ticks(s, 400, 1);
  assert.equal(s.angle, Math.PI / 2);
  assert(!s.seated);
  ticks(s, 300, 0, -1);
  assert.deepEqual(s, seated);
  ticks(s, 500, -1, 1);
  assert.deepEqual(s, seated);
});
test("large frames, bad inputs and simultaneous drives cannot tunnel through the fork", () => {
  const s = { angle: 0.43, height: 0.6, seated: false };
  stepAstralCrane(s, 50, 1, 0);
  assert(s.angle < 0.44);
  const before = { ...s };
  stepAstralCrane(s, NaN, 1, 1);
  stepAstralCrane(s, -1, 1, 1);
  stepAstralCrane(s, 1, NaN, Infinity);
  assert.deepEqual(s, before);
  for (let i = 0; i < 1000; i++) {
    stepAstralCrane(s, 0.75, Math.sin(i), Math.cos(i));
    assert.equal(craneClearance(s.angle, s.height), null);
  }
  const braked = { ...s };
  ticks(s, 60);
  assert.deepEqual(s, braked);
});
test("continuous save state survives reload while corrupt and old completed missions recover safely", () => {
  const v = { angle: 0.78, height: 7.2, seated: false };
  assert.deepEqual(normalizeAstralCrane(v, surveyed), v);
  assert.deepEqual(
    normalizeAstralCrane({ angle: 0.55, height: 9, seated: true }, surveyed),
    { angle: 0, height: 0.6, seated: false },
  );
  assert.deepEqual(normalizeAstralCrane(seated, { stage: 6, field: [] }), {
    angle: 0,
    height: 0.6,
    seated: false,
  });
  assert.deepEqual(normalizeAstralCrane(null, { stage: 7, field: [] }), seated);
  assert.deepEqual(
    normalizeAstralCrane(null, { stage: 6, field: ["field-6-2"] }),
    seated,
  );
  assert.deepEqual(
    normalizeSave({
      version: 1,
      levels: { eclipse: { ...surveyed, astralCrane: v } },
    }).levels.eclipse.astralCrane,
    v,
  );
  assert.equal(
    new SaveStore({ getItem: () => null, setItem() {} }).level("verdant")
      .astralCrane,
    null,
  );
});
function fixture() {
  const store = new SaveStore({
      getItem: () =>
        JSON.stringify({ version: 1, levels: { eclipse: { stage: 6 } } }),
      setItem() {},
    }),
    world = new THREE.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level,
    map: createMap(level),
    progress: store.level("eclipse"),
    store,
    world,
    terrainProfile: { craneY: 0 },
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    cameraSurfaces: new CameraSurfaces(world),
    stoneMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    glowMat: new THREE.MeshBasicMaterial(),
    groundHeight: () => 0,
    walkable: () => true,
    obstacles: [],
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
  });
  const doc = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  try {
    buildAstralCrane(g);
  } finally {
    globalThis.document = doc;
  }
  g.cameraSurfaces.rebuild();
  return g;
}
test("controls enforce mission order, reserve hands, freeze on pause and stop audio when released", () => {
  const g = fixture(),
    h = g.astralCrane,
    fields = g.map.features.filter((f) => f.type === "field" && f.stage === 6);
  g.player.position.copy(h.control);
  assert(craneInteract(g));
  assert(!h.operating);
  assert(finishFieldTask(g, fields[0]));
  assert.equal(carryingComponent(g.level, g.progress), false);
  assert(craneInteract(g));
  assert(!h.operating);
  assert(finishFieldTask(g, fields[1]));
  assert.equal(finishFieldTask(g, fields[2]), false);
  assert(craneObjective(g));
  assert(craneInteract(g));
  assert(h.operating);
  assert(!canAim(g));
  assert(!canCrouch(g));
  assert(torchHandsBusy(g));
  controlAstralCrane(g, 1, 0, 1);
  assert(h.saved.height > 2);
  assert.equal(h.sources[1].activity, 1);
  assert(h.cargo.visible);
  g.paused = true;
  updateAstralCrane(g, 0);
  const saved = { ...h.saved };
  controlAstralCrane(g, 1, 1, 1);
  assert.deepEqual(h.saved, saved);
  assert(h.sources.every((s) => s.activity === 0));
  g.paused = false;
  assert(craneInteract(g));
  assert(!h.operating);
  assert(h.sources.slice(0, 2).every((s) => s.activity === 0));
  Object.assign(h.saved, seated);
  assert.equal(craneObjective(g), null);
  assert(finishFieldTask(g, fields[2]));
  updateAstralCrane(g, 0);
  assert(!h.cargo.visible);
  assert(!h.operating);
});
test("the west stair joins its gallery, the upper joint needs a jump, and the mast blocks travel and sight", () => {
  const g = fixture();
  g.player.position.set(168, 0, 236);
  for (let i = 0; i < 480; i++) advanceCharacter(g, { x: 0, z: -2 }, 1 / 60);
  assert(g.player.position.z < 222);
  assert(Math.abs(g.player.position.y - 4.2) < 0.001);
  assert.equal(supportAt(g, 182, 211, 4.2).height, 0);
  g.player.position.set(179.5, 4.2, 211);
  g.grounded = true;
  g.velocityY = 0;
  for (let i = 0; i < 70; i++)
    advanceCharacter(g, { x: 5, z: 0 }, 1 / 60, i === 0);
  assert(g.player.position.x > 184);
  assert(g.grounded);
  assert.equal(g.player.position.y, 4.2);
  assert(craneBlocked(g, 182, 217, 0));
  assert(craneOccludes(g, { x: 178, y: 2, z: 217 }, { x: 186, y: 2, z: 217 }));
  g.progress.field.push("field-6-0");
  Object.assign(g.astralCrane.saved, { angle: 0.78, height: 7 });
  const p = cranePayload(g.astralCrane.saved);
  assert(craneBlocked(g, p.x, p.z, 7));
  assert(!craneBlocked(g, p.x, p.z, 3));
  assert.equal(supportAt(g, p.x, p.z, 9).height, 0);
});
test("the final yard preserves its nearby cache and witness and leaves the other chapters alone", () => {
  const map = createMap(level),
    terrain = createTerrainProfile(map, level);
  assert.deepEqual(
    map.features
      .filter((f) => f.type === "field" && f.stage === 6)
      .map((f) => [f.x * 7, f.z * 7, f.craneHeight]),
    [
      [182, 231, 0.6],
      [168, 214, 4.2],
      [196, 217, 4.2],
    ],
  );
  const cache = map.features.find((f) => f.id === "treasure-16"),
    witness = map.features.find((f) => f.id === "field-4-1");
  assert.deepEqual([cache.x * 7, cache.z * 7], [175, 231]);
  assert.deepEqual([witness.x * 7, witness.z * 7], [196, 189]);
  assert.equal(craneFoundationWeight(175, 231), 1);
  assert.equal(craneFoundationWeight(196, 189), 0);
  assert(Math.abs(terrain.height(168, 220) - terrain.craneY) < 0.001);
  for (const l of LEVELS.filter((l) => l !== level))
    assert.equal(createMap(l).astralCrane, undefined);
});
