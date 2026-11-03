import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { echoWalls } from "../src/echo-gallery-rules.js";
import {
  galleryWallGeometry,
  galleryBackingGeometry,
} from "../src/echo-gallery-masonry.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { stoneBlockGeometry } from "../src/temple-architecture.js";

// Match delivered seed slots: five blocks for each of 32 paving cells,
// followed by five slots per fixed wall and four per moving shutter.
function wallSeed(wall) {
  let serial = 19000 + 32 * 5;
  for (const candidate of echoWalls()) {
    if (
      candidate.x === wall.x &&
      candidate.z === wall.z &&
      candidate.w === wall.w &&
      candidate.d === wall.d
    )
      return serial;
    serial += candidate.after ? 4 : 5;
  }
  throw Error("Unknown gallery wall");
}

function closedTriangles(geometry) {
  const p = geometry.attributes.position,
    ids = geometry.index,
    count = ids?.count ?? p.count,
    edges = new Map();
  assert(p.array.every(Number.isFinite));
  for (let i = 0; i < count; i += 3) {
    const keys = [0, 1, 2].map((j) =>
      new T.Vector3()
        .fromBufferAttribute(p, ids ? ids.getX(i + j) : i + j)
        .toArray()
        .join(","),
    );
    assert(new Set(keys).size === 3, "nondegenerate triangle vertices");
    for (let j = 0; j < 3; j++) {
      const a = keys[j],
        b = keys[(j + 1) % 3],
        key = [a, b].sort().join("/"),
        edge = edges.get(key) ?? { count: 0, direction: 0 };
      edge.count++;
      edge.direction += a < b ? 1 : -1;
      edges.set(key, edge);
    }
  }
  assert(
    [...edges.values()].every((e) => e.count === 2 && e.direction === 0),
    "closed, consistently wound component edges",
  );
  return count / 3;
}

test("all gallery facings and the joined backing have closed finite geometry within the wall envelope", (t) => {
  const walls = echoWalls().filter((w) => !w.after);
  let triangles = 0;
  for (const [index, wall] of walls.entries()) {
    const geometries = galleryWallGeometry(wall, wallSeed(wall));
    try {
      for (const geometry of Object.values(geometries)) {
        triangles += closedTriangles(geometry);
        const p = geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          assert(Math.abs(p.getX(i)) < wall.w / 2 + 0.4);
          assert(Math.abs(p.getZ(i)) < wall.d / 2 + 0.4);
          assert(p.getY(i) >= -0.4 && p.getY(i) <= 6.904);
        }
      }
    } finally {
      for (const geometry of Object.values(geometries)) geometry.dispose();
    }
  }
  const backing = galleryBackingGeometry(walls);
  try {
    triangles += closedTriangles(backing);
  } finally {
    backing.dispose();
  }
  t.diagnostic(
    `${triangles} closed triangles across ${walls.length} permanent walls and their joined backing`,
  );
});

