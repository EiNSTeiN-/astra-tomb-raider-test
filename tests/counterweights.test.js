import { explorerGait } from "../src/explorer.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { LEVELS } from "../src/campaign.js";
import {
  COUNTERWEIGHTS,
  initialStones,
  normalizeWeights,
  weightsSolved,
  stoneMove,
  pressureState,
  TILE,
} from "../src/counterweight-rules.js";
import {
  buildCounterweights,
  counterweightInteract,
  counterweightsReady,
  updateCounterweightGrip,
  releaseCounterweight,
  resetCounterweights,
  syncCounterweights,
} from "../src/counterweights.js";
import { solveCounterweights } from "../scripts/solve-counterweights.js";
import { buildFieldGates } from "../src/field-world.js";
import { advanceCharacter } from "../src/character-motion.js";
import { resetTraversal } from "../src/traversal.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { SaveStore, normalizeSave } from "../src/storage.js";

function fixture(level = LEVELS[0], groundHeight = () => 0) {
  const memory = new Map(),
    storage = {
      getItem: (k) => memory.get(k),
      setItem: (k, v) => memory.set(k, v),
    };
  const store = new SaveStore(storage),
    progress = store.level(level.id);
  progress.field = ["field-0-0", "field-0-1", "field-0-2"];
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    progress,
    store,
    world: new THREE.Group(),
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    glowMat: new THREE.MeshStandardMaterial(),
    groundHeight,
    walkable: () => true,
    obstacles: [],
    keys: new Set(),
    grounded: true,
    jumpY: 0,
    velocityY: 0,
    elapsed: 0,
    health: 100,
    explored: new Set(),
    checkpoint: { x: 100, z: 107 },
    traversalCourses: [],
    audio: { tone() {}, noiseHit() {}, note() {} },
    cb: { toast() {}, saved() {}, counterweights() {} },
  });
  const group = new THREE.Group();
  group.position.set(100, 0, 100);
  game.world.add(group);
  const feature = {
    id: "mechanism-0",
    type: "mechanism",
    stage: 0,
    x: 100 / 7,
    z: 100 / 7,
    group,
  };
  game.items = [feature];
  game.cameraSurfaces = new CameraSurfaces(game.world);
  const oldLoad = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = () => new THREE.Texture();
  const oldDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  try {
    buildCounterweights(game, feature, group);
    buildFieldGates(game);
    game.cameraSurfaces.rebuild();
  } finally {
    globalThis.document = oldDocument;
    THREE.TextureLoader.prototype.load = oldLoad;
  }
  game.player.position.set(100, 0, 104.8);
  return { game, storage, feature };
}
const point = (cell) =>
  new THREE.Vector3(100 + (cell[0] - 2) * TILE, 0, 100 + (cell[1] - 2) * TILE);
function walk(game, target) {
  for (let step = 0; step < 240; step++) {
    const delta = target.clone().sub(game.player.position);
    delta.y = 0;
    if (delta.length() < 0.035) return;
    const distance = delta.length();
    delta.normalize().multiplyScalar(Math.min(3.8, distance * 60));
    advanceCharacter(game, delta, 1 / 60);
  }
  assert.fail(
    `Walking route blocked at ${game.player.position.toArray()} toward ${target.toArray()}`,
  );
}
function gripMove(game, action) {
  const c = game.counterweights;
  const target = point(c.saved.positions[action.index]).add(
    new THREE.Vector3(-action.axis[0] * 1.25, 0, -action.axis[1] * 1.25),
  );
  walk(game, target);
  assert.equal(counterweightInteract(game), true);
  assert.equal(game.blockGrip?.block.index, action.index);
  const previous = c.saved.moves;
  for (let frame = 0; frame < 60 && c.saved.moves === previous; frame++)
    updateCounterweightGrip(game, 1 / 60, action.pull ? -1 : 1);
  assert.equal(c.saved.moves, previous + 1);
  releaseCounterweight(game);
}

