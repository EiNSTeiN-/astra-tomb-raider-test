import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { inspectExplorerCamera } from "../scripts/inspect-explorer-camera-browser.js";
import {
  cameraBodyTargets,
  cameraBodyVisibility,
} from "../src/camera-body-frame.js";
import { CameraSurfaces, followCamera } from "../src/camera-collision.js";
import { followClearCamera } from "../src/camera-follow.js";

function fixture(t, skinned = false) {
  const geometry = new THREE.BoxGeometry(0.8, 1.8, 0.4),
    material = new THREE.MeshBasicMaterial(),
    avatar = new THREE.Group(),
    mesh = skinned
      ? new THREE.SkinnedMesh(geometry, material)
      : new THREE.Mesh(geometry, material),
    bone = new THREE.Bone(),
    camera = new THREE.PerspectiveCamera(58, 1.6, 0.1, 100);
  if (skinned) {
    geometry.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute(
        Array(geometry.attributes.position.count * 4).fill(0),
        4,
      ),
    );
    geometry.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute(
        Array.from(
          { length: geometry.attributes.position.count * 4 },
          (_, i) => (i % 4 === 0 ? 1 : 0),
        ),
        4,
      ),
    );
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
  }
  avatar.add(mesh);
  avatar.position.set(10, 2, 20);
  camera.position.set(10, 2, 25);
  camera.lookAt(avatar.position);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.2), material);
  wall.name = "foreground";
  wall.position.set(10, 2, 22);
  t.after(() => {
    geometry.dispose();
    wall.geometry.dispose();
    material.dispose();
    mesh.skeleton?.dispose();
  });
  return { avatar, rig: { model: avatar }, camera, bone, geometry, wall };
}

test("posed surface visibility follows skin deformation, world transforms and foreground depth without editing delivery geometry", (t) => {
  const g = fixture(t, true),
    source = [...g.geometry.attributes.position.array];
  const blocked = inspectExplorerCamera(g, [g.wall]);
  assert(blocked.bodyRays > 100);
  assert.equal(blocked.fraction, 1);
  assert(
    blocked.witnesses.every(
      (w) => w.object === "foreground" && w.point[0] >= 9.5,
    ),
  );
  g.bone.position.x = 3;
  const clear = inspectExplorerCamera(g, [g.wall]);
  assert(clear.bodyRays > 100);
  assert.equal(clear.blocked, 0);
  assert.deepEqual([...g.geometry.attributes.position.array], source);
  g.wall.position.z = 18;
  g.bone.position.x = 0;
  assert.equal(
    inspectExplorerCamera(g, [g.wall]).blocked,
    0,
    "scenery behind the body is not foreground occlusion",
  );
});

test("an open batched frame uses delivered triangles rather than its closed bounding box", (t) => {
  const g = fixture(t),
    left = new THREE.BoxGeometry(0.2, 3, 0.2),
    right = left.clone();
  left.translate(-1, 0, 0);
  right.translate(1, 0, 0);
  const merged = mergeGeometries([left, right]),
    frame = new THREE.Mesh(merged, g.wall.material);
  frame.position.copy(g.wall.position);
  t.after(() => {
    left.dispose();
    right.dispose();
    merged.dispose();
  });
  assert.equal(inspectExplorerCamera(g, [frame]).blocked, 0);
  assert.equal(
    inspectExplorerCamera(g, [g.wall]).fraction,
    1,
    "closed-frame control must block the body",
  );
  g.wall.visible = false;
  assert.equal(inspectExplorerCamera(g, [g.wall]).blocked, 0);
});