test("rendered joints, collinear connections, caps and bases cover independent rays and stop the camera", (t) => {
  const map = createMap(LEVELS[6]),
    profile = createTerrainProfile(map, LEVELS[6]),
    rootY = profile.surfaceHeight(21, 56),
    surface = (x, z) => profile.surfaceHeight(x, z) - rootY,
    walls = echoWalls().filter((w) => !w.after),
    material = new T.MeshStandardMaterial({ side: T.DoubleSide }),
    world = new T.Group(),
    camera = new CameraSurfaces(world),
    ray = new T.Raycaster(),
    backing = new T.Mesh(galleryBackingGeometry(walls, surface), material),
    assembled = [],
    resources = new Set([backing.geometry]);
  world.add(backing);
  let probes = 0,
    baseProbes = 0,
    exposedOriginalBases = 0,
    joinProbes = 0;
  try {
    for (const [index, wall] of walls.entries()) {
      const geometries = galleryWallGeometry(wall, wallSeed(wall), surface),
        meshes = [];
      for (const geometry of Object.values(geometries)) {
        resources.add(geometry);
        const mesh = new T.Mesh(geometry, material);
        mesh.position.set(wall.x, 0, wall.z);
        world.add(mesh);
        camera.capture(mesh);
        meshes.push(mesh);
      }
      assembled.push({ wall, meshes, index });
    }
    world.updateMatrixWorld(true);
    camera.rebuild();
    for (const { wall, meshes, index } of assembled) {
      const vertical = wall.d > wall.w,
        half = Math.max(wall.w, wall.d) / 2,
        thickness = Math.min(wall.w, wall.d),
        alongSamples = [];
      for (let along = -half + 0.06; along <= half - 0.06; along += 0.23)
        alongSamples.push({ along, join: false });
      for (const side of [-1, 1]) {
        const end = vertical ? wall.z + side * half : wall.x + side * half;
        if (
          walls.some(
            (other) =>
              other !== wall &&
              other.d > other.w === vertical &&
              Math.abs(vertical ? other.x - wall.x : other.z - wall.z) < 1e-6 &&
              Math.abs(
                Math.abs((vertical ? other.z : other.x) - end) -
                  Math.max(other.w, other.d) / 2,
              ) < 1e-6,
          )
        )
          alongSamples.push({ along: side * half, join: true });
      }
      const original = new T.Mesh(
        stoneBlockGeometry(wall.w, 1.7, wall.d, wallSeed(wall)).translate(
          0,
          0.85,
          0,
        ),
        material,
      );
      original.position.set(wall.x, 0, wall.z);
      original.updateMatrixWorld();
      resources.add(original.geometry);
      for (const { along, join } of alongSamples)
        for (const side of [-1, 1]) {
          const wx = wall.x + (vertical ? 0 : along),
            wz = wall.z + (vertical ? along : 0),
            floor = surface(
              wx + (vertical ? side * 0.31 : 0),
              wz + (vertical ? 0 : side * 0.31),
            );
          const outsideX = wx + (vertical ? side * 2 : 0),
            outsideZ = wz + (vertical ? 0 : side * 2);
          // A ray beginning inside an adjoining wall has no exposed near face.
          // The union deliberately removes those internal junction surfaces.
          if (
            walls.some(
              (other) =>
                other !== wall &&
                Math.abs(outsideX - other.x) < other.w / 2 + 0.09 &&
                Math.abs(outsideZ - other.z) < other.d / 2 + 0.09,
            )
          )
            continue;
          for (const height of [
            floor - 0.01,
            0.005,
            0.5,
            ...[1, 2, 3, 4, 5].map((i) => (i * 6.8) / 6),
            6.75,
            6.82,
            6.89,
          ]) {
            const origin = new T.Vector3(
                wx + (vertical ? side * 2 : 0),
                height,
                wz + (vertical ? 0 : side * 2),
              ),
              direction = new T.Vector3(
                vertical ? -side : 0,
                0,
                vertical ? 0 : -side,
              );
            ray.set(origin, direction);
            const hit = ray.intersectObjects([...meshes, backing], false)[0];
            assert(hit, `uncovered ${index}/${along}/${height}/${side}`);
            const depth = vertical
              ? Math.abs(hit.point.x - wall.x)
              : Math.abs(hit.point.z - wall.z);
            assert(
              depth >= thickness / 2 - 0.055 && depth <= thickness / 2 + 0.088,
              `surface depth ${depth}: wall ${index}, along ${along}, join ${join}, height ${height}, side ${side}`,
            );
            if (height >= 0)
              assert(
                camera.entry(
                  origin,
                  origin.clone().addScaledVector(direction, 4),
                  0.18,
                ) <
                  hit.distance / 4,
                "camera stops before rendered stone",
              );
            else {
              baseProbes++;
              if (floor < -0.03 && !ray.intersectObject(original)[0])
                exposedOriginalBases++;
            }
            probes++;
            if (join) joinProbes++;
          }
        }
    }
    assert(
      exposedOriginalBases > 20,
      "published course bases reproduce the sampled footing gaps",
    );
    assert(joinProbes > 100, "shared wall ends are covered");
  } finally {
    for (const resource of resources) resource.dispose();
    material.dispose();
  }
  t.diagnostic(
    `${probes} independent rays; ${baseProbes} below-floor and ${joinProbes} shared-end probes; ${exposedOriginalBases} exposed original-base controls`,
  );
});

test("recessed backing clears every exposed ashlar end face instead of cutting through its chips", (t) => {
  const material = new T.MeshBasicMaterial({ side: T.DoubleSide }),
    ray = new T.Raycaster();
  let probes = 0;
  try {
    for (const [index, wall] of echoWalls()
      .filter((w) => !w.after)
      .entries()) {
      const geometries = galleryWallGeometry(wall, wallSeed(wall)),
        core = galleryBackingGeometry([wall]),
        facing = new T.Mesh(geometries.facing, material),
        backing = new T.Mesh(core, material),
        vertical = wall.d > wall.w,
        half = Math.max(wall.w, wall.d) / 2;
      backing.position.set(-wall.x, 0, -wall.z);
      backing.updateMatrixWorld();
      try {
        for (const side of [-1, 1])
          for (const height of [0.3, 1.4, 2.5, 3.8, 4.9, 6.1])
            for (const across of [-0.2, 0, 0.2]) {
              const origin = new T.Vector3(
                  vertical ? across : side * (half + 1),
                  height,
                  vertical ? side * (half + 1) : across,
                ),
                direction = new T.Vector3(
                  vertical ? 0 : -side,
                  0,
                  vertical ? -side : 0,
                );
              ray.set(origin, direction);
              const face = ray.intersectObject(facing)[0],
                behind = ray.intersectObject(backing)[0];
              assert(face && behind);
              assert(
                behind.distance - face.distance > 0.025,
                `backing intersects the stone end: ${behind.distance - face.distance}`,
              );
              probes++;
            }
      } finally {
        for (const geometry of Object.values(geometries)) geometry.dispose();
        core.dispose();
      }
    }
  } finally {
    material.dispose();
  }
  t.diagnostic(`${probes} exposed-end clearance rays`);
});
