import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import {
  fumaroleGeometry,
  fumarolePlan,
  buildFumaroles,
} from "../src/fumaroles.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { yardRouteClear } from "../src/station-yard-plan.js";
import {
  stationEntry,
  stationBlocked,
  stationSupport,
} from "../src/field-station-solids.js";
import { AUDIO_SOURCES, distanceGain } from "../src/audio.js";

const level = LEVELS[4],
  map = createMap(level),
  profile = createTerrainProfile(map, level);
function planner() {
  return {
    level,
    map,
    terrainProfile: profile,
    obstacles: [],
    items: [],
    groundHeight: profile.height.bind(profile),
  };
}

test("fumaroles retain closed rock around an open bore and a buried underside", () => {
  for (const seed of [23, 315, 817]) {
    const plan = { radius: 1.7, height: 1.25, bottom: -0.6, seed },
      geometry = fumaroleGeometry(plan),
      p = geometry.attributes.position,
      mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()),
      edges = new Map();
    let volume = 0;
    const key = (v) =>
      v
        .toArray()
        .map((n) => Math.round(n * 1e5))
        .join(",");
    for (const a of Object.values(geometry.attributes))
      assert(a.array.every(Number.isFinite));
    for (let i = 0; i < p.count; i += 3) {
      const points = [0, 1, 2].map((j) =>
        new THREE.Vector3().fromBufferAttribute(p, i + j),
      );
      assert(new THREE.Triangle(...points).getArea() > 1e-8);
      volume += points[0].dot(points[1].clone().cross(points[2])) / 6;
      for (let j = 0; j < 3; j++) {
        const a = key(points[j]),
          b = key(points[(j + 1) % 3]),
          edge = [a, b].sort().join("/");
        edges.set(edge, (edges.get(edge) || 0) + (a < b ? 1 : -1));
      }
    }
    assert(
      [...edges.values()].every((n) => n === 0),
      "all oriented edges seal",
    );
    assert(volume > 0, "rock faces wind outward");
    assert(geometry.boundingBox.min.y < -0.59);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 5, 0),
      new THREE.Vector3(0, -1, 0),
    );
    assert.equal(
      ray.intersectObject(mesh).length,
      0,
      "the bore is a real opening",
    );
    ray.ray.origin.x = plan.radius * 0.29;
    assert(
      ray.intersectObject(mesh)[0].point.y > plan.height * 0.9,
      "a dressed mineral lip surrounds the opening",
    );
    geometry.dispose();
    mesh.material.dispose();
  }
});

test("regional vents leave route collars, thermal focus approaches and each other clear", () => {
  const g = planner(),
    plans = fumarolePlan(g);
  assert(plans.length >= 4 && plans.length <= map.rooms.length);
  assert.deepEqual(fumarolePlan(g), plans);
  for (const p of plans) {
    const geometry = fumaroleGeometry(p),
      positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = p.x + positions.getX(i),
        z = p.z + positions.getZ(i);
      assert(
        yardRouteClear(map, { x, z, w: 0, d: 0 }, 5.8),
        "the entire stone clears the route camera collar",
      );
      if (Math.abs(positions.getY(i) - p.bottom) < 1e-5)
        assert(
          p.y + p.bottom < profile.surfaceHeight(x, z),
          "the complete underside is buried",
        );
      for (const f of map.features.filter((f) => f.type === "mechanism"))
        assert(
          !(
            x > f.x * 7 - 2 &&
            x < f.x * 7 + 29 &&
            z > f.z * 7 + 7 &&
            z < f.z * 7 + 71
          ),
        );
    }
    geometry.dispose();
    for (const q of plans)
      if (p !== q)
        assert(
          Math.hypot(p.x - q.x, p.z - q.z) > p.envelope + q.envelope + 15.9,
        );
  }
  assert.deepEqual(
    fumarolePlan({ ...g, level: { ...level, biome: "jungle" } }),
    [],
  );
});

test("visible vent mouths supply physical rock, clear steam anchors and bounded positional sound", (t) => {
  const g = planner(),
    material = new THREE.MeshStandardMaterial();
  Object.assign(g, {
    world: new THREE.Group(),
    darkMat: material,
    forgeTime: { value: 25 },
    soundSources: [],
  });
  g.cameraSurfaces = new CameraSurfaces(g.world);
  buildFumaroles(g);
  g.world.updateMatrixWorld(true);
  g.cameraSurfaces.rebuild();
  t.after(() => {
    const geometries = new Set(),
      materials = new Set([material]);
    g.world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) materials.add(o.material);
    });
    geometries.forEach((o) => o.dispose());
    materials.forEach((o) => o.dispose());
  });
  assert.equal(g.fumaroles.length, g.soundSources.length);
  for (const f of g.fumaroles) {
    const { plan: p, source: s, solid } = f;
    assert(
      s.y > solid.bounds.max.y,
      "the sound originates above the real open mouth",
    );
    assert(
      stationBlocked(solid, p.x, p.y, p.z),
      "a body cannot enter the narrow hot bore",
    );
    assert.equal(
      stationSupport(solid, p.x, p.z),
      null,
      "the opening is not a hidden cap",
    );
    const listener = { x: p.x + p.envelope + 3, y: s.y, z: p.z };
    assert.equal(
      stationEntry(solid, listener, s),
      null,
      "the vent does not muffle its own exposed source",
    );
    const config = AUDIO_SOURCES[s.kind],
      gain = (d) => distanceGain(d, config.near, s.range) * s.gain;
    assert(gain(2) > gain(8) && gain(8) > gain(16) && gain(18) === 0);
    assert.equal(
      f.plume.material.uniforms.time,
      g.forgeTime,
      "steam uses the existing paused game clock",
    );
  }
  g.level = { ...level, biome: "jungle" };
  buildFumaroles(g);
  assert.deepEqual(g.fumaroles, [], "a chapter change clears references");
});
