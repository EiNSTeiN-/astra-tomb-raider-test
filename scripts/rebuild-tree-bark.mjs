// Rebuild trunk geometry from the credited originals. Prepare and validate all
// six deliveries before replacing any public file. Raw downloads stay ignored.
import assert from "node:assert/strict";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { barkCoverage, barkLeaks, preserveBark } from "./preserve-bark.mjs";
import { barkRetained, barkHash } from "./tree-bark-signatures.mjs";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS),
  leafPath = "asset-sources/tree-leaves/sources.json",
  leaves = JSON.parse(await readFile(leafPath, "utf8")),
  records = {
    derivation:
      "Original trunk vertices, normals and UVs, reduced with normal/UV error weights and locked UV chart boundaries. Local source geometry is retained wherever reduced triangles cross the original atlas coverage. Coverage checks inspect every pixel centre and half-pixel edge step at 1024 resolution with one pixel of filtering tolerance. All three tiers use the same reduced trunk; branch/leaf geometry, texture image bytes, node transforms and normalization metadata retain their input signatures.",
    trees: {},
  },
  deliveries = [];

for (const name of ["island_tree_01", "island_tree_02"]) {
  const input = leaves.trees[name];
  for (const source of input.inputs)
    assert.equal(barkHash(await readFile(source.path)), source.sha256);
  const sourceDoc = await io.read(input.inputs[0].path),
    findTrunk = (doc) => {
      const trunks = doc
        .getRoot()
        .listMeshes()
        .flatMap((m) => m.listPrimitives())
        .filter((p) => p.getMaterial().getName() === name);
      assert.equal(trunks.length, 1);
      return trunks[0];
    },
    source = findTrunk(sourceDoc),
    coverage = barkCoverage(source),
    record = {
      source: input.source,
      license: "CC0-1.0",
      authors: ["Rico Cilliers", "Rob Tuytel"],
      inputs: input.inputs,
      coverage: {
        description:
          "Source UV coverage validation fixture, row-major bytes (0 or 1), deflate/base64. Not a runtime texture.",
        size: coverage.size,
        sha256: barkHash(coverage.mask),
        deflateBase64: deflateSync(coverage.mask).toString("base64"),
      },
      outputs: [],
    };
  assert.equal(
    barkLeaks(
      source.getAttribute("TEXCOORD_0").getArray(),
      source.getIndices().getArray(),
      coverage,
    ).length,
    0,
  );
  for (const output of input.outputs) {
    const bytes = await readFile(output.path);
    assert.equal(barkHash(bytes), output.sha256);
    const doc = await io.readBinary(new Uint8Array(bytes)),
      before = barkRetained(doc, name),
      result = await preserveBark(doc, findTrunk(doc), source, coverage);
    await doc.transform(prune());
    const data = await io.writeBinary(doc),
      roundtrip = await io.readBinary(data),
      trunk = findTrunk(roundtrip);
    assert.deepEqual(barkRetained(roundtrip, name), before);
    assert.equal(
      barkLeaks(
        trunk.getAttribute("TEXCOORD_0").getArray(),
        trunk.getIndices().getArray(),
        coverage,
      ).length,
      0,
    );
    const sha256 = barkHash(data);
    record.outputs.push({
      path: output.path,
      sha256,
      bytes: data.byteLength,
      ...result,
      retained: before,
    });
    output.sha256 = sha256;
    deliveries.push({ path: output.path, data });
    console.log(
      output.path,
      result.triangles,
      "triangles; retained inputs verified",
    );
  }
  records.trees[name] = record;
}
leaves.trunkFollowup =
  "Trunks subsequently rebuilt from the same originals by scripts/rebuild-tree-bark.mjs; current output hashes include that repair. Leaf and branch geometry and texture image bytes remain unchanged. See asset-sources/tree-bark/sources.json.";
await mkdir("asset-sources/tree-bark", { recursive: true });
for (const delivery of deliveries)
  await writeFile(delivery.path, delivery.data);
await writeFile(
  "asset-sources/tree-bark/sources.json",
  JSON.stringify(records, null, 2) + "\n",
);
await writeFile(leafPath, JSON.stringify(leaves, null, 2) + "\n");
