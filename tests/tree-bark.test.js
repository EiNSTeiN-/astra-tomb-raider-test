import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  barkCoverage,
  barkLeaks,
  barkBoundaryLocks,
} from "../scripts/preserve-bark.mjs";
import { barkRetained, barkHash } from "../scripts/tree-bark-signatures.mjs";

function fixture(uv, indices) {
  const d = new Document(),
    b = d.createBuffer();
  return d
    .createPrimitive()
    .setAttribute(
      "TEXCOORD_0",
      d
        .createAccessor()
        .setType("VEC2")
        .setArray(new Float32Array(uv))
        .setBuffer(b),
    )
    .setIndices(
      d
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint32Array(indices))
        .setBuffer(b),
    );
}

test("bark coverage keeps thin source faces but rejects a bridge across separate UV islands", () => {
  const uv = [0.05, 0.1, 0.3, 0.1, 0.3, 0.8, 0.7, 0.1, 0.95, 0.1, 0.7, 0.8],
    original = [0, 1, 2, 3, 4, 5],
    source = fixture(uv, original),
    coverage = barkCoverage(source, 128);
  assert.equal(barkLeaks(uv, original, coverage).length, 0);
  assert.deepEqual(barkLeaks(uv, [1, 2, 3], coverage), [[1, 2, 3]]);
  const thin = fixture([0.1, 0.45, 0.9, 0.45, 0.5, 0.45001], [0, 1, 2]),
    thinCoverage = barkCoverage(thin, 128);
  assert.equal(
    barkLeaks(
      thin.getAttribute("TEXCOORD_0").getArray(),
      [0, 1, 2],
      thinCoverage,
    ).length,
    0,
  );
  assert.equal(thinCoverage.mask[0], 0);
  assert.throws(
    () => barkCoverage(fixture([Infinity, 0, 0, 0, 0, 1], [0, 1, 2])),
    /source UVs/,
  );
});

test("bark checking detects narrow interior holes even with covered triangle edges", () => {
  const size = 128,
    mask = new Uint8Array(size * size).fill(1),
    uv = [0.1, 0.1, 0.9, 0.1, 0.5, 0.9];
  mask[64 * size + 63] = 0;
  assert.deepEqual(barkLeaks(uv, [0, 1, 2], { size, mask }), [[0, 1, 2]]);
  assert.equal(
    barkLeaks([NaN, 0, 0, 0, 0, 1], [0, 1, 2], { size, mask }).length,
    1,
  );
  assert.equal(
    barkLeaks([0, 0, 1, 0, 1.1, 1], [0, 1, 2], { size, mask }).length,
    1,
  );
});

test("index boundaries lock both sides of texture seams and leave interior vertices free", () => {
  // Four triangles around an interior vertex, plus a separate indexed island.
  const locks = barkBoundaryLocks(
    [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4, 5, 6, 7],
    8,
  );
  assert.deepEqual([...locks], [1, 1, 1, 1, 0, 1, 1, 1]);
});

test("six delivered trunks stay inside the source atlas and retain all non-trunk inputs", async () => {
  const records = JSON.parse(
      await readFile("asset-sources/tree-bark/sources.json", "utf8"),
    ),
    io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  for (const [name, record] of Object.entries(records.trees)) {
    const mask = inflateSync(
        Buffer.from(record.coverage.deflateBase64, "base64"),
      ),
      coverage = { size: record.coverage.size, mask };
    assert.equal(mask.length, coverage.size ** 2);
    assert.equal(barkHash(mask), record.coverage.sha256);
    assert(mask.includes(0) && mask.includes(1));
    let common;
    for (const output of record.outputs) {
      const bytes = await readFile(output.path);
      assert.equal(barkHash(bytes), output.sha256);
      const doc = await io.readBinary(new Uint8Array(bytes)),
        p = doc
          .getRoot()
          .listMeshes()
          .flatMap((m) => m.listPrimitives())
          .find((p) => p.getMaterial().getName() === name),
        uv = p.getAttribute("TEXCOORD_0").getArray(),
        index = p.getIndices().getArray();
      assert.deepEqual(barkRetained(doc, name), output.retained);
      assert.equal(index.length / 3, output.triangles);
      assert(output.triangles < output.sourceTriangles * 0.35);
      assert.equal(barkLeaks(uv, index, coverage).length, 0, output.path);
      assert(p.getAttribute("POSITION").getArray().every(Number.isFinite));
      const signature = [...p.listAttributes(), p.getIndices()].map((a) =>
        barkHash(
          new Uint8Array(
            a.getArray().buffer,
            a.getArray().byteOffset,
            a.getArray().byteLength,
          ),
        ),
      );
      common ||= signature;
      assert.deepEqual(
        signature,
        common,
        "Trunk shape and UVs must agree across distance tiers",
      );
    }
  }
});
