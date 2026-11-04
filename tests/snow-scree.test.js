import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {
  snowScreeGeometries,
  snowScreeAllowed,
  snowScreeCandidates,
  buildSnowScree,
  SNOW_SCREE_RANGES,
  seatSnowScree,
} from "../src/snow-scree.js";
import { stoneFootprint } from "../src/stone-grounding.js";
import { closedComponentMeshes } from "../scripts/inspect-explorer-solids-browser.js";
import { NatureRockSolids } from "../src/nature-rock-solids.js";
import { updateLodPatch, disposeInstanceBuffers } from "../src/instance-lod.js";

test("all six scree forms have closed, outward, finite near and coarse surfaces", () => {
  for (let variant = 0; variant < 6; variant++) {
    const tiers = snowScreeGeometries(variant);
    let previous = Infinity;
    for (const geometry of tiers) {
      const material = new T.MeshBasicMaterial(),
        mesh = new T.Mesh(geometry, material),
        closed = closedComponentMeshes([mesh]);
      try {
        assert.equal(closed.stats.openTriangles, 0);
        assert(closed.stats.closedTriangles < previous);
        previous = closed.stats.closedTriangles;
        for (const a of Object.values(geometry.attributes))
          assert(a.array.every(Number.isFinite));
        const p = geometry.attributes.position;
        let volume = 0;
        for (let i = 0; i < p.count; i += 3) {
          const [a, b, c] = [0, 1, 2].map((j) =>
            new T.Vector3().fromBufferAttribute(p, i + j),
          );
          volume += a.dot(b.clone().cross(c)) / 6;
        }
        assert(volume > 0);
      } finally {
        closed.dispose();
        geometry.dispose();
        material.dispose();
      }
    }
  }
});

function fixture() {
  const size = 31,
    grid = Array.from({ length: size }, () => Array(size).fill(0));
  for (let x = 4; x <= 26; x++) grid[15][x] = 1;
  const geometry = new T.BoxGeometry(2, 1, 2).translate(0, 0.5, 0),
    material = new T.MeshStandardMaterial(),
    matrix = new T.Matrix4().makeTranslation(21, 0, 21);
  return {
    level: { biome: "snow", seed: 829 },
    world: new T.Group(),
    map: {
      size,
      grid,
      paths: [
        [
          { x: 4, z: 15 },
          { x: 26, z: 15 },
        ],
      ],
      rooms: [],
      features: [],
      enemies: [],
      spawn: { x: 1, z: 1 },
    },
    terrainProfile: { height: () => 0, court: () => 0, waters: [] },
    obstacles: [],
    woodland: [],
    traversalCourses: [],
    fieldGates: [],
    items: [],
    groundHeight: () => 0,
    terrainMeshes: [
      {
        material: {
          userData: {
            terrainUniforms: {
              cliffMap: { value: null },
              cliffNormal: { value: null },
              cliffRoughness: { value: null },
            },
          },
        },
      },
    ],
    naturePatches: [
      {
        kind: "rock",
        tiers: [[{ geometry, material }]],
        matrices: [matrix],
        positions: [new T.Vector3(21, 0, 21)],
      },
    ],
  };
}
function dispose(g) {
  const materials = new Set();
  disposeInstanceBuffers(g.world);
  g.world.traverse((m) => {
    m.geometry?.dispose();
    m.customDepthMaterial?.dispose();
    if (m.material) materials.add(m.material);
  });
  for (const m of materials) m.dispose();
  for (const p of g.naturePatches.slice(0, 1)) {
    p.tiers[0][0].geometry.dispose();
    p.tiers[0][0].material.dispose();
  }
}

test("scree retains the four-metre walking lane, fits both detail tiers and releases owned instances", () => {
  const a = fixture(),
    b = fixture();
  try {
    buildSnowScree(a);
    buildSnowScree(b);
    assert(a.snowScree.stats.placed > 20);
    assert.deepEqual(
      a.snowScree.stones.map((p) => p.matrix.elements),
      b.snowScree.stones.map((p) => p.matrix.elements),
    );
    const solids = new NatureRockSolids(a.naturePatches),
      point = new T.Vector3(),
      ray = new T.Raycaster();
    let roots = 0;
    for (const patch of a.snowScree.patches) {
      for (const tier of patch.tiers) {
        const geometry = tier[0].geometry,
          material = new T.MeshBasicMaterial({ side: T.DoubleSide }),
          mesh = new T.Mesh(geometry, material);
        mesh.matrixAutoUpdate = false;
        try {
          for (const matrix of patch.matrices) {
            mesh.matrix.copy(matrix);
            mesh.updateMatrixWorld(true);
            const box = new T.Box3().setFromObject(mesh);
            for (let iz = 1; iz < 6; iz++)
              for (let ix = 1; ix < 6; ix++) {
                const x = T.MathUtils.lerp(box.min.x, box.max.x, ix / 6),
                  z = T.MathUtils.lerp(box.min.z, box.max.z, iz / 6);
                ray.set(point.set(x, box.min.y - 1, z), new T.Vector3(0, 1, 0));
                const hit = ray.intersectObject(mesh)[0];
                if (hit) {
                  assert(hit.point.y < -0.008, "both tiers seat below ground");
                  roots++;
                }
              }
          }
        } finally {
          material.dispose();
        }
      }
      for (const quality of ["high", "low", "medium"])
        updateLodPatch(
          patch,
          new T.Vector3(105, 1, 105),
          SNOW_SCREE_RANGES[quality],
        );
    }
    for (let x = 30; x < 180; x += 0.5)
      for (const dz of [-2, 0, 2])
        assert(
          !solids.blocked(x, 0, 105 + dz, 2.2, 0.55),
          "four-metre trail remains clear",
        );
    assert(roots > 500);
    assert.equal(a.naturePatches[0].matrices.length, 1);
  } finally {
    dispose(a);
    dispose(b);
  }
});