test("regional counterweight labels remain attached to physical backing after batching and plate depression", () => {
  for (const level of LEVELS) {
    const { game } = fixture(level),
      chamber = game.counterweights;
    for (const solved of [false, true]) {
      if (solved)
        chamber.saved.positions = solveCounterweights(chamber.trial).positions;
      syncCounterweights(game, 0);
      game.world.updateMatrixWorld(true);
      const labels = [],
        solids = [];
      chamber.group.traverse((mesh) => {
        if (!mesh.isMesh) return;
        if (mesh.userData.counterweightLabel) labels.push(mesh);
        else solids.push(mesh);
      });
      assert.equal(
        labels.length,
        4 * chamber.trial.stones.length +
          chamber.trial.goals.reduce(
            (sum, goal) => sum + goal.cells.length,
            0,
          ) +
          chamber.trial.goals.length +
          1,
        "floor, wall, stone and inscription labels survive batching",
      );
      for (const mesh of labels) {
        const p = mesh.getWorldPosition(new THREE.Vector3()),
          n = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld),
          hit = new THREE.Raycaster(
            p.clone().addScaledVector(n, 0.03),
            n.negate(),
            0,
            0.06,
          ).intersectObjects(
            mesh.parent.isMesh ? [mesh.parent] : solids,
            false,
          )[0];
        assert.ok(hit, `${mesh.userData.counterweightLabel}: physical backing`);
        assert.ok(
          hit.distance >= 0.025 && hit.distance <= 0.05,
          `${mesh.userData.counterweightLabel}: seated face, distance ${hit.distance}`,
        );
      }
    }
  }
});

test("dressed regional stones and fittings stay inside the delivered movable footprint", () => {
  for (const level of LEVELS) {
    const { game } = fixture(level);
    for (const { group } of game.counterweights.blocks) {
      group.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3()
        .setFromObject(group)
        .translate(group.getWorldPosition(new THREE.Vector3()).negate());
      assert.ok(bounds.min.x >= -0.635 && bounds.max.x <= 0.635);
      assert.ok(bounds.min.z >= -0.635 && bounds.max.z <= 0.635);
      assert.ok(
        bounds.min.y >= 0.06 && bounds.min.y < 0.065,
        "shoe bears on the 6 cm paving",
      );
      assert.ok(bounds.max.y <= 1.32, "retains the original collision height");
      const solids = [];
      group.traverse((mesh) => {
        if (mesh.isMesh && !mesh.userData.animated) solids.push(mesh);
      });
      assert.equal(
        solids.length,
        5,
        "stone, caps and three metal finishes are batched per moving stone",
      );
      for (const mesh of solids) {
        assert.ok(
          mesh.geometry.attributes.position.array.every(Number.isFinite),
        );
        if (mesh.material.userData.windMetal) {
          const coordinates = mesh.geometry.attributes.windCoord;
          assert.equal(
            coordinates.count,
            mesh.geometry.attributes.position.count,
          );
          assert.ok(
            coordinates.array.every(Number.isFinite),
            "patina coordinates survive fitting and merging",
          );
        }
      }
    }
  }
});

test("regional camera solids follow sliding stones and the fitted inscriptions have safe reset stances", () => {
  for (const level of LEVELS) {
    const { game } = fixture(level),
      c = game.counterweights,
      index = c.blocks.length - 1,
      body = c.blocks[index].group,
      surface = game.cameraSurfaces.dynamic.find((s) => s.parent === body);
    assert.ok(surface, "small moving stones are registered for the camera");
    const ray = () => {
      const p = body.getWorldPosition(new THREE.Vector3());
      return game.cameraSurfaces.entry(
        p.clone().add(new THREE.Vector3(0.66, 0.8, 2)),
        p.clone().add(new THREE.Vector3(0.66, 0.8, -2)),
      );
    };
    assert.ok(ray() < 1);
    const before = surface.bounds.clone();
    const original = c.saved.positions[index],
      dx = original[0] < 4 ? 1 : -1;
    c.saved.positions[index] = [original[0] + dx, original[1]];
    syncCounterweights(game, 0);
    game.world.updateMatrixWorld(true);
    assert.ok(ray() < 1);
    assert.ok(Math.abs(surface.bounds.min.x - before.min.x - dx * TILE) < 1e-8);
    assert.equal(
      game.canMove(c.tablet.x, c.tablet.z, 0),
      false,
      "tablet has a physical footprint",
    );
    resetCounterweights(game);
    assert.equal(
      game.canMove(game.player.position.x, game.player.position.z, 0),
      true,
      "reset returns beside the inscription rather than inside its stone",
    );
    assert.ok(game.player.position.distanceTo(c.tablet) < 2.7);
  }
});

