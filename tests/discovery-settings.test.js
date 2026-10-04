import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  DISCOVERY_SETTINGS,
  discoveryClusters,
  discoverySettingPlan,
  discoverySettingAllowed,
  discoveryFoliageClear,
} from "../src/discovery-setting-plan.js";
import { discoverySettingModule } from "../src/discovery-setting-art.js";
import { propSupportHeight } from "../src/prop-support.js";
import { stationBlocked } from "../src/field-station-solids.js";

const pickup = (id, x, z, yaw = 0) => ({
  id,
  discovery: {
    x,
    z,
    stance: { x: x + Math.sin(yaw) * 2.4, z: z + Math.cos(yaw) * 2.4, yaw },
  },
});
const world = () => ({
  map: { paths: [] },
  items: [pickup("note-0", 100, 100)],
  obstacles: [],
  terrainProfile: { waters: [] },
  groundHeight: () => 10,
  canMove: () => true,
});

test("understory leaf extents remain outside discovery construction", () => {
  const g = world();
  g.discoverySettings = [{ modules: [{ x: 110, z: 110, w: 3.25, d: 1.15 }] }];
  assert.equal(discoveryFoliageClear(g, 112, 110, 0.9), false);
  assert.equal(discoveryFoliageClear(g, 100, 102, 1), false);
  assert(discoveryFoliageClear(g, 115, 110, 0.9));
  assert(discoveryFoliageClear(g, 100, 105, 1));
});

test("neighboring discoveries share a setting without chaining a long corridor", () => {
  const items = [
    pickup("note-0", 100, 100),
    pickup("treasure-12", 114, 100),
    pickup("note-1", 128, 100),
    pickup("note-2", 180, 180),
  ];
  assert.deepEqual(
    discoveryClusters(items).map((c) => c.map((f) => f.id)),
    [["note-0", "treasure-12"], ["note-1"], ["note-2"]],
  );
  for (const biome of Object.keys(DISCOVERY_SETTINGS)) {
    const level = { seed: 42, biome },
      members = items.slice(0, 2),
      plan = discoverySettingPlan(level, members);
    assert.deepEqual(discoverySettingPlan(level, members), plan);
    assert.equal(plan.style.fixture, DISCOVERY_SETTINGS[biome].fixture);
    assert.equal(new Set(plan.candidates.map((c) => c.owner)).size, 2);
  }
});

test("settings protect each collection approach continuously in every orientation", () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const game = world();
    game.items = [pickup("note-0", 100, 100, yaw)];
    for (const r of [0, 1.2, 2.4, 3.6])
      assert.equal(
        discoverySettingAllowed(game, {
          x: 100 + Math.sin(yaw) * r,
          z: 100 + Math.cos(yaw) * r,
          w: 1,
          d: 1,
        }),
        false,
      );
    assert(discoverySettingAllowed(game, { x: 106, z: 106, w: 1, d: 1 }));
  }
});

test("hidden geometry, swept gates, instrument working space, water edges and banks remain reserved", () => {
  const box = { x: 110, z: 110, w: 2.6, d: 1.2 };
  for (const configure of [
    (g) =>
      g.obstacles.push({
        x: 110,
        z: 110,
        w: 1,
        d: 1,
        h: 2,
        node: { visible: false },
      }),
    (g) => {
      g.fieldGates = [{ root: { position: { x: 123.5, z: 110 } } }];
    },
    (g) => g.items.push({ type: "field", x: 114 / 7, z: 110 / 7 }),
    (g) =>
      g.terrainProfile.waters.push({ x: 110, z: 112, width: 4, length: 2 }),
    (g) => {
      g.groundHeight = (x) => x * 0.3;
    },
    (g) => {
      g.canMove = (x) => x < 111;
    },
    (g) => {
      g.map.paths = [
        [
          { x: 15, z: 15 },
          { x: 17, z: 17 },
        ],
      ];
    },
    (g) => {
      g.traversalCourses = [
        {
          entry: { x: 105, z: 110 },
          ledges: [],
          launch: { x: 108, z: 110 },
          exit: { x: 120, z: 110 },
        },
      ];
    },
  ]) {
    const g = world();
    assert(discoverySettingAllowed(g, box));
    configure(g);
    assert.equal(discoverySettingAllowed(g, box), false);
  }
});

