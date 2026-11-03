import { explorerGait } from "../src/explorer.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
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
import { advanceCharacter, safeArrival } from "../src/character-motion.js";
import { resetTraversal } from "../src/traversal.js";
import {
  CameraSurfaces,
  constrainCamera,
  followCamera,
} from "../src/camera-collision.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { frameCounterweightGrip } from "../src/counterweight-camera.js";
import { followClearCamera } from "../src/camera-follow.js";
import { buildSoundLandmarks } from "../src/sound-landmarks.js";
import {
  stationAssemblySolid,
  stationBlocked,
  stationEntry,
  stationSupport,
} from "../src/field-station-solids.js";

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

test("sanctuary hums originate above their visible rear controls rather than five metres away on the board", () => {
  for (const level of LEVELS) {
    const { game, feature } = fixture(level);
    game.map = { rooms: [] };
    game.flames = game.waterMeshes = [];
    buildSoundLandmarks(game);
    const source = game.soundSources.find((s) => s.id === feature.id),
      head = feature.core.getWorldPosition(new THREE.Vector3());
    assert(source);
    assert(Math.abs(source.x - head.x) < 1e-6);
    assert(Math.abs(source.z - head.z) < 1e-6);
    assert(Math.abs(source.y - head.y - 0.6) < 1e-6);
    assert.equal(source.mechanism, true);
    assert.equal(source.gain, 0.28);
  }
});

test("all eight sanctuary controls keep bodies outside the rendered stone and crystal while retaining nearby access and saved arrivals", () => {
  const ray = new THREE.Raycaster();
  let surfaceRays = 0,
    supportRays = 0;
  for (const level of LEVELS) {
    const { game, feature } = fixture(level),
      control = feature.core.parent;
    assert.equal(
      feature.fixedCore,
      true,
      "the solid crystal retains its seated pose",
    );
    game.world.updateMatrixWorld(true);
    const centre = control.getWorldPosition(new THREE.Vector3());
    // The rear control becomes accessible after its guard has lifted.
    game.counterweights.saved.solved = true;
    syncCounterweights(game, 0);
    assert.equal(
      game.canMove(centre.x, centre.z, 0),
      false,
      `${level.id}: a standing explorer cannot occupy the control`,
    );
    const solid = game.counterweights.controlSolid,
      headSolid = game.counterweights.controlHeadSolid,
      solids = [solid, headSolid];
    assert(
      solid,
      "the rendered assembly retains physical surfaces after batching",
    );
    assert.equal(solid.triangles.solids.length, 2);
    assert.equal(headSolid.triangles.solids.length, 1);
    assert.equal(game.canMove(centre.x, centre.z, 1.6), true);
    const cameraParts = [
      ...new Set([...game.cameraSurfaces.cells.values()].flat()),
    ].filter((s) => s.parent === control || s.parent === feature.core);
    assert.equal(
      cameraParts.length,
      3,
      "stone, collar and crystal protect the camera",
    );
    const base = control.children[0],
      vertices = base.geometry.attributes.position;
    base.geometry.computeBoundingBox();
    const low = base.geometry.boundingBox.min.y;
    for (let i = 0; i < vertices.count; i++)
      if (Math.abs(vertices.getY(i) - low) < 1e-6) {
        const v = new THREE.Vector3()
          .fromBufferAttribute(vertices, i)
          .applyMatrix4(base.matrixWorld);
        assert(v.y < game.groundHeight(v.x, v.z), "the base enters the ground");
      }
    for (let turn = 0; turn < 24; turn++)
      for (const height of [0.12, 0.45, 0.77, 1.02, 1.21, 1.48]) {
        const angle = ((turn + 0.137) * Math.PI) / 12,
          direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)),
          from = centre.clone().addScaledVector(direction, 2).setY(height),
          to = centre.clone().addScaledVector(direction, -2).setY(height);
        ray.set(from, direction.clone().negate());
        ray.far = 4;
        const hit = ray.intersectObject(control, true)[0],
          entries = solids
            .map((s) => stationEntry(s, from, to))
            .filter((v) => v !== null),
          entry = entries.length ? Math.min(...entries) : null;
        assert(hit && entry !== null);
        assert(Math.abs(entry * 4 - hit.distance) < 2e-6);
        assert(game.cameraSurfaces.entry(from, to, 0) <= entry + 1e-6);
        surfaceRays++;
      }
    for (let ix = -8; ix <= 8; ix++)
      for (let iz = -8; iz <= 8; iz++) {
        const x = centre.x + ix * 0.1 + 0.003,
          z = centre.z + iz * 0.1 + 0.007;
        ray.set(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0));
        ray.far = 4;
        const hit = ray.intersectObject(control, true)[0],
          heights = solids
            .map((s) => stationSupport(s, x, z))
            .filter((v) => v !== null),
          support = heights.length ? Math.max(...heights) : null;
        if (hit)
          assert(support !== null && Math.abs(support - hit.point.y) < 2e-6);
        else assert.equal(support, null);
        supportRays++;
      }
    feature.core.visible = false;
    // Isolate the head's visibility between the new permanent guide channels.
    const from = centre.clone().add(new THREE.Vector3(-0.6, 1.2, 0)),
      to = centre.clone().add(new THREE.Vector3(0.6, 1.2, 0));
    assert.equal(stationEntry(headSolid, from, to), null);
    assert.equal(stationSupport(headSolid, centre.x, centre.z), null);
    assert.equal(game.canMove(centre.x, centre.z, 0.81), true);
    assert.equal(game.cameraSurfaces.entry(from, to, 0), 1);
    feature.core.visible = true;
    assert.equal(game.canMove(centre.x, centre.z, 0.81), false);
    assert(game.cameraSurfaces.entry(from, to, 0) < 1);
    // The front aisle remains close enough to use the released mechanism.
    const start = centre.clone().add(new THREE.Vector3(0, 0, 2.2));
    game.player.position.copy(start);
    for (let frame = 0; frame < 120; frame++)
      advanceCharacter(game, new THREE.Vector3(0, 0, -3), 1 / 60);
    assert(
      game.player.position.z > centre.z + 1.2,
      "sustained walking stops before the base",
    );
    assert(
      game.player.position.distanceTo(centre) < 2.4,
      "the interaction range is retained",
    );
    assert(
      game.canMove(game.player.position.x, game.player.position.z, game.jumpY),
    );
    walk(game, start);
    assert(
      game.player.position.distanceTo(start) < 0.04,
      `${level.id}: the approach permits a return to its clear starting point`,
    );
    const arrival = safeArrival(game, centre);
    assert(arrival && game.canMove(arrival.x, arrival.z, arrival.y));
    assert(
      Math.abs(arrival.y) < 1e-6,
      "an occupied old ground save stays on ground",
    );
    assert(Math.hypot(arrival.x - centre.x, arrival.z - centre.z) < 2.4);
    assert.equal(game.health, 100);
  }
  assert.equal(surfaceRays, 1152);
  assert.equal(supportRays, 2312);
});

