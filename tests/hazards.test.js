import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { LEVELS, createMap } from "../src/campaign.js";
import {
  HAZARD_TYPES,
  hazardPhase,
  hazardDisabled,
  hazardContact,
  buildHazards,
  updateHazards,
} from "../src/hazards.js";
import { normalizeSave } from "../src/storage.js";

test("eight chapter hazards have warning, active, and usable clear intervals", () => {
  assert.equal(new Set(Object.values(HAZARD_TYPES).map((t) => t.kind)).size, 8);
  for (const spec of Object.values(HAZARD_TYPES)) {
    assert.ok(spec.warning >= 1);
    assert.ok(spec.period - spec.warning - spec.active >= 2);
    assert.equal(hazardPhase(0, spec).phase, "warning");
    assert.equal(hazardPhase(spec.warning + 0.01, spec).phase, "active");
    assert.equal(
      hazardPhase(spec.warning + spec.active + 0.01, spec).phase,
      "rest",
    );
    for (let t = -5; t < 50; t += 0.03) {
      const state = hazardPhase(t, spec);
      assert.ok(state.progress >= 0 && state.progress <= 1);
    }
  }
});
test("each sector gets a trap tied to one reachable field station, and a restored station stays disarmed after reload", () => {
  let count = 0;
  for (const level of LEVELS) {
    const map = createMap(level),
      game = Object.assign(Object.create(Adventure.prototype), {
        level,
        world: new THREE.Group(),
        items: map.features,
        groundHeight: () => 0,
        darkMat: new THREE.MeshStandardMaterial(),
        goldMat: new THREE.MeshStandardMaterial(),
        glowMat: new THREE.MeshStandardMaterial(),
        flames: [],
      });
    buildHazards(game);
    assert.equal(game.hazards.length, level.mechanisms);
    for (const hazard of game.hazards) {
      const field = map.features.find((f) => f.id === hazard.fieldId);
      assert.equal(field.type, "field");
      assert.equal(field.stage, hazard.stage);
      assert.notEqual(field.kind, "climb");
      assert.equal(
        hazardDisabled(hazard, {
          stage: hazard.stage,
          field: [],
          completed: false,
        }),
        false,
      );
      const saved = normalizeSave({
        version: 1,
        levels: { [level.id]: { stage: hazard.stage, field: [field.id] } },
      });
      assert.equal(hazardDisabled(hazard, saved.levels[level.id]), true);
      count++;
    }
  }
  assert.equal(count, 69);
});
test("ice locks its impact point, beams can be jumped, and ground pulses have a safe airborne interval", () => {
  const ice = {
    spec: HAZARD_TYPES.snow,
    x: 0,
    y: 0,
    z: 0,
    phase: "active",
    progress: 0.9,
    aim: new THREE.Vector3(2, 0, 3),
  };
  assert.equal(hazardContact(ice, new THREE.Vector3(2, 0, 3)), true);
  assert.equal(hazardContact(ice, new THREE.Vector3(-2, 0, 3)), false);
  const beam = { ...ice, spec: HAZARD_TYPES.crystal, angle: 0 };
  assert.equal(hazardContact(beam, new THREE.Vector3(4, 0, 0)), true);
  assert.equal(hazardContact(beam, new THREE.Vector3(4, 1.3, 0), 1.3), false);
  const pulse = { ...ice, spec: HAZARD_TYPES.eclipse, progress: 0.5 };
  assert.equal(hazardContact(pulse, new THREE.Vector3(3.5, 0, 0)), true);
  assert.equal(
    hazardContact(pulse, new THREE.Vector3(3.5, 1.1, 0), 1.1),
    false,
  );
  pulse.phase = "warning";
  assert.equal(hazardContact(pulse, new THREE.Vector3(3.5, 0, 0)), false);
});

test("a desert dart trap launches three bolts from its fixed emitters without a character rig", () => {
  const level = LEVELS[1],
    map = createMap(level);
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    world: new THREE.Group(),
    items: map.features,
    groundHeight: () => 0,
    darkMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    glowMat: new THREE.MeshStandardMaterial(),
    flames: [],
    progress: { stage: 0, field: [] },
    player: new THREE.Group(),
    hazardTutorials: new Set(),
    cb: {},
    audio: {},
    damage() {},
    jumpY: 0,
  });
  buildHazards(game);
  const hazard = game.hazards[0];
  game.hazards = [hazard];
  game.player.position.set(hazard.x, hazard.y, hazard.z + 5);
  hazard.offset = 0;
  game.elapsed = 0;
  updateHazards(game, 0);
  game.elapsed = hazard.spec.warning + 0.01;
  updateHazards(game, 0.01);
  assert.equal(game.projectiles.length, 3);
  game.projectiles.forEach((bolt, i) => {
    assert.ok(
      bolt.mesh.position.distanceTo(
        new THREE.Vector3(
          hazard.x - 5,
          hazard.y + 1.2,
          hazard.z + [-1.3, 0, 1.3][i],
        ),
      ) < 1e-6,
    );
    assert.ok(bolt.direction.toArray().every(Number.isFinite));
  });
});
test("a disabled vent removes its damaging effect and a crosswind respects collision", () => {
  const game = {
    progress: { stage: 0, field: ["field-0-1"] },
    player: { position: new THREE.Vector3() },
    elapsed: 2,
    stamina: 100,
    jumpY: 0,
    hazardTutorials: new Set(),
    cb: {},
    audio: {},
    canMove: () => false,
    groundHeight: () => 0,
    damage() {
      throw Error("Disabled hazard inflicted damage");
    },
  };
  const h = {
    spec: HAZARD_TYPES.volcano,
    stage: 0,
    fieldId: "field-0-1",
    x: 0,
    y: 0,
    z: 0,
    root: new THREE.Group(),
    fx: new THREE.Group(),
    fire: new THREE.Object3D(),
    marker: new THREE.Object3D(),
    phase: "active",
  };
  game.hazards = [h];
  updateHazards(game, 0.1);
  assert.equal(h.fire.visible, false);
  assert.equal(h.disabled, true);
  Object.assign(h, {
    spec: HAZARD_TYPES.sky,
    phase: "active",
    progress: 0.3,
    offset: 0,
    marker: new THREE.Mesh(
      new THREE.RingGeometry(),
      new THREE.MeshBasicMaterial(),
    ),
  });
  game.progress.field = [];
  updateHazards(game, 0.1);
  assert.equal(game.player.position.x, 0);
  assert.ok(game.stamina < 100);
});
