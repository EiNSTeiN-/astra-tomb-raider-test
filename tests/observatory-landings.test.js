import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { animateExplorer } from "../src/explorer.js";
import { cablePartContains } from "../scripts/inspect-cable-parts.js";
import { Adventure } from "../src/game.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildObservatory } from "../src/observatory.js";
import { stoneBlockGeometry } from "../src/temple-architecture.js";
import {
  stationMeshSolid,
  stationSupport,
} from "../src/field-station-solids.js";
import { advanceCharacter, supportAt } from "../src/character-motion.js";
import { restoreTraversal } from "../src/traversal.js";

test("station point support follows the rendered chipped surface under rotation, with real empty corners and finite arrival height", () => {
  const game = { obstacles: [], groundHeight: () => 0 },
    mesh = new THREE.Mesh(
      stoneBlockGeometry(2.5, 1.2, 2.5, 17),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
  mesh.position.set(20, 3, 30);
  mesh.rotation.y = Math.PI / 4;
  const solid = stationMeshSolid(game, { id: "landing" }, mesh),
    ray = new THREE.Raycaster();
  let hits = 0,
    misses = 0;
  for (let ix = -8; ix <= 8; ix++)
    for (let iz = -8; iz <= 8; iz++) {
      const x = 20 + ix * 0.23,
        z = 30 + iz * 0.23;
      ray.set(new THREE.Vector3(x, 6, z), new THREE.Vector3(0, -1, 0));
      ray.far = 8;
      const hit = ray.intersectObject(mesh)[0],
        top = stationSupport(solid, x, z, Infinity, 0);
      if (hit) {
        assert(top !== null && Math.abs(top - hit.point.y) < 1e-6);
        hits++;
      } else {
        assert.equal(top, null);
        misses++;
      }
      assert.equal(
        stationSupport(solid, x, z, 1, 0),
        null,
        "overhead masonry cannot catch a low saved or falling foot",
      );
    }
  assert(hits > 100 && misses > 100);
  solid.supportable = false;
  assert.equal(stationSupport(solid, 20, 30), null);
  mesh.geometry.dispose();
  mesh.material.dispose();
});

function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[7],
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    world,
    terrainProfile: terrain,
    obstacles: [],
    groundHeight: (x, z) => terrain.height(x, z),
    progress: { stage: 0, field: [], alignments: {} },
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    audio: { tone() {} },
    grounded: true,
    jumpY: 0,
    velocityY: 0,
    traversalCourses: [],
    keys: new Set(),
  });
  buildObservatory(game);
  t.after(() => {
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) materials.add(o.material);
    });
    for (const m of materials)
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    for (const x of textures) x.dispose();
  });
  return game;
}

function jumpToCorner(game, room, column, sx = 1, sz = 1) {
  const patch = game.observatories[room],
    f = patch.foundations.find(
      (f) => f.kind === "column" && f.column === column,
    ),
    cx = patch.root.position.x + f.x,
    cz = patch.root.position.z + f.z,
    start = { x: cx + sx * 2.3, z: cz + sz * 2.3 },
    target = { x: cx + sx * 1.17, z: cz + sz * 1.17 };
  assert(game.canMove(start.x, start.z, 0), "legal ground start");
  game.player.position.set(
    start.x,
    game.groundHeight(start.x, start.z),
    start.z,
  );
  Object.assign(game, {
    grounded: true,
    jumpY: 0,
    velocityY: 0,
    jumpBuffer: 0,
    coyote: 0,
    airVelocity: null,
  });
  let arrived = false,
    peak = game.player.position.y;
  for (let frame = 0; frame < 120; frame++) {
    const dx = target.x - game.player.position.x,
      dz = target.z - game.player.position.z,
      d = Math.hypot(dx, dz);
    if (d < 0.075) arrived = true;
    advanceCharacter(
      game,
      arrived ? { x: 0, z: 0 } : { x: (dx / d) * 4.6, z: (dz / d) * 4.6 },
      1 / 60,
      frame === 0,
    );
    peak = Math.max(peak, game.player.position.y);
  }
  return { start, target, arrived, peak };
}

test("reachable column corners catch ordinary jumps on real masonry, while removing their support reproduces the former fall-through", (t) => {
  const game = fixture(t);
  let reached = 0,
    checked = 0;
  for (const room of [0, 1, 4, 9])
    for (const column of [0, 3])
      for (const [sx, sz] of [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
      ]) {
        const trial = jumpToCorner(game, room, column, sx, sz),
          p = game.player.position,
          floor = supportAt(game, p.x, p.z, p.y, 0.55);
        assert(game.grounded);
        assert(game.canMove(p.x, p.z, game.jumpY));
        assert(Math.abs(floor.height - p.y) < 1e-8);
        assert(floor.surface?.triangles);
        if (trial.arrived) reached++;
        checked++;
      }
  assert.equal(checked, 32);
  assert.equal(reached, 26);
  for (const solid of game.observatories[9].stationSolids)
    solid.supportable = false;
  const trial = jumpToCorner(game, 9, 0),
    p = game.player.position;
  assert(trial.arrived && game.grounded);
  assert.equal(game.canMove(p.x, p.z, game.jumpY), false);
  const base = game.observatories[9].stationSolids.find(
      (s) => s.observatoryPart === "column-0-base",
    ),
    physical = base.triangles.support(p.x, p.z, Infinity, 0)?.height;
  assert(
    physical - p.y > 0.75,
    "negative control reproduces a foot beneath the delivered cap",
  );
  t.diagnostic(
    JSON.stringify({ checked, reached, negativeControlDepth: physical - p.y }),
  );
});

