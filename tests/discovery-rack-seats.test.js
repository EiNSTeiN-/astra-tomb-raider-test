import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { buildDiscoverySettings } from "../src/discovery-settings.js";
import { verifyDiscoveryRacks } from "../scripts/inspect-discovery-racks-browser.js";

function fixture(biome, seed, yaw) {
  return {
    level: { biome, seed },
    map: { paths: [], rooms: [], size: 61 },
    terrainProfile: { waters: [], step: 1.75, height: () => 0 },
    world: new T.Group(),
    items: [
      {
        id: "note-0",
        discovery: {
          x: 100,
          y: 0,
          z: 100,
          stance: {
            x: 100 + Math.sin(yaw) * 2.4,
            z: 100 + Math.cos(yaw) * 2.4,
            yaw,
          },
        },
      },
    ],
    groundHeight: () => 0,
    canMove: () => true,
    obstacles: [],
    fieldGates: [],
    traversalCourses: [],
    stoneMat: new T.MeshStandardMaterial(),
    darkMat: new T.MeshStandardMaterial(),
    cameraSurfaces: { capture() {} },
  };
}
function dispose(g) {
  const materials = new Set([
    g.stoneMat,
    g.darkMat,
    ...Object.values(g.campMaterials || {}),
  ]);
  g.world.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) materials.add(o.material);
  });
  const textures = new Set();
  for (const m of materials) {
    for (const value of Object.values(m))
      if (value?.isTexture) textures.add(value);
    m.dispose();
  }
  textures.forEach((t) => t.dispose());
  g.world.clear();
}

test("all regional rack stores retain actual shelf contact after world transforms and material batching", () => {
  const load = T.TextureLoader.prototype.load;
  T.TextureLoader.prototype.load = function (url, done) {
    const t = new T.Texture();
    queueMicrotask(() => done?.(t));
    return t;
  };
  let assemblies = 0,
    probes = 0;
  try {
    for (const biome of [
      "jungle",
      "desert",
      "snow",
      "water",
      "volcano",
      "sky",
      "crystal",
      "eclipse",
    ])
      for (const [seed, yaw] of [
        [1, 0],
        [3, 0.73],
      ]) {
        const g = fixture(biome, seed, yaw);
        try {
          buildDiscoverySettings(g);
          assert(g.discoveryRackSeats.length > 0);
          const buffers = [];
          g.discoverySettingBatches.batch.traverse((o) => {
            if (o.isMesh)
              buffers.push([
                o.geometry.attributes.position,
                o.geometry.attributes.position.array.slice(),
              ]);
          });
          const result = verifyDiscoveryRacks(g);
          assert.deepEqual(result.accepted.failures, []);
          assert.equal(result.liftedFailures, result.accepted.probes);
          assert(
            result.accepted.minimumGap >= -0.006 &&
              result.accepted.maximumGap <= 0.01,
          );
          for (const [p, bytes] of buffers)
            assert.deepEqual(
              p.array,
              bytes,
              "displacement control restores exact delivered bytes",
            );
          assemblies += result.accepted.assemblies;
          probes += result.accepted.probes;
        } finally {
          dispose(g);
        }
      }
    assert(assemblies > 150 && probes > 3000);
  } finally {
    T.TextureLoader.prototype.load = load;
  }
});