test("observer releases temporary surface geometry and materials on success and failure, retaining source assets", (t) => {
  const g = fixture(t);
  let geometries = 0,
    materials = 0;
  const disposeGeometry = THREE.BufferGeometry.prototype.dispose,
    disposeMaterial = THREE.MeshBasicMaterial.prototype.dispose;
  t.mock.method(THREE.BufferGeometry.prototype, "dispose", function () {
    geometries++;
    return disposeGeometry.call(this);
  });
  t.mock.method(THREE.MeshBasicMaterial.prototype, "dispose", function () {
    materials++;
    return disposeMaterial.call(this);
  });
  let sourceDisposals = 0;
  g.geometry.addEventListener("dispose", () => sourceDisposals++);
  g.wall.geometry.addEventListener("dispose", () => sourceDisposals++);
  inspectExplorerCamera(g, [g.wall]);
  assert.equal(geometries, 1);
  assert.equal(materials, 1);
  assert.equal(sourceDisposals, 0);
  const mesh = g.avatar.children[0],
    read = mesh.getVertexPosition;
  mesh.getVertexPosition = () => {
    throw Error("vertex read failed");
  };
  assert.throws(() => inspectExplorerCamera(g, [g.wall]), /vertex read failed/);
  mesh.getVertexPosition = read;
  assert.equal(geometries, 2);
  assert.equal(materials, 2);
  assert.equal(sourceDisposals, 0);
  g.avatar.visible = false;
  assert.throws(() => inspectExplorerCamera(g, [g.wall]), /visible explorer/);
  assert.equal(materials, 3);
  assert.equal(sourceDisposals, 0);
  const instances = new THREE.InstancedMesh(
    g.wall.geometry,
    g.wall.material,
    2,
  );
  assert.throws(() => inspectExplorerCamera(g, [instances]), /static meshes/);
  instances.dispose();
  assert.throws(
    () => inspectExplorerCamera(g, [], 0, 10),
    /sampling dimensions/,
  );
});

test("framing targets follow posed bone transforms and are owned by the current rig", () => {
  const parent = new THREE.Group(),
    model = new THREE.Group(),
    foot = new THREE.Bone();
  foot.name = "mixamorigLeftFoot";
  model.add(foot);
  parent.add(model);
  parent.position.set(3, 2, 1);
  const game = { rig: { model } };
  foot.position.set(0.4, 0.1, 0.2);
  assert.deepEqual(
    cameraBodyTargets(game)[0].position.toArray(),
    [3.4, 2.1, 1.2],
  );
  foot.position.y = -0.2;
  assert.equal(cameraBodyTargets(game)[0].position.y, 1.8);
  game.rig = { model: new THREE.Group() };
  assert.deepEqual(cameraBodyTargets(game), []);
  assert.equal(cameraBodyVisibility(null, new THREE.Vector3(), []), 1);
});

test("walking recovery clears a foot hidden by a column beside a clear central arm, then returns when the requested view clears", (t) => {
  const world = new THREE.Group(),
    surfaces = new CameraSurfaces(world),
    column = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.8, 0.3),
      new THREE.MeshStandardMaterial(),
    );
  column.position.set(0.27, 0.4, 2);
  world.add(column);
  surfaces.capture(column, { small: true });
  surfaces.rebuild();
  t.after(() => {
    column.geometry.dispose();
    column.material.dispose();
  });
  const model = new THREE.Group(),
    foot = new THREE.Bone();
  foot.name = "LeftFoot";
  foot.position.set(0.4, 0.1, 0);
  model.add(foot);
  const game = {
      rig: { model },
      camera: new THREE.PerspectiveCamera(),
      cameraSurfaces: surfaces,
      yaw: 0,
      pitch: 0,
    },
    target = new THREE.Vector3(0, 1.3, 0),
    desired = new THREE.Vector3(0, 1.5, 5.3);
  game.camera.position.copy(desired);
  game.cameraFollowTarget = target.clone();
  assert.equal(surfaces.entry(target, desired), 1, "central arm is clear");
  assert(
    cameraBodyVisibility(surfaces, desired, cameraBodyTargets(game)) < 1,
    "foot really is hidden",
  );
  for (let frame = 0; frame < 120; frame++)
    game.camera.position.copy(
      followClearCamera(game, target, desired, 1 / 60, () => true),
    );
  assert.equal(
    cameraBodyVisibility(
      surfaces,
      game.camera.position,
      cameraBodyTargets(game),
    ),
    1,
  );
  assert(game.cameraBodyRecovery);
  assert.equal(game.yaw, 0);
  assert.equal(game.pitch, 0);
  model.position.x = 3;
  target.x = desired.x = 3;
  game.camera.position.copy(desired);
  game.cameraFollowTarget.copy(target);
  const ordinary = followCamera(
    game.camera.position,
    target,
    desired,
    1 / 60,
    surfaces,
    () => true,
    target,
  );
  assert(
    followClearCamera(game, target, desired, 1 / 60, () => true).equals(
      ordinary,
    ),
  );
  assert.equal(game.cameraBodyRecovery, null);
});

