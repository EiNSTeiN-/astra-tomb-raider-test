import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {
  palaceHallLights,
  palaceLightFrame,
  palaceLightWallCell,
  offsetPalaceLight,
} from "../src/palace-hall-lights.js";
import { palaceCourtPlan } from "../src/palace-court-plan.js";
import { FacadeCamera } from "../src/fitted-facades.js";
import { buildPalaceArchitecture } from "../src/palace-architecture.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { pbrMaterial } from "../src/visuals.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { stationBlocked } from "../src/field-station-solids.js";

function sealed(geometry) {
  const p = geometry.attributes.position,
    index = geometry.index,
    edges = new Map();
  for (const attribute of Object.values(geometry.attributes))
    assert(attribute.array.every(Number.isFinite));
  let volume = 0;
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const v = [0, 1, 2].map((k) =>
        new T.Vector3().fromBufferAttribute(
          p,
          index ? index.getX(i + k) : i + k,
        ),
      ),
      keys = v.map((v) =>
        v
          .toArray()
          .map((n) => Math.round(n * 1e5))
          .join(","),
      );
    assert(
      new T.Triangle(...v).getArea() > 1e-9,
      "every delivered triangle has area",
    );
    assert.equal(
      new Set(keys).size,
      3,
      "inspection precision retains every edge",
    );
    volume += v[0].dot(v[1].clone().cross(v[2])) / 6;
    for (let j = 0; j < 3; j++) {
      const a = keys[j],
        b = keys[(j + 1) % 3],
        key = [a, b].sort().join("/");
      edges.set(key, (edges.get(key) ?? 0) + (a < b ? 1 : -1));
    }
  }
  assert(volume > 0, "closed cells face outwards");
  assert(
    [...edges.values()].every((n) => n === 0),
    "oriented boundaries close",
  );
}

function allWalls() {
  return Array.from({ length: 10 }, (_, court) =>
    palaceCourtPlan(court).walls.map((wall) => ({
      court,
      wall,
      lights: palaceHallLights(court, wall),
    })),
  ).flat();
}

test("ninety-two clerestory profiles clear the columns, old lower panels and door jambs", () => {
  let count = 0,
    walls = 0;
  const courts = new Set(),
    profiles = new Set();
  for (const { court, wall, lights } of allWalls()) {
    if (lights.length) walls++;
    if (wall.height < 4.5) assert.equal(lights.length, 0);
    for (const light of lights) {
      count++;
      courts.add(court);
      profiles.add(light.kind);
      assert(
        light.width <= 1,
        "the lights remain narrower than the standing body margin",
      );
      const outer = offsetPalaceLight(light.points, 0.17);
      for (const [x, y] of outer) {
        assert(
          y > 3.3 && y < wall.height,
          "surrounds clear lower records and the wall cap",
        );
        assert(
          Math.abs(x) < wall.length / 2 - 1.35,
          "column heads remain separate",
        );
        assert(
          Math.abs(x - wall.door) > wall.doorWidth / 2 + 0.2,
          "door jambs keep their stone",
        );
      }
    }
  }
  assert.equal(count, 92);
  assert.equal(walls, 28);
  assert.equal(courts.size, 10);
  assert.equal(profiles.size, 6);
});

test("light frames have sealed blue reveals and two finite dressed mouths around a real aperture", () => {
  const material = new T.MeshBasicMaterial(),
    ray = new T.Raycaster();
  let inspected = 0;
  try {
    for (const { lights } of allWalls())
      for (const light of lights) {
        const frame = palaceLightFrame(light),
          parts = [frame.reveal, frame.front, frame.back];
        try {
          for (const geometry of [...parts, frame.camera]) sealed(geometry);
          const meshes = parts.map((g) => new T.Mesh(g, material)),
            kernel = new FacadeCamera(frame.camera);
          for (const side of [-1, 1]) {
            ray.set(
              new T.Vector3(light.x, light.y, side * 2),
              new T.Vector3(0, 0, -side),
            );
            assert.equal(
              ray.intersectObjects(meshes).length,
              0,
              "centre sight ray passes both mouths",
            );
          }
          assert.equal(
            kernel.entry(
              new T.Vector3(light.x, light.y, -2),
              new T.Vector3(light.x, light.y, 2),
              0,
            ),
            null,
          );
          const triangleCount = parts.reduce(
            (n, g) => n + (g.index?.count ?? g.attributes.position.count) / 3,
            0,
          );
          assert(
            triangleCount <= 1200,
            "each complete reveal has a bounded geometry cost",
          );
          inspected++;
        } finally {
          for (const g of [...parts, frame.camera]) g.dispose();
        }
      }
  } finally {
    material.dispose();
  }
  assert.equal(inspected, 92);
});

