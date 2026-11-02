import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { mechanismReachable } from "../src/mechanism-reach.js";

function fixture(level, stage = 1) {
  const map = createMap(level),
    terrain = createTerrainProfile(map, level),
    feature = map.features.find(
      (f) => f.type === "mechanism" && f.stage === stage,
    ),
    raised = stage > 0 && ["snow", "sky"].includes(level.biome),
    offset = raised ? 2.8 + (stage % 3) * 0.3 : 0;
  feature.group = new THREE.Group();
  feature.group.position.set(
    feature.x * 7,
    terrain.height(feature.x * 7, feature.z * 7) + offset,
    feature.z * 7,
  );
  feature.yOffset = offset;
  const opened = [],
    messages = [],
    game = Object.assign(Object.create(Adventure.prototype), {
      level,
      items: [feature],
      progress: {
        stage,
        found: [],
        field: [0, 1, 2].map((i) => `field-${stage}-${i}`),
      },
      player: new THREE.Group(),
      keys: new Set(),
      groundHeight: terrain.height,
      grounded: true,
      traversalCourses: [],
      counterweights: {
        saved: { solved: true },
        feature,
        tablet: new THREE.Vector3(-1000, -1000, -1000),
        blocks: [],
      },
      cb: {
        puzzle: (f) => opened.push(f),
        toast: (text) => messages.push(text),
      },
      setPaused(value) {
        this.paused = value;
      },
    });
  game.player.position.copy(feature.group.position);
  game.player.position.z += stage === 0 ? -5 : 4;
  return { game, feature, opened, messages };
}

test("all authored mechanisms select and open from their standing level, including raised platforms", () => {
  let mechanisms = 0,
    elevated = 0;
  for (const level of LEVELS) {
    for (let stage = 0; stage < level.mechanisms; stage++) {
      const { game, feature, opened } = fixture(level, stage);
      game.updateInteractionTarget();
      assert.equal(game.nearest, feature, `${level.id}/${stage}`);
      game.interact();
      assert.deepEqual(opened, [feature], `${level.id}/${stage}`);
      assert.equal(game.paused, true);
      mechanisms++;
      if (feature.yOffset) elevated++;
    }
  }
  assert.equal(mechanisms, 69);
  assert.equal(elevated, 15);
});

test("roofs above and terrain below raised mechanisms cannot select or activate them", () => {
  for (const level of LEVELS) {
    const { game, feature, opened } = fixture(level);
    const y = feature.group.position.y;
    for (const delta of [-8, -0.81, 0.81, 8]) {
      game.player.position.y = y + delta;
      game.updateInteractionTarget();
      assert.equal(game.nearest, null, `${level.id}, height ${delta}`);
      // A stale prompt is not permission to activate after a fall or a climb.
      game.nearest = feature;
      game.interact();
      assert.equal(game.nearest, null);
      assert.equal(game.paused, undefined);
      assert.deepEqual(opened, []);
    }
    if (feature.yOffset) {
      game.player.position.y = y - feature.yOffset;
      game.updateInteractionTarget();
      assert.equal(game.nearest, null);
    }
  }
});

test("activation rechecks horizontal reach and the solved counterweight console offset", () => {
  const { game, feature, opened } = fixture(LEVELS[2], 0),
    p = feature.group.position;
  assert(mechanismReachable(game, feature));
  for (const [dx, dz] of [
    [0, 0],
    [2.41, -5],
    [0, -7.41],
    [20, 20],
  ]) {
    game.player.position.set(p.x + dx, p.y, p.z + dz);
    game.updateInteractionTarget();
    assert.equal(game.nearest, null);
    game.nearest = feature;
    game.interact();
    assert.deepEqual(opened, []);
    assert.equal(game.nearest, null);
  }
  game.counterweights.saved.solved = false;
  game.player.position.set(p.x, p.y, p.z + 4.9);
  game.updateInteractionTarget();
  assert.equal(game.nearest, feature);
  game.counterweights.saved.solved = true;
  game.updateInteractionTarget();
  assert.equal(game.nearest, null);
});

test("small platform steps remain reachable and the next eligible object wins over a remote mechanism", () => {
  const { game, feature, opened, messages } = fixture(LEVELS[2]);
  for (const delta of [-0.49, 0.79]) {
    game.player.position.y = feature.group.position.y + delta;
    game.updateInteractionTarget();
    assert.equal(game.nearest, feature);
    game.interact();
  }
  assert.equal(opened.length, 2);
  // The older lower-ledge gate still gives climbing guidance near the step.
  game.player.position.y = feature.group.position.y - 0.79;
  game.updateInteractionTarget();
  assert.equal(game.nearest, feature);
  game.interact();
  assert.equal(opened.length, 2);
  assert.match(messages.at(-1), /Climb the gilded ledge/);
  const field = {
    id: "raised-field",
    type: "field",
    stage: game.progress.stage,
    x: feature.x,
    z: feature.z + 0.3,
    craneHeight: 8,
    group: {
      position: feature.group.position.clone().add(new THREE.Vector3(0, 8, 0)),
    },
  };
  game.items.push(field);
  game.player.position.y = feature.group.position.y + 8;
  game.updateInteractionTarget();
  assert.equal(game.nearest, field);
  game.player.position.copy(feature.group.position);
  game.progress.stage++;
  game.items.pop();
  game.updateInteractionTarget();
  assert.equal(game.nearest, null);
});
