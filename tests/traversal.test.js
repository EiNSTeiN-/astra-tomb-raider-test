import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";

test("a two-tier field tower mantles upward from the lower ledge rather than selecting the same ledge twice", () => {
  const game = Object.assign(Object.create(Adventure.prototype), {
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    audio: { tone() {} },
    obstacles: [
      { x: -3.8, z: 0, w: 2.2, d: 2.2, h: 2.8, climbable: true },
      { x: 0, z: 0, w: 2.2, d: 2.2, h: 5.6, climbable: true },
    ],
    groundHeight: () => 0,
    jumpY: 0,
    yaw: -Math.PI / 2,
  });
  game.player.position.set(-6.2, 0, 0);
  assert.equal(game.tryClimb(0, -1), true);
  game.updateClimb(1);
  assert.equal(game.jumpY, 2.8);
  assert.equal(game.tryClimb(0, -1), true);
  game.updateClimb(1);
  assert.equal(game.jumpY, 5.6);
  assert.equal(game.player.position.y, 5.6);
  assert.equal(game.tryClimb(0, -1), false);
});

import { advanceCharacter } from "../src/character-motion.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { coursePlan, hasTraversalCourse } from "../src/traversal-courses.js";
import {
  trackTraversalSupport,
  restoreTraversal,
  captureTraversal,
  traversalInteract,
  updateTraversal,
  predictedRopeLanding,
} from "../src/traversal.js";
import { normalizeSave } from "../src/storage.js";

