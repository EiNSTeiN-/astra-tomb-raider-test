import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { advanceCharacter } from "../src/character-motion.js";
import { clearTerrainDescent } from "../src/terrain-body-clearance.js";
import { normalizeSave } from "../src/storage.js";

const level = LEVELS[0],
  map = createMap(level),
  profile = createTerrainProfile(map, level);
const hash = (values) =>
  createHash("sha256")
    .update(Buffer.from(new Float32Array(values).buffer))
    .digest("hex");
function game() {
  return Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile: profile,
    groundHeight: profile.surfaceHeight,
    obstacles: [],
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    audio: { tone() {} },
    grounded: true,
    velocityY: 0,
    jumpY: 0,
    explored: new Set(),
  });
}
function place(g, x, z) {
  g.player.position.set(x, g.groundHeight(x, z), z);
  g.grounded = true;
  g.velocityY = g.jumpY = 0;
  g.coyote = g.jumpBuffer = 0;
}

test("airborne feet land before entering an uphill terrain step", () => {
  const g = game();
  g.terrainProfile = { ...profile, jungleRim: null };
  g.groundHeight = (x) => (x - 70) * 0.8;
  place(g, 70, 70);
  g.player.position.y = 0.02;
  g.grounded = false;
  g.velocityY = -1;
  advanceCharacter(g, { x: 6, z: 0 }, 1 / 60);
  assert(g.player.position.y >= g.groundHeight(g.player.position.x, 70) - 1e-6);
  assert(g.grounded);
});

test("the jungle rim retains all shipped walking, basin and interior terrain vertices", () => {
  const walking = [],
    waters = [],
    inner = [];
  for (let iz = 0; iz < profile.width; iz++)
    for (let ix = 0; ix < profile.width; ix++) {
      const x = ix * profile.step,
        z = iz * profile.step,
        height = profile.heights[iz * profile.width + ix];
      if (map.grid[Math.round(z / 7)]?.[Math.round(x / 7)])
        walking.push(height);
      if (Math.min(x, z, profile.extent - x, profile.extent - z) >= 28)
        inner.push(height);
      if (
        profile.waters.some(
          (w) =>
            Math.abs(x - w.x) <= (w.bedWidth ?? w.width) / 2 + 3.5 &&
            Math.abs(z - w.z) <= (w.bedLength ?? w.length) / 2 + 3.5,
        )
      )
        waters.push(height);
    }
  // Recorded on published 69a8484 before changing the outer valley terrain.
  assert.equal(walking.length, 33280);
  assert.equal(
    hash(walking),
    "b3e8074777257f1252f3efcb2755b0046398c639760afbe35e6094102e4d37f7",
  );
  assert.equal(waters.length, 1573);
  assert.equal(
    hash(waters),
    "33a7aa41010df5cf277fd28b0d3b847a4d7b941c770551303de43d4a69ac904e",
  );
  assert.equal(inner.length, 45369);
  assert.equal(
    hash(inner),
    "88d6a903d637a0d34b3907700b94f5be570c618a90acc38bc50c8823a989d901",
  );
});

test("ordinary controller movement crosses the reproduced grass/grid edge and can return", () => {
  const g = game();
  place(g, 372, 49);
  for (let i = 0; i < 150; i++) advanceCharacter(g, { x: 3, z: 0 }, 1 / 60);
  assert(g.player.position.x > 379.4);
  assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
  assert.equal(map.grid[7][54], 0);
  for (let i = 0; i < 150; i++) advanceCharacter(g, { x: -3, z: 0 }, 1 / 60);
  assert(Math.abs(g.player.position.x - 372) < 1e-7);
  // The same terrain and controller retain the earlier stop with the old mask.
  g.walkable = (x, z) => !!map.grid[Math.round(z / 7)]?.[Math.round(x / 7)];
  place(g, 372, 49);
  for (let i = 0; i < 150; i++) advanceCharacter(g, { x: 3, z: 0 }, 1 / 60);
  assert(g.player.position.x <= 374.05);
});

