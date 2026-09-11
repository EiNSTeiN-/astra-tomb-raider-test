import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile, buildTerrainSurface } from "../src/terrain.js";
import { volcanicBoulderMaterial } from "../src/volcanic-material.js";
const level = LEVELS[4],
  map = createMap(level),
  profile = createTerrainProfile(map, level);

test("volcanic fractures vary the enclosing ridges while preserving walking cells and working foundations", () => {
  let changed = 0,
    largest = 0,
    protectedCount = 0;
  for (let z = 0; z < map.size; z++)
    for (let x = 0; x < map.size; x++) {
      if (!map.grid[z][x]) continue;
      for (const dx of [-3.49, -1.6, 0, 1.6, 3.49])
        for (const dz of [-3.49, 0, 3.49]) {
          const px = x * 7 + dx,
            pz = z * 7 + dz;
          assert.equal(
            profile.height(px, pz),
            profile.volcanic.originalHeight(px, pz),
          );
          protectedCount++;
        }
    }
  for (let z = 0.31; z < profile.extent; z += 2.3)
    for (let x = 0.19; x < profile.extent; x += 2.1) {
      const d = Math.abs(
        profile.height(x, z) - profile.volcanic.originalHeight(x, z),
      );
      assert(Number.isFinite(d) && d < 3.81);
      if (d > 0.1) changed++;
      largest = Math.max(largest, d);
    }
  assert(changed > 2000);
  assert(largest > 1.5);
  assert(protectedCount > 15000);
  for (const f of map.features)
    assert.equal(
      profile.height(f.x * 7, f.z * 7),
      profile.volcanic.originalHeight(f.x * 7, f.z * 7),
      f.id,
    );
  for (const w of profile.waters)
    for (const dx of [-w.width / 2, 0, w.width / 2])
      for (const dz of [-w.length / 2, 0, w.length / 2])
        assert.equal(
          profile.height(w.x + dx, w.z + dz),
          profile.volcanic.originalHeight(w.x + dx, w.z + dz),
        );
  assert.deepEqual(
    createTerrainProfile(createMap(level), level).heights,
    profile.heights,
  );
});

test("volcanic terrain chunks keep finite shared edge positions and normals without adding vertices", async (t) => {
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
        sample = [p.getY(i), n.getX(i), n.getY(i), n.getZ(i)];
      if (edges.has(key)) assert.deepEqual(sample, edges.get(key));
      else edges.set(key, sample);
    }
    mesh.geometry.dispose();
  }
  assert.equal(triangles, 2 * (profile.width - 1) ** 2);
  assert.equal(game.terrainMeshes.length, 81);
  game.terrainMeshes[0].material.dispose();
});

test("volcanic boulders retain the credited maps and do not recolor scans in other chapters", () => {
  const source = new THREE.MeshStandardMaterial({
      color: 0xeeddcc,
      map: new THREE.Texture(),
      normalMap: new THREE.Texture(),
      roughnessMap: new THREE.Texture(),
    }),
    original = source.color.getHex();
  const volcanic = volcanicBoulderMaterial(source);
  assert.notEqual(volcanic, source);
  assert.equal(source.color.getHex(), original);
  for (const key of ["map", "normalMap", "roughnessMap"])
    assert.equal(volcanic[key], source[key]);
  assert.notEqual(volcanic.color.getHex(), original);
  volcanic.dispose();
  source.dispose();
});

import {
  volcanicScreeLayout,
  buildVolcanicScree,
} from "../src/volcanic-scree.js";
import { rockGroundHeight, natureRockAllowed } from "../src/nature-rocks.js";
import { stoneFootprint } from "../src/stone-grounding.js";
test("small bank fragments are repeatable, seated below their undersides and absent from working areas", () => {
  const game = {
    level,
    map,
    terrainProfile: profile,
    obstacles: [],
    world: new THREE.Group(),
    darkMat: new THREE.MeshStandardMaterial(),
    naturePatches: [],
  };
  const candidates = volcanicScreeLayout(game);
  assert(candidates.length > 1000);
  assert.deepEqual(volcanicScreeLayout(game), candidates);
  for (const p of candidates) {
    assert(natureRockAllowed(game, p.x, p.z, p.size));
    assert(profile.court(p.x, p.z) <= 0.46);
  }
  buildVolcanicScree(game);
  assert(game.volcanicScree.placed > 700);
  assert(game.volcanicScree.rejected >= 0);
  assert.equal(game.volcanicScree.patches, 3);
  let count = 0;
  for (const patch of game.naturePatches) {
    assert.equal(patch.kind, "gravel");
    const mesh = patch.tiers[0][0];
    assert.equal(mesh.geometry.attributes.position.count / 3, 20);
    for (let i = 0; i < patch.matrices.length; i += 17) {
      const m = patch.matrices[i],
        p = new THREE.Vector3(),
        g = mesh.geometry;
      g.computeBoundingBox();
      assert((g.boundingBox.max.y - g.boundingBox.min.y) * m.elements[5] < 0.2);
      const shape = stoneFootprint(g);
      for (const u of shape.underside) {
        p.copy(u).applyMatrix4(m);
        assert(p.y - rockGroundHeight(profile, p.x, p.z) < 1e-5);
      }
      count++;
    }
  }
  assert(count > 100);
  game.world.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
    o.customDepthMaterial?.dispose();
    if (o.isInstancedMesh) o.dispose();
  });
  assert.deepEqual(volcanicScreeLayout({ ...game, level: LEVELS[0] }), []);
});
