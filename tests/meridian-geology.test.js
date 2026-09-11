import { meridianBoulderMaterial } from "../src/meridian-terrain-material.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile, buildTerrainSurface } from "../src/terrain.js";
import { craneFoundationDistance } from "../src/astral-crane-rules.js";
const level = LEVELS[7],
  map = createMap(level),
  profile = createTerrainProfile(map, level);

test("meridian fractures vary the enclosing ridges while preserving walking cells and working foundations", () => {
  let changed = 0,
    largest = 0,
    protectedCount = 0;
  for (let z = 0; z < map.size; z++)
    for (let x = 0; x < map.size; x++) {
      if (!map.grid[z][x]) continue;
      for (const dx of [-3.5, -3.49, -1.75, 0, 1.75, 3.49, 3.5])
        for (const dz of [-3.5, -3.49, -1.75, 0, 1.75, 3.49, 3.5]) {
          const px = x * 7 + dx,
            pz = z * 7 + dz;
          assert.equal(
            profile.height(px, pz),
            profile.meridian.originalHeight(px, pz),
          );
          protectedCount++;
        }
    }
  for (let z = 0.31; z < profile.extent; z += 2.3)
    for (let x = 0.19; x < profile.extent; x += 2.1) {
      const d = Math.abs(
        profile.height(x, z) - profile.meridian.originalHeight(x, z),
      );
      assert(Number.isFinite(d) && d < 12);
      if (d > 0.1) changed++;
      largest = Math.max(largest, d);
    }
  assert(changed > 2000);
  assert(largest > 3);
  assert(protectedCount > 15000);
  for (const f of map.features)
    assert.equal(
      profile.height(f.x * 7, f.z * 7),
      profile.meridian.originalHeight(f.x * 7, f.z * 7),
      f.id,
    );
  for (const room of map.rooms) {
    const radius = 9.6 + (room.index % 3) * 0.3;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 24)
      for (const dx of [-1.4, 0, 1.4])
        for (const dz of [-1.4, 0, 1.4]) {
          const x = room.x * 7 + Math.cos(angle) * radius + dx,
            z = room.z * 7 - 17 + Math.sin(angle) * radius + dz;
          assert.equal(
            profile.height(x, z),
            profile.meridian.originalHeight(x, z),
          );
        }
  }
  for (const w of profile.waters)
    for (const dx of [-w.width / 2, 0, w.width / 2])
      for (const dz of [-w.length / 2, 0, w.length / 2])
        assert.equal(
          profile.height(w.x + dx, w.z + dz),
          profile.meridian.originalHeight(w.x + dx, w.z + dz),
        );
  for (let z = 190; z <= 245; z += 0.7)
    for (let x = 155; x <= 315; x += 0.7) {
      if (
        craneFoundationDistance(x, z) <= 2 ||
        Math.hypot(x - 273, z - 217) <= 30
      )
        assert.equal(
          profile.height(x, z),
          profile.meridian.originalHeight(x, z),
        );
    }
  assert.deepEqual(
    createTerrainProfile(createMap(level), level).heights,
    profile.heights,
  );
});

test("meridian terrain chunks keep finite shared edge positions and normals without adding vertices", async (t) => {
  t.mock.method(THREE.TextureLoader.prototype, "load", (url, onLoad) => {
    const texture = new THREE.Texture();
    queueMicrotask(() => onLoad?.(texture));
    return texture;
  });
  const game = { level, terrainProfile: profile, world: new THREE.Group() };
  buildTerrainSurface(game);
  await game.terrainTexturesReady;
  const edges = new Map();
  let triangles = 0;
  for (const mesh of game.terrainMeshes) {
    const p = mesh.geometry.attributes.position,
      n = mesh.geometry.attributes.normal;
    triangles += mesh.geometry.index.count / 3;
    for (let i = 0; i < p.count; i++) {
      assert(Number.isFinite(p.getY(i)));
      assert(n.getY(i) > 0);
      const key = `${p.getX(i)},${p.getZ(i)}`,
        exposure = mesh.geometry.attributes.meridianRock.getX(i),
        sample = [p.getY(i), n.getX(i), n.getY(i), n.getZ(i), exposure];
      assert(exposure >= 0 && exposure <= 1);
      if (edges.has(key)) assert.deepEqual(sample, edges.get(key));
      else edges.set(key, sample);
    }
    mesh.geometry.dispose();
  }
  assert.equal(triangles, 2 * (profile.width - 1) ** 2);
  assert.equal(game.terrainMeshes.length, 81);
  game.terrainMeshes[0].material.dispose();
});

test("meridian boulders retain the credited maps and do not recolor scans in other chapters", () => {
  const source = new THREE.MeshStandardMaterial({
      color: 0xeeddcc,
      map: new THREE.Texture(),
      normalMap: new THREE.Texture(),
      roughnessMap: new THREE.Texture(),
    }),
    original = source.color.getHex();
  const meridian = meridianBoulderMaterial(source);
  assert.notEqual(meridian, source);
  assert.equal(source.color.getHex(), original);
  assert.deepEqual(source.normalScale.toArray(), [1, 1]);
  assert.notEqual(meridian.normalScale, source.normalScale);
  for (const key of ["map", "normalMap", "roughnessMap"])
    assert.equal(meridian[key], source[key]);
  assert.notEqual(meridian.color.getHex(), original);
  meridian.dispose();
  source.dispose();
});
