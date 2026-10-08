import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";

export function pierCornerGeometry(height, seed, sx, sz) {
  const geometry = stoneBlockGeometry(0.31, height, 0.31, seed),
    attributes = Object.entries(geometry.attributes),
    values = attributes.map(() => []),
    normal = geometry.attributes.normal;
  // The continuous corner bearing carries the hidden faces. Preserve both
  // outward dressed faces and their bevels, rather than submitting the buried
  // back, inner sides and horizontal joints as another complete solid.
  for (let i = 0; i < normal.count; i += 3) {
    if (normal.getX(i) * sx <= 0.1 && normal.getZ(i) * sz <= 0.1) continue;
    for (let a = 0; a < attributes.length; a++) {
      const attribute = attributes[a][1];
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < attribute.itemSize; k++)
          values[a].push(attribute.array[(i + j) * attribute.itemSize + k]);
    }
  }
  for (let a = 0; a < attributes.length; a++)
    geometry.setAttribute(
      attributes[a][0],
      new THREE.Float32BufferAttribute(values[a], attributes[a][1].itemSize),
    );
  return geometry;
}

// Batching expands every triangle. Index only exact duplicates, including all
// material attributes, so hard normals, UV seams and paint edges stay intact.
export function indexPierGeometry(group) {
  let before = 0,
    after = 0;
  for (const object of group.children) {
    const geometry = object.geometry;
    if (!geometry || geometry.index) continue;
    const attributes = Object.entries(geometry.attributes),
      values = attributes.map(() => []),
      vertices = new Map(),
      indices = [];
    before += geometry.attributes.position.count;
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      const components = attributes.flatMap(([, attribute]) =>
          Array.from(
            { length: attribute.itemSize },
            (_, k) => attribute.array[i * attribute.itemSize + k],
          ),
        ),
        key = components
          .map((component) => (Object.is(component, -0) ? "-0" : component))
          .join(",");
      let index = vertices.get(key);
      if (index === undefined) {
        index = vertices.size;
        vertices.set(key, index);
        for (let a = 0; a < attributes.length; a++) {
          const attribute = attributes[a][1];
          for (let k = 0; k < attribute.itemSize; k++)
            values[a].push(attribute.array[i * attribute.itemSize + k]);
        }
      }
      indices.push(index);
    }
    for (let a = 0; a < attributes.length; a++) {
      const [name, attribute] = attributes[a];
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(
          new attribute.array.constructor(values[a]),
          attribute.itemSize,
          attribute.normalized,
        ),
      );
    }
    geometry.setIndex(indices);
    after += geometry.attributes.position.count;
  }
  return { before, after };
}