test("a descending explorer clears each sanctuary crystal and can leave the resulting support", () => {
  for (const level of LEVELS) {
    const { game, feature } = fixture(level),
      centre = feature.core.parent.getWorldPosition(new THREE.Vector3());
    game.player.position.copy(centre).add(new THREE.Vector3(0, 2.6, 0));
    game.grounded = false;
    game.jumpY = 2.6;
    for (let frame = 0; frame < 120; frame++) {
      advanceCharacter(game, new THREE.Vector3(), 1 / 60);
      assert(
        game.canMove(
          game.player.position.x,
          game.player.position.z,
          game.jumpY,
        ),
        `${level.id}: crystal drop frame ${frame} at ${game.player.position.toArray()}`,
      );
    }
    assert(game.grounded, `${level.id}: the drop settles`);
    const settled = game.player.position.clone();
    for (let frame = 0; frame < 60; frame++)
      advanceCharacter(game, new THREE.Vector3(3, 0, 0), 1 / 60);
    assert(
      game.player.position.x > settled.x + 1.4,
      `${level.id}: clear departure`,
    );
    assert(
      game.canMove(game.player.position.x, game.player.position.z, game.jumpY),
    );
  }
});
test("the fixed hoist beam catches a clear-air fall without a sideways jump and permits a clear departure", () => {
  for (const dx of [-0.35, 0, 0.35])
    for (const dz of [-0.04, 0.04]) {
      const { game } = fixture();
      game.player.position.set(100 + dx, 5.7, 95 + dz);
      game.jumpY = 5.7;
      game.grounded = false;
      const start = game.player.position.clone();
      assert(
        game.canMove(
          game.player.position.x,
          game.player.position.z,
          game.jumpY,
        ),
        "the drop starts in clear air",
      );
      for (let frame = 0; frame < 180; frame++) {
        advanceCharacter(game, new THREE.Vector3(), 1 / 60);
        assert(
          game.canMove(
            game.player.position.x,
            game.player.position.z,
            game.jumpY,
          ),
          `hoist beam drop ${dx}, ${dz}, frame ${frame}: ${game.player.position.toArray()}`,
        );
      }
      assert(game.grounded, "the explorer reaches real support");
      assert(Math.abs(game.player.position.x - start.x) < 1e-8);
      assert(Math.abs(game.player.position.z - start.z) < 1e-8);
      const support = stationSupport(
        game.counterweights.cageBeamSolid,
        game.player.position.x,
        game.player.position.z,
        Infinity,
        0.55,
      );
      assert(
        Math.abs(game.player.position.y - support) < 1e-8,
        "the rendered beam is the landing surface",
      );
      for (let frame = 0; frame < 90; frame++) {
        advanceCharacter(game, new THREE.Vector3(), 1 / 60, frame === 0);
        assert(
          game.canMove(
            game.player.position.x,
            game.player.position.z,
            game.jumpY,
          ),
          "a jump from the beam stays clear of the overhead fittings",
        );
      }
      assert(game.grounded, "the jump returns to real support");
      const settled = game.player.position.clone();
      for (let frame = 0; frame < 120; frame++) {
        advanceCharacter(game, new THREE.Vector3(0, 0, 3), 1 / 60);
        assert(
          game.canMove(
            game.player.position.x,
            game.player.position.z,
            game.jumpY,
          ),
          "departure stays outside the frame",
        );
      }
      assert(
        game.player.position.z > settled.z + 1.4,
        "the landing leaves a usable departure",
      );
    }
});

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

