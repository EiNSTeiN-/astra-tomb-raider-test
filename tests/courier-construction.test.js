import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  buildCourierConstruction,
  courierPulleyGeometry,
  courierPavingGeometry,
} from "../src/courier-construction.js";
import { courierPlatforms, normalizeCourier } from "../src/courier-rules.js";
import { updateCourierArt } from "../src/courier-ferry.js";
import { CameraSurfaces } from "../src/camera-collision.js";

function fixture() {
  const root = new THREE.Group(),
    car = new THREE.Group(),
    fixed = new THREE.Group();
  root.add(car, fixed);
  car.userData.cameraDynamic = true;
  const h = {
    root,
    car,
    x: 220,
    y: 9.466345697011473,
    trim: 1,
    wind: 0.8,
    time: 0,
    velocity: 2,
    recall: null,
    platforms: courierPlatforms(9.466345697011473),
    solids: [],
    sources: [],
    signs: [],
    pulleys: [],
    saved: normalizeCourier(null),
  };
  const game = {
    world: root,
    courierFerry: h,
    cameraSurfaces: new CameraSurfaces(root),
    paused: false,
  };
  const old = globalThis.document,
    load = THREE.TextureLoader.prototype.load;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  THREE.TextureLoader.prototype.load = () => new THREE.Texture();
  try {
    buildCourierConstruction(game, h, fixed);
  } finally {
    globalThis.document = old;
    THREE.TextureLoader.prototype.load = load;
  }
  updateCourierArt(game);
  root.updateMatrixWorld(true);
  game.cameraSurfaces.rebuild();
  return { game, h };
}
const worldVertex = (mesh, index) =>
  new THREE.Vector3()
    .fromBufferAttribute(mesh.geometry.attributes.position, index)
    .applyMatrix4(mesh.matrixWorld);

