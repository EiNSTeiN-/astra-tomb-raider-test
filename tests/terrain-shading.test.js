import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { fitTerrainNormals } from "../src/terrain-shading.js";
function inspect(g) {
  const p = g.attributes.position,
    n = g.attributes.normal,
    ids = g.index;
  let bad = 0;
  for (let i = 0; i < (ids?.count ?? p.count); i += 3) {
    const v = [0, 1, 2].map((j) =>
        new T.Vector3().fromBufferAttribute(p, ids ? ids.getX(i + j) : i + j),
      ),
      f = new T.Triangle(...v).getNormal(new T.Vector3());
    for (let j = 0; j < 3; j++)
      if (
        new T.Vector3()
          .fromBufferAttribute(n, ids ? ids.getX(i + j) : i + j)
          .dot(f) < -1e-6
      )
        bad++;
  }
  return bad;
}
function fixture() {
  const g = new T.BufferGeometry(),
    up = new T.Vector3(4, 1, 0).normalize(),
    left = new T.Vector3(-4, 1, 0).normalize();
  g.setAttribute(
    "position",
    new T.Float32BufferAttribute([0, 0, 0, 0, 0, 1, 1, 4, 0, -1, 4, 0], 3),
  );
  g.setAttribute(
    "normal",
    new T.Float32BufferAttribute(
      [...up.toArray(), ...up.toArray(), ...left.toArray(), ...up.toArray()],
      3,
    ),
  );
  g.setAttribute(
    "uv",
    new T.Float32BufferAttribute([0, 0, 0, 1, 1, 0, -1, 0], 2),
  );
  g.setAttribute("court", new T.Float32BufferAttribute([0.2, 0.4, 0.8, 1], 1));
  g.setAttribute("mask", new T.Uint8BufferAttribute([11, 33, 66, 99], 1, true));
  g.setIndex([0, 1, 2, 0, 3, 1]);
  return g;
}
function corners(g) {
  const r = {};
  for (const [name, a] of Object.entries(g.attributes))
    if (name !== "normal")
      r[name] = Array.from({ length: g.index?.count ?? a.count }, (_, i) => {
        const id = g.index ? g.index.getX(i) : i;
        return Array.from(
          a.array.subarray(id * a.itemSize, (id + 1) * a.itemSize),
        );
      });
  return r;
}
test("only opposing corners split, retaining all expanded surface fields and unaffected normal values", () => {
  const g = fixture(),
    before = corners(g),
    originalNormals = g.attributes.normal.array.slice(),
    originalPoints = g.attributes.position.array.slice();
  try {
    assert.equal(inspect(g), 2);
    assert.equal(fitTerrainNormals(g), 2);
    assert.equal(inspect(g), 0);
    assert.equal(g.attributes.position.count, 6);
    assert.deepEqual(corners(g), before);
    assert.deepEqual(g.attributes.normal.array.slice(0, 12), originalNormals);
    assert.deepEqual(g.attributes.position.array.slice(0, 12), originalPoints);
    assert(g.attributes.mask.normalized);
    const attrs = { ...g.attributes },
      index = g.index;
    assert.equal(fitTerrainNormals(g), 0);
    for (const [k, v] of Object.entries(attrs))
      assert.equal(g.attributes[k], v);
    assert.equal(g.index, index);
  } finally {
    g.dispose();
  }
});
test("nonindexed faces correct only their normals and do not allocate duplicate positions", () => {
  const indexed = fixture(),
    g = indexed.toNonIndexed(),
    before = corners(g),
    positions = g.attributes.position;
  try {
    assert.equal(inspect(g), 2);
    assert.equal(fitTerrainNormals(g), 2);
    assert.equal(inspect(g), 0);
    assert.deepEqual(corners(g), before);
    assert.equal(g.attributes.position, positions);
    assert.equal(g.index, null);
    assert.equal(fitTerrainNormals(g), 0);
  } finally {
    indexed.dispose();
    g.dispose();
  }
});
test("valid flat and steep faces keep their original buffers", () => {
  for (const angle of [0, 0.6, 1.2]) {
    const g = new T.PlaneGeometry(4, 4, 2, 2).rotateX(-Math.PI / 2 + angle),
      attrs = { ...g.attributes },
      index = g.index;
    try {
      assert.equal(inspect(g), 0);
      assert.equal(fitTerrainNormals(g), 0);
      for (const [k, v] of Object.entries(attrs))
        assert.equal(g.attributes[k], v);
      assert.equal(g.index, index);
    } finally {
      g.dispose();
    }
  }
});

test("all eight delivered terrain factories retain face agreement, including clipped gallery triangles", async () => {
  const { LEVELS, createMap } = await import("../src/campaign.js"),
    { createTerrainProfile, buildTerrainSurface } =
      await import("../src/terrain.js"),
    { verifyTerrainNormals } =
      await import("../scripts/inspect-terrain-normals-browser.js"),
    load = T.TextureLoader.prototype.load;
  T.TextureLoader.prototype.load = function (url, done) {
    const t = new T.Texture();
    queueMicrotask(() => done?.(t));
    return t;
  };
  let corners = 0;
  try {
    for (const level of LEVELS) {
      const map = createMap(level),
        g = {
          level,
          map,
          terrainProfile: createTerrainProfile(map, level),
          world: new T.Group(),
        };
      buildTerrainSurface(g);
      await g.terrainTexturesReady;
      try {
        const bytes = g.terrainMeshes.map((m) =>
            m.geometry.attributes.normal.array.slice(),
          ),
          result = verifyTerrainNormals(g);
        assert.equal(result.accepted.opposing, 0);
        assert.equal(result.accepted.invalid, 0);
        assert.equal(result.accepted.degenerate, 0);
        assert.equal(result.reversedOpposing, result.accepted.corners);
        for (let i = 0; i < bytes.length; i++)
          assert.deepEqual(
            g.terrainMeshes[i].geometry.attributes.normal.array,
            bytes[i],
          );
        corners += result.accepted.corners;
      } finally {
        const materials = new Set(),
          textures = new Set();
        for (const m of g.terrainMeshes) {
          m.geometry.dispose();
          materials.add(m.material);
        }
        for (const m of materials) {
          for (const t of [
            m.map,
            m.normalMap,
            m.roughnessMap,
            ...m.userData.additionalTextures,
          ])
            textures.add(t);
          m.dispose();
        }
        textures.forEach((t) => t.dispose());
        g.world.clear();
      }
    }
    assert(corners > 3900000);
  } finally {
    T.TextureLoader.prototype.load = load;
  }
});
