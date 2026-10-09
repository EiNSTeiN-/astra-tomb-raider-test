import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { coursePlan, hasTraversalCourse } from "../src/traversal-courses.js";
import { climbingMaterials } from "../src/traversal-art.js";
import { buildReturnCable, updateReturnCable } from "../src/return-cable.js";
import { mergeArchitecture } from "../src/visuals.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  captureCableParts,
  cablePartContains,
  cablePartClosed,
} from "../scripts/inspect-cable-parts.js";

function disposeWorld(game) {
  const geometries = new Set(),
    materials = new Set(Object.values(game.climbingMaterials || {})),
    textures = new Set();
  if (game.stoneMat) materials.add(game.stoneMat);
  game.world.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) materials.add(o.material);
  });
  for (const m of materials)
    for (const value of Object.values(m))
      if (value?.isTexture) textures.add(value);
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
  for (const t of textures) t.dispose();
}

test("the geometry observer retains uncaptured closed pieces after batching and camera rebuild, and detects deliberate overlaps", async () => {
  const world = new THREE.Group(),
    fixed = new THREE.Group(),
    material = new THREE.MeshStandardMaterial(),
    camera = new CameraSurfaces(world);
  world.add(fixed);
  const originalRemove = THREE.Object3D.prototype.remove;
  const observer = await captureCableParts(() => {
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.5, 0.6),
        material,
      );
      mesh.position.set(i * 2, 0, 0);
      mesh.rotation.y = i * 0.4;
      fixed.add(mesh);
      camera.capture(mesh); // These small rendered blocks fail the camera filter.
    }
    mergeArchitecture(fixed);
    camera.rebuild();
  });
  try {
    assert.equal(THREE.Object3D.prototype.remove, originalRemove);
    assert.equal(camera.pending.length, 0);
    assert.equal(camera.count, 0);
    const parts = observer.partsFor({
      fixed,
      winchRoot: new THREE.Group(),
      ornaments: [],
    });
    assert.equal(fixed.children.length, 1);
    assert.equal(parts.length, 3);
    world.updateMatrixWorld(true);
    observer.update(parts);
    for (let i = 0; i < parts.length; i++) {
      assert(cablePartClosed(parts[i]));
      assert(
        cablePartContains(parts[i], new THREE.Vector3(i * 2, 0, 0)),
        "real interior detected",
      );
      assert(
        !cablePartContains(parts[i], new THREE.Vector3(i * 2 + 0.8, 0, 0)),
        "empty space stays clear",
      );
    }
  } finally {
    observer.dispose();
    disposeWorld({ world });
  }
});

test("277,200 delivered sheave vertex records clear independently observed terminal pieces on all 21 cable paths", async (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const failures = [],
    point = new THREE.Vector3(),
    ray = new THREE.Raycaster(),
    wheelBox = new THREE.Box3();
  let samples = 0,
    courses = 0,
    partsCount = 0,
    openCount = 0,
    controls = 0,
    candidateRays = 0;
  for (const level of LEVELS) {
    const map = createMap(level),
      terrain = createTerrainProfile(map, level),
      game = {
        level,
        map,
        world: new THREE.Group(),
        groundHeight: terrain.height,
        obstacles: [],
        stoneMat: new THREE.MeshStandardMaterial(),
        traversalCourses: [],
      };
    game.cameraSurfaces = new CameraSurfaces(game.world);
    const observer = await captureCableParts(() => {
      game.climbingMaterials = climbingMaterials(game);
      for (const feature of map.features.filter(
        (f) => f.type === "field" && hasTraversalCourse(level, f),
      )) {
        const plan = coursePlan(level, feature),
          base = game.groundHeight(feature.x * 7, feature.z * 7),
          root = new THREE.Group();
        game.world.add(root);
        const course = {
          ...plan,
          root,
          launch: new THREE.Vector3(
            plan.launchPoint.x,
            base + 8.4,
            plan.launchPoint.z,
          ),
          exit: new THREE.Vector3(
            plan.exitPoint.x,
            game.groundHeight(plan.exitPoint.x, plan.exitPoint.z),
            plan.exitPoint.z,
          ),
          zip: { visible: false },
        };
        buildReturnCable(game, course, game.climbingMaterials);
        game.traversalCourses.push(course);
      }
      game.cameraSurfaces.rebuild();
    });
    try {
      assert.equal(game.cameraSurfaces.pending.length, 0);
      for (const course of game.traversalCourses) {
        const parts = observer.partsFor(course.zipRig);
        assert(
          parts.length > 50,
          `${level.id}/${course.id}: terminal pieces retained`,
        );
        for (const part of parts) part.closed = cablePartClosed(part);
        const closed = parts.filter((p) => p.closed),
          open = parts.filter((p) => !p.closed);
        assert(closed.length > 30);
        partsCount += parts.length;
        openCount += open.length;
        courses++;
        course.zip.visible = true;
        for (let step = 0; step <= 32; step++) {
          course.zipRig.travel = step / 32;
          updateReturnCable(game, course, 0);
          game.world.updateMatrixWorld(true);
          observer.update(parts);
          for (const wheel of course.zipRig.wheels) {
            wheel.geometry.computeBoundingBox();
            wheelBox
              .copy(wheel.geometry.boundingBox)
              .applyMatrix4(wheel.matrixWorld);
            // Open decorative tubes cannot use a volume-parity query. Their
            // complete delivered bounds must be disjoint from the sheave mesh.
            for (const part of open)
              assert(
                !part.bounds.intersectsBox(wheelBox),
                `${level.id}/${course.id}: open ornament near sheave`,
              );
            const positions = wheel.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
              point
                .fromBufferAttribute(positions, i)
                .applyMatrix4(wheel.matrixWorld);
              samples++;
              for (const part of closed) {
                if (!part.bounds.containsPoint(point)) continue;
                candidateRays++;
                if (cablePartContains(part, point, ray)) {
                  failures.push(
                    `${level.id}/${course.id}: travel ${step}/32, vertex ${i}`,
                  );
                  break;
                }
              }
            }
          }
        }
        // A clear path must not hide an empty observer. Move a copied real
        // closed piece onto a delivered sheave vertex; restore it afterward.
        const control = closed[0],
          center = control.bounds.getCenter(new THREE.Vector3()),
          wheel = course.zipRig.wheels[0];
        point
          .fromBufferAttribute(wheel.geometry.attributes.position, 0)
          .applyMatrix4(wheel.matrixWorld);
        const delta = point.clone().sub(center);
        control.mesh.matrixWorld.premultiply(
          new THREE.Matrix4().makeTranslation(delta.x, delta.y, delta.z),
        );
        control.bounds
          .copy(control.mesh.geometry.boundingBox)
          .applyMatrix4(control.mesh.matrixWorld);
        assert(
          cablePartContains(control, point, ray),
          `${level.id}/${course.id}: injected intersection detected`,
        );
        controls++;
        observer.update(parts);
      }
    } finally {
      observer.dispose();
      disposeWorld(game);
    }
  }
  assert.equal(courses, 21);
  assert.equal(controls, 21);
  assert.equal(samples, 277200);
  assert.deepEqual(failures, []);
  t.diagnostic(
    JSON.stringify({
      courses,
      samples,
      partsCount,
      openCount,
      controls,
      candidateRays,
    }),
  );
});
