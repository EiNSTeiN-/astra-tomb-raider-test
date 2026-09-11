import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile, buildTerrainSurface } from "../src/terrain.js";
import { mineralBedGeometry } from "../src/cavern-geometry.js";
import { causewayFoundationDistance } from "../src/echo-causeway-rules.js";
const level = LEVELS[6],
  map = createMap(level),
  p = createTerrainProfile(map, level);
test("cavern shelves preserve every walking-cell boundary and interior while changing the enclosing rock", () => {
  let count = 0,
    changed = 0,
    max = 0;
  for (let z = 0; z < map.size; z++)
    for (let x = 0; x < map.size; x++) {
      if (!map.grid[z][x]) continue;
      for (const dx of [-3.5, -3.49, -1.75, 0, 1.75, 3.49, 3.5])
        for (const dz of [-3.5, -3.49, -1.75, 0, 1.75, 3.49, 3.5]) {
          const px = x * 7 + dx,
            pz = z * 7 + dz;
          assert.equal(p.height(px, pz), p.cavern.originalHeight(px, pz));
          count++;
        }
    }
  for (let z = 0.1; z < p.extent; z += 1.7)
    for (let x = 0.2; x < p.extent; x += 1.7) {
      const d = Math.abs(p.height(x, z) - p.cavern.originalHeight(x, z));
      assert(Number.isFinite(d));
      max = Math.max(max, d);
      if (d > 0.05) changed++;
    }
  assert(count > 20000);
  assert(changed > 5000);
  assert(max > 3 && max < 10);
  assert.deepEqual(createTerrainProfile(map, level).heights, p.heights);
  assert.equal(
    createTerrainProfile(createMap(LEVELS[0]), LEVELS[0]).cavern,
    undefined,
  );
});
test("mineral roots, water edges, relay galleries and other discoveries retain their original footing heights", () => {
  for (const f of map.features)
    for (const dx of [-2, 0, 2])
      for (const dz of [-2, 0, 2]) {
        const x = f.x * 7 + dx,
          z = f.z * 7 + dz;
        assert.equal(p.height(x, z), p.cavern.originalHeight(x, z), f.id);
      }
  for (const r of map.rooms)
    for (const [dx, dz] of [
      [14, -12],
      [-17, -11],
      [17, 13],
      [-17, 14],
      [0, 20],
      [21, 0],
      [-21, 0],
    ])
      for (const a of [-2.8, 0, 2.8])
        for (const b of [-2.4, 0, 2.4]) {
          const x = r.x * 7 + dx + a,
            z = r.z * 7 + dz + b;
          assert.equal(p.height(x, z), p.cavern.originalHeight(x, z));
        }
  for (let z = 208; z < 287; z += 0.9)
    for (let x = 204; x < 274; x += 0.9)
      if (causewayFoundationDistance(x, z) < 2)
        assert.equal(p.height(x, z), p.cavern.originalHeight(x, z));
  for (const w of p.waters)
    for (const dx of [-w.width / 2, 0, w.width / 2])
      for (const dz of [-w.length / 2, 0, w.length / 2])
        assert.equal(
          p.height(w.x + dx, w.z + dz),
          p.cavern.originalHeight(w.x + dx, w.z + dz),
        );
});
test("cavern bank chunks agree at shared edges and retain their geometry count and texture ownership", async (t) => {
  t.mock.method(THREE.TextureLoader.prototype, "load", (url, onLoad) => {
    const texture = new THREE.Texture();
    queueMicrotask(() => onLoad?.(texture));
    return texture;
  });
  const g = { level, terrainProfile: p, world: new THREE.Group() };
  buildTerrainSurface(g);
  await g.terrainTexturesReady;
  const shared = new Map();
  let triangles = 0;
  for (const m of g.terrainMeshes) {
    const a = m.geometry.attributes,
      pos = a.position,
      n = a.normal;
    triangles += m.geometry.index.count / 3;
    for (let i = 0; i < pos.count; i++) {
      const v = [
        pos.getY(i),
        n.getX(i),
        n.getY(i),
        n.getZ(i),
        a.cavernRock.getX(i),
      ];
      assert(v.every(Number.isFinite));
      assert(n.getY(i) > 0);
      assert(v[4] >= 0 && v[4] <= 1);
      const key = pos.getX(i) + "," + pos.getZ(i);
      if (shared.has(key)) assert.deepEqual(v, shared.get(key));
      else shared.set(key, v);
    }
    m.geometry.dispose();
  }
  assert.equal(triangles, 2 * (p.width - 1) ** 2);
  assert.equal(
    g.terrainMeshes[0].material.userData.additionalTextures.length,
    6,
  );
  const mat = g.terrainMeshes[0].material;
  assert.deepEqual(mat.defines, { TERRAIN_CAVERN: 1 });
  mat.dispose();
});
test("mineral beds have closed outward faces, buried irregular rims and finite normals on uneven ground", () => {
  const ground = (x, z) => 10 + 0.04 * x - 0.02 * z + 0.15 * Math.sin(x * 0.3),
    x = 55,
    z = 63;
  const g = mineralBedGeometry(x, z, ground, 9),
    pos = g.attributes.position,
    index = g.index,
    edges = new Map();
  assert(pos.array.every(Number.isFinite));
  assert(g.attributes.normal.array.every(Number.isFinite));
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    for (let j = 0; j < 3; j++) {
      const u = ids[j],
        v = ids[(j + 1) % 3],
        key = [Math.min(u, v), Math.max(u, v)].join(",");
      edges.set(key, (edges.get(key) || 0) + 1);
    }
    a.fromBufferAttribute(pos, ids[0]);
    b.fromBufferAttribute(pos, ids[1]);
    c.fromBufferAttribute(pos, ids[2]);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    assert(normal.length() > 0.00001);
    if (ids.every((n) => n < 129)) assert(normal.y > 0);
  }
  assert([...edges.values()].every((n) => n === 2));
  for (let i = 97; i < 129; i++)
    assert(
      Math.abs(
        pos.getY(i) +
          ground(x, z) -
          ground(x + pos.getX(i), z + pos.getZ(i)) +
          0.14,
      ) < 1e-5,
    );
  assert.deepEqual(
    mineralBedGeometry(x, z, ground, 9).attributes.position.array,
    pos.array,
  );
  g.dispose();
});
