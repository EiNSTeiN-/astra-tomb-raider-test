import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  solarCastingGeometry,
  solarPlateGeometry,
  addSolarPedestal,
  addSolarReflectorFrame,
} from "../src/solar-instrument-art.js";

function closedSolid(geometry) {
  const p = geometry.attributes.position,
    ids = geometry.index?.array || Array.from({ length: p.count }, (_, i) => i),
    edges = new Map();
  let volume = 0,
    triangles = 0;
  for (let i = 0; i < ids.length; i += 3) {
    const vertices = [...ids.slice(i, i + 3)].map((id) =>
        new THREE.Vector3().fromBufferAttribute(p, id),
      ),
      [a, b, c] = vertices,
      area = b.clone().sub(a).cross(c.clone().sub(a));
    if (area.lengthSq() < 1e-18) continue;
    triangles++;
    volume += a.dot(b.clone().cross(c)) / 6;
    const keys = vertices.map((v) =>
      v
        .toArray()
        .map((x) => Math.round(x * 1e6))
        .join(","),
    );
    for (let j = 0; j < 3; j++) {
      const key = [keys[j], keys[(j + 1) % 3]].sort().join("/");
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  assert(triangles > 40);
  assert(volume > 0);
  assert(
    [...edges.values()].every((count) => count === 2),
    "delivered surfaces close at material seams",
  );
}

test("solar turned bases and chamfered frame shells are closed outward solids with real openings", () => {
  const casting = solarCastingGeometry([
      [0, -1.2],
      [0.83, -1.2],
      [0.83, 0.045],
      [0.68, 0.45],
      [0, 0.45],
    ]),
    frame = solarPlateGeometry(2.03, 1.864, 0.144, [1.75, 1.49]),
    plate = solarPlateGeometry(1.95, 1.76, 0.064),
    material = new THREE.MeshStandardMaterial(),
    mesh = new THREE.Mesh(frame, material),
    ray = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    );
  for (const geometry of [casting, frame, plate]) closedSolid(geometry);
  assert.equal(
    ray.intersectObject(mesh).length,
    0,
    "frame aperture contains no hidden bronze face",
  );
  ray.ray.origin.x = 0.96;
  assert(ray.intersectObject(mesh).length > 0, "frame has solid side metal");
  const p = casting.attributes.position,
    uv = casting.attributes.uv;
  let caps = 0;
  for (let i = 0; i < p.count; i += 3) {
    const [a, b, c] = [i, i + 1, i + 2].map((j) =>
        new THREE.Vector3().fromBufferAttribute(p, j),
      ),
      area = b.clone().sub(a).cross(c.clone().sub(a));
    if (
      area.lengthSq() < 1e-18 ||
      Math.hypot(area.x, area.z) > Math.abs(area.y) * 1e-6
    )
      continue;
    const [u, v, w] = [i, i + 1, i + 2].map((j) =>
      new THREE.Vector2().fromBufferAttribute(uv, j),
    );
    assert(
      Math.abs((v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x)) > 1e-10,
    );
    caps++;
  }
  assert(caps >= 64, "both flat ends have two-dimensional UV patches");
  for (const geometry of [casting, frame, plate]) geometry.dispose();
  material.dispose();
});

test("whole solar base footprints bury into diagonal terrain and castings bear the frames below the glass", () => {
  const materials = {
      stone: new THREE.MeshStandardMaterial(),
      bronze: new THREE.MeshStandardMaterial(),
    },
    game = {
      groundHeight: (x, z) => x * 0.62 - z * 0.18,
      terrainProfile: { step: 1.75 },
      cameraSurfaces: null,
    },
    ray = new THREE.Raycaster();
  for (const kind of ["mirror", "source", "receiver"]) {
    const group = new THREE.Group();
    group.position.set(2.1, game.groundHeight(2.1, 2.7), 2.7);
    const base = addSolarPedestal(game, group, 3.7, materials, kind);
    group.updateMatrixWorld(true);
    for (const radius of [
      0,
      base.radius * 0.33,
      base.radius * 0.66,
      base.radius * 0.97,
    ])
      for (let i = 0; i < (radius ? 32 : 1); i++) {
        const angle = (i * Math.PI) / 16,
          x = group.position.x + Math.cos(angle) * radius,
          z = group.position.z + Math.sin(angle) * radius;
        ray.set(
          new THREE.Vector3(x, base.bottom - 1, z),
          new THREE.Vector3(0, 1, 0),
        );
        const hit = ray.intersectObject(group, true)[0];
        assert(hit && hit.point.y - game.groundHeight(x, z) < -0.17);
      }
    if (kind === "mirror") {
      const pivot = new THREE.Group();
      pivot.position.y = 3.7;
      group.add(pivot);
      addSolarReflectorFrame(game, pivot, materials.bronze, 4);
      group.updateMatrixWorld(true);
      ray.set(
        new THREE.Vector3(
          group.position.x,
          group.position.y + 3.7 - 1.3,
          group.position.z,
        ),
        new THREE.Vector3(0, 1, 0),
      );
      const frame = ray.intersectObject(pivot, true)[0];
      ray.set(
        new THREE.Vector3(
          group.position.x,
          group.position.y + 3.7 - 0.7,
          group.position.z,
        ),
        new THREE.Vector3(0, -1, 0),
      );
      const bearing = ray.intersectObjects(
        group.children.filter((m) => m.isMesh),
        false,
      )[0];
      assert(
        bearing && frame && bearing.point.y >= frame.point.y - 1e-6,
        "bearing touches the underside rather than leaving an air gap",
      );
      ray.set(
        new THREE.Vector3(
          group.position.x,
          group.position.y + 3.7 - 0.35,
          group.position.z + 0.65,
        ),
        new THREE.Vector3(0, 0, -1),
      );
      const hits = ray.intersectObject(group, true);
      assert(
        hits.every((hit) => hit.distance > 0.65),
        "spindle never crosses the front glass plane",
      );
    }
    group.traverse((m) => m.geometry?.dispose());
  }
  materials.stone.dispose();
  materials.bronze.dispose();
});

test("short source pillars protect the follow sight line despite the default camera size threshold", () => {
  const world = new THREE.Group(),
    group = new THREE.Group(),
    materials = {
      stone: new THREE.MeshStandardMaterial(),
      bronze: new THREE.MeshStandardMaterial(),
    },
    game = {
      groundHeight: () => 0,
      terrainProfile: { step: 1.75 },
      cameraSurfaces: new CameraSurfaces(world),
    };
  world.add(group);
  addSolarPedestal(game, group, 2.7, materials, "source");
  game.cameraSurfaces.rebuild();
  const target = new THREE.Vector3(1.4, 1.3, 0),
    eye = new THREE.Vector3(-3.8, 2.45, 0),
    ray = new THREE.Raycaster(
      target,
      eye.clone().sub(target).normalize(),
      0,
      target.distanceTo(eye),
    ),
    hit = ray.intersectObject(world, true)[0],
    entry = game.cameraSurfaces.entry(target, eye);
  assert(hit, "actual short pillar intersects the body sight line");
  assert(
    entry < hit.distance / target.distanceTo(eye),
    "rounded camera clearance catches that actual obstruction before the lens passes through it",
  );
  world.traverse((m) => m.geometry?.dispose());
  materials.stone.dispose();
  materials.bronze.dispose();
});