test("aim, water and rope cameras discard walking detours without reading posed framing joints", (t) => {
  const g = fixture(t, true);
  g.bone.name = "LeftFoot";
  const target = g.avatar.position.clone(),
    desired = g.camera.position.clone();
  g.cameraSurfaces = {
    entry() {
      return 1;
    },
  };
  g.yaw = g.pitch = 0;
  g.cameraFollowTarget = target.clone();
  const expected = followCamera(
    g.camera.position,
    target,
    desired,
    1 / 60,
    g.cameraSurfaces,
    () => true,
    target,
  );
  for (const flag of ["aiming", "swimming", "diving", "ropeRide"]) {
    g[flag] = true;
    g.cameraBodyRecovery = [0.3, 0];
    assert(
      followClearCamera(g, target, desired, 1 / 60, () => true).equals(
        expected,
      ),
    );
    assert.equal(g.cameraBodyRecovery, null);
    assert.equal(
      g.rig.cameraBodyBones,
      undefined,
      "exempt views need no body-joint traversal",
    );
    g[flag] = false;
  }
});

test("a clear body detour remains stable while terrain still shortens the requested arm, then yields when it opens", () => {
  const model = new THREE.Group(),
    foot = new THREE.Bone();
  foot.name = "LeftFoot";
  foot.position.set(0.4, 0.1, 0);
  model.add(foot);
  const target = new THREE.Vector3(0, 1.3, 0),
    desired = new THREE.Vector3(0, 1.5, 5.3),
    detour = target
      .clone()
      .add(new THREE.Vector3(Math.sin(1.2) * 5.3, 0.2, Math.cos(1.2) * 5.3)),
    surfaces = new CameraSurfaces(new THREE.Group()),
    game = {
      rig: { model },
      camera: new THREE.PerspectiveCamera(),
      cameraSurfaces: surfaces,
      yaw: 0,
      pitch: 0,
      cameraBodyRecovery: [1.2, 0],
      cameraFollowTarget: target.clone(),
    },
    space = (p) => p.x > 1 || p.z < 2.7;
  game.camera.position.copy(detour);
  assert.equal(
    cameraBodyVisibility(surfaces, desired, cameraBodyTargets(game)),
    1,
    "requested body rays are clear despite the terrain restriction",
  );
  const ordinary = followCamera(
    game.camera.position,
    target,
    desired,
    1 / 60,
    surfaces,
    space,
    target,
  );
  assert(
    ordinary.distanceTo(target) > 3.2,
    "interpolated view is still comfortable",
  );
  assert(
    ordinary.distanceTo(detour) > 0.2,
    "ordinary follow starts falling back toward the shortened arm",
  );
  for (let frame = 0; frame < 120; frame++) {
    game.camera.position.copy(
      followClearCamera(game, target, desired, 1 / 60, space),
    );
    assert(game.camera.position.distanceTo(detour) < 1e-8);
    assert.deepEqual(game.cameraBodyRecovery, [1.2, 0]);
  }
  const opened = followCamera(
    game.camera.position,
    target,
    desired,
    1 / 60,
    surfaces,
    () => true,
    target,
  );
  assert(
    followClearCamera(game, target, desired, 1 / 60, () => true).equals(opened),
  );
  assert.equal(game.cameraBodyRecovery, null);
  assert.equal(game.yaw, 0);
  assert.equal(game.pitch, 0);
});

test("a detour selected for a short arm is retained before a clear interpolated arm can fall back into the obstruction", () => {
  const model = new THREE.Group(),
    foot = new THREE.Bone();
  foot.name = "LeftFoot";
  foot.position.set(0.4, 0.1, 0);
  model.add(foot);
  const target = new THREE.Vector3(0, 1.3, 0),
    desired = new THREE.Vector3(0, 1.5, 5.3),
    surfaces = new CameraSurfaces(new THREE.Group()),
    game = {
      rig: { model },
      camera: new THREE.PerspectiveCamera(),
      cameraSurfaces: surfaces,
      yaw: 0,
      pitch: 0,
      cameraFollowTarget: target.clone(),
    },
    space = (p) => p.x > 1 || p.z < 2.7;
  game.camera.position.set(0, 1.4, 2.4);
  game.camera.position.copy(
    followClearCamera(game, target, desired, 1 / 60, space),
  );
  assert(
    game.cameraBodyRecovery,
    "short-arm recovery must save its selected view even with clear body rays",
  );
  const arms = [];
  for (let frame = 0; frame < 240; frame++) {
    game.camera.position.copy(
      followClearCamera(game, target, desired, 1 / 60, space),
    );
    assert(space(game.camera.position));
    assert(game.cameraBodyRecovery);
    if (frame >= 180) arms.push(game.camera.position.distanceTo(target));
  }
  assert(Math.min(...arms) > 3.2);
  assert(
    Math.max(...arms) - Math.min(...arms) < 1e-6,
    "no repeated contraction back into the blocked arm",
  );
});