test("an earned chipped-cap landing restores its body footprint and height exactly, while an older under-cap save recovers on clear soil", (t) => {
  const game = fixture(t);
  jumpToCorner(game, 9, 0);
  const p = game.player.position,
    before = p.clone(),
    height = game.jumpY;
  assert(height > 0.8 && height < 1.2);
  const pointFloor = supportAt(game, p.x, p.z, p.y).height;
  assert(
    before.y - pointFloor > 0.025,
    "a point-only restore would lower this body-supported edge stance",
  );
  game.progress.position = { x: p.x, z: p.z, height };
  const progress = structuredClone(game.progress);
  for (let i = 0; i < 2; i++) {
    p.set(before.x, game.groundHeight(before.x, before.z), before.z);
    restoreTraversal(game);
    assert(p.distanceTo(before) < 1e-8);
    assert(Math.abs(game.jumpY - height) < 1e-8);
    assert.deepEqual(game.progress, progress);
  }
  game.progress.position.height = 0;
  p.y = game.groundHeight(p.x, p.z);
  restoreTraversal(game);
  assert(game.canMove(p.x, p.z, game.jumpY));
  assert(Math.abs(game.jumpY) < 1e-8);
  assert(p.distanceTo(before) > 0.75);
  assert.equal(game.progress.position.height, 0);
});

test("walking back off earned column corners clears the movement disk before falling to soil", (t) => {
  const game = fixture(t);
  let returned = 0;
  for (const room of [0, 1, 4, 9])
    for (const column of [0, 3])
      for (const [sx, sz] of [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
      ]) {
        const { start } = jumpToCorner(game, room, column, sx, sz);
        for (let frame = 0; frame < 120; frame++) {
          const dx = start.x - game.player.position.x,
            dz = start.z - game.player.position.z,
            distance = Math.hypot(dx, dz);
          advanceCharacter(
            game,
            distance < 0.075
              ? { x: 0, z: 0 }
              : {
                  x: (dx / distance) * 4.6,
                  z: (dz / distance) * 4.6,
                },
            1 / 60,
          );
        }
        const p = game.player.position;
        assert(Math.hypot(p.x - start.x, p.z - start.z) < 0.075);
        assert(game.grounded && game.canMove(p.x, p.z, game.jumpY));
        assert(Math.abs(game.jumpY) < 1e-8);
        returned++;
      }
  assert.equal(returned, 32);
});

