import { NodeIO } from "@gltf-transform/core";
import { simplify, weld, prune, dedup } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
const io = new NodeIO();
await MeshoptSimplifier.ready;
for (const name of ["shrub_01", "fern_02", "rock_moss_set_01"]) {
  const doc = await io.read(`asset-sources/models/${name}/scene.gltf`);
  const triangles = () =>
    doc
      .getRoot()
      .listMeshes()
      .reduce(
        (n, m) =>
          n +
          m
            .listPrimitives()
            .reduce(
              (a, p) =>
                a +
                (p.getIndices()?.getCount() ||
                  p.getAttribute("POSITION").getCount()) /
                  3,
              0,
            ),
        0,
      );
  const before = triangles();
  await doc.transform(
    weld(),
    simplify({
      simplifier: MeshoptSimplifier,
      ratio: name === "shrub_01" ? 0.14 : name === "fern_02" ? 0.7 : 0.2,
      error: 0.025,
      lockBorder: false,
    }),
    prune(),
    dedup(),
  );
  await io.write(`public/assets/models/${name}/optimized.glb`, doc);
  console.log(
    name,
    Math.round(before),
    "→",
    Math.round(triangles()),
    "triangles",
  );
}