test("a tablet raised by uneven ground keeps its complete slab within the walking solid", () => {
  const { game } = fixture(LEVELS[0], (x, z) =>
    z > 107 ? Math.abs(x - 100) * 0.5 : 0,
  );
  const tablet = game.obstacles.find((o) => o.counterweightTablet);
  const top = game.groundHeight(tablet.x, tablet.z) + tablet.h;
  game.world.updateMatrixWorld(true);
  const solids = [];
  game.counterweights.group.traverse((mesh) => {
    if (mesh.isMesh && !mesh.userData.counterweightLabel) solids.push(mesh);
  });
  const hit = new THREE.Raycaster(
    new THREE.Vector3(tablet.x, top + 0.5, tablet.z),
    new THREE.Vector3(0, -1, 0),
  ).intersectObjects(solids, false)[0];
  assert.ok(hit, "the probe intersects the raised slab");
  assert.ok(hit.point.y <= top && top - hit.point.y < 0.1);
  assert.equal(
    game.canMove(tablet.x, tablet.z, hit.point.y - 0.25),
    false,
    "an airborne body below the slab top cannot pass through it",
  );
});

test("all eight authored counterweight chambers solve through walking, gripping and swept stone movement", () => {
  const layouts = new Set();
  for (const level of LEVELS) {
    const { game, feature } = fixture(level),
      trial = COUNTERWEIGHTS[level.id];
    layouts.add(JSON.stringify(trial.walls));
    const solution = solveCounterweights(trial);
    assert.ok(solution, level.id);
    assert.ok(solution.path.length >= 12 && solution.path.length <= 24);
    assert.equal(counterweightsReady(game, feature), false);
    for (const action of solution.path) {
      for (const cell of action.walking) walk(game, point(cell));
      gripMove(game, action);
      assert.equal(
        game.canMove(game.player.position.x, game.player.position.z, 0),
        true,
      );
    }
    assert.equal(
      weightsSolved(trial, game.counterweights.saved.positions),
      true,
    );
    assert.equal(counterweightsReady(game, feature), true);
    assert.equal(game.counterweights.saved.moves, solution.path.length);
  }
  assert.equal(layouts.size, 8);
});

test("pressure totals, named stones and clear tracks are all required; walls and other stones reject movement", () => {
  const trial = COUNTERWEIGHTS.tides,
    positions = initialStones(trial);
  assert.equal(pressureState(trial, positions).at(-1).active, false);
  assert.equal(
    stoneMove(
      trial,
      [
        [4, 4],
        [0, 4],
        [2, 1],
      ],
      2,
      [1, 0],
    ),
    null,
    "wall blocks the required gripping face",
  );
  const solution = solveCounterweights(COUNTERWEIGHTS.verdant).positions;
  assert.equal(
    weightsSolved(COUNTERWEIGHTS.verdant, solution.toReversed()),
    false,
    "similar weight does not replace a named stone",
  );
  assert.equal(
    stoneMove(
      COUNTERWEIGHTS.verdant,
      [
        [0, 0],
        [1, 0],
      ],
      0,
      [1, 0],
    ),
    null,
  );
  assert.equal(
    stoneMove(
      COUNTERWEIGHTS.verdant,
      [
        [0, 0],
        [4, 3],
      ],
      0,
      [-1, 0],
    ),
    null,
  );
});

test("settled moves survive reload and malformed or forged chamber saves cannot open the mechanism", () => {
  const { game, storage, feature } = fixture();
  const action = solveCounterweights(COUNTERWEIGHTS.verdant).path[0];
  for (const cell of action.walking) walk(game, point(cell));
  gripMove(game, action);
  const restored = new SaveStore(storage).level("verdant");
  assert.deepEqual(restored.counterweights, game.progress.counterweights);
  for (const positions of [
    [[0, 0], null],
    [
      [0, 0],
      [0, 0],
    ],
    [
      [2, 2],
      [4, 3],
    ],
    [
      [NaN, 1],
      [4, 3],
    ],
    [
      [7, 1],
      [4, 3],
    ],
  ]) {
    const save = normalizeSave({
      version: 1,
      levels: { verdant: { counterweights: { positions, solved: true } } },
    });
    assert.deepEqual(
      save.levels.verdant.counterweights.positions,
      initialStones(COUNTERWEIGHTS.verdant),
    );
    assert.equal(save.levels.verdant.counterweights.solved, false);
  }
  game.progress.stage = 1;
  assert.equal(
    counterweightsReady(game, feature),
    true,
    "existing completed sanctuary progress remains valid",
  );
});

