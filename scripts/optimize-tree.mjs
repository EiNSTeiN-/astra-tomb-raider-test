import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { NodeIO } from "@gltf-transform/core";
import {
  simplifyPrimitive,
  weld,
  prune,
  dedup,
} from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import { mkdir, readFile } from "node:fs/promises";
import { preserveCanopy } from "./preserve-canopy.mjs";
import { preserveNeedles } from "./preserve-needles.mjs";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const treeLeaves = JSON.parse(
  await readFile("asset-sources/tree-leaves/sources.json", "utf8"),
);
await MeshoptSimplifier.ready;
for (const asset of process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["island_tree_01", "island_tree_02", "fir_tree_01"]) {
  await mkdir(`public/assets/models/${asset}`, { recursive: true });
  for (const [name, ratio, error] of [
    ["near", 0.055, 0.018],
    ["optimized", 0.008, 0.06],
  ]) {
    const doc = await io.read(`asset-sources/models/${asset}/scene.gltf`);
    if (asset.startsWith("island")) {
      for (const mesh of doc.getRoot().listMeshes())
        for (const primitive of mesh.listPrimitives()) {
          if (primitive.getMaterial()?.getName().includes("leaves")) {
            const result = preserveCanopy(
              doc,
              primitive,
              name === "near" ? 1 : 8,
            );
            console.log(asset, name, "canopy", result);
          } else {
            simplifyPrimitive(primitive, {
              simplifier: MeshoptSimplifier,
              ratio,
              error,
              lockBorder: false,
            });
          }
        }
      await doc.transform(weld(), prune(), dedup());
    } else {
      for (const mesh of doc.getRoot().listMeshes())
        for (const primitive of mesh.listPrimitives()) {
          if (primitive.getMaterial()?.getName().includes("twig")) {
            console.log(
              asset,
              name,
              "needles",
              preserveNeedles(doc, primitive, name === "near" ? 32 : 256),
            );
          } else
            simplifyPrimitive(primitive, {
              simplifier: MeshoptSimplifier,
              ratio: ratio * 0.12,
              error,
              lockBorder: false,
            });
        }
      await doc.transform(weld(), prune(), dedup());
    }

    const reference = treeLeaves.trees[asset]?.referenceBounds;
    if (reference)
      for (const scene of doc.getRoot().listScenes())
        scene.setExtras({ ...scene.getExtras(), vesperTreeBounds: reference });
    await io.write(`public/assets/models/${asset}/${name}.glb`, doc);
    const triangles = doc
      .getRoot()
      .listMeshes()
      .reduce(
        (n, m) =>
          n +
          m
            .listPrimitives()
            .reduce((a, p) => a + (p.getIndices()?.getCount() || 0) / 3, 0),
        0,
      );
    console.log(`${asset} ${name}: ${triangles.toLocaleString()} triangles`);
  }
}
