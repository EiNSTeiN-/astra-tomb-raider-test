// Convert the project's generated grayscale carving into a shallow stone mesh.
// Run with the original PNG path; the shipped GLB needs no runtime conversion.
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import * as THREE from "three";
import { Document, NodeIO } from "@gltf-transform/core";

const source = process.argv[2];
if (!source) throw new Error("Pass the generated memorial relief PNG path.");
const columns = 384,
  rows = 192,
  width = 6.6,
  height = 3.3;
const pixels = await sharp(source)
  .resize(columns + 1, rows + 1, { fit: "fill" })
  .grayscale()
  .blur(0.65)
  .raw()
  .toBuffer();
const geometry = new THREE.PlaneGeometry(width, height, columns, rows);
const positions = geometry.attributes.position;
// This is a stylized luminance interpretation, not calibrated scan depth.
for (let i = 0; i < positions.count; i++)
  positions.setZ(i, 0.025 + (0.15 * pixels[i]) / 255);
geometry.computeVertexNormals();
// Match the surrounding stone's two-metre texture scale.
const uv = geometry.attributes.uv;
for (let i = 0; i < uv.count; i++)
  uv.setXY(i, (uv.getX(i) * width) / 2, (uv.getY(i) * height) / 2);
const document = new Document(),
  buffer = document.createBuffer();
const accessor = (name, type, array) =>
  document.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
const primitive = document
  .createPrimitive()
  .setAttribute(
    "POSITION",
    accessor("carved positions", "VEC3", positions.array),
  )
  .setAttribute(
    "NORMAL",
    accessor("carved normals", "VEC3", geometry.attributes.normal.array),
  )
  .setAttribute(
    "TEXCOORD_0",
    accessor("stone coordinates", "VEC2", geometry.attributes.uv.array),
  )
  .setIndices(accessor("triangles", "SCALAR", geometry.index.array));
document
  .createScene("Maritime memorial relief")
  .addChild(
    document
      .createNode("Evacuation boats in shallow relief")
      .setMesh(
        document.createMesh("carved stone face").addPrimitive(primitive),
      ),
  );
await mkdir("public/assets/memorial", { recursive: true });
await new NodeIO().write(
  "public/assets/memorial/evacuation-relief.glb",
  document,
);
console.log(
  JSON.stringify({
    vertices: positions.count,
    triangles: geometry.index.count / 3,
    width,
    height,
  }),
);
