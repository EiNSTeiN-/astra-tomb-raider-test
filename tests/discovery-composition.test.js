import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {
  DISCOVERY_COMPOSITIONS,
  discoveryLayout,
  discoveryPaving,
} from "../src/discovery-composition.js";
import {
  discoveryInlayGeometry,
  pavingSeparated,
  discoveryPavingAllowed,
  discoveryPavingMaterial,
  polygonArea,
} from "../src/discovery-paving.js";
import { discoveryFoliageClear } from "../src/discovery-setting-plan.js";
import { verifyDiscoveryPaving } from "../scripts/inspect-discovery-paving-browser.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";

test("discovery shading removes the generic patch while retaining main court cores and the physical court field", () => {
  let changed = 0;
  for (const level of LEVELS) {
    const map = createMap(level),
      profile = createTerrainProfile(map, level);
    for (const r of map.rooms)
      assert.equal(
        profile.visualCourt(r.x * 7, r.z * 7),
        profile.court(r.x * 7, r.z * 7),
      );
    for (let z = 0; z < profile.extent; z += 3.5)
      for (let x = 0; x < profile.extent; x += 3.5) {
        const visible = profile.visualCourt(x, z),
          physical = profile.court(x, z);
        assert(visible >= 0 && visible <= physical + 1e-6);
        if (physical - visible > 0.1) changed++;
      }
  }
  assert(changed > 100);
});

test("plant extents clear angled floor pieces while their empty corners remain plantable", () => {
  const g = {
    items: [],
    discoverySettings: [
      {
        modules: [],
        paving: [
          {
            x: 0,
            z: 0,
            w: 2,
            d: 2,
            points: [
              [0, 1],
              [1, 0],
              [0, -1],
              [-1, 0],
            ],
          },
        ],
      },
    ],
  };
  assert.equal(discoveryFoliageClear(g, 0, 0, 0.05), false);
  assert.equal(discoveryFoliageClear(g, 0.52, 0.52, 0.07), false);
  assert(discoveryFoliageClear(g, 0.9, 0.9, 0.05));
  assert(discoveryFoliageClear(g, 1.3, 0, 0.05));
});

test("delivered floor observer detects lifted and overlapping controls and restores exact bytes", () => {
  const ground = new T.PlaneGeometry(12, 12, 6, 6)
      .rotateX(-Math.PI / 2)
      .translate(6, 0, 6),
    material = new T.MeshBasicMaterial(),
    floors = new T.Group(),
    g = {
      terrainMeshes: [new T.Mesh(ground, material)],
      discoverySettingBatches: { floors },
    };
  for (const [i, x] of [1, 4].entries()) {
    const geometry = discoveryInlayGeometry({ step: 2, height: () => 0 }, [
      [x, 1],
      [x + 1, 1],
      [x + 1, 2],
      [x, 2],
    ]);
    geometry.setAttribute(
      "discoveryPavingTile",
      new T.Float32BufferAttribute(
        new Float32Array(geometry.attributes.position.count).fill(i + 1),
        1,
      ),
    );
    floors.add(new T.Mesh(geometry, material));
  }
  const before = floors.children.map((m) =>
    m.geometry.attributes.position.array.slice(),
  );
  try {
    const r = verifyDiscoveryPaving(g);
    assert.equal(r.accepted.tiles, 2);
    assert.equal(r.accepted.overlaps, 0);
    assert.equal(r.liftedFailures, r.accepted.probes);
    assert(r.overlapControl > 0);
    for (const [i, m] of floors.children.entries())
      assert.deepEqual(m.geometry.attributes.position.array, before[i]);
  } finally {
    ground.dispose();
    material.dispose();
    floors.children.forEach((m) => m.geometry.dispose());
  }
});

test("eight regional sites have distinct floor topology and inward-facing varied working edges", () => {
  const floors = new Set(),
    layouts = new Set();
  for (const biome of Object.keys(DISCOVERY_COMPOSITIONS)) {
    const variants = new Set();
    for (let index = 0; index < 4; index++) {
      const level = { biome, seed: 42 },
        member = { id: `note-${index}` },
        p = discoveryPaving(level, member),
        layout = discoveryLayout(biome, index, index, "bench");
      assert.deepEqual(p, discoveryPaving(level, member));
      assert(p.length >= 15 && p.length <= 64);
      for (const tile of p) {
        assert.equal(tile.points.length, 4);
        assert(Math.abs(polygonArea(tile.points)) > 0.05);
        assert(
          tile.points.every(
            (v) => v.every(Number.isFinite) && Math.hypot(...v) < 6,
          ),
        );
      }
      for (const slot of layout) {
        assert(
          Math.cos(slot.facing) * -slot.z + Math.sin(slot.facing) * -slot.x > 3,
        );
        assert(Math.hypot(slot.x, slot.z) > 3.5);
      }
      variants.add(JSON.stringify(p));
      if (index === 0) {
        floors.add(JSON.stringify(p.map((t) => t.points)));
        layouts.add(JSON.stringify(layout.map((s) => [s.x, s.z, s.facing])));
      }
    }
    assert.equal(variants.size, 4);
  }
  assert.equal(floors.size, 8);
  assert.equal(layouts.size, 8);
});