test("both detail-tier bases remain beneath independently rendered uneven terrain triangles", () => {
  const step = 1.75,
    height = (x, z) =>
      4 + x * 0.055 - z * 0.03 + Math.sin(x * 0.7) * Math.cos(z * 0.9) * 0.16,
    geometry = new T.PlaneGeometry(21, 21, 12, 12)
      .rotateX(-Math.PI / 2)
      .translate(10.5, 0, 10.5),
    p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)));
  const groundMaterial = new T.MeshBasicMaterial({ side: T.DoubleSide }),
    ground = new T.Mesh(geometry, groundMaterial),
    ray = new T.Raycaster();
  ground.updateMatrixWorld(true);
  let probes = 0;
  try {
    for (let variant = 0; variant < 6; variant++) {
      const tiers = snowScreeGeometries(variant),
        footprints = tiers.map((g) => stoneFootprint(g, { edgeProbes: true })),
        shape = {
          bounds: tiers.reduce((b, g) => b.union(g.boundingBox), new T.Box3()),
          underside: footprints.flatMap((f) => f.underside),
        };
      try {
        for (const yaw of [0, 0.73, 2.1])
          for (const size of [0.6, 1.1]) {
            const placed = seatSnowScree({ height, step }, shape, {
              x: 9.83,
              z: 10.11,
              size,
              yaw,
            });
            assert(placed);
            for (const g of tiers) {
              const p = g.attributes.position;
              for (let i = 0; i < p.count; i++)
                if (p.getY(i) === 0) {
                  const root = new T.Vector3()
                    .fromBufferAttribute(p, i)
                    .applyMatrix4(placed.matrix);
                  ray.set(
                    new T.Vector3(root.x, 30, root.z),
                    new T.Vector3(0, -1, 0),
                  );
                  const hit = ray.intersectObject(ground)[0];
                  assert(hit);
                  assert(
                    root.y < hit.point.y - 0.008,
                    "no floating underside on either detail tier",
                  );
                  probes++;
                }
            }
          }
      } finally {
        tiers.forEach((g) => g.dispose());
      }
    }
    assert(probes > 1000);
  } finally {
    geometry.dispose();
    groundMaterial.dispose();
  }
});

test("scree reserves machinery, discoveries, trees, water, court paving and existing rocks", () => {
  const g = fixture();
  try {
    assert(snowScreeAllowed(g, 70, 120, 0.4));
    assert(!snowScreeAllowed(g, 70, 107, 0.4));
    g.map.frozenStair = { x: 10, z: 17 };
    assert(!snowScreeAllowed(g, 70, 120, 0.4));
    delete g.map.frozenStair;
    g.map.bellHoist = { x: 10, z: 17 };
    assert(!snowScreeAllowed(g, 70, 120, 0.4));
    delete g.map.bellHoist;
    g.woodland = [{ x: 70, z: 120 }];
    assert(!snowScreeAllowed(g, 70, 120, 0.4));
    g.woodland = [];
    g.terrainProfile.waters = [{ x: 70, z: 120, width: 4, length: 4 }];
    assert(!snowScreeAllowed(g, 70, 120, 0.4));
    g.terrainProfile.waters = [];
    g.terrainProfile.court = () => 1;
    assert(!snowScreeAllowed(g, 70, 120, 0.4));
    g.terrainProfile.court = () => 0;
    assert(
      !snowScreeAllowed(g, 70, 120, 0.4, [
        new T.Box3(new T.Vector3(69, 0, 119), new T.Vector3(71, 1, 121)),
      ]),
    );
    g.fieldGates = [{ root: { position: new T.Vector3(70, 0, 120) } }];
    assert(!snowScreeAllowed(g, 70, 120, 0.4));
    g.level.biome = "desert";
    assert.deepEqual(snowScreeCandidates(g), []);
    buildSnowScree(g);
    assert.equal(g.snowScree, null);
    assert.equal(g.world.children.length, 0);
  } finally {
    dispose(g);
  }
});