test("newly explored forest ground appears in the existing map and survives save normalization", () => {
  const g = game();
  place(g, 380, 49);
  g.survey();
  assert(g.explored.has("54,7"));
  assert.equal(profile.bankMap[7 * map.size + 54], 1);
  const save = normalizeSave({
    version: 1,
    levels: {
      verdant: {
        position: { x: 380, z: 49, height: 0 },
        explored: [...g.explored],
      },
    },
  });
  assert.deepEqual(save.levels.verdant.position, { x: 380, z: 49, height: 0 });
  assert(save.levels.verdant.explored.includes("54,7"));
  assert(
    profile.walkableBank(
      save.levels.verdant.position.x,
      save.levels.verdant.position.z,
    ),
  );
});

test("descending against a steep corner face clears the body instead of embedding it in the bank", () => {
  const g = game();
  place(g, 399, 399);
  for (let i = 0; i < 900; i++) {
    advanceCharacter(g, { x: 4, z: 4 }, 1 / 60, i % 55 === 0);
    assert(
      g.player.position.y >=
        g.groundHeight(g.player.position.x, g.player.position.z) - 1e-6,
    );
    assert(
      g.canMove(g.player.position.x, g.player.position.z, g.jumpY),
      `Blocked body at update${i}: ${g.player.position.toArray()}`,
    );
  }
  for (let i = 0; i < 150; i++) advanceCharacter(g, { x: 0, z: 0 }, 1 / 60);
  assert(g.grounded);
  assert(g.player.position.x < 421 && g.player.position.z < 421);
});

test("four valley sides stop sustained walking and repeated jumps before the world edge", () => {
  const g = game();
  for (const [x, z, vx, vz] of [
    [28, 215, -6, 0],
    [399, 215, 6, 0],
    [215, 28, 0, -6],
    [215, 399, 0, 6],
  ]) {
    place(g, x, z);
    for (let i = 0; i < 900; i++) {
      advanceCharacter(g, { x: vx, z: vz }, 1 / 60, i % 55 === 0);
      const p = g.player.position;
      assert(p.y >= g.groundHeight(p.x, p.z) - 1e-6);
      assert(g.canMove(p.x, p.z, g.jumpY));
      assert(
        Math.min(p.x, p.z, profile.extent - p.x, profile.extent - p.z) > 1.75,
      );
    }
    for (let i = 0; i < 150; i++) advanceCharacter(g, { x: 0, z: 0 }, 1 / 60);
    assert(g.grounded);
  }
});

test("a narrow downhill escape clears a descending body instead of retaining its height", () => {
  const g = game();
  g.groundHeight = (x) => (70 - x) * 2;
  const ordinary = g.canMove.bind(g);
  g.canMove = (x, z, height) => {
    const dx = x - 70,
      dz = z - 70;
    return (
      ordinary(x, z, height) &&
      ((Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) ||
        (dx > 0 && dz > dx * 1.7 && dz < dx * 3))
    );
  };
  place(g, 70, 70);
  g.player.position.y = 0.49;
  g.grounded = false;
  g.velocityY = -1;
  assert(clearTerrainDescent(g, 0.51));
  assert(g.player.position.x > 70 && g.player.position.z > 70);
  assert(g.player.position.y < 0.5);
  assert(
    g.canMove(
      g.player.position.x,
      g.player.position.z,
      g.player.position.y -
        g.groundHeight(g.player.position.x, g.player.position.z),
    ),
  );
});

test("a tight contact can escape between the coarse downhill directions", () => {
  const g = game();
  g.groundHeight = (x, z) => (70 - z) * 2;
  const ordinary = g.canMove.bind(g);
  g.canMove = (x, z, height) => {
    const dx = x - 70,
      dz = z - 70;
    return (
      ordinary(x, z, height) &&
      ((Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) ||
        (dx < 0 && dz > -dx * 8 && dz < -dx * 14))
    );
  };
  place(g, 70, 70);
  g.player.position.y = 0.49;
  g.grounded = false;
  g.velocityY = -1;
  assert(clearTerrainDescent(g, 0.51));
  assert(g.player.position.x < 70 && g.player.position.z > 70);
  assert(g.player.position.y < 0.5);
  assert(
    g.canMove(
      g.player.position.x,
      g.player.position.z,
      g.player.position.y -
        g.groundHeight(g.player.position.x, g.player.position.z),
    ),
  );
});