function motionGame(ground = () => 0, obstacles = []) {
  return Object.assign(Object.create(Adventure.prototype), {
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    limbs: Array.from({ length: 4 }, () => new THREE.Group()),
    audio: { tone() {}, footstep() {}, noiseHit() {} },
    cb: { toast() {} },
    keys: new Set(),
    touchMove: { x: 0, z: 0 },
    groundHeight: ground,
    obstacles,
    walkable: () => true,
    grounded: true,
    velocityY: 0,
    jumpY: 0,
    elapsed: 0,
    yaw: 0,
    stamina: 100,
    progress: { stage: 0, field: [], found: [] },
    level: LEVELS[0],
    traversalCourses: [],
    items: [],
    survey() {},
    save() {},
  });
}
const tick = (g, v, seconds, jump = false) => {
  for (let i = 0; i < Math.ceil(seconds * 60); i++)
    advanceCharacter(g, v, 1 / 60, jump && i === 0);
};
test("movement reports collision-resolved travel while retaining the requested velocity", () => {
  const game = motionGame(() => 0, [{ x: 2, z: 0, w: 0.5, d: 10, h: 4 }]);
  frame(game, { x: 1, z: 0 }, 0.1);
  assert.ok(Math.abs(game.actualMoveSpeed - 6) < 1e-8);
  frame(game, { x: 1, z: 0 }, 1);
  assert.equal(game.moveVelocity.x, 6);
  assert.equal(game.actualMoveSpeed, 0);
  const stopped = game.player.position.clone();
  frame(game, { x: 1, z: 0 }, 0.5, ["ShiftLeft"]);
  assert.equal(game.moveVelocity.x, 10);
  assert.equal(game.actualMoveSpeed, 0);
  assert.ok(game.player.position.equals(stopped));
  frame(game, { x: 0, z: 1 }, 0.1);
  assert.ok(Math.abs(game.actualMoveSpeed - 6) < 1e-8);
  assert.ok(game.player.position.z > stopped.z);
  frame(game, { x: 0, z: 0 }, 0.1);
  assert.equal(game.actualMoveSpeed, 0);
});
test("walking off a platform loses support, falls to ground, and cannot jump after coyote time", () => {
  const g = motionGame(
    () => 0,
    [{ x: 0, z: 0, w: 2, d: 2, h: 5.6, climbable: true }],
  );
  g.player.position.set(1.9, 5.6, 0);
  g.jumpY = 5.6;
  tick(g, { x: 6, z: 0 }, 0.25);
  assert.equal(g.grounded, false);
  assert.ok(g.player.position.y < 5.6);
  advanceCharacter(g, { x: 0, z: 0 }, 1 / 60, true);
  assert.ok(g.velocityY < 0, "no second jump in midair");
  tick(g, { x: 0, z: 0 }, 2);
  assert.equal(g.grounded, true);
  assert.equal(g.player.position.y, 0);
});
test("jump arcs stay in world space over descending terrain and buffered input jumps on landing", () => {
  const g = motionGame((x) => Math.min(0, -x * 0.3)),
    flat = motionGame();
  tick(g, { x: 6, z: 0 }, 0.5, true);
  tick(flat, { x: 6, z: 0 }, 0.5, true);
  assert.ok(Math.abs(g.player.position.y - flat.player.position.y) < 1e-6);
  const b = motionGame();
  b.player.position.y = 0.15;
  b.grounded = false;
  b.velocityY = -2;
  advanceCharacter(b, { x: 0, z: 0 }, 1 / 60, true);
  tick(b, { x: 0, z: 0 }, 0.12);
  assert.ok(
    b.player.position.y > 0.3 && b.velocityY > 0,
    "buffered jump follows landing",
  );
});
function courseGame(level, feature) {
  const terrain = createTerrainProfile(createMap(level), level);
  const g = motionGame(terrain.height),
    c = coursePlan(level, feature),
    base = terrain.height(feature.x * 7, feature.z * 7);
  Object.assign(c, {
    base,
    stage: feature.stage,
    anchor: new THREE.Vector3(c.pivot.x, base + c.pivot.h, c.pivot.z),
    angle: 0,
    omega: 0,
    rope: new THREE.Object3D(),
    grip: new THREE.Object3D(),
    zip: new THREE.Object3D(),
    launch: new THREE.Vector3(c.launchPoint.x, base + 8.4, c.launchPoint.z),
    exit: new THREE.Vector3(
      c.exitPoint.x,
      terrain.height(c.exitPoint.x, c.exitPoint.z),
      c.exitPoint.z,
    ),
  });
  for (const l of c.ledges) {
    l.y = base + l.h;
    g.obstacles.push({
      x: l.x,
      z: l.z,
      w: l.w,
      d: l.d,
      h: l.y - terrain.height(l.x, l.z),
      climbable: true,
      courseId: c.id,
      ledge: l.index,
    });
  }
  g.traversalCourses = [c];
  g.level = level;
  g.progress.stage = feature.stage;
  g.player.position.set(
    c.entry.x,
    terrain.height(c.entry.x, c.entry.z),
    c.entry.z,
  );
  return { g, c };
}
const localInput = (c, x, z) => ({
  x: x * c.axis.x - z * c.axis.z,
  z: x * c.axis.z + z * c.axis.x,
});
function frame(g, input, seconds, keys = []) {
  g.keys = new Set(keys);
  g.touchMove = { x: input.x, z: input.z };
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    g.elapsed += 1 / 60;
    g.updatePlayer(1 / 60);
  }
}
function walkLocal(g, c, x, z, seconds, keys = []) {
  frame(g, localInput(c, x, z), seconds, keys);
}
function mantle(g, c, x, z) {
  const input = localInput(c, x, z);
  assert.equal(g.tryClimb(input.x, input.z), true);
  g.updateClimb(1);
  trackTraversalSupport(g);
}
test("all 22 routes across eight chapters can be climbed, jumped, rope-crossed, and exited through their unlocked cable", () => {
  let count = 0;
  for (const level of LEVELS)
    for (const f of createMap(level).features.filter(
      (f) => f.type === "field" && hasTraversalCourse(level, f),
    )) {
      const { g, c } = courseGame(level, f);
      const label = `${level.id}/${f.id}`;
      mantle(g, c, 0, -1);
      assert.equal(g.courseAnchor.ledge, 0, label);
      // Walk to the rear edge, mantle the second tier, then jump to the rope's takeoff ledge.
      walkLocal(g, c, 0, -1, 0.6);
      mantle(g, c, 0, -1);
      assert.equal(g.courseAnchor.ledge, 1, label);
      const beforeJump = c.transform(-10, -0.1);
      while (
        g.player.position.distanceTo(
          new THREE.Vector3(beforeJump.x, c.ledges[1].y, beforeJump.z),
        ) > 0.12
      ) {
        walkLocal(g, c, 0, -1, 1 / 60);
        if (g.elapsed > 3)
          assert.fail(`${label}: failed to reach takeoff edge`);
      }
      walkLocal(g, c, 0, -1, 0.82, ["Space"]);
      assert.equal(g.courseAnchor.ledge, 2, `${label}: jump gap`);
      // Move to the left edge of the rope span, catch on approach, pump toward the far ledge.
      walkLocal(g, c, 1, 0, 0.33);
      walkLocal(g, c, 1, 0, 0.65, ["Space", "KeyE"]);
      assert.ok(g.ropeRide, `${label}: rope catch`);
      let swing = 0;
      while (!predictedRopeLanding(g)?.safe && swing < 4) {
        walkLocal(g, c, 1, 0, 1 / 60);
        swing += 1 / 60;
      }
      assert.ok(predictedRopeLanding(g)?.safe, `${label}: swing amplitude`);
      walkLocal(g, c, 0, 0, 0.02, ["Space"]);
      assert.equal(g.ropeRide, null);
      // The release cue predicts a landing without requiring extra air steering.
      let landing = 0;
      while (!g.grounded && landing < 2) {
        walkLocal(g, c, 0, 0, 1 / 60);
        landing += 1 / 60;
      }
      assert.equal(
        g.courseAnchor?.ledge,
        3,
        `${label}: far landing at ${g.player.position.toArray()}`,
      );
      const corner = c.transform(3.0, (f.stage % 2 ? -6 : -5) + 2.05);
      const delta = new THREE.Vector3(
        corner.x - g.player.position.x,
        0,
        corner.z - g.player.position.z,
      );
      frame(g, delta.clone().normalize(), delta.length() / 6);
      mantle(g, c, -0.6, 0.8);
      assert.equal(g.courseAnchor.ledge, 4, `${label}: summit`);
      const last = c.ledges[4],
        toCenter = new THREE.Vector3(
          last.x - g.player.position.x,
          0,
          last.z - g.player.position.z,
        );
      frame(g, toCenter.clone().normalize(), toCenter.length() / 6);
      g.progress.field.push(f.id);
      assert.equal(traversalInteract(g), true, label);
      for (let i = 0; i < 185; i++) {
        updateTraversal(g, 1 / 60, { x: 0, z: 0 });
        assert.ok(
          g.canMove(g.player.position.x, g.player.position.z, g.jumpY),
          `${label}: cable clears pillars`,
        );
      }
      assert.equal(g.zipRide, null);
      assert.ok(g.player.position.distanceTo(c.exit) < 0.01, label);
      count++;
    }
  assert.equal(count, 22);
});
test("secure ledges survive save normalization and invalid platform heights cannot create airborne spawns", () => {
  const level = LEVELS[0],
    f = createMap(level).features.find((f) => f.kind === "climb");
  const { g, c } = courseGame(level, f);
  g.courseAnchor = { id: c.id, ledge: 2 };
  g.player.position.set(c.ledges[2].x, c.ledges[2].y, c.ledges[2].z);
  const value = {
    version: 1,
    levels: {
      verdant: {
        ...g.progress,
        traversal: captureTraversal(g),
        position: {
          x: g.player.position.x,
          z: g.player.position.z,
          height: 5.6,
        },
      },
    },
  };
  g.progress = normalizeSave(value).levels.verdant;
  g.player.position.copy(c.exit);
  restoreTraversal(g);
  assert.ok(
    g.player.position.distanceTo(
      new THREE.Vector3(c.ledges[2].x, c.ledges[2].y, c.ledges[2].z),
    ) < 1e-6,
  );
  g.progress.traversal = { id: "field-9-2", ledge: 9 };
  g.progress.position = { height: 20 };
  g.player.position.copy(c.exit);
  restoreTraversal(g);
  assert.equal(g.player.position.y, c.exit.y);
});

test("a missed crossing returns to the last secure ledge and an exhausted grip releases without an extra jump", () => {
  const level = LEVELS[0],
    f = createMap(level).features.find((f) => f.kind === "climb"),
    { g, c } = courseGame(level, f),
    l = c.ledges[2];
  g.courseAnchor = { id: c.id, ledge: 2 };
  g.player.position.set(l.x + 2.3, l.y, l.z);
  g.grounded = false;
  g.jumpY = 5.6;
  g.fallPeak = l.y;
  for (let i = 0; i < 100; i++) {
    advanceCharacter(g, { x: 0, z: 0 }, 1 / 60);
    trackTraversalSupport(g);
  }
  assert.ok(
    g.player.position.distanceTo(new THREE.Vector3(l.x, l.y, l.z)) < 0.01,
  );
  assert.equal(g.grounded, true);
  g.ropeRide = c;
  g.stamina = 0.01;
  c.angle = 0.2;
  c.omega = 0.4;
  g.grounded = false;
  updateTraversal(g, 1 / 60, { x: 0, z: 0 });
  assert.equal(g.ropeRide, null);
  assert.ok(g.ropeCooldown > 0);
  assert.equal(g.stamina, 0);
  assert.ok(g.velocityY < 1.5);
});
