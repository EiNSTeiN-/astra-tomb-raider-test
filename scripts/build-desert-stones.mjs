import { NodeIO } from "@gltf-transform/core";
import { prune } from "@gltf-transform/functions";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const input = "public/assets/models/rock_moss_set_01/optimized.glb";
const output = "public/assets/models/desert-stones.glb";
const io = new NodeIO(),
  document = await io.read(new URL(input, root).pathname);
for (const mesh of document.getRoot().listMeshes())
  for (const primitive of mesh.listPrimitives()) {
    primitive.setMaterial(null);
    primitive.setAttribute("TEXCOORD_0", null);
    primitive.setAttribute("TANGENT", null);
  }
await document.transform(prune());
await io.write(new URL(output, root).pathname, document);
const record = async (file) => {
  const data = await readFile(new URL(file, root));
  return {
    file,
    bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
};
const manifest = {
  source: "https://polyhaven.com/a/rock_moss_set_01",
  author: "Kless Gyzen",
  license: "CC0-1.0",
  license_url: "https://polyhaven.com/license",
  derivation:
    "Six existing simplified rock meshes retain their positions, normals, indices and node transforms. Materials, images, UVs and tangents are omitted. Runtime adds sandstone shading and terrain seating.",
  input: await record(input),
  output: await record(output),
};
await mkdir(new URL("asset-sources/desert-stones/", root), { recursive: true });
await writeFile(
  new URL("asset-sources/desert-stones/sources.json", root),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(manifest.output);