test("receiver plaques align with their floor plates and bear continuously into the real rear masonry", () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const level of LEVELS) {
    const { game } = fixture(level),
      c = game.counterweights;
    game.world.updateMatrixWorld(true);
    const architecture = [],
      fittings = [],
      labels = [];
    game.world.traverse((mesh) => {
      if (!mesh.isMesh) return;
      let parent = mesh;
      while (parent && parent !== c.group) parent = parent.parent;
      if (!parent) architecture.push(mesh);
      else if (Number.isInteger(mesh.userData.counterweightReceiver))
        labels.push(mesh);
      else if (!mesh.userData.counterweightLabel) fittings.push(mesh);
    });
    assert.equal(labels.length, c.plates.length);
    const proxies = [...architecture, ...fittings].map((mesh) => {
      const proxy = new THREE.Mesh(mesh.geometry, material);
      proxy.matrixWorld.copy(mesh.matrixWorld);
      return proxy;
    });
    const masonry = proxies.slice(0, architecture.length);
    for (const label of labels) {
      const index = label.userData.counterweightReceiver,
        p = label.getWorldPosition(new THREE.Vector3()),
        receivers = c.plates[index].meshes.map((m) =>
          m.getWorldPosition(new THREE.Vector3()),
        );
      assert(
        Math.abs(
          p.x - receivers.reduce((sum, v) => sum + v.x, 0) / receivers.length,
        ) < 1e-6,
      );
      assert(
        p.y - c.group.position.y + 0.275 < 1.2,
        "the complete plaque clears the painted recess",
      );
      const textWidth = new THREE.Box3()
        .setFromObject(label)
        .getSize(new THREE.Vector3()).x;
      for (const side of [-1, 1])
        for (const dy of [-0.06, 0.04]) {
          const origin = new THREE.Vector3(
              p.x + side * textWidth * 0.45 + 0.003,
              p.y + dy,
              c.group.position.z - 5.7,
            ),
            direction = new THREE.Vector3(0, 0, -1),
            ray = new THREE.Raycaster(origin, direction, 0, 2),
            wall = ray.intersectObjects(masonry, false)[0];
          assert(wall, `${level.id}: real rear wall behind the plaque`);
          const events = ray.intersectObjects(proxies, false),
            intervals = [];
          let depth = 0,
            start = null,
            last = null;
          for (const hit of events) {
            const normal = hit.face.normal
                .clone()
                .transformDirection(hit.object.matrixWorld),
              entering = normal.dot(direction) < 0;
            if (
              last &&
              last.object === hit.object &&
              Math.abs(last.distance - hit.distance) < 1e-6 &&
              last.entering === entering
            )
              continue;
            last = { object: hit.object, distance: hit.distance, entering };
            if (entering) {
              if (depth++ === 0) start = hit.distance;
            } else if (--depth === 0 && start !== null)
              intervals.push([start, hit.distance]);
          }
          assert(
            intervals.some(([a, b]) => a < 0.29 && b > wall.distance + 0.02),
            `${level.id}: plaque, anchor and masonry form a closed bearing`,
          );
        }
    }
    // Above the iron insets and anchor pads, only the bronze plaque fronts
    // occupy this strip. Two entering faces reveal overlapping coplanar backs.
    for (let step = 0; step < 129; step++) {
      const ray = new THREE.Raycaster(
          new THREE.Vector3(
            c.group.position.x - 4.3 + (step * 8.6) / 128 + 0.00137,
            c.group.position.y + 1.07317,
            c.group.position.z - 5.8,
          ),
          new THREE.Vector3(0, 0, -1),
          0,
          0.4,
        ),
        fronts = ray
          .intersectObjects(proxies.slice(architecture.length), false)
          .filter(
            (hit) =>
              hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
                .z > 0.95,
          );
      assert(
        fronts.length <= 1,
        `${level.id}: neighboring plaques must not overlap`,
      );
    }
  }
  material.dispose();
});