test("sail keeps its full width, gathers toward the head and stays above the explorer across trim and wind states", () => {
  const { game, h } = fixture();
  for (const trim of [-1, -0.7, -0.3, 0, 0.3, 0.7, 1])
    for (const wind of [-1.2, 0, 1.2]) {
      h.trim = trim;
      h.wind = wind;
      h.time += 0.31;
      updateCourierArt(game);
      h.root.updateMatrixWorld(true);
      const topA = worldVertex(h.cloth, 0),
        topB = worldVertex(h.cloth, 40),
        bottomA = worldVertex(h.cloth, 28 * 41),
        bottomB = worldVertex(h.cloth, 29 * 41 - 1);
      assert(Math.abs(topA.distanceTo(topB) - 4) < 1e-5);
      assert(Math.abs(bottomA.distanceTo(bottomB) - 4) < 1e-5);
      assert(Math.abs(topA.y - h.y - 5.6) < 1e-5);
      assert(bottomA.y >= h.y + 2.79);
      if (trim === 0)
        assert(
          bottomA.y > h.y + 5.3,
          "furled cloth rises toward the upper yard",
        );
      h.batten.traverse((m) => {
        if (m.geometry)
          for (let i = 0; i < m.geometry.attributes.position.count; i++)
            assert(
              worldVertex(m, i).y > h.y + 2.65,
              "lower batten clears the operator",
            );
      });
    }
});
test("all four rigging ends follow rendered cloth corners, and the wind emitter follows the cloth itself", () => {
  const { game, h } = fixture(),
    g = h.rigging.geometry,
    { segments, sides } = g.userData.line;
  const buffer = g.attributes.position.array;
  for (let i = 0; i <= 40; i++) {
    h.trim = -1 + i / 20;
    h.wind = Math.sin(i);
    h.x = 126 + i * 4.7;
    h.time = i * 0.7;
    updateCourierArt(game);
    h.root.updateMatrixWorld(true);
    const corners = [0, 40, 28 * 41, 29 * 41 - 1];
    for (let line = 0; line < 4; line++) {
      const point = new THREE.Vector3();
      for (let j = 0; j < sides; j++)
        point.add(
          worldVertex(
            h.rigging,
            line * (segments + 1) * (sides + 1) + segments * (sides + 1) + j,
          ),
        );
      point.divideScalar(sides);
      assert(point.distanceTo(worldVertex(h.cloth, corners[line])) < 1e-5);
    }
    const center = worldVertex(h.cloth, 14 * 41 + 20),
      wind = h.sources.find((s) => s.id === "courier-sail");
    assert(center.distanceTo(new THREE.Vector3(wind.x, wind.y, wind.z)) < 1e-5);
    const rope = h.sources.find((s) => s.id === "courier-rope"),
      axle = h.pulleys[0].getWorldPosition(new THREE.Vector3());
    assert(
      Math.abs(rope.x - axle.x) < 1e-5 && Math.abs(rope.y - axle.y) < 1e-5,
    );
  }
  assert.equal(
    g.attributes.position.array,
    buffer,
    "rigging updates reuse their buffers",
  );
});
test("cable wheels have an open bearing bore and a groove tangent to the track without cable penetration", () => {
  const geometry = courierPulleyGeometry(),
    mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  ray.set(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, 0, -1));
  assert.equal(ray.intersectObject(mesh).length, 0, "shaft bore is open");
  for (let z = -0.075; z <= 0.075; z += 0.005) {
    ray.set(new THREE.Vector3(0, -0.325, z), new THREE.Vector3(0, 1, 0));
    const hit = ray.intersectObject(mesh)[0];
    assert(hit);
    const cableRadius = Math.sqrt(Math.max(0, 0.075 ** 2 - z ** 2));
    assert(
      hit.distance >= cableRadius - 1e-6,
      "track remains outside the solid groove",
    );
    if (Math.abs(z) < 1e-8)
      assert(
        Math.abs(hit.distance - 0.075) < 1e-6,
        "loaded groove meets the cable crown",
      );
  }
});
test("recessed paving seams retain a shallow continuous backing instead of exposing daylight through the dock", () => {
  const geometry = courierPavingGeometry(7, 4, 38111),
    mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  let joints = 0;
  for (let x = -6.8; x < 6.8; x += 0.21)
    for (let z = -3.8; z < 3.8; z += 0.19) {
      ray.set(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0];
      assert(hit, "paving has a solid backing");
      assert(hit.point.y <= 0.001 && hit.point.y >= -0.035);
      if (hit.point.y < -0.02) joints++;
    }
  assert(joints > 10, "sample includes recessed joints");
});
test("batched materials retain their authored coordinates, finite geometry, shared label atlas and moving camera surfaces", () => {
  const { h, game } = fixture(),
    maps = new Set();
  let meshes = 0,
    triangles = 0;
  h.root.traverse((m) => {
    if (!m.geometry) return;
    meshes++;
    const p = m.geometry.attributes.position;
    triangles += (m.geometry.index?.count ?? p.count) / 3;
    for (const name of ["position", "normal", "uv"])
      assert(
        [...m.geometry.attributes[name].array].every(Number.isFinite),
        name,
      );
    if (m.material.userData.windMetal) {
      assert(m.geometry.attributes.windCoord);
      assert(m.geometry.attributes.windCavity);
    }
    if (m.material.vertexColors) assert(m.geometry.attributes.color);
    if (m.material.name === "Courier engraved labels") maps.add(m.material.map);
  });
  assert.equal(maps.size, 1);
  assert(meshes < 59, "batching reduces the original 59 source meshes");
  assert(triangles < 100000);
  assert(game.cameraSurfaces.dynamic.length > 0);
  const old = game.cameraSurfaces.dynamic[0].parent.matrixWorld.clone();
  h.x += 10;
  updateCourierArt(game);
  h.root.updateMatrixWorld(true);
  assert(!game.cameraSurfaces.dynamic[0].parent.matrixWorld.equals(old));
});
