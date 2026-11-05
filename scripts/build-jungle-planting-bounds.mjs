import { writeFile } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import * as THREE from "three";
import { format } from "prettier";
import { jungleSpecimen } from "../src/jungle-grounding.js";

function hull(points) {
  const unique = new Map(points.map((p) => [[p.x, p.z].join(), [p.x, p.z]])),
    sorted = [...unique.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    cross = (a, b, c) =>
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    half = (points) => {
      const result = [];
      for (const p of points) {
        while (result.length > 1 && cross(result.at(-2), result.at(-1), p) <= 0)
          result.pop();
        result.push(p);
      }
      return result.slice(0, -1);
    };
  return [...half(sorted), ...half([...sorted].reverse())].map((p) =>
    p.map((v) => Number(v.toFixed(6))),
  );
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS),
  bounds = [];
for (const name of ["island_tree_01", "island_tree_02"]) {
  const scenes = [];
  try {
    for (const tier of ["near", "optimized", "distant"]) {
      const document = await io.read(
          `public/assets/models/${name}/${tier}.glb`,
        ),
        scene = new THREE.Group();
      scene.userData = document.getRoot().listScenes()[0].getExtras();
      scenes.push(scene);
      for (const node of document.getRoot().listNodes()) {
        if (!node.getMesh()) continue;
        const group = new THREE.Group();
        group.matrixAutoUpdate = false;
        group.matrix.fromArray(node.getWorldMatrix());
        for (const primitive of node.getMesh().listPrimitives()) {
          const geometry = new THREE.BufferGeometry(),
            material = new THREE.MeshBasicMaterial();
          for (const [name, semantic, size] of [
            ["position", "POSITION", 3],
            ["uv", "TEXCOORD_0", 2],
          ])
            geometry.setAttribute(
              name,
              new THREE.BufferAttribute(
                primitive.getAttribute(semantic).getArray(),
                size,
              ),
            );
          if (primitive.getIndices())
            geometry.setIndex(
              new THREE.BufferAttribute(primitive.getIndices().getArray(), 1),
            );
          material.name = primitive.getMaterial().getName();
          group.add(new THREE.Mesh(geometry, material));
        }
        scene.add(group);
      }
    }
    const specimen = jungleSpecimen(scenes);
    bounds.push({
      radius: specimen.radius,
      footprint: hull([...specimen.roots, ...specimen.apron]),
    });
  } finally {
    for (const scene of scenes)
      scene.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
  }
}
await writeFile(
  "src/jungle-planting-bounds.js",
  await format(
    "// Root/apron bounds from all three delivered island-tree tiers.\n" +
      "// Regenerate with scripts/build-jungle-planting-bounds.mjs after changing the scans.\n" +
      `export const JUNGLE_PLANTING_BOUNDS = ${JSON.stringify(bounds, null, 2)};\n`,
    { parser: "babel" },
  ),
);
console.log(
  bounds.map(({ radius, footprint }) => ({
    radius,
    vertices: footprint.length,
  })),
);