test("the taut hoist cable and its camera and physical header follow closed, moving and raised cages", () => {
  for (const level of LEVELS) {
    const { game } = fixture(level),
      c = game.counterweights;
    for (const [solved, dt] of [
      [false, 0],
      [true, 0.1],
      [true, 0.1],
      [true, 0],
      [false, 0.1],
      [false, 0],
    ]) {
      c.saved.solved = solved;
      syncCounterweights(game, dt);
      game.world.updateMatrixWorld(true);
      const header = c.cage.children.find((mesh) => {
          mesh.geometry.computeBoundingBox();
          return (
            mesh.geometry.boundingBox.max.x - mesh.geometry.boundingBox.min.x >
            1
          );
        }),
        bounds = new THREE.Box3().setFromObject(header),
        cable = new THREE.Box3().setFromObject(c.hoistCable),
        center = bounds.getCenter(new THREE.Vector3()),
        from = center.clone().add(new THREE.Vector3(0, 0, 1)),
        to = center.clone().add(new THREE.Vector3(0, 0, -1)),
        ray = new THREE.Raycaster(from, new THREE.Vector3(0, 0, -1), 0, 2),
        hit = ray.intersectObject(header, false)[0],
        entry = stationEntry(c.cageHeaderSolid, from, to);
      assert(hit && entry !== null);
      assert(Math.abs(hit.distance - entry * 2) < 0.03);
      assert(game.cameraSurfaces.entry(from, to, 0) <= entry + 0.015);
      assert(Math.abs(c.cageHeaderSolid.bounds.min.y - bounds.min.y) < 0.03);
      assert(Math.abs(c.cageHeaderSolid.bounds.max.y - bounds.max.y) < 0.03);
      assert(
        stationBlocked(
          c.cageHeaderSolid,
          center.x,
          center.y - 0.04,
          center.z,
          0.08,
        ),
      );
      assert(
        !stationBlocked(
          c.cageHeaderSolid,
          center.x,
          bounds.min.y - 0.3,
          center.z,
          0.2,
        ),
      );
      assert(
        cable.min.y > bounds.min.y && cable.min.y < bounds.max.y,
        "cable enters the moving header",
      );
      assert(
        Math.abs(cable.max.y - c.group.position.y - 5.1) < 1e-6,
        "upper end remains seated in the fixed beam",
      );
      assert(
        c.hoistCable.userData.animated,
        "batching retains the moving cable",
      );
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

test("the Meridian counterweight route stays usable beside its new threshold on delivered terrain", (t) => {
  const level = LEVELS[7],
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    feature = map.features.find((f) => f.type === "mechanism" && f.stage === 0),
    x = feature.x * 7,
    z = feature.z * 7,
    base = terrain.surfaceHeight(x, z),
    { game } = fixture(
      level,
      (px, pz) => terrain.surfaceHeight(x + px - 100, z + pz - 100) - base,
    );
  t.after(() => {
    const materials = new Set(),
      textures = new Set();
    game.world.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) materials.add(o.material);
    });
    for (const material of materials) {
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
      material.dispose();
    }
    textures.forEach((texture) => texture.dispose());
  });
  assert(game.fieldGates[0].threshold, "exercise the actual raised sill");
  const solution = solveCounterweights(game.counterweights.trial);
  for (const action of solution.path) {
    for (const cell of action.walking) walk(game, point(cell));
    gripMove(game, action);
  }
  assert(
    weightsSolved(
      game.counterweights.trial,
      game.counterweights.saved.positions,
    ),
  );
  assert.equal(game.counterweights.saved.moves, solution.path.length);
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

test("counterweight sweeps pass beneath a hollow triangle assembly and still reject its thin ground-level member", () => {
  for (const blocked of [false, true]) {
    const { game } = fixture(LEVELS[5]),
      c = game.counterweights,
      action = solveCounterweights(c.trial).path[0];
    assert(action.pull);
    for (const cell of action.walking) walk(game, point(cell));
    walk(
      game,
      point(c.saved.positions[action.index]).add(
        new THREE.Vector3(-action.axis[0] * 1.25, 0, -action.axis[1] * 1.25),
      ),
    );
    assert(counterweightInteract(game));
    const middle = point(action.from).lerp(point(action.to), 0.5),
      material = new THREE.MeshBasicMaterial(),
      parts = [];
    const piece = (w, h, d, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      game.world.add(mesh);
      parts.push(mesh);
    };
    for (const x of [-5, 5])
      for (const z of [-5, 5])
        piece(0.2, 2.6, 0.2, middle.x + x, 1.3, middle.z + z);
    piece(10, 0.2, 10, middle.x, 2.7, middle.z);
    if (blocked) piece(0.035, 1.2, 0.035, middle.x, 0.6, middle.z);
    const solid = stationAssemblySolid(
      game,
      { id: "counterweight-frame-control" },
      parts,
    );
    assert(solid.bounds.min.x < middle.x && solid.bounds.max.x > middle.x);
    assert(Math.abs(solid.bounds.min.y) < 1e-6);
    for (let frame = 0; frame < 60; frame++)
      updateCounterweightGrip(game, 1 / 60, -1);
    assert.equal(c.saved.moves, blocked ? 0 : 1);
    releaseCounterweight(game);
    parts.forEach((p) => p.geometry.dispose());
    material.dispose();
  }
});

test("the first sanctuary rejects activation until its counterweights latch", () => {
  const { game, feature } = fixture();
  let guides = 0,
    puzzles = 0;
  game.setPaused = () => {};
  game.cb.counterweights = () => guides++;
  game.cb.puzzle = () => puzzles++;
  game.nearest = feature;
  // This approach stance is inside the mechanism's five-metre prompt range.
  game.player.position.set(100, 0, 95.1);
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

test("taking a stone grip frames its close working stance without changing a move or locking the chosen view", () => {
  const { game } = fixture(),
    c = game.counterweights,
    action = solveCounterweights(c.trial).path[0],
    stone = point(c.saved.positions[action.index]);
  game.player.position.copy(stone).add(new THREE.Vector3(0, 0, 1.25));
  game.yaw = (-2 * Math.PI) / 3;
  game.pitch = 0.4;
  game.camera = new THREE.PerspectiveCamera();
  game.cameraSpace = () => true;
  const desiredAt = (target) =>
    target
      .clone()
      .add(
        new THREE.Vector3(
          Math.sin(game.yaw) * Math.cos(game.pitch) * 5.3,
          Math.sin(game.pitch) * 5.3 + 0.2,
          Math.cos(game.yaw) * Math.cos(game.pitch) * 5.3,
        ),
      );
  const workingChest = stone.clone().add(new THREE.Vector3(0, 1.3, 1.1)),
    oldView = constrainCamera(
      workingChest,
      desiredAt(workingChest),
      game.cameraSurfaces,
      game.cameraSpace,
    );
  assert.ok(
    oldView.distanceTo(workingChest) < 1.5,
    "reproduces the hidden body",
  );
  const saved = structuredClone(c.saved);
  game.keys = new Set(["KeyW", "KeyE", "Space"]);
  assert.equal(counterweightInteract(game), true);
  assert.deepEqual(
    c.saved,
    saved,
    "choosing a view does not earn a stone move",
  );
  assert.deepEqual([...game.keys], ["KeyW"]);
  assert.ok(game.camera.position.distanceTo(game.cameraFollowTarget) >= 2.2);
  assert.ok(Math.abs(game.player.position.z - stone.z - 1.1) < 1e-8);
  for (let frame = 0; frame < 60 && !c.saved.moves; frame++) {
    const yaw = game.yaw;
    updateCounterweightGrip(game, 1 / 60, 1);
    if (frame > 0)
      assert.equal(
        game.yaw,
        yaw,
        "the moving controller does not overwrite look input between accepted moves",
      );
    const target = game.player.position
      .clone()
      .add(new THREE.Vector3(0, 1.3, 0));
    game.camera.position.copy(
      followCamera(
        game.camera.position,
        target,
        desiredAt(target),
        1 / 60,
        game.cameraSurfaces,
        game.cameraSpace,
        game.cameraFollowTarget,
      ),
    );
    game.cameraFollowTarget = target;
    assert.ok(game.camera.position.distanceTo(target) >= 2.2);
  }
  assert.equal(c.saved.moves, 1);
  assert.deepEqual(c.saved.positions[action.index], action.to);
  releaseCounterweight(game);
});

test("walking around a twice-pulled cloud stone retains a visible board view after settling", () => {
  const { game } = fixture(LEVELS[5]),
    chamber = game.counterweights,
    solution = solveCounterweights(chamber.trial);
  game.camera = new THREE.PerspectiveCamera();
  game.cameraSpace = () => true;
  game.yaw = 0;
  game.pitch = 0.13;
  for (const action of solution.path.slice(0, 2)) {
    for (const cell of action.walking) walk(game, point(cell));
    gripMove(game, action);
  }
  assert.equal(chamber.saved.moves, 2);
  assert.deepEqual(chamber.saved.positions[2], [4, 2]);
  const saved = structuredClone(chamber.saved);
  // Retain the recorded horizontal look while walking from the side to the
  // next gripping face. The old low view settles behind the neighboring stone.
  game.yaw = 0.6981449455552843;
  const look = { yaw: game.yaw, pitch: game.pitch },
    updateView = () => {
      const target = game.player.position
          .clone()
          .add(new THREE.Vector3(0, 1.3, 0)),
        desired = target
          .clone()
          .add(
            new THREE.Vector3(
              Math.sin(game.yaw) * Math.cos(game.pitch) * 5.3,
              Math.sin(game.pitch) * 5.3 + 0.2,
              Math.cos(game.yaw) * Math.cos(game.pitch) * 5.3,
            ),
          );
      game.camera.position.copy(
        followCamera(
          game.camera.position,
          target,
          desired,
          1 / 60,
          game.cameraSurfaces,
          game.cameraSpace,
          game.cameraFollowTarget,
        ),
      );
      game.cameraFollowTarget = target;
      assert.ok(game.camera.position.distanceTo(target) >= 2.2);
      assert.equal(
        game.cameraSurfaces.entry(target, game.camera.position, 0),
        1,
      );
      assert.deepEqual({ yaw: game.yaw, pitch: game.pitch }, look);
    };
  for (let frame = 0; frame < 120; frame++) updateView();
  for (const [x, z] of [
    [104.85, 100],
    [104.85, 101.25],
    [103.2, 101.25],
  ]) {
    const target = new THREE.Vector3(x, 0, z);
    let arrived = false;
    for (let tick = 0; tick < 240; tick++) {
      const delta = target.clone().sub(game.player.position),
        distance = delta.length();
      if (distance < 0.035) {
        arrived = true;
        break;
      }
      delta.normalize().multiplyScalar(Math.min(3.8, distance * 60));
      advanceCharacter(game, delta, 1 / 60);
      updateView();
    }
    assert.ok(arrived, `walking reached ${target.toArray()}`);
  }
  for (let frame = 0; frame < 120; frame++) updateView();
  assert.deepEqual(chamber.saved, saved);
});

test("a fixed cloud pillar retains a visible walking view without changing chosen angles", () => {
  const { game } = fixture(LEVELS[5]),
    solution = solveCounterweights(game.counterweights.trial);
  for (const action of solution.path.slice(0, 7)) {
    for (const cell of action.walking) walk(game, point(cell));
    gripMove(game, action);
  }
  assert.deepEqual(game.counterweights.saved.positions, [
    [0, 4],
    [2, 2],
    [4, 1],
  ]);
  const saved = structuredClone(game.counterweights.saved),
    shift = new THREE.Vector3(-229, -5.161680221557617, 23);
  game.player.position
    .fromArray([330.8333333333333, 5.161680221557617, 77])
    .add(shift);
  game.camera = new THREE.PerspectiveCamera();
  game.camera.position
    .fromArray([331.18859096300633, 8.4395888669411, 77.91731525802433])
    .add(shift);
  game.cameraFollowTarget = new THREE.Vector3()
    .fromArray([330.76666666666665, 6.461680221557617, 77])
    .add(shift);
  game.yaw = -0.5213475698437574;
  game.pitch = 1.05;
  const feet = game.player.position.clone(),
    look = { yaw: game.yaw, pitch: game.pitch },
    target = feet.clone().add(new THREE.Vector3(0, 1.3, 0)),
    desired = target
      .clone()
      .add(
        new THREE.Vector3(
          Math.sin(game.yaw) * Math.cos(game.pitch) * 5.3,
          Math.sin(game.pitch) * 5.3 + 0.2,
          Math.cos(game.yaw) * Math.cos(game.pitch) * 5.3,
        ),
      );
  const ordinary = followCamera(
    game.camera.position,
    target,
    desired,
    1 / 60,
    game.cameraSurfaces,
    () => true,
    game.cameraFollowTarget,
  );
  assert(
    ordinary.distanceTo(target) < 2.2,
    "recorded ordinary follow fades the explorer",
  );
  for (let frame = 0; frame < 120; frame++) {
    game.camera.position.copy(
      followClearCamera(game, target, desired, 1 / 60, () => true),
    );
    game.cameraFollowTarget = target.clone();
    assert(
      game.camera.position.distanceTo(target) >= 2.2 - 1e-8,
      "nearby recovery keeps the explorer visible",
    );
    assert.equal(game.cameraSurfaces.entry(target, game.camera.position, 0), 1);
    assert(game.player.position.equals(feet));
    assert.deepEqual({ yaw: game.yaw, pitch: game.pitch }, look);
    assert.deepEqual(game.counterweights.saved, saved);
  }
});

test("a clear cloud orbit recovers when its interpolated path crosses a puzzle pillar", () => {
  const { game } = fixture(LEVELS[5]),
    solution = solveCounterweights(game.counterweights.trial);
  for (const action of solution.path.slice(0, 7)) {
    for (const cell of action.walking) walk(game, point(cell));
    gripMove(game, action);
  }
  assert.deepEqual(game.counterweights.saved.positions, [
    [0, 4],
    [2, 2],
    [4, 1],
  ]);
  const saved = structuredClone(game.counterweights.saved),
    shift = new THREE.Vector3(-229, -5.161680221557617, 23);
  game.player.position
    .fromArray([332.0849987455561, 5.161680221557617, 77.59288444830713])
    .add(shift);
  game.camera = new THREE.PerspectiveCamera();
  game.camera.position
    .fromArray([329.4150320186747, 11.154375792430066, 77.39508883045858])
    .add(shift);
  game.cameraFollowTarget = new THREE.Vector3()
    .fromArray([332.0545139172968, 6.461680221557617, 77.53359600347642])
    .add(shift);
  game.yaw = -1.9424162328989552;
  game.pitch = 1.05;
  const feet = game.player.position.clone(),
    look = { yaw: game.yaw, pitch: game.pitch },
    target = feet.clone().add(new THREE.Vector3(0, 1.3, 0)),
    desired = target
      .clone()
      .add(
        new THREE.Vector3(
          Math.sin(game.yaw) * Math.cos(game.pitch) * 5.3,
          Math.sin(game.pitch) * 5.3 + 0.2,
          Math.cos(game.yaw) * Math.cos(game.pitch) * 5.3,
        ),
      );
  const ordinary = followCamera(
    game.camera.position,
    target,
    desired,
    1 / 60,
    game.cameraSurfaces,
    () => true,
    game.cameraFollowTarget,
  );
  assert(
    ordinary.distanceTo(target) < 2.2,
    "recorded ordinary follow fades the explorer",
  );
  for (let frame = 0; frame < 120; frame++) {
    game.camera.position.copy(
      followClearCamera(game, target, desired, 1 / 60, () => true),
    );
    game.cameraFollowTarget = target.clone();
    assert(
      game.camera.position.distanceTo(target) >= 2.2 - 1e-8,
      "nearby recovery keeps the explorer visible",
    );
    assert.equal(game.cameraSurfaces.entry(target, game.camera.position, 0), 1);
    assert(game.player.position.equals(feet));
    assert.deepEqual({ yaw: game.yaw, pitch: game.pitch }, look);
    assert.deepEqual(game.counterweights.saved, saved);
  }
});

test("a wider pillar clearance recovers a desert walking view when every small orbit is blocked", () => {
  const { game } = fixture(LEVELS[1]),
    solution = solveCounterweights(game.counterweights.trial);
  for (const action of solution.path.slice(0, 3)) {
    for (const cell of action.walking) walk(game, point(cell));
    gripMove(game, action);
  }
  const saved = structuredClone(game.counterweights.saved),
    shift = new THREE.Vector3(-243, -0.5876420736312866, -208);
  game.player.position
    .fromArray([346.2, 0.5876420736312866, 307.74666666666667])
    .add(shift);
  game.camera = new THREE.PerspectiveCamera();
  game.camera.position
    .fromArray([345.1920864307181, 4.0385297055782505, 308.0726186706492])
    .add(shift);
  game.cameraFollowTarget = new THREE.Vector3()
    .fromArray([346.2, 1.8876420736312866, 307.81])
    .add(shift);
  game.yaw = -1.4044635973207735;
  game.pitch = 1.05;
  const feet = game.player.position.clone(),
    look = { yaw: game.yaw, pitch: game.pitch },
    target = feet.clone().add(new THREE.Vector3(0, 1.3, 0)),
    desiredAt = (yaw, pitch) =>
      target
        .clone()
        .add(
          new THREE.Vector3(
            Math.sin(yaw) * Math.cos(pitch) * 5.3,
            Math.sin(pitch) * 5.3 + 0.2,
            Math.cos(yaw) * Math.cos(pitch) * 5.3,
          ),
        ),
    desired = desiredAt(game.yaw, game.pitch);
  for (const yaw of [-0.3, 0, 0.3])
    for (const pitch of [-0.4, -0.2, 0])
      assert(
        constrainCamera(
          target,
          desiredAt(game.yaw + yaw, game.pitch + pitch),
          game.cameraSurfaces,
          () => true,
        ).distanceTo(target) < 2.2,
        "small neighboring views remain blocked by the actual pillar",
      );
  for (let frame = 0; frame < 120; frame++) {
    game.camera.position.copy(
      followClearCamera(game, target, desired, 1 / 60, () => true),
    );
    game.cameraFollowTarget = target.clone();
    assert(game.camera.position.distanceTo(target) >= 2.2 - 1e-8);
    assert.equal(game.cameraSurfaces.entry(target, game.camera.position, 0), 1);
    assert(game.player.position.equals(feet));
    assert.deepEqual({ yaw: game.yaw, pitch: game.pitch }, look);
    assert.deepEqual(game.counterweights.saved, saved);
  }
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

test("an accepted slide predicts its endpoint wall without moving the stone or changing progress", () => {
  const world = new THREE.Group(),
    body = new THREE.Group();
  body.userData.cameraDynamic = true;
  world.add(body);
  const surfaces = new CameraSurfaces(world),
    material = new THREE.MeshStandardMaterial(),
    stone = new THREE.Mesh(new THREE.BoxGeometry(1.44, 2.2, 1.44), material),
    wall = new THREE.Mesh(new THREE.BoxGeometry(1.4, 8, 0.3), material);
  stone.position.y = 1.1;
  body.add(stone);
  wall.position.set(1.4, 4, 1.8);
  world.add(wall);
  surfaces.capture(stone);
  surfaces.capture(wall);
  surfaces.rebuild();
  const player = new THREE.Group();
  player.position.set(-1.1, 0, 0);
  const game = {
      player,
      blockGrip: { block: { group: body } },
      camera: new THREE.PerspectiveCamera(),
      cameraSurfaces: surfaces,
      cameraSpace: () => true,
      yaw: -Math.PI / 2 + 1.2,
      pitch: 0.15,
    },
    move = {
      from: new THREE.Vector3(),
      to: new THREE.Vector3(2.5, 0, 0),
      playerFrom: player.position.clone(),
      playerTo: new THREE.Vector3(1.4, 0, 0),
    },
    arm = () =>
      new THREE.Vector3(
        Math.sin(game.yaw) * Math.cos(game.pitch) * 5.3,
        Math.sin(game.pitch) * 5.3 + 0.2,
        Math.cos(game.yaw) * Math.cos(game.pitch) * 5.3,
      ),
    endpoint = move.playerTo.clone().add(new THREE.Vector3(0, 1.3, 0));
  assert.ok(
    constrainCamera(
      endpoint,
      endpoint.clone().add(arm()),
      surfaces,
      game.cameraSpace,
    ).distanceTo(endpoint) < 2.2,
    "the current view collides at the destination",
  );
  const before = {
    feet: player.position.toArray(),
    stone: body.position.toArray(),
    wall: wall.position.toArray(),
    plan: JSON.stringify(move),
  };
  assert.equal(frameCounterweightGrip(game, [1, 0], move), true);
  assert.deepEqual(
    {
      feet: player.position.toArray(),
      stone: body.position.toArray(),
      wall: wall.position.toArray(),
      plan: JSON.stringify(move),
    },
    before,
    "prediction is read only for world and movement state",
  );
  for (let i = 0; i <= 60; i++) {
    const amount = i / 60;
    body.position.copy(move.from).lerp(move.to, amount);
    player.position.copy(move.playerFrom).lerp(move.playerTo, amount);
    const target = player.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    game.camera.position.copy(
      followCamera(
        game.camera.position,
        target,
        target.clone().add(arm()),
        1 / 60,
        surfaces,
        game.cameraSpace,
        game.cameraFollowTarget,
      ),
    );
    game.cameraFollowTarget = target;
    assert.ok(
      game.camera.position.distanceTo(target) >= 2.2,
      `visible working arm at frame ${i}`,
    );
  }
  const yaw = game.yaw,
    pitch = game.pitch;
  // The same clear direction on a subsequent slide does not reset the orbit.
  const next = {
    from: body.position.clone(),
    to: body.position.clone().add(new THREE.Vector3(0.1, 0, 0)),
    playerFrom: player.position.clone(),
    playerTo: player.position.clone().add(new THREE.Vector3(0.1, 0, 0)),
  };
  assert.equal(frameCounterweightGrip(game, [1, 0], next), false);
  assert.equal(game.yaw, yaw);
  assert.equal(game.pitch, pitch);
});
