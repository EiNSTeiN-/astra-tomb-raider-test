// Bake the original three-dimensional fir sprigs into crossed cutout cards.
// No renderer, external services or image generation are required to rebuild.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, getBounds } from "@gltf-transform/functions";
import { Vector3 } from "three";
import { readFirSprigs, sprigCards } from "./fir-sprigs.mjs";

const source = "asset-sources/models/fir_tree_01",
  recordDirectory = "asset-sources/fir-sprigs";
await mkdir(recordDirectory, { recursive: true });
const fir = await readFirSprigs(source),
  tile = 512,
  width = tile * 6,
  height = tile * 4;
console.log(
  "Source sprigs",
  fir.meshes.map((m) => m.groups.length),
  "templates",
  fir.templates.length,
  "residual",
  fir.maximumResidual,
);
const color = Buffer.alloc(width * height * 4),
  normal = Buffer.alloc(width * height * 3),
  depth = new Float32Array(width * height).fill(-Infinity);
// Padded green RGB avoids dark fringes in transparent mip texels.
for (let i = 0; i < width * height; i++) {
  color.set([57, 76, 29, 0], i * 4);
  normal.set([128, 128, 255], i * 3);
}
const texture = await sharp(`${source}/textures/fir_tree_01_twig_diff_1k.jpg`)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const sample = (u, v) => {
  const x = Math.min(
      texture.info.width - 1,
      Math.floor((u - Math.floor(u)) * texture.info.width),
    ),
    y = Math.min(
      texture.info.height - 1,
      Math.floor((v - Math.floor(v)) * texture.info.height),
    );
  return (y * texture.info.width + x) * 3;
};
for (const template of fir.templates)
  for (const [planeIndex, plane] of template.planes.entries()) {
    const cell = template.id * 3 + planeIndex,
      ox = (cell % 6) * tile,
      oy = Math.floor(cell / 6) * tile,
      vertices = [];
    for (let i = 0; i < template.position.length; i += 3) {
      const point = new Vector3()
          .fromArray(template.position, i)
          .sub(plane.center),
        n = new Vector3().fromArray(template.normal, i);
      vertices.push({
        x:
          ox +
          ((point.dot(plane.u) - plane.min[0]) /
            (plane.max[0] - plane.min[0])) *
            tile,
        y:
          oy +
          ((point.dot(plane.v) - plane.min[1]) /
            (plane.max[1] - plane.min[1])) *
            tile,
        z: point.dot(plane.w),
        n: [n.dot(plane.u), n.dot(plane.v), n.dot(plane.w)],
        uv: [template.uv[(i / 3) * 2], template.uv[(i / 3) * 2 + 1]],
      });
    }
    for (let i = 0; i < template.indices.length; i += 3) {
      const [a, b, c] = template.indices
          .slice(i, i + 3)
          .map((index) => vertices[index]),
        area = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if (Math.abs(area) < 1e-10) continue;
      const minX = Math.max(ox, Math.floor(Math.min(a.x, b.x, c.x))),
        maxX = Math.min(ox + tile - 1, Math.ceil(Math.max(a.x, b.x, c.x))),
        minY = Math.max(oy, Math.floor(Math.min(a.y, b.y, c.y))),
        maxY = Math.min(oy + tile - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          const s =
              ((b.y - c.y) * (x + 0.5 - c.x) + (c.x - b.x) * (y + 0.5 - c.y)) /
              area,
            t =
              ((c.y - a.y) * (x + 0.5 - c.x) + (a.x - c.x) * (y + 0.5 - c.y)) /
              area,
            r = 1 - s - t;
          if (s < 0 || t < 0 || r < 0) continue;
          const z = s * a.z + t * b.z + r * c.z,
            index = y * width + x;
          if (z < depth[index]) continue;
          depth[index] = z;
          const texel = sample(
            s * a.uv[0] + t * b.uv[0] + r * c.uv[0],
            s * a.uv[1] + t * b.uv[1] + r * c.uv[1],
          );
          color.set(
            [
              texture.data[texel],
              texture.data[texel + 1],
              texture.data[texel + 2],
              255,
            ],
            index * 4,
          );
          const n = [0, 1, 2].map((k) => s * a.n[k] + t * b.n[k] + r * c.n[k]);
          if (n[2] < 0) for (let k = 0; k < 3; k++) n[k] *= -1;
          const length = Math.hypot(...n) || 1;
          normal.set(
            n.map((v) => Math.round(((v / length) * 0.5 + 0.5) * 255)),
            index * 3,
          );
        }
    }
  }
