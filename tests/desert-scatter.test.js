import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import {
  desertStoneShape,
  seatDesertStone,
  desertScatterLayout,
  buildDesertScatter,
} from "../src/desert-scatter.js";
import { buildDesertArchitecture } from "../src/desert-architecture.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { updateNature } from "../src/vegetation.js";

const io = new NodeIO();
const document = await io.read(
  new URL("../public/assets/models/desert-stones.glb", import.meta.url)
    .pathname,
);
function scanSources() {
  const material = new THREE.MeshStandardMaterial();
  return document
    .getRoot()
    .listNodes()
    .filter((n) => n.getMesh())
    .map((n) => {
      const primitive = n.getMesh().listPrimitives()[0],
        geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          primitive.getAttribute("POSITION").getArray().slice(),
          3,
        ),
      );
      geometry.setAttribute(
        "normal",
        new THREE.BufferAttribute(
          primitive.getAttribute("NORMAL").getArray().slice(),
          3,
        ),
      );
      geometry.setIndex(
        new THREE.BufferAttribute(primitive.getIndices().getArray().slice(), 1),
      );
      return {
        geometry,
        matrixWorld: new THREE.Matrix4().fromArray(n.getWorldMatrix()),
        material,
      };
    });
}
const shapes = scanSources().map((s) =>
  desertStoneShape(s.geometry, s.matrixWorld),
);
const chip = desertStoneShape(new THREE.IcosahedronGeometry(1, 1));
function fixture() {
  const level = LEVELS[1],
    map = createMap(level),
    world = new THREE.Group(),
    terrainProfile = createTerrainProfile(map, level);
  return Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    world,
    terrainProfile,
    groundHeight: terrainProfile.height,
    obstacles: [],
    naturePatches: [],
    player: { position: new THREE.Vector3() },
    store: { data: { settings: { quality: "high" } } },
    cameraSurfaces: new CameraSurfaces(world),
    terrainMeshes: [
      {
        material: {
          userData: {
            terrainUniforms: Object.fromEntries(
              ["cliffMap", "cliffNormal", "cliffRoughness"].map((k) => [
                k,
                { value: new THREE.Texture() },
              ]),
            ),
          },
        },
      },
    ],
  });
}
function undersideGaps(shape, matrix, profile) {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(shape.geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(matrix);
  mesh.updateMatrixWorld(true);
  const box = shape.bounds.clone().applyMatrix4(matrix),
    ray = new THREE.Raycaster(),
    gaps = [];
  // A different world-aligned sampling grid from the local footprint used to seat it.
  for (let iz = 1; iz < 6; iz++)
    for (let ix = 1; ix < 6; ix++) {
      const x = THREE.MathUtils.lerp(box.min.x, box.max.x, ix / 6),
        z = THREE.MathUtils.lerp(box.min.z, box.max.z, iz / 6);
      ray.set(
        new THREE.Vector3(x, box.min.y - 10, z),
        new THREE.Vector3(0, 1, 0),
      );
      const hit = ray.intersectObject(mesh)[0];
      if (hit) gaps.push(hit.point.y - profile.height(x, z));
    }
  material.dispose();
  return gaps;
}

test("desert delivery preserves all six scanned stone shapes and transforms without moss images or materials", async () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL("../asset-sources/desert-stones/sources.json", import.meta.url),
    ),
  );
  for (const entry of [manifest.input, manifest.output]) {
    const bytes = readFileSync(new URL("../" + entry.file, import.meta.url));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      entry.sha256,
    );
  }
  assert.equal(manifest.author, "Kless Gyzen");
  assert.equal(manifest.license, "CC0-1.0");
  assert(manifest.output.bytes < manifest.input.bytes * 0.4);
  const original = await io.read(
    new URL("../" + manifest.input.file, import.meta.url).pathname,
  );
  assert.equal(document.getRoot().listTextures().length, 0);
  assert.equal(document.getRoot().listMaterials().length, 0);
  const before = original
      .getRoot()
      .listNodes()
      .filter((n) => n.getMesh()),
    after = document
      .getRoot()
      .listNodes()
      .filter((n) => n.getMesh());
  assert.equal(after.length, 6);
  for (let i = 0; i < after.length; i++) {
    assert.deepEqual(after[i].getWorldMatrix(), before[i].getWorldMatrix());
    const a = after[i].getMesh().listPrimitives()[0],
      b = before[i].getMesh().listPrimitives()[0];
    for (const attr of ["POSITION", "NORMAL"])
      assert.deepEqual(
        a.getAttribute(attr).getArray(),
        b.getAttribute(attr).getArray(),
      );
    assert.deepEqual(a.getIndices().getArray(), b.getIndices().getArray());
    assert.equal(a.getAttribute("TEXCOORD_0"), null);
    assert.equal(a.getMaterial(), null);
  }
});

