import * as THREE from "three";
import { masonryFoundation } from "./masonry-foundations.js";

// Build below an existing cap without consuming the court's layout or color
// random stream. The caller supplies its masonry geometry and material.
export function addMasonryFooting(game, root, options) {
  const { x, z, width, material, blockGeometry, seed, color } = options,
    depth = options.depth ?? width,
    base = root.position.y,
    footing = masonryFoundation(
      (px, pz) => game.groundHeight(px, pz),
      root.position.x + x,
      root.position.z + z,
      width,
      depth,
      game.terrainProfile?.step,
    );
  if (!footing) return null;
  let triangles = 0,
    parts = 0;
  const add = (geometry, y) => {
    const count = geometry.attributes.position.count,
      colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set(color, i * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y - base, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    triangles += (geometry.index?.count ?? count) / 3;
    parts++;
  };
  add(
    new THREE.BoxGeometry(
      width * 0.82,
      footing.top - footing.bottom,
      depth * 0.82,
    ),
    (footing.top + footing.bottom) / 2,
  );
  for (const [i, course] of footing.courses.entries())
    add(
      blockGeometry(footing.width, course.height, footing.depth, seed + i),
      course.y,
    );
  return { ...footing, x, z, triangles, parts };
}