test("convex inlays follow the actual alternating terrain triangles, including rotated edges", () => {
  const step = 1.75,
    field = (x, z) => Math.sin(x * 0.7) * 0.4 + Math.cos(z * 0.9) * 0.3,
    profile = { step, height: field },
    terrain = new T.PlaneGeometry(14, 14, 8, 8)
      .rotateX(-Math.PI / 2)
      .translate(7, 0, 7),
    p = terrain.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, field(p.getX(i), p.getZ(i)));
  const surface = new T.Mesh(
      terrain,
      new T.MeshBasicMaterial({ side: T.DoubleSide }),
    ),
    ray = new T.Raycaster(),
    down = new T.Vector3(0, -1, 0);
  surface.updateMatrixWorld();
  let probes = 0;
  try {
    for (const biome of Object.keys(DISCOVERY_COMPOSITIONS))
      for (const tile of discoveryPaving(
        { biome, seed: 17 },
        { id: "note-2" },
      )) {
        const polygon = tile.points.map(([x, z]) => [7 + x * 0.8, 7 + z * 0.8]),
          g = discoveryInlayGeometry(profile, polygon),
          position = g.attributes.position;
        try {
          assert(position.count > 0 && position.count % 3 === 0);
          let area = 0;
          for (let i = 0; i < position.count; i += 3) {
            const v = [0, 1, 2].map((j) =>
                new T.Vector3().fromBufferAttribute(position, i + j),
              ),
              tri = new T.Triangle(...v);
            assert(tri.getNormal(new T.Vector3()).y > 0);
            area += Math.abs(polygonArea(v.map((p) => [p.x, p.z])));
            for (const point of [
              ...v,
              tri.getMidpoint(new T.Vector3()),
              v[0].clone().lerp(v[1], 0.37),
            ]) {
              ray.set(new T.Vector3(point.x, 10, point.z), down);
              const hit = ray.intersectObject(surface)[0];
              assert(hit);
              assert(Math.abs(point.y - hit.point.y - 0.003) < 2e-6);
              probes++;
            }
          }
          assert(Math.abs(area - Math.abs(polygonArea(polygon))) < 2e-5);
          const edges = g.attributes.discoveryEdge;
          for (let i = 0; i < edges.count; i++)
            for (let j = 0; j < 4; j++) assert(edges.array[i * 4 + j] >= -1e-5);
        } finally {
          g.dispose();
        }
      }
    assert(probes > 1000);
  } finally {
    terrain.dispose();
    surface.material.dispose();
  }
});

test("floor admission rejects submerged, steep, outside-map and overlapping pieces", () => {
  const a = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ],
    g = {
      map: {},
      terrainProfile: { waters: [] },
      canMove: () => true,
      groundHeight: () => 0,
    };
  assert(discoveryPavingAllowed(g, a));
  for (const configure of [
    (g) => (g.canMove = (x) => x < 0.5),
    (g) => (g.groundHeight = (x) => x),
    (g) => (g.terrainProfile.waters = [{ x: 0, z: 0, width: 0.2, length: 4 }]),
  ]) {
    const game = { ...g, terrainProfile: { waters: [] } };
    configure(game);
    assert.equal(discoveryPavingAllowed(game, a), false);
  }
  assert(!pavingSeparated(a, a));
  assert(
    !pavingSeparated(
      a,
      a.map(([x, z]) => [x + 0.8, z + 0.8]),
    ),
  );
  assert(
    pavingSeparated(
      a,
      a.map(([x, z]) => [x + 2.1, z]),
    ),
  );
});

test("polygon edge wear keeps the existing regional paving shader extensions", () => {
  const load = T.TextureLoader.prototype.load;
  T.TextureLoader.prototype.load = function (url, done) {
    const t = new T.Texture();
    queueMicrotask(() => done?.(t));
    return t;
  };
  try {
    for (const biome of Object.keys(DISCOVERY_COMPOSITIONS)) {
      const m = discoveryPavingMaterial(biome, { rooms: [], fieldSites: [] }),
        shader = {
          uniforms: {},
          vertexShader: "#include <common>\n#include <begin_vertex>",
          fragmentShader:
            "#include <common>\n#include <map_fragment>\n#include <normal_fragment_maps>\n#include <roughnessmap_fragment>\n#include <clearcoat_normal_fragment_begin>",
        };
      try {
        m.onBeforeCompile(shader);
        assert(shader.vertexShader.includes("vDiscoveryEdge=discoveryEdge"));
        assert(
          shader.fragmentShader.includes(
            "min(vDiscoveryEdge.x,vDiscoveryEdge.y)",
          ),
        );
        assert(!shader.fragmentShader.includes("vec2 edgePair"));
        assert(shader.fragmentShader.includes("discoveryGrad"));
        assert(!shader.fragmentShader.includes("edge) * .84;"));
        assert(
          m.customProgramCacheKey().includes("discovery-polygon-edges-v2"),
        );
        if (biome === "volcano")
          assert(shader.fragmentShader.includes("foundryFloor"));
        if (biome === "crystal")
          assert(shader.fragmentShader.includes("archiveFloor"));
      } finally {
        for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
        m.dispose();
      }
    }
  } finally {
    T.TextureLoader.prototype.load = load;
  }
});
