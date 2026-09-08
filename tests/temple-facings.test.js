import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  addPierFacings,
  pierFacingPlan,
  facingGeometry,
  templeGrowthMaterials,
} from "../src/temple-facings.js";
import {
  buildTempleArchitecture,
  updateTempleArchitecture,
  templePlan,
} from "../src/temple-architecture.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { mergeArchitecture } from "../src/visuals.js";

test("all four relief faces remain in front of their backing through recesses and raised petals", () => {
  for (const width of [2.65, 2.9]) {
    const detail = new THREE.Group(),
      material = new THREE.MeshStandardMaterial();
    addPierFacings(
      detail,
      { x: 0, z: 0, width },
      0,
      { index: 1 },
      2,
      material,
      templeGrowthMaterials(),
    );
    detail.updateMatrixWorld(true);
    const plan = pierFacingPlan(width);
    for (let face = 0; face < 4; face++)
      for (const u of [-0.35, 0, 0.35])
        for (const h of [1.9, 2.8, 4.05, 5.25]) {
          const rotation = new THREE.Matrix4().makeRotationY(
            (face * Math.PI) / 2,
          );
          const origin = new THREE.Vector3(u, h, 3).applyMatrix4(rotation);
          const direction = new THREE.Vector3(0, 0, -1).transformDirection(
            rotation,
          );
          const hit = new THREE.Raycaster(origin, direction).intersectObject(
            detail,
          )[0];
          assert(hit, `missing face ${face}`);
          assert.equal(
            hit.object.geometry.attributes.position.count,
            1225,
            "a backing slab hides the carving",
          );
          assert(3 - hit.distance > plan.surface + 0.005);
        }
  }
});

test("facings and woody growth fit the existing solid pier envelope without invalid geometry", () => {
  for (const width of [2.65, 2.9])
    for (const index of [0, 2, 6]) {
      const detail = new THREE.Group(),
        material = new THREE.MeshStandardMaterial(),
        growth = templeGrowthMaterials();
      const result = addPierFacings(
        detail,
        { x: -19, z: 18, width },
        0,
        { index: 4 - index },
        index,
        material,
        growth,
      );
      assert(result.rooted);
      detail.updateMatrixWorld(true);
      for (const mesh of detail.children) {
        const g = mesh.geometry;
        for (const attr of Object.values(g.attributes))
          assert(attr.array.every(Number.isFinite));
        for (let i = 0; i < g.attributes.position.count; i++) {
          const point = new THREE.Vector3()
            .fromBufferAttribute(g.attributes.position, i)
            .applyMatrix4(mesh.matrix);
          if (mesh.material === growth.leaves) {
            assert(point.y > 1.8, "leaf intrudes into walking height");
            continue;
          }
          assert(
            Math.abs(point.x + 19) < result.plan.footprint + 0.003,
            `x outside ${point.x + 19}`,
          );
          assert(
            Math.abs(point.z - 18) < result.plan.footprint + 0.003,
            `z outside ${point.z - 18}`,
          );
          assert(point.y < 9.1, "growth intrudes into the bird's perch");
        }
      }
    }
});

test("batching retains the detail's surfaces and material groups with a bounded number of draws", () => {
  const detail = new THREE.Group(),
    material = new THREE.MeshStandardMaterial(),
    growth = templeGrowthMaterials();
  addPierFacings(
    detail,
    { x: -19, z: 18, width: 2.65 },
    0,
    { index: 2 },
    6,
    material,
    growth,
  );
  const triangleCount = () =>
    detail.children.reduce(
      (n, m) =>
        n +
        (m.geometry.index?.count || m.geometry.attributes.position.count) / 3,
      0,
    );
  const before = triangleCount();
  const from = new THREE.Vector3(-19, 4.05, 21),
    direction = new THREE.Vector3(0, 0, -1);
  detail.updateMatrixWorld(true);
  const distance = new THREE.Raycaster(from, direction).intersectObject(
    detail,
  )[0].distance;
  mergeArchitecture(detail);
  detail.updateMatrixWorld(true);
  assert.equal(detail.children.length, 3);
  assert.equal(triangleCount(), before);
  assert(
    Math.abs(
      new THREE.Raycaster(from, direction).intersectObject(detail)[0].distance -
        distance,
    ) < 1e-6,
  );
});

test("the built temple keeps structure, culls only fine detail, and shares leaf motion with its shadows", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const map = createMap(LEVELS[0]);
  map.rooms = map.rooms.filter((r) => [0, 2, 8].includes(r.index));
  const game = {
    level: LEVELS[0],
    map,
    world: new THREE.Group(),
    obstacles: [],
    groundHeight: () => 0,
    player: new THREE.Group(),
    store: { data: { settings: { quality: "high" } } },
    elapsed: 5,
  };
  assert(buildTempleArchitecture(game));
  assert.equal(
    game.templePatches.reduce((n, p) => n + p.facings, 0),
    map.rooms.reduce((n, r) => n + templePlan(r).piers.length * 4, 0),
  );
  for (const patch of game.templePatches) {
    const leaf = patch.detail.children.find(
      (m) => m.material.name === "Temple climbing leaves",
    );
    if (leaf) {
      assert(leaf.customDepthMaterial);
      const shaders = [leaf.material, leaf.customDepthMaterial].map((m) => {
        const shader = {
          uniforms: {},
          vertexShader: "#include <common>\n#include <begin_vertex>",
        };
        m.onBeforeCompile(shader);
        return shader;
      });
      assert.equal(
        shaders[0].uniforms.templeTime,
        shaders[1].uniforms.templeTime,
      );
      assert.equal(shaders[0].vertexShader, shaders[1].vertexShader);
    }
  }
  const patch = game.templePatches[0];
  game.player.position.copy(patch.center);
  updateTempleArchitecture(game);
  assert(patch.detail.visible);
  assert.equal(game.templeWind.value, 5);
  game.player.position.set(-10000, 0, -10000);
  updateTempleArchitecture(game);
  assert(!patch.detail.visible);
  assert(patch.root.visible);
});
