import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { pbrMaterial } from "../src/visuals.js";
import { buildPalaceArchitecture } from "../src/palace-architecture.js";
import {
  buildPalaceFurnishings,
  bakeFurnishingParts,
} from "../src/palace-furnishings.js";
import {
  palaceFurnishingArt,
  palaceFurnishingPlan,
  palaceVesselGeometry,
} from "../src/palace-furnishing-art.js";
import { stationBlocked, stationSupport } from "../src/field-station-solids.js";
import { advanceCharacter } from "../src/character-motion.js";

test("retained raised arrivals and walking exits clear neighboring part margins", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[3],
    map = createMap(level),
    world = new THREE.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    world,
    terrainProfile: createTerrainProfile(map, level),
    obstacles: [],
    stoneMat: pbrMaterial("palace-stone"),
    darkMat: pbrMaterial("palace-stone"),
    player: new THREE.Group(),
    audio: { tone() {} },
  });
  buildPalaceArchitecture(g);
  buildPalaceFurnishings(g);
  try {
    for (const [x, y, z, court] of [
      [226.3782612715613, 1.4169456005096435, 49.25472223806066, 1],
      [365.87466150428384, 2.864167058467865, 48.571796711814876, 2],
      [86.04252809337632, 3.2873066902160644, 244.7994385538968, 6],
      [333.8678090271395, 1.3798452727091064, 146.2061759071352, 5],
    ])
      for (const crouching of [false, true]) {
        g.player.position.set(x, y, z);
        g.jumpY = y - g.groundHeight(x, z);
        g.crouching = crouching;
        g.grounded = true;
        g.velocityY = g.coyote = g.jumpBuffer = 0;
        g.fallPeak = y;
        assert(g.canMove(x, z, g.jumpY), "retained arrival begins clear");
        for (let frame = 0; frame < 120; frame++) {
          advanceCharacter(g, { x: 0, z: 0 }, 1 / 60);
          const p = g.player.position;
          assert(
            g.canMove(p.x, p.z, g.jumpY),
            JSON.stringify({
              start: [x, y, z],
              crouching,
              frame,
              settled: p.toArray(),
            }),
          );
        }
        assert(
          g.grounded,
          "the retained arrival reaches a supported resting point",
        );
        const started = g.player.position.clone(),
          room = g.map.rooms[court];
        const dx = room.x * 7 - started.x,
          dz = room.z * 7 - started.z,
          distance = Math.hypot(dx, dz);
        for (let frame = 0; frame < 120; frame++) {
          advanceCharacter(
            g,
            { x: (dx / distance) * 4, z: (dz / distance) * 4 },
            1 / 60,
          );
          const p = g.player.position;
          assert(
            g.canMove(p.x, p.z, g.jumpY),
            JSON.stringify({
              kind: "walking",
              court,
              frame,
              feet: p.toArray(),
            }),
          );
        }
        assert(
          Math.hypot(
            g.player.position.x - started.x,
            g.player.position.z - started.z,
          ) > 0.5,
          "the recovered top retains an ordinary walking exit",
        );
      }
  } finally {
    const resources = new Set([g.stoneMat, g.darkMat]);
    world.traverse((o) => {
      if (o.geometry) resources.add(o.geometry);
      for (const m of Array.isArray(o.material)
        ? o.material
        : o.material
          ? [o.material]
          : [])
        resources.add(m);
    });
    for (const resource of resources) resource.dispose();
  }
});