test("seating scanned undersides embeds rocks on gentle slopes and rejects an abrupt terrain step", () => {
  for (const shape of shapes)
    for (const slope of [0, 0.08, -0.08]) {
      const profile = { height: (x, z) => 3 + x * slope + z * 0.03 };
      const seated = seatDesertStone(profile, shape, {
        x: 4,
        z: 6,
        size: 2,
        yaw: 0.7,
        squash: 0.85,
      });
      assert(seated);
      const gaps = undersideGaps(shape, seated.matrix, profile);
      assert(Math.min(...gaps) < 0);
      assert(Math.max(...gaps) < 0.4);
      assert(seated.exposed > 0.1);
      assert(seated.matrix.elements.every(Number.isFinite));
    }
  for (const shape of shapes)
    assert.equal(
      seatDesertStone({ height: (x) => (x > 0 ? 8 : 0) }, shape, {
        x: 0,
        z: 0,
        size: 2,
        yaw: 0,
      }),
      null,
    );
});

test("desert outcrops are deterministic, supported and keep their full geometry outside walkable cells", () => {
  const game = fixture(),
    a = desertScatterLayout(game, shapes, chip),
    b = desertScatterLayout(game, shapes, chip);
  assert.deepEqual(a, b);
  assert.equal(a.stones.length, 230);
  assert(a.rubble.length > 800);
  let maximum = -Infinity;
  for (const stone of a.stones) {
    const shape = shapes[stone.variant],
      p = shape.geometry.attributes.position,
      world = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      world.fromBufferAttribute(p, i).applyMatrix4(stone.matrix);
      assert(
        !game.map.grid[Math.round(world.z / 7)]?.[Math.round(world.x / 7)],
        "large geometry stays outside walking cells",
      );
    }
    const gaps = undersideGaps(shape, stone.matrix, game.terrainProfile);
    assert(Math.min(...gaps) <= 0.01);
    maximum = Math.max(maximum, ...gaps);
  }
  assert(maximum < 0.5);
  for (const stone of [...a.stones, ...a.rubble]) {
    const p = stone.position,
      r = stone.radius;
    assert(
      game.map.features.every(
        (f) => Math.hypot(f.x * 7 - p.x, f.z * 7 - p.z) >= 3.5 + r,
      ),
    );
    assert(
      game.terrainProfile.waters.every(
        (w) =>
          Math.abs(p.x - w.x) >= w.width / 2 + r + 1.5 ||
          Math.abs(p.z - w.z) >= w.length / 2 + r + 1.5,
      ),
    );
    assert(
      Math.abs(p.x - game.map.cleft.x * 7) >= 22 + r ||
        Math.abs(p.z - game.map.cleft.z * 7) >= 19 + r,
    );
  }
});

test("built scatter clears the actual courtyard piers, retains gameplay bounds and shares terrain maps through retirement", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const game = fixture();
  buildDesertArchitecture(game);
  const before = structuredClone(game.obstacles);
  let textureDisposals = 0;
  for (const u of Object.values(
    game.terrainMeshes[0].material.userData.terrainUniforms,
  ))
    u.value.addEventListener("dispose", () => textureDisposals++);
  buildDesertScatter(game, scanSources());
  assert.deepEqual(game.obstacles, before);
  const placements = [
    ...game.desertScatter.stones,
    ...game.desertScatter.rubble,
  ];
  assert(game.desertScatter.stones.length >= 200);
  assert(game.desertScatter.rubble.length > 600);
  for (const s of placements)
    assert(
      game.obstacles.every(
        (o) =>
          Math.abs(s.position.x - o.x) >= o.w + s.radius + 0.2 ||
          Math.abs(s.position.z - o.z) >= o.d + s.radius + 0.2,
      ),
    );
  for (const patch of game.naturePatches) {
    assert(patch.planar);
    assert.equal(patch.tiers[0][0].castShadow, patch.kind === "rock");
    assert.equal(patch.tiers[0][0].material.map, null);
  }
  const material = game.naturePatches[0].tiers[0][0].material;
  material.dispose();
  assert.equal(
    textureDisposals,
    0,
    "scatter material borrows terrain-owned textures",
  );
});

test("gravel visibility follows quality and distance without changing placements or losing its shadow-free state", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const game = fixture();
  buildDesertScatter(game, scanSources());
  const patch = game.naturePatches.find((p) => p.kind === "gravel"),
    saved = patch.matrices.map((m) => m.elements.slice());
  game.player.position.copy(patch.positions[0]);
  updateNature(game);
  assert(patch.counts[0] > 0);
  game.player.position.set(10000, 0, 10000);
  updateNature(game);
  assert.equal(patch.counts[0], 0);
  for (const quality of ["low", "medium", "high"]) {
    game.store.data.settings.quality = quality;
    game.player.position.copy(patch.positions[0]);
    updateNature(game);
    assert(patch.counts[0] > 0);
    assert(!patch.tiers[0][0].castShadow);
    assert.deepEqual(
      patch.matrices.map((m) => m.elements),
      saved,
    );
  }
});
