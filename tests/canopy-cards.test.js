import test from "node:test";
import assert from "node:assert/strict";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { preserveCanopy } from "../scripts/preserve-canopy.mjs";

function fixture(degenerate = false) {
  const doc = new Document(),
    buffer = doc.createBuffer(),
    p = [],
    n = [],
    uv = [],
    index = [];
  const project = (u, v, leaf) => [
    leaf * 3 + u * 2 + v * 0.3,
    2 + u * 0.7 - v * 0.4,
    -1 + v * 1.2,
  ];
  const normal = [0.84, -2.4, -1.01],
    len = Math.hypot(...normal);
  for (let leaf = 0; leaf < 3; leaf++)
    for (let i = 0; i < 16; i++) {
      const u = 0.4 + Math.cos((i / 8) * Math.PI) * 0.1,
        v = 0.6 + Math.sin((i / 8) * Math.PI) * 0.2;
      p.push(...project(u, v, leaf));
      n.push(...normal.map((x) => x / len));
      uv.push(u, degenerate ? u : v);
      if (i > 1) index.push(leaf * 16, leaf * 16 + i - 1, leaf * 16 + i);
    }
  const a = (type, array) =>
    doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const primitive = doc
    .createPrimitive()
    .setMaterial(doc.createMaterial())
    .setAttribute("POSITION", a("VEC3", new Float32Array(p)))
    .setAttribute("NORMAL", a("VEC3", new Float32Array(n)))
    .setAttribute("TEXCOORD_0", a("VEC2", new Float32Array(uv)))
    .setIndices(a("SCALAR", new Uint32Array(index)));
  return { doc, primitive, project };
}

test("fitted leaf cards contain the full texture rectangle and preserve the source plane and front", () => {
  const { doc, primitive, project } = fixture();
  const r = preserveCanopy(doc, primitive);
  assert.equal(r.retained, 3);
  assert.equal(r.triangles, 6);
  const p = primitive.getAttribute("POSITION"),
    uv = primitive.getAttribute("TEXCOORD_0"),
    normal = primitive.getAttribute("NORMAL"),
    idx = primitive.getIndices().getArray();
  for (let leaf = 0; leaf < 3; leaf++)
    for (let i = 0; i < 4; i++) {
      const tex = uv.getElement(leaf * 4 + i, []);
      assert(Math.min(Math.abs(tex[0] - 0.3), Math.abs(tex[0] - 0.5)) < 1e-6);
      assert(Math.min(Math.abs(tex[1] - 0.4), Math.abs(tex[1] - 0.8)) < 1e-6);
      const expected = project(...tex, leaf),
        actual = p.getElement(leaf * 4 + i, []);
      assert(Math.hypot(...actual.map((n, a) => n - expected[a])) < 1e-6);
      assert(
        Math.abs(Math.hypot(...normal.getElement(leaf * 4 + i, [])) - 1) < 1e-6,
      );
    }
  for (let i = 0; i < idx.length; i += 3) {
    const a = p.getElement(idx[i], []),
      b = p.getElement(idx[i + 1], []).map((x, k) => x - a[k]),
      c = p.getElement(idx[i + 2], []).map((x, k) => x - a[k]);
    const cross = [
        b[1] * c[2] - b[2] * c[1],
        b[2] * c[0] - b[0] * c[2],
        b[0] * c[1] - b[1] * c[0],
      ],
      n = normal.getElement(idx[i], []);
    assert(cross.reduce((s, x, k) => s + x * n[k], 0) > 0);
  }
});

test("sampling retains complete four-corner leaves, while degenerate UVs cannot silently collapse them", () => {
  const { doc, primitive } = fixture();
  const r = preserveCanopy(doc, primitive, 2);
  assert.equal(r.retained, 2);
  assert.equal(primitive.getAttribute("POSITION").getCount(), 8);
  assert.equal(primitive.getIndices().getCount(), 12);
  const bad = fixture(true);
  assert.throws(
    () => preserveCanopy(bad.doc, bad.primitive),
    /degenerate texture/,
  );
});

test("delivered leaf cards, shared coverage map and normalization metadata match their provenance", async () => {
  const records = JSON.parse(
      await readFile("asset-sources/tree-leaves/sources.json", "utf8"),
    ),
    mask = await readFile(records.mask.path),
    io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  assert.equal(
    createHash("sha256").update(mask).digest("hex"),
    records.mask.sha256,
  );
  const metadata = await sharp(mask).metadata();
  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 1024);
  const pixels = await sharp(mask).removeAlpha().greyscale().raw().toBuffer();
  assert(pixels.some((v) => v === 0));
  assert(pixels.some((v) => v === 255));
  assert(pixels.filter((v) => v === 0).length > pixels.length * 0.4);
  let sharedAtlas;
  for (const [asset, record] of Object.entries(records.trees))
    for (const output of record.outputs) {
      const data = await readFile(output.path);
      assert.equal(
        createHash("sha256").update(data).digest("hex"),
        output.sha256,
      );
      const d = await io.readBinary(new Uint8Array(data));
      for (const scene of d.getRoot().listScenes())
        assert.deepEqual(
          scene.getExtras().vesperTreeBounds,
          record.referenceBounds,
        );
      for (const p of d
        .getRoot()
        .listMeshes()
        .flatMap((m) => m.listPrimitives())
        .filter((p) => p.getMaterial().getName().includes("leaves"))) {
        const uv = p.getAttribute("TEXCOORD_0"),
          bounds = p.getAttribute("_LEAF_BOUNDS"),
          position = p.getAttribute("POSITION");
        assert.equal(bounds.getCount(), position.getCount());
        const material = p.getMaterial();
        const signature = {
          regions: [
            ...new Set(
              Array.from({ length: bounds.getCount() / 4 }, (_, i) =>
                bounds.getElement(i * 4, []).join(","),
              ),
            ),
          ].sort(),
          maps: [
            material.getBaseColorTexture(),
            material.getNormalTexture(),
            material.getMetallicRoughnessTexture(),
          ].map((texture) =>
            createHash("sha256").update(texture.getImage()).digest("hex"),
          ),
        };
        assert.equal(signature.regions.length, 8);
        sharedAtlas ||= signature;
        assert.deepEqual(
          signature,
          sharedAtlas,
          "Both species and all tiers must share the baked atlas inputs",
        );
        assert.equal(position.getCount() % 4, 0);
        assert.equal(p.getIndices().getCount(), position.getCount() * 1.5);
        for (let i = 0; i < uv.getCount(); i += 4) {
          const a = uv.getElement(i, []),
            b = uv.getElement(i + 1, []),
            c = uv.getElement(i + 2, []),
            e = uv.getElement(i + 3, []);
          assert(a[0] < b[0] && a[1] < e[1], asset);
          assert.equal(a[1], b[1]);
          assert.equal(b[0], c[0]);
          assert.equal(c[1], e[1]);
          assert.equal(e[0], a[0]);
          for (let corner = 0; corner < 4; corner++)
            assert.deepEqual(bounds.getElement(i + corner, []), [
              a[0],
              a[1],
              c[0],
              c[1],
            ]);
        }
        assert(position.getArray().every(Number.isFinite));
      }
    }
});
