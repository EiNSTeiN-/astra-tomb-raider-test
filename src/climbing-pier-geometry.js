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
