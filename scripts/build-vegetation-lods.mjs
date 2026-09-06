import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, simplifyPrimitive } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import { sampleFoliage } from "./sample-foliage.mjs";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
for (const [asset, tiers] of [
  [
    "shrub_01",
    [
      ["middle", 4],
      ["distant", 16],
    ],
  ],
  ["fern_02", [["distant", 2]]],
  ["island_tree_01", [["distant", 6]]],
  ["island_tree_02", [["distant", 6]]],
  ["fir_tree_01", [["distant", 6]]],
]) {
  for (const [tier, stride] of tiers) {
    const doc = await io.read(`public/assets/models/${asset}/optimized.glb`);
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const name = primitive.getMaterial().getName();
        if (
          asset === "shrub_01" ||
          asset === "fern_02" ||
          /leaves|twig/.test(name)
        )
          console.log(asset, tier, name, sampleFoliage(doc, primitive, stride));
        else
          simplifyPrimitive(primitive, {
            simplifier: MeshoptSimplifier,
            ratio: 0.25,
            error: 0.08,
            lockBorder: false,
          });
      }
    }
    await doc.transform(prune(), dedup());
    await io.write(`public/assets/models/${asset}/${tier}.glb`, doc);
  }
}
