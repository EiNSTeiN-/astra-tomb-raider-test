import test from "node:test";
import * as THREE from "three";
import assert from "node:assert/strict";
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Vector3,
} from "three";
import {
  CameraSurfaces,
  constrainCamera,
  followCamera,
} from "../src/camera-collision.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { buildPalaceArchitecture } from "../src/palace-architecture.js";
import { buildSkyBridges } from "../src/sky-bridges.js";
import { followClearCamera } from "../src/camera-follow.js";
import {
  buildTraversalCourse,
  hasTraversalCourse,
} from "../src/traversal-courses.js";
import { buildRegionalStation } from "../src/field-station-art.js";

function fixture(t, wall = false) {
  const world = new Group(),
    surfaces = new CameraSurfaces(world),
    material = new MeshStandardMaterial();
  const sleeve = new Mesh(
    new CylinderGeometry(0.3, 0.3, 0.5, 12, 1, true),
    material,
  );
  sleeve.position.set(0, 3.05, 0);
  sleeve.rotation.z = Math.PI / 2;
  world.add(sleeve);
  surfaces.capture(sleeve, { small: true, thin: true, cylinderAxis: "y" });
  if (wall) {
    const mesh = new Mesh(new BoxGeometry(20, 10, 0.5), material);
    mesh.position.set(0, 5, 0.6);
    world.add(mesh);
    surfaces.capture(mesh);
  }
  surfaces.rebuild();
  const game = {
    player: new Group(),
    camera: new PerspectiveCamera(),
    cameraSurfaces: surfaces,
    yaw: -0.11960624978591558,
    pitch: 1.05,
  };
  game.player.position.set(0.21, 0, -0.594);
  const target = game.player.position.clone().add(new Vector3(0, 1.3, 0)),
    desired = target
      .clone()
      .add(
        new Vector3(
          Math.sin(game.yaw) * Math.cos(game.pitch) * 5.3,
          Math.sin(game.pitch) * 5.3 + 0.2,
          Math.cos(game.yaw) * Math.cos(game.pitch) * 5.3,
        ),
      ),
    space = (p) => p.y >= 0.28;
  game.camera.position.copy(constrainCamera(target, desired, surfaces, space));
  game.cameraFollowTarget = target.clone();
  t.after(() => {
    world.traverse((o) => o.geometry?.dispose());
    material.dispose();
  });
  return { game, target, desired, space };
}

test("an overhead wind coupling can clear a nearby walking camera without rewriting look or player state", (t) => {
  const { game, target, desired, space } = fixture(t),
    feet = game.player.position.clone(),
    look = { yaw: game.yaw, pitch: game.pitch };
  assert(
    game.camera.position.distanceTo(target) < 1.5,
    "baseline coupling hides explorer",
  );
  for (let frame = 0; frame < 120; frame++) {
    game.camera.position.copy(
      followClearCamera(game, target, desired, 1 / 60, space),
    );
    assert(
      game.camera.position.distanceTo(target) >= 2.2 - 1e-8,
      "explorer stays outside close fade",
    );
    assert.equal(
      game.cameraSurfaces.entry(target, game.camera.position, 0),
      1,
      "body sight line crosses no casting",
    );
    assert(space(game.camera.position), "camera remains above terrain");
    assert(game.player.position.equals(feet));
    assert.deepEqual({ yaw: game.yaw, pitch: game.pitch }, look);
  }
  const arm = game.camera.position.clone().sub(target),
    yaw = Math.atan2(arm.x, arm.z),
    pitch = Math.atan2(arm.y - 0.2, Math.hypot(arm.x, arm.z));
  assert(Math.abs(yaw - game.yaw) <= 0.3 + 1e-8);
  assert(Math.abs(pitch - game.pitch) <= 0.4 + 1e-8);
});

