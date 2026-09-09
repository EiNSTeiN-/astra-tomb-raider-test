// Replace only leaf geometry in the delivered tiers. Existing trunks, branches,
// images and nodes stay intact; the normalization bounds preserve world size.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, getBounds } from "@gltf-transform/functions";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { preserveCanopy } from "./preserve-canopy.mjs";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const file = "asset-sources/tree-leaves/sources.json";
const records = JSON.parse(await readFile(file, "utf8"));
const hash = async (p) =>
  createHash("sha256")
    .update(await readFile(p))
    .digest("hex");
records.trees ||= {};
for (const asset of ["island_tree_01", "island_tree_02"]) {
  const sourcePath = `asset-sources/models/${asset}/scene.gltf`,
    source = await io.read(sourcePath);
  const near = await io.read(`public/assets/models/${asset}/near.glb`);
  const referenceBounds =
    records.trees[asset]?.referenceBounds ||
    getBounds(near.getRoot().listScenes()[0]);
  const outputs = [];
  for (const [tier, stride] of [
    ["near", 1],
    ["optimized", 8],
    ["distant", 48],
  ]) {
    const path = `public/assets/models/${asset}/${tier}.glb`,
      doc = await io.read(path),
      leaves = [];
    for (const mesh of doc.getRoot().listMeshes())
      for (const p of mesh.listPrimitives()) {
        if (!p.getMaterial().getName().includes("leaves")) continue;
        const original = source
          .getRoot()
          .listMeshes()
          .flatMap((m) => m.listPrimitives())
          .find((s) => s.getMaterial().getName() === p.getMaterial().getName());
        if (!original) throw Error("Missing source leaf mesh");
        leaves.push(preserveCanopy(doc, p, stride, original));
      }
    for (const scene of doc.getRoot().listScenes())
      scene.setExtras({
        ...scene.getExtras(),
        vesperTreeBounds: referenceBounds,
      });
    await doc.transform(prune(), dedup());
    await io.write(path, doc);
    outputs.push({ path, sha256: await hash(path), leaves });
    console.log(asset, tier, JSON.stringify(leaves));
  }
  records.trees[asset] = {
    source: `https://polyhaven.com/a/${asset}`,
    license: "CC0-1.0",
    inputs: [
      { path: sourcePath, sha256: await hash(sourcePath) },
      {
        path: `asset-sources/models/${asset}/${asset}.bin`,
        sha256: await hash(`asset-sources/models/${asset}/${asset}.bin`),
      },
    ],
    referenceBounds,
    outputs,
  };
}
records.derivation =
  "Two-triangle UV-bounds leaf cards fitted to the source leaf vertices; original sampling strides 1/8/48, with area compensation. Existing non-leaf geometry and images retained. Original near-tier bounds retain tree normalization. Runtime supplies the shared unmodified alpha map and bakes middle/distant leaf clusters into shared color, normal and roughness atlases once per jungle load. Ordinary foliage and depth materials sample those atlases each frame.";
await writeFile(file, JSON.stringify(records, null, 2) + "\n");