test("regional assemblies fit their reserved footprints, including relief and fittings", () => {
  const plain = new THREE.MeshStandardMaterial({ vertexColors: true }),
    materials = Object.fromEntries(
      ["stone", "dark", "wood", "metal", "bronze", "cloth", "seam", "trim"].map(
        (name) => [name, plain],
      ),
    );
  for (const biome of Object.keys(DISCOVERY_SETTINGS))
    for (let variant = 0; variant < 4; variant++) {
      const level = { seed: variant, biome },
        plan = discoverySettingPlan(level, [pickup("note-0", 100, 100)]);
      for (const p of plan.candidates.filter((p) => p.yaw === 0)) {
        const root = discoverySettingModule(biome, p, materials, -0.47),
          bounds = new THREE.Box3().setFromObject(root);
        assert(
          bounds.min.x >= -p.localWidth / 2 - 0.004,
          `${biome}/${p.kind} min x`,
        );
        assert(
          bounds.max.x <= p.localWidth / 2 + 0.004,
          `${biome}/${p.kind} max x`,
        );
        assert(
          bounds.min.z >= -p.localDepth / 2 - 0.004,
          `${biome}/${p.kind} min z`,
        );
        assert(
          bounds.max.z <= p.localDepth / 2 + 0.004,
          `${biome}/${p.kind} max z: ${bounds.max.z}`,
        );
        assert(
          bounds.min.y < -0.46,
          "foundation reaches below the lowest sampled ground",
        );
        root.traverse((mesh) => {
          if (!mesh.isMesh) return;
          if (mesh.userData.settingSolid) {
            const b = new THREE.Box3().setFromObject(mesh),
              centre = b.getCenter(new THREE.Vector3()),
              support = propSupportHeight(mesh);
            assert(Number.isFinite(support(centre.x, centre.z)));
            assert(support(centre.x, centre.z) <= b.max.y + 1e-6);
          }
          mesh.geometry.dispose();
        });
      }
    }
  plain.dispose();
});

test("an open rack has separate legs and shelves with no solid in the empty bays", () => {
  const plain = new THREE.MeshStandardMaterial({ vertexColors: true }),
    m = Object.fromEntries(
      ["stone", "dark", "wood", "metal", "bronze", "cloth", "seam", "trim"].map(
        (name) => [name, plain],
      ),
    ),
    root = discoverySettingModule("sky", { kind: "rack", variant: 1 }, m),
    ray = new THREE.Raycaster(
      new THREE.Vector3(0, 0.87, 3),
      new THREE.Vector3(0, 0, -1),
    );
  root.updateMatrixWorld(true);
  assert.equal(
    ray.intersectObjects(root.children.filter((m) => m.userData.settingSolid))
      .length,
    0,
  );
  ray.set(new THREE.Vector3(0, 0.46, 3), new THREE.Vector3(0, 0, -1));
  assert(
    ray.intersectObjects(root.children.filter((m) => m.userData.settingSolid))
      .length > 0,
  );
  root.children.forEach((mesh) => mesh.geometry.dispose());
  plain.dispose();
});

test("a body cannot occupy a storage jar through its narrow mouth", () => {
  const plain = new THREE.MeshStandardMaterial({ vertexColors: true }),
    m = Object.fromEntries(
      ["stone", "dark", "wood", "metal", "bronze", "cloth", "seam", "trim"].map(
        (name) => [name, plain],
      ),
    ),
    root = discoverySettingModule("desert", { kind: "storage", variant: 0 }, m);
  root.updateMatrixWorld(true);
  const solids = root.children
    .filter((mesh) => mesh.userData.settingSolid)
    .map((mesh) => {
      const b = new THREE.Box3().setFromObject(mesh),
        c = b.getCenter(new THREE.Vector3()),
        size = b.getSize(new THREE.Vector3());
      return {
        x: c.x,
        z: c.z,
        w: size.x / 2,
        d: size.z / 2,
        bounds: b,
        surfaceHeight: propSupportHeight(mesh),
      };
    });
  // Previously all upward surfaces missed the open centre. Floor support
  // selected the jar's bottom, admitting a body through its surrounding sides.
  assert(solids.some((s) => stationBlocked(s, -0.62, 0.14, 0, 1.8)));
  const ray = new THREE.Raycaster(
      new THREE.Vector3(-0.62, 3, 0),
      new THREE.Vector3(0, -1, 0),
    ),
    hit = ray.intersectObjects(
      root.children.filter((m) => m.userData.settingSolid),
    )[0];
  assert(hit && hit.point.y > 1);
  const supported = Math.max(...solids.map((s) => s.surfaceHeight(-0.62, 0)));
  assert(Math.abs(supported - hit.point.y) < 1e-6);
  root.children.forEach((mesh) => mesh.geometry.dispose());
  plain.dispose();
});