function terrainFixture(t, chapter, bridge = false) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[chapter],
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    world = new Group(),
    game = Object.assign(Object.create(Adventure.prototype), {
      level,
      map,
      world,
      terrainProfile: terrain,
      groundHeight: terrain.height,
      obstacles: [],
      cameraSurfaces: new CameraSurfaces(world),
      player: new Group(),
      camera: new PerspectiveCamera(),
      progress: { stage: 9, field: [], routeVersion: 1 },
      elapsed: 0,
      stoneMat: new MeshStandardMaterial(),
      goldMat: new MeshStandardMaterial(),
      store: { data: { settings: { quality: "high" } } },
    });
  if (bridge) buildSkyBridges(game);
  game.cameraSurfaces.rebuild();
  t.after(() => {
    const materials = new Set([game.stoneMat, game.goldMat]);
    world.traverse((o) => {
      o.geometry?.dispose();
      for (const m of o.material ? [o.material].flat() : []) materials.add(m);
    });
    for (const m of materials) {
      for (const value of Object.values(m))
        if (value?.isTexture) value.dispose();
      m.dispose();
    }
  });
  return game;
}

function checkRecordedWalkingView(game, pose, minimum = 2.2) {
  game.player.position.fromArray(pose.feet);
  game.camera.position.fromArray(pose.camera);
  game.yaw = pose.yaw;
  game.pitch = 0.35;
  const target = game.player.position.clone().add(new Vector3(0, 1.3, 0)),
    desired = target
      .clone()
      .add(
        new Vector3(
          Math.sin(game.yaw) * Math.cos(game.pitch) * 5.3,
          Math.sin(game.pitch) * 5.3 + 0.2,
          Math.cos(game.yaw) * Math.cos(game.pitch) * 5.3,
        ),
      ),
    space = (p) => game.cameraSpace(p),
    feet = game.player.position.clone();
  game.cameraFollowTarget = target.clone();
  assert(
    followCamera(
      game.camera.position,
      target,
      desired,
      1 / 60,
      game.cameraSurfaces,
      space,
      target,
    ).distanceTo(target) < 2.2,
    "ordinary follow reproduces the recorded fade",
  );
  for (let frame = 0; frame < 120; frame++) {
    game.camera.position.copy(
      followClearCamera(game, target, desired, 1 / 60, space),
    );
    assert(
      game.camera.position.distanceTo(target) >= minimum - 1e-8,
      "recovery keeps the explorer outside the fade range",
    );
    assert(space(game.camera.position));
    assert.equal(game.cameraSurfaces.entry(target, game.camera.position, 0), 1);
    assert(game.player.position.equals(feet));
    assert.equal(game.yaw, pose.yaw);
    assert.equal(game.pitch, 0.35);
  }
}

test("a crystal slope turn recovers a visible walking view beyond the side neighborhood", (t) => {
  checkRecordedWalkingView(terrainFixture(t, 6), {
    feet: [144.0333204806886, 15.830595539541418, 229.199537304783],
    camera: [143.63657474893444, 17.929487723334116, 230.41142431792628],
    yaw: -2.2144160504385155,
  });
});

test("a cloud terrace turn retains a visible walking view beside its steep bank", (t) => {
  checkRecordedWalkingView(terrainFixture(t, 5), {
    feet: [124.49302809827881, 17.82882395520345, 158.17435666724194],
    camera: [125.83607968509256, 20.720757392466957, 157.60881062189839],
    yaw: -2.672519111416625,
  });
});

test("a cloud return beneath a bridge can use a safe arm shorter than 3.2 m", (t) => {
  checkRecordedWalkingView(terrainFixture(t, 5, true), {
    feet: [274.30080774975687, 29.33665148795398, 294.5434672943302],
    camera: [274.0509741186088, 32.86366622259044, 289.5672847309377],
    yaw: -10.862638693967446,
  });
});