function inspectSolid(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry,
    p = g.attributes.position,
    edges = new Map();
  const key = (i) =>
    [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.round(v * 1e5)).join(",");
  assert(p.array.every(Number.isFinite));
  assert(g.attributes.normal.array.every(Number.isFinite));
  let volume = 0;
  for (let i = 0; i < p.count; i += 3) {
    const [a, b, c] = [i, i + 1, i + 2].map((j) =>
      new THREE.Vector3().fromBufferAttribute(p, j),
    );
    assert(
      b.clone().sub(a).cross(c.clone().sub(a)).length() > 1e-8,
      "nondegenerate face",
    );
    volume += a.dot(b.cross(c)) / 6;
    for (let j = 0; j < 3; j++) {
      const k = [key(i + j), key(i + ((j + 1) % 3))].sort().join("|");
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  assert(volume > 0, "positive outward volume");
  assert(
    [...edges.values()].every((n) => n === 2),
    "sealed edges",
  );
  if (g !== geometry) g.dispose();
}

test("ceramic storage and basin walls have sealed inner floors and outward faces", () => {
  for (const basin of [false, true]) {
    const g = palaceVesselGeometry(basin);
    inspectSolid(g);
    g.dispose();
  }
});

test("all authored settings fit their floor beds and bake tilted hardware into upright collision placements", () => {
  const m = Object.fromEntries(
    ["stone", "dark", "blue", "ceramic", "metal", "wood", "paper", "rope"].map(
      (k) => [k, new THREE.MeshStandardMaterial({ vertexColors: true })],
    ),
  );
  const plans = new Set();
  let parts = 0;
  for (let room = 0; room < 10; room++) {
    const plan = palaceFurnishingPlan(room);
    plans.add(plan.settings.map((s) => s.kind).join("/"));
    for (const spec of plan.settings) {
      const root = palaceFurnishingArt(spec.kind, m, room * 73),
        bounds = new THREE.Box3().setFromObject(root);
      assert(bounds.min.x >= -spec.width / 2 && bounds.max.x <= spec.width / 2);
      assert(bounds.min.z >= -spec.depth / 2 && bounds.max.z <= spec.depth / 2);
      bakeFurnishingParts(root);
      for (const mesh of root.children) {
        assert(mesh.matrix.equals(new THREE.Matrix4()));
        assert(mesh.geometry.attributes.color.array.every(Number.isFinite));
        if (mesh.userData.furnishingSolid) {
          inspectSolid(mesh.geometry);
          parts++;
        }
        mesh.geometry.dispose();
      }
    }
  }
  assert.equal(plans.size, 10);
  assert(parts > 250);
  Object.values(m).forEach((v) => v.dispose());
});

test("built furnishings retain clear doorway aisles, real roof support and buried floor-bed edges", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[3],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    world = new THREE.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile: profile,
    world,
    obstacles: [],
    cameraSurfaces: new CameraSurfaces(world),
    stoneMat: pbrMaterial("palace-stone"),
    darkMat: pbrMaterial("palace-stone"),
  });
  buildPalaceArchitecture(g);
  const existing = g.obstacles.slice();
  buildPalaceFurnishings(g);
  g.cameraSurfaces.rebuild();
  assert.equal(g.palaceFurnishings.length, 10);
  assert(g.cameraSurfaces.count < 2600);
  let total = 0,
    probes = 0;
  const ray = new THREE.Raycaster(
    new THREE.Vector3(),
    new THREE.Vector3(0, -1, 0),
  );
  for (const hall of g.palaceFurnishings) {
    assert.equal(hall.settings.length, 2);
    for (const s of hall.settings) {
      total += s.triangles;
      assert(s.root.children.length <= 8);
      assert(s.bottom < g.groundHeight(s.footprint.x, s.footprint.z));
      const box = new THREE.Box3().setFromObject(s.root),
        center = box.getCenter(new THREE.Vector3());
      assert(
        !existing.some((o) =>
          stationBlocked(o, center.x, s.top, center.z, 2.5, 0),
        ),
        "setting has no existing masonry through its center",
      );
      for (let x = -1.15; x < 1.2; x += 0.23)
        for (let z = -0.85; z < 0.9; z += 0.23) {
          const p = new THREE.Vector3(x, 0, z).applyMatrix4(s.root.matrixWorld);
          ray.ray.origin.set(p.x, s.top + 4, p.z);
          const hit = ray.intersectObject(s.root, true)[0];
          assert(hit);
          const support = stationSupport(s.solid, p.x, p.z);
          assert(
            Math.abs(hit.point.y - support) < 1e-4,
            "support matches delivered mesh",
          );
          probes++;
        }
    }
    const patch = g.palacePatches[hall.room];
    for (const wall of patch.court.walls.filter((w) => w.kind === "door"))
      for (let u = -0.65; u <= 0.66; u += 0.325)
        for (let n = -3; n <= 3; n += 0.3) {
          const x =
              patch.root.position.x +
              wall.x +
              u * Math.cos(wall.angle) +
              n * Math.sin(wall.angle),
            z =
              patch.root.position.z +
              wall.z -
              u * Math.sin(wall.angle) +
              n * Math.cos(wall.angle),
            y = g.groundHeight(x, z);
          assert(
            !hall.settings.some((s) =>
              stationBlocked(s.solid, x, y, z, 1.8, 0.65),
            ),
            `room ${hall.room} ${wall.id} aisle`,
          );
        }
  }
  assert(total < 50000, `${total} furnishing triangles`);
  assert(probes > 1500);
});

test("other chapters do not construct palace furnishings", () => {
  const g = { level: LEVELS[0], palaceFurnishings: ["stale"] };
  buildPalaceFurnishings(g);
  assert.deepEqual(g.palaceFurnishings, []);
});
