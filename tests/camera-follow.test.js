import test from "node:test";
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
import { followClearCamera } from "../src/camera-follow.js";

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

test("nearby view recovery preserves ordinary follow during aimed, water and traversal views", (t) => {
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
  for (const flag of [
    "aiming",
    "swimming",
    "diving",
    "climb",
    "ropeRide",
    "zipRide",
  ]) {
    game[flag] = true;
    assert(
      followClearCamera(game, target, desired, 1 / 60, space).equals(expected),
      flag,
    );
    game[flag] = false;
  }
});

test("a wall that closes all nearby orbits retains the safe retracted view", (t) => {
  const { game, target, desired, space } = fixture(t, true),
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