test("nearby view recovery preserves ordinary follow during aimed, water and rope views", (t) => {
  const { game, target, desired, space } = fixture(t);
  const expected = followCamera(
    game.camera.position,
    target,
    desired,
    1 / 60,
    game.cameraSurfaces,
    space,
    game.cameraFollowTarget,
  );
  for (const flag of ["aiming", "swimming", "diving", "ropeRide"]) {
    game[flag] = true;
    assert(
      followClearCamera(game, target, desired, 1 / 60, space).equals(expected),
      flag,
    );
    game[flag] = false;
  }
  game.climb = { time: 0.4 };
  const clearDesired = target.clone().add(new Vector3(0, 0, 5.3));
  game.camera.position.copy(clearDesired);
  const ordinary = followCamera(
    game.camera.position,
    target,
    clearDesired,
    1 / 60,
    game.cameraSurfaces,
    space,
    game.cameraFollowTarget,
  );
  assert(ordinary.distanceTo(target) >= 2.2);
  assert(
    followClearCamera(game, target, clearDesired, 1 / 60, space).equals(
      ordinary,
    ),
  );
});

test("the recorded volcanic summit mantle retains a visible safe view without changing climb or look", (t) => {
  const game = terrainFixture(t, 4);
  game.cameraSurfaces = new CameraSurfaces(game.world);
  game.darkMat = game.stoneMat.clone();
  game.flames = [];
  t.after(() => game.darkMat.dispose());
  for (const feature of game.map.features.filter(
    (f) => f.type === "field" && hasTraversalCourse(game.level, f),
  )) {
    const station = new Group();
    station.position.set(feature.x * 7, 0, feature.z * 7);
    game.world.add(station);
    buildTraversalCourse(game, feature, station);
    buildRegionalStation(game, feature, station);
  }
  game.world.updateMatrixWorld(true);
  game.cameraSurfaces.rebuild();
  const climb = { time: 0.4, ledge: 4 },
    feet = new Vector3(
      392.7972025821405,
      26.686437304989113,
      120.58139960671012,
    );
  game.player.position.copy(feet);
  game.camera.position.set(
    396.8549760303661,
    29.489536775499595,
    120.15389565572842,
  );
  game.yaw = -4.50525035903769;
  game.pitch = 0.35;
  game.climb = climb;
  const target = feet.clone().add(new Vector3(0, 1.3, 0)),
    desired = target
      .clone()
      .add(
        new Vector3(
          Math.sin(game.yaw) * Math.cos(game.pitch) * 5.3,
          Math.sin(game.pitch) * 5.3 + 0.2,
          Math.cos(game.yaw) * Math.cos(game.pitch) * 5.3,
        ),
      ),
    space = (p) => game.cameraSpace(p);
  game.cameraFollowTarget = target.clone();
  assert(
    followCamera(
      game.camera.position,
      target,
      desired,
      1 / 60,
      game.cameraSurfaces,
      space,
      target,
    ).distanceTo(target) < 1.5,
    "ordinary follow reproduces the hidden summit frame",
  );
  for (let frame = 0; frame < 120; frame++) {
    game.camera.position.copy(
      followClearCamera(game, target, desired, 1 / 60, space),
    );
    assert(game.camera.position.distanceTo(target) >= 2.2 - 1e-8);
    assert.equal(game.cameraSurfaces.entry(target, game.camera.position, 0), 1);
    assert(space(game.camera.position));
    assert(game.player.position.equals(feet));
    assert.equal(game.climb, climb);
    assert.deepEqual(climb, { time: 0.4, ledge: 4 });
    assert.equal(game.yaw, -4.50525035903769);
    assert.equal(game.pitch, 0.35);
  }
});