test("the delivered crouched knee clears a chipped cap when the other boot reaches its steep bevel", async (t) => {
  const game = fixture(t),
    io = new NodeIO(),
    document = await io.read(
      new URL("../public/assets/characters/vesper.glb", import.meta.url)
        .pathname,
    );
  for (const texture of document.getRoot().listTextures()) texture.dispose();
  const bytes = await io.writeBinary(document),
    { scene, animations } = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    ),
    mixer = new THREE.AnimationMixer(scene),
    actions = {};
  for (const clip of animations) actions[clip.name] = mixer.clipAction(clip);
  actions.Idle.play();
  mixer.update(0.1);
  game.rig = {
    model: scene,
    mixer,
    actions,
    state: "Idle",
    weapon: { group: new THREE.Group() },
  };
  game.player.add(game.avatar);
  game.avatar.add(scene);
  game.world.add(game.player);
  game.elapsed = 0;
  const patch = game.observatories[0],
    f = patch.foundations.find((f) => f.kind === "column" && f.column === 0),
    cx = patch.root.position.x + f.x,
    cz = patch.root.position.z + f.z,
    target = { x: cx + 1.17, z: cz + 1.17 };
  game.player.position.set(
    cx + 2.3,
    game.groundHeight(cx + 2.3, cz + 2.3),
    cz + 2.3,
  );
  let arrived = false;
  for (let frame = 0; frame < 140; frame++) {
    const dx = target.x - game.player.position.x,
      dz = target.z - game.player.position.z,
      distance = Math.hypot(dx, dz);
    if (distance < 0.14) arrived = true;
    game.moveVelocity = arrived
      ? { x: 0, z: 0 }
      : { x: (dx / distance) * 6, z: (dz / distance) * 6 };
    game.actualMoveSpeed = arrived ? 0 : 6;
    advanceCharacter(game, game.moveVelocity, 1 / 60, frame === 0);
    if (!arrived) {
      const delta = (-3 * Math.PI) / 4 - game.avatar.rotation.y;
      game.avatar.rotation.y +=
        (Math.atan2(Math.sin(delta), Math.cos(delta)) * 14) / 60;
    }
    animateExplorer(game, 1 / 60, !arrived, false);
  }
  assert(arrived && game.grounded);
  const root = game.player.position.clone(),
    base = patch.stationSolids.find(
      (s) => s.observatoryPart === "column-0-base",
    ).triangles.solids[0],
    faces = base.shape.triangles.map(
      (t) =>
        new THREE.Triangle(
          ...t.vertices.map((p) => p.clone().applyMatrix4(base.matrix)),
        ),
    ),
    geometry = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        base.shape.triangles.flatMap((t) =>
          t.vertices.flatMap((p) => p.toArray()),
        ),
        3,
      ),
    ),
    mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    ),
    ray = new THREE.Raycaster(),
    nearest = new THREE.Vector3();
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(base.matrix);
  mesh.updateMatrixWorld(true);
  const part = { mesh, bounds: base.bounds };
  t.after(() => {
    geometry.dispose();
    mesh.material.dispose();
  });
  assert(
    cablePartContains(part, base.bounds.getCenter(new THREE.Vector3()), ray),
    "independent ray parity detects a buried control point",
  );
  let samples = 0,
    worst = 0;
  game.crouching = true;
  for (let frame = 1; frame <= 40; frame++) {
    animateExplorer(game, 1 / 60, false, false);
    assert(
      game.player.position.equals(root),
      "visual footing cannot change the earned capsule/save height",
    );
    if (![8, 16, 32, 40].includes(frame)) continue;
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!o.isMesh) return;
      for (let i = 0; i < o.geometry.attributes.position.count; i++) {
        const p = o
          .getVertexPosition(i, new THREE.Vector3())
          .applyMatrix4(o.matrixWorld);
        samples++;
        if (!base.bounds.containsPoint(p) || !cablePartContains(part, p, ray))
          continue;
        let depth = Infinity;
        for (const face of faces) {
          face.closestPointToPoint(p, nearest);
          depth = Math.min(depth, p.distanceTo(nearest));
        }
        worst = Math.max(worst, depth);
        assert(
          depth <= 0.015,
          `${o.name}/${i}: crouched body penetrates cap by ${depth} m`,
        );
      }
    });
  }
  assert(samples > 180000);
  t.diagnostic(JSON.stringify({ samples, worst, height: game.jumpY }));
});

test("a normal second jump toward the low wall falls clear of the widening shaft and lands back on the base", (t) => {
  const game = fixture(t),
    patch = game.observatories[7],
    column = patch.foundations.find(
      (f) => f.kind === "column" && f.column === 0,
    ),
    cx = patch.root.position.x + column.x,
    cz = patch.root.position.z + column.z,
    start = { x: cx + 2.3, z: cz + 2.3 },
    corner = { x: cx + 1.17, z: cz + 1.17 };
  // Use the runtime terrain method: a descent response must retain its receiver.
  game.groundHeight = Adventure.prototype.groundHeight;
  game.player.position.set(
    start.x,
    game.groundHeight(start.x, start.z),
    start.z,
  );
  assert(game.canMove(start.x, start.z, 0));
  const jump = (target) => {
    const angle = Math.atan2(
        game.player.position.x - target.x,
        game.player.position.z - target.z,
      ),
      velocity = { x: -Math.sin(angle) * 6, z: -Math.cos(angle) * 6 };
    let stopped = false;
    for (let frame = 0; frame < 140; frame++) {
      if (
        Math.hypot(
          game.player.position.x - target.x,
          game.player.position.z - target.z,
        ) < 0.14
      )
        stopped = true;
      advanceCharacter(
        game,
        stopped ? { x: 0, z: 0 } : velocity,
        1 / 60,
        frame === 0,
      );
    }
    assert(
      game.grounded &&
        game.canMove(
          game.player.position.x,
          game.player.position.z,
          game.jumpY,
        ),
    );
  };
  jump(corner);
  const first = game.player.position.clone();
  jump({ x: cx + 0.85, z: patch.root.position.z + 2.063565980414392 });
  const p = game.player.position,
    floor = supportAt(game, p.x, p.z, p.y, 0.55);
  assert.equal(floor.surface.observatoryPart, "column-0-base");
  assert(Math.abs(p.y - first.y) < 0.01);
  assert(game.jumpY > 0.8 && game.jumpY < 0.95);
  assert(Math.abs(p.y - floor.height) < 1e-8);
  t.diagnostic(
    JSON.stringify({
      first: first.toArray(),
      landed: p.toArray(),
      height: game.jumpY,
    }),
  );
});