test("wall beds and cut courses retain closed cells while opening the original opaque marble", () => {
  const material = new T.MeshBasicMaterial(),
    ray = new T.Raycaster();
  let courses = 0,
    rays = 0;
  try {
    for (const { wall, lights } of allWalls()) {
      if (!lights.length) continue;
      const bed = palaceLightWallCell(
          {
            x0: -wall.length / 2,
            x1: wall.length / 2,
            y0: -0.25,
            y1: wall.height,
          },
          lights,
          0.9,
        ),
        old = new T.BoxGeometry(wall.length, wall.height + 0.25, 0.9),
        mesh = new T.Mesh(bed, material),
        control = new T.Mesh(old, material);
      control.position.y = (wall.height - 0.25) / 2;
      control.updateMatrixWorld(true);
      try {
        sealed(bed);
        for (const light of lights)
          for (const side of [-1, 1]) {
            ray.set(
              new T.Vector3(light.x, light.y, side * 2),
              new T.Vector3(0, 0, -side),
            );
            assert(
              ray.intersectObject(control).length > 0,
              "the preceding wall closes this sightline",
            );
            assert.equal(
              ray.intersectObject(mesh).length,
              0,
              "the dressed construction must not fill the cut",
            );
            rays++;
          }
        // Read the wall independently of its surrounds. Their outer beds
        // must lie on real opaque masonry, including along curved corners.
        for (const light of lights)
          for (const [x, y] of offsetPalaceLight(light.points, 0.12))
            for (const side of [-1, 1]) {
              ray.set(
                new T.Vector3(x, y, side * 2),
                new T.Vector3(0, 0, -side),
              );
              const hit = ray.intersectObject(mesh)[0];
              assert(hit, "every surround has continuous wall backing");
              assert(Math.abs(hit.point.z - side * 0.45) < 1e-6);
            }
        for (const bottom of [-0.2, -1.137, 0])
          for (let y = bottom; y < wall.height; y += 0.88)
            for (let x = -wall.length / 2; x < wall.length / 2; x += 2.1) {
              const g = palaceLightWallCell(
                {
                  x0: x + 0.009,
                  x1: Math.min(wall.length / 2, x + 2.1) - 0.009,
                  y0: y + 0.007,
                  y1: Math.min(wall.height, y + 0.88) - 0.007,
                },
                lights,
                1,
              );
              if (!g) continue;
              try {
                sealed(g);
                courses++;
              } finally {
                g.dispose();
              }
            }
      } finally {
        bed.dispose();
        old.dispose();
      }
    }
  } finally {
    material.dispose();
  }
  assert.equal(rays, 184);
  assert(courses > 2000);
});

test("built and batched lights agree with sight, physical and camera rays without opening body passages", (t) => {
  t.mock.method(T.TextureLoader.prototype, "load", () => new T.Texture());
  const level = LEVELS[3],
    map = createMap(level),
    world = new T.Group(),
    game = Object.assign(Object.create(Adventure.prototype), {
      level,
      map,
      world,
      terrainProfile: createTerrainProfile(map, level),
      obstacles: [],
      cameraSurfaces: new CameraSurfaces(world),
      stoneMat: pbrMaterial("palace-stone"),
      darkMat: pbrMaterial("palace-stone"),
    }),
    ray = new T.Raycaster();
  let queried = 0;
  try {
    buildPalaceArchitecture(game);
    world.updateMatrixWorld(true);
    game.cameraSurfaces.rebuild();
    for (const patch of game.palacePatches)
      for (const wall of patch.court.walls) {
        const c = Math.cos(wall.angle),
          s = Math.sin(wall.angle),
          normal = new T.Vector3(s, 0, c),
          point = (u, y) =>
            patch.root.localToWorld(
              new T.Vector3(wall.x + u * c, y, wall.z - u * s),
            );
        for (const light of wall.lights) {
          const center = point(light.x, light.y),
            a = center.clone().addScaledVector(normal, -2),
            b = center.clone().addScaledVector(normal, 2);
          for (const [from, to] of [
            [a, b],
            [b, a],
          ]) {
            ray.set(from, to.clone().sub(from).normalize());
            ray.far = 4;
            assert.equal(
              ray.intersectObject(patch.root, true).length,
              0,
              "the material batches preserve the opening",
            );
            assert.equal(
              game.cameraSurfaces.entry(from, to, 0),
              1,
              "camera capture retains the true central aperture",
            );
            assert(
              patch.court.solids.every(
                (solid) => solid.triangles.entry(from, to) === null,
              ),
              "copied physical triangles preserve sight and sound through it",
            );
          }
          assert(
            patch.court.solids.some((solid) =>
              stationBlocked(solid, center.x, center.y, center.z, 1.8, 0.65),
            ),
            "a narrow upper light does not become a body passage",
          );
          const below = point(light.x, 2.4),
            from = below.clone().addScaledVector(normal, -2),
            to = below.clone().addScaledVector(normal, 2);
          ray.set(from, to.clone().sub(from).normalize());
          ray.far = 4;
          assert(
            ray.intersectObject(patch.root, true).length > 0,
            "lower masonry remains opaque",
          );
          assert(game.cameraSurfaces.entry(from, to, 0) < 1);
          queried++;
        }
      }
    assert.equal(queried, 92);
  } finally {
    const resources = new Set([game.stoneMat, game.darkMat]);
    world.traverse((o) => {
      if (o.geometry) resources.add(o.geometry);
      for (const m of [o.material].flat().filter(Boolean)) {
        resources.add(m);
        for (const value of Object.values(m))
          if (value?.isTexture) resources.add(value);
      }
    });
    for (const resource of resources) resource.dispose();
  }
});
