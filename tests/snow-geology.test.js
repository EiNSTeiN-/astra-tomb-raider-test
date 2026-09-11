import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile, buildTerrainSurface } from "../src/terrain.js";
import { monasteryPlan } from "../src/monastery-architecture.js";
import { shutterFoundationDistance } from "../src/shutter-house-rules.js";

const level = LEVELS[2],
  map = createMap(level),
  profile = createTerrainProfile(map, level);
test("snow shoulders preserve every walking cell while replacing the enclosing banks deterministically", () => {
  let samples = 0,
    changed = 0,
    max = 0;
  for (let z = 0; z < map.size; z++)
    for (let x = 0; x < map.size; x++) {
      if (!map.grid[z][x]) continue;
      for (const dx of [-3.5, -3.49, -1.75, 0, 1.75, 3.49, 3.5])
        for (const dz of [-3.5, -3.49, -1.75, 0, 1.75, 3.49, 3.5]) {
          assert.equal(
            profile.height(x * 7 + dx, z * 7 + dz),
            profile.snow.originalHeight(x * 7 + dx, z * 7 + dz),
          );
          samples++;
        }
    }
  for (let z = 0.1; z < profile.extent; z += 1.7)
    for (let x = 0.2; x < profile.extent; x += 1.7) {
      const d = Math.abs(
        profile.height(x, z) - profile.snow.originalHeight(x, z),
      );
      assert(Number.isFinite(d));
      max = Math.max(max, d);
      if (d > 0.05) changed++;
    }
  assert(samples > 20000);
  assert(changed > 2500);
  assert(max > 3 && max < 12);
  assert.deepEqual(createTerrainProfile(map, level).heights, profile.heights);
  assert.equal(
    createTerrainProfile(createMap(LEVELS[0]), LEVELS[0]).snow,
    undefined,
  );
});
test("snow banks retain monastery footings, working pads, ice edges and moving structure foundations", () => {
  const unchanged = (x, z, label) =>
    assert.equal(
      profile.height(x, z),
      profile.snow.originalHeight(x, z),
      label,
    );
  for (const r of map.rooms)
    for (const p of monasteryPlan(r).posts)
      for (const dx of [-1, 0, 1])
        for (const dz of [-1, 0, 1])
          unchanged(r.x * 7 + p.x + dx, r.z * 7 + p.z + dz, `court ${r.index}`);
  for (const f of map.features)
    for (const dx of [-2, 0, 2])
      for (const dz of [-2, 0, 2]) unchanged(f.x * 7 + dx, f.z * 7 + dz, f.id);
  for (const w of profile.waters)
    for (const dx of [-w.width / 2, 0, w.width / 2])
      for (const dz of [-w.length / 2, 0, w.length / 2])
        unchanged(w.x + dx, w.z + dz, "water");
  for (const [cx, cz, w, d] of [
    [126, 224, 14, 14],
    [182, 364, 23, 30],
  ])
    for (let z = cz - d; z <= cz + d; z += 0.9)
      for (let x = cx - w; x <= cx + w; x += 0.9)
        unchanged(x, z, "moving structure");
  for (let z = 210; z < 259; z += 0.9)
    for (let x = 154; x < 200; x += 0.9)
      if (shutterFoundationDistance(x, z) < 2) unchanged(x, z, "wind house");
});
test("snow terrain chunks share positions, normals and exposure without adding triangles or maps", async (t) => {
  t.mock.method(THREE.TextureLoader.prototype, "load", (url, onLoad) => {
    const texture = new THREE.Texture();
    queueMicrotask(() => onLoad?.(texture));
    return texture;
  });
  const g = { level, terrainProfile: profile, world: new THREE.Group() };
  buildTerrainSurface(g);
  await g.terrainTexturesReady;
  const shared = new Map();
  let triangles = 0;
  for (const mesh of g.terrainMeshes) {
    const a = mesh.geometry.attributes,
      p = a.position,
      n = a.normal;
    triangles += mesh.geometry.index.count / 3;
    for (let i = 0; i < p.count; i++) {
      const values = [
        p.getY(i),
        n.getX(i),
        n.getY(i),
        n.getZ(i),
        a.snowRock.getX(i),
      ];
      assert(values.every(Number.isFinite));
      assert(n.getY(i) > 0);
      assert(values[4] >= 0 && values[4] <= 1);
      const key = p.getX(i) + "," + p.getZ(i);
      if (shared.has(key)) assert.deepEqual(values, shared.get(key));
      else shared.set(key, values);
    }
    mesh.geometry.dispose();
  }
  assert.equal(triangles, 2 * (profile.width - 1) ** 2);
  const material = g.terrainMeshes[0].material;
  assert.deepEqual(material.defines, { TERRAIN_SNOW: 1 });
  assert.equal(material.userData.additionalTextures.length, 6);
  material.dispose();
});