test("a blocked cable camera can recover without changing its ride, feet or selected look", (t) => {
  const { game, target, desired, space } = fixture(t),
    ride = { approach: false, time: 0.8 },
    feet = game.player.position.clone(),
    look = { yaw: game.yaw, pitch: game.pitch };
  game.zipRide = ride;
  const next = followClearCamera(game, target, desired, 1 / 60, space);
  assert(next.distanceTo(target) >= 2.2 - 1e-8);
  assert(space(next));
  assert.equal(game.cameraSurfaces.entry(target, next, 0), 1);
  assert.equal(game.zipRide, ride);
  assert.deepEqual(ride, { approach: false, time: 0.8 });
  assert(game.player.position.equals(feet));
  assert.deepEqual({ yaw: game.yaw, pitch: game.pitch }, look);
});

test("an enclosed corridor with no clear escape retains the safe retracted view", (t) => {
  const { game, target, desired } = fixture(t, true),
    space = (p) => p.y >= 0.28 && p.y <= 2.8 && Math.abs(p.x - target.x) <= 0.8,
    expected = followCamera(
      game.camera.position,
      target,
      desired,
      1 / 60,
      game.cameraSurfaces,
      space,
      game.cameraFollowTarget,
    ),
    next = followClearCamera(game, target, desired, 1 / 60, space);
  assert(next.equals(expected));
  assert(next.distanceTo(target) < 2.2);
  assert.equal(game.cameraSurfaces.entry(target, next, 0), 1);
});

test("recovery keeps a supplied shorter camera arm during the transition out of aim", (t) => {
  const { game, target, space } = fixture(t),
    distance = 3.4,
    lift = 0.08,
    desired = target
      .clone()
      .add(
        new Vector3(
          Math.sin(game.yaw) * Math.cos(game.pitch) * distance,
          Math.sin(game.pitch) * distance + lift,
          Math.cos(game.yaw) * Math.cos(game.pitch) * distance,
        ),
      );
  game.camera.position.copy(
    constrainCamera(target, desired, game.cameraSurfaces, space),
  );
  for (let frame = 0; frame < 120; frame++) {
    game.camera.position.copy(
      followClearCamera(game, target, desired, 1 / 60, space),
    );
    assert(
      game.camera.position.distanceTo(target) <= distance + lift + 1e-8,
      "collision recovery must not expand the requested arm to the full third-person distance",
    );
    assert.equal(game.cameraSurfaces.entry(target, game.camera.position, 0), 1);
  }
  assert(game.camera.position.distanceTo(target) >= 2.2);
});

test("a tall entrance support permits wider walking clearance without changing the selected heading", (t) => {
  const world = new Group(),
    surfaces = new CameraSurfaces(world),
    material = new MeshStandardMaterial(),
    pier = new Mesh(new BoxGeometry(2.04, 3.55, 2.08), material),
    shift = new Vector3(-200, -3.990407705307007, -59);
  pier.position.set(200.6, 4.932778569630202, 59).add(shift);
  world.add(pier);
  surfaces.capture(pier);
  surfaces.rebuild();
  t.after(() => {
    pier.geometry.dispose();
    material.dispose();
  });
  const game = {
    player: new Group(),
    camera: new PerspectiveCamera(),
    cameraSurfaces: surfaces,
    yaw: -1.693965756501817,
    pitch: 0.15,
  };
  game.player.position
    .fromArray([203.42039839356255, 3.990407705307007, 59.25552644863627])
    .add(shift);
  game.camera.position
    .fromArray([201.55973660311426, 5.771005475468911, 60.649844202887365])
    .add(shift);
  game.cameraFollowTarget = new Vector3()
    .fromArray([203.38218035778414, 5.290407705307007, 59.20502404421479])
    .add(shift);
  const target = game.player.position.clone().add(new Vector3(0, 1.3, 0)),
    desired = target
      .clone()
      .add(
        new Vector3(
          Math.sin(game.yaw) * Math.cos(game.pitch) * 5.3,
          Math.sin(game.pitch) * 5.3 + 0.2,
          Math.cos(game.yaw) * Math.cos(game.pitch) * 5.3,
        ),
      ),
    feet = game.player.position.clone(),
    look = { yaw: game.yaw, pitch: game.pitch };
  assert(
    followCamera(
      game.camera.position,
      target,
      desired,
      1 / 60,
      surfaces,
      () => true,
      game.cameraFollowTarget,
    ).distanceTo(target) < 2.2,
  );
  for (let frame = 0; frame < 120; frame++) {
    game.camera.position.copy(
      followClearCamera(game, target, desired, 1 / 60, () => true),
    );
    game.cameraFollowTarget = target.clone();
    assert(game.camera.position.distanceTo(target) >= 2.2 - 1e-8);
    assert.equal(surfaces.entry(target, game.camera.position, 0), 1);
    assert(game.player.position.equals(feet));
    assert.deepEqual({ yaw: game.yaw, pitch: game.pitch }, look);
  }
});

