import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { RoofCamera } from "../src/roof-camera.js";
import { monasteryRoofGeometry } from "../src/monastery-roof.js";
import { CameraSurfaces, boxEntry } from "../src/camera-collision.js";

test("roof camera cells match delivered slate and snow from above, below and oblique rays, including broken corners", () => {
  let hits = 0,
    voids = 0;
  for (const snow of [false, true])
    for (const damage of [0, 2]) {
      const geometry = monasteryRoofGeometry({
          width: 10,
          depth: 8,
          rise: 2,
          seed: 4,
          snow,
          damage,
        }),
        kernel = new RoofCamera(geometry),
        mesh = new T.Mesh(
          geometry,
          new T.MeshStandardMaterial({ side: T.DoubleSide }),
        ),
        ray = new T.Raycaster();
      const probes = [];
      for (const x of [-5.2, -4.7, -3.4, -1.1, 0, 1.4, 3.7, 4.9, 5.2])
        for (const z of [-4.2, -3.8, -2.1, 0, 1.6, 3.7, 4.2]) {
          probes.push(
            [new T.Vector3(x, 5, z), new T.Vector3(x, -1, z)],
            [new T.Vector3(x, -1, z), new T.Vector3(x, 5, z)],
          );
        }
      for (const z of [-3.7, -1.5, 0, 2.5, 3.7])
        probes.push([new T.Vector3(-6, 3, z), new T.Vector3(6, -0.2, z)]);
      for (const [a, b] of probes) {
        ray.set(a, b.clone().sub(a).normalize());
        ray.far = a.distanceTo(b);
        const rendered = ray.intersectObject(mesh)[0],
          collision = kernel.entry(a, b, 0);
        if (rendered) {
          assert(collision !== null);
          assert(Math.abs(collision * ray.far - rendered.distance) < 2e-5);
          hits++;
        } else {
          assert.equal(collision, null);
          voids++;
        }
      }
      mesh.material.dispose();
      geometry.dispose();
    }
  assert(hits > 200 && voids > 100);
});

test("roof camera clearance leaves air under a hip open and protects the near plane outside its eave", () => {
  const geometry = monasteryRoofGeometry({ width: 10, depth: 8, rise: 2 }),
    kernel = new RoofCamera(geometry);
  geometry.computeBoundingBox();
  const a = new T.Vector3(-2, -1, 0),
    b = new T.Vector3(-2, 0.5, 0);
  assert.notEqual(
    boxEntry(a, b, geometry.boundingBox, 0),
    null,
    "full roof box would falsely close this air space",
  );
  assert.equal(kernel.entry(a, b, 0), null);
  const from = new T.Vector3(5.1, 4, 0),
    to = new T.Vector3(5.1, -1, 0);
  assert.equal(kernel.entry(from, to, 0), null);
  assert.notEqual(kernel.entry(from, to, 0.24), null);
  from.x = to.x = 5.4;
  assert.equal(kernel.entry(from, to, 0.24), null);
  geometry.dispose();
});

test("captured roof kernels survive render disposal and honor translated rotated parents", () => {
  const world = new T.Group(),
    root = new T.Group();
  root.position.set(70, 8, -50);
  root.rotation.y = 0.6;
  world.add(root);
  const geometry = monasteryRoofGeometry({ width: 10, depth: 8, rise: 2 }),
    mesh = new T.Mesh(geometry, new T.MeshStandardMaterial()),
    kernel = new RoofCamera(geometry);
  root.add(mesh);
  const camera = new CameraSurfaces(world);
  camera.capture(mesh, { small: true, thin: true, kernel });
  camera.rebuild();
  world.updateMatrixWorld(true);
  const a = new T.Vector3(2, 5, 1).applyMatrix4(mesh.matrixWorld),
    b = new T.Vector3(2, -1, 1).applyMatrix4(mesh.matrixWorld),
    ray = new T.Raycaster(a, b.clone().sub(a).normalize());
  ray.far = a.distanceTo(b);
  const hit = ray.intersectObject(mesh)[0];
  assert(hit);
  assert(Math.abs(camera.entry(a, b, 0) * ray.far - hit.distance) < 2e-5);
  root.remove(mesh);
  geometry.dispose();
  mesh.material.dispose();
  assert(Math.abs(camera.entry(a, b, 0) * ray.far - hit.distance) < 2e-5);
});