const colorPath = "public/assets/textures/fir-sprigs-color.png",
  normalPath = "public/assets/textures/fir-sprigs-normal.png";
await sharp(color, { raw: { width, height, channels: 4 } })
  .resize(width / 2, height / 2, { kernel: "lanczos3" })
  .png()
  .toFile(colorPath);
await sharp(normal, { raw: { width, height, channels: 3 } })
  .resize(width / 2, height / 2, { kernel: "lanczos3" })
  .png()
  .toFile(normalPath);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS),
  recordPath = `${recordDirectory}/sources.json`;
let previous;
try {
  previous = JSON.parse(await readFile(recordPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const near = await io.read("public/assets/models/fir_tree_01/near.glb");
const referenceBounds =
  previous?.referenceBounds || getBounds(near.getRoot().listScenes()[0]);
const hash = async (path) =>
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
  outputs = [];
for (const [tier, planes, stride] of [
  ["near", 3, 1],
  ["optimized", 2, 1],
  ["distant", 2, 2],
]) {
  const path = `public/assets/models/fir_tree_01/${tier}.glb`,
    // The old coarse trunks collapse into disconnected slivers. The near
    // woody geometry is only 1,741 triangles across all three specimens.
    doc = await io.read("public/assets/models/fir_tree_01/near.glb"),
    buffer = doc.getRoot().listBuffers()[0];
  const accessor = (type, values) =>
    doc.createAccessor().setType(type).setArray(values).setBuffer(buffer);
  for (const mesh of doc.getRoot().listMeshes()) {
    const sourceMesh = fir.meshes.find((m) => m.name === mesh.getName());
    if (!sourceMesh) throw Error("Unknown fir mesh");
    const p = mesh
        .listPrimitives()
        .find((p) => /twig/.test(p.getMaterial().getName())),
      cards = sprigCards(sourceMesh.groups, { planes, stride });
    for (const semantic of p.listSemantics()) p.setAttribute(semantic, null);
    p.setAttribute("POSITION", accessor("VEC3", cards.positions));
    p.setAttribute("NORMAL", accessor("VEC3", cards.normals));
    p.setAttribute("TEXCOORD_0", accessor("VEC2", cards.uvs));
    p.setIndices(accessor("SCALAR", cards.indices));
    // The runtime supplies one shared atlas pair to all three delivered tiers.
    p.getMaterial()
      .setBaseColorTexture(null)
      .setNormalTexture(null)
      .setMetallicRoughnessTexture(null)
      .setAlphaMode("MASK")
      .setAlphaCutoff(0.35)
      .setDoubleSided(true)
      .setRoughnessFactor(0.95);
  }
  for (const scene of doc.getRoot().listScenes())
    scene.setExtras({
      ...scene.getExtras(),
      vesperTreeBounds: referenceBounds,
    });
  // UVs are used by the shared runtime atlas even though it is not embedded.
  await doc.transform(prune({ keepAttributes: true }), dedup());
  await io.write(path, doc);
  const triangles = doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((sum, p) => sum + p.getIndices().getCount() / 3, 0);
  outputs.push({ path, planes, stride, triangles, sha256: await hash(path) });
  console.log(tier, triangles);
}
await writeFile(
  recordPath,
  JSON.stringify(
    {
      source: "https://polyhaven.com/a/fir_tree_01",
      license: "CC0-1.0",
      derivation:
        "Seven repeated source sprigs, fitted by four corresponding vertices and validated against every vertex, UV and triangle. Three orthographic color/normal bakes per template; 1536x1024 shared atlases. Near uses three crossed cards per sprig; middle uses two; distant retains one deterministically chosen sprig per pair at sqrt(2) size. All tiers retain the near woody geometry and the original normalization bounds.",
      templates: fir.templates.length,
      sprigs: fir.meshes.map((m) => ({ name: m.name, count: m.groups.length })),
      maximumResidual: fir.maximumResidual,
      referenceBounds,
      inputs: await Promise.all(
        [
          `${source}/scene.gltf`,
          `${source}/fir_tree_01.bin`,
          `${source}/textures/fir_tree_01_twig_diff_1k.jpg`,
        ].map(async (path) => ({ path, sha256: await hash(path) })),
      ),
      outputs: [
        ...outputs,
        ...(await Promise.all(
          [colorPath, normalPath].map(async (path) => ({
            path,
            sha256: await hash(path),
          })),
        )),
      ],
    },
    null,
    2,
  ) + "\n",
);