// This is the first hidden frame on the continuous coastal canal approach review.
// Build the delivered court construction and terrain rather than approximating
// the canal's map boundary with a synthetic wall.
test("a coastal canal approach keeps a visible safe camera while preserving the chosen look", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[3],
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    world = new Group(),
    game = Object.assign(Object.create(Adventure.prototype), {
      level,
      map,
      world,
      terrainProfile: terrain,
      groundHeight: terrain.height,
      obstacles: [],
      cameraSurfaces: new CameraSurfaces(world),
      stoneMat: new MeshStandardMaterial(),
      darkMat: new MeshStandardMaterial(),
      player: new Group(),
      camera: new PerspectiveCamera(),
      store: { data: { settings: { quality: "high" } } },
    });
  buildPalaceArchitecture(game);
  game.cameraSurfaces.rebuild();
  t.after(() => {
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of o.material
        ? Array.isArray(o.material)
          ? o.material
          : [o.material]
        : []) {
        materials.add(m);
        for (const value of Object.values(m))
          if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((x) => x.dispose());
  });
  for (const pose of [
    {
      feet: [186.01625532830303, 0.21973156187096304, 178.33353153957142],
      camera: [185.76848424627238, 2.436529240855932, 176.31848741222237],
      yaw: -1.5880134247460416,
      step: [0.0016255328303, -0.066646846043],
    },
  ]) {
    game.player.position.fromArray(pose.feet);
    game.camera.position.fromArray(pose.camera);
    game.yaw = pose.yaw;
    game.pitch = 0.35;
    const target = game.player.position.clone().add(new Vector3(0, 1.3, 0)),
      desired = target
        .clone()
        .add(
          new Vector3(
            Math.sin(game.yaw) * Math.cos(game.pitch) * 5.3,
            Math.sin(game.pitch) * 5.3 + 0.2,
            Math.cos(game.yaw) * Math.cos(game.pitch) * 5.3,
          ),
        ),
      space = (p) => game.cameraSpace(p),
      feet = game.player.position.clone();
    game.cameraFollowTarget = target
      .clone()
      .sub(new Vector3(pose.step[0], 0, pose.step[1]));
    assert(
      followCamera(
        game.camera.position,
        target,
        desired,
        1 / 60,
        game.cameraSurfaces,
        space,
        game.cameraFollowTarget,
      ).distanceTo(target) < 2.2,
      "ordinary follow reproduces the hidden canal approach",
    );
    for (let frame = 0; frame < 120; frame++) {
      game.camera.position.copy(
        followClearCamera(game, target, desired, 1 / 60, space),
      );
      game.cameraFollowTarget.copy(target);
      assert(
        game.camera.position.distanceTo(target) >= 2.2 - 1e-8,
        "explorer stays outside the fade range",
      );
      assert.equal(
        game.cameraSurfaces.entry(target, game.camera.position, 0),
        1,
        "court geometry remains between neither lens nor explorer",
      );
      assert(
        space(game.camera.position),
        "camera remains within the playable map and above terrain",
      );
      assert(game.player.position.equals(feet));
      assert.equal(game.yaw, pose.yaw);
      assert.equal(game.pitch, 0.35);
    }
  }
});
