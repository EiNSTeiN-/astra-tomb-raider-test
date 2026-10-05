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
import { followWindCamera } from "../src/wind-walking-camera.js";

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
    windSites: [
      {
        root: new Group(),
        nodes: [
          { x: -1.75, y: 0, z: 0 },
          { x: 1.75, y: 0, z: 0 },
        ],
      },
    ],
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
      followWindCamera(game, target, desired, 1 / 60, space),
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

test("wind recovery preserves ordinary follow outside machinery and during aimed or water views", (t) => {
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
      followWindCamera(game, target, desired, 1 / 60, space).equals(expected),
      flag,
    );
    game[flag] = false;
  }
  game.windSites = [];
  assert(
    followWindCamera(game, target, desired, 1 / 60, space).equals(expected),
  );
});

test("a wall that closes all nearby wind orbits retains the safe retracted view", (t) => {
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
    next = followWindCamera(game, target, desired, 1 / 60, space);
  assert(next.equals(expected));
  assert(next.distanceTo(target) < 2.2);
  assert.equal(game.cameraSurfaces.entry(target, next, 0), 1);
});