test("pause during a stone slide saves its last settled position and recovery clears the grip", () => {
  const { game, storage } = fixture(),
    c = game.counterweights;
  const action = solveCounterweights(c.trial).path[0];
  for (const cell of action.walking) walk(game, point(cell));
  walk(
    game,
    point(c.saved.positions[action.index]).add(
      new THREE.Vector3(-action.axis[0] * 1.25, 0, -action.axis[1] * 1.25),
    ),
  );
  counterweightInteract(game);
  const initial = game.player.position.clone();
  updateCounterweightGrip(game, 0.4, action.pull ? -1 : 1);
  assert.equal(c.saved.moves, 0);
  game.save();
  const saved = new SaveStore(storage).level("verdant");
  assert.equal(saved.position.x, initial.x);
  assert.equal(saved.position.z, initial.z);
  resetTraversal(game);
  assert.equal(game.blockGrip, null);
  assert.deepEqual(c.saved.positions, initialStones(c.trial));
  resetCounterweights(game);
  assert.equal(
    game.canMove(game.player.position.x, game.player.position.z, 0),
    true,
  );
});

test("a thin world obstacle between free tiles prevents the entire stone slide", () => {
  const { game } = fixture(),
    c = game.counterweights;
  const action = solveCounterweights(c.trial).path[0];
  for (const cell of action.walking) walk(game, point(cell));
  walk(
    game,
    point(c.saved.positions[action.index]).add(
      new THREE.Vector3(-action.axis[0] * 1.25, 0, -action.axis[1] * 1.25),
    ),
  );
  counterweightInteract(game);
  const middle = point(action.from).lerp(point(action.to), 0.5);
  game.obstacles.push({ x: middle.x, z: middle.z, w: 0.02, d: 0.02, h: 2 });
  updateCounterweightGrip(game, 1, action.pull ? -1 : 1);
  assert.equal(c.saved.moves, 0);
  assert.equal(game.blockGrip.move, undefined);
});

test("the first sanctuary rejects activation until its counterweights latch", () => {
  const { game, feature } = fixture();
  let guides = 0,
    puzzles = 0;
  game.setPaused = () => {};
  game.cb.counterweights = () => guides++;
  game.cb.puzzle = () => puzzles++;
  game.nearest = feature;
  game.player.position.set(100, 0, 95);
  game.interact();
  assert.equal(guides, 1);
  assert.equal(puzzles, 0);
  game.solve(feature);
  assert.equal(game.progress.stage, 0);
  const solution = solveCounterweights(game.counterweights.trial);
  game.counterweights.saved.positions = solution.positions;
  game.counterweights.saved.solved = true;
  game.interact();
  assert.equal(puzzles, 1);
  game.solve(feature);
  assert.equal(game.progress.stage, 1);
});

test("gripping preserves a held movement key while consuming Use and Jump", () => {
  const { game } = fixture(),
    c = game.counterweights;
  game.player.position
    .copy(point(c.saved.positions[0]))
    .add(new THREE.Vector3(0, 0, 1.25));
  game.keys = new Set(["KeyW", "KeyE", "Space"]);
  assert.equal(counterweightInteract(game), true);
  assert.deepEqual([...game.keys], ["KeyW"]);
});

test("pulling a counterweight reverses the walking cycle", () => {
  const game = {
    grounded: true,
    blockGrip: { move: { pull: true } },
    moveVelocity: { x: 0, z: -1.8 },
  };
  assert.deepEqual(explorerGait(game, true, false), {
    name: "Walk",
    rate: -0.75,
  });
  game.blockGrip.move.pull = false;
  assert.deepEqual(explorerGait(game, true, false), {
    name: "Walk",
    rate: 0.75,
  });
});
