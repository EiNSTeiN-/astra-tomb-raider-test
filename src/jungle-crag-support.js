import * as THREE from "three";
import { TriangleSolids } from "./triangle-solids.js";

function clip(polygon, distance) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      da = distance(a),
      db = distance(b);
    if (da >= 0) result.push(a);
    if (da >= 0 !== db >= 0) result.push(a.clone().lerp(b, da / (da - db)));
  }
  return result;
}

// The closed volume remains movement/sight cover. Only exposed upward pieces
// can hold a body: its disk must not stand on a back face buried in the bank.
// Clip against each actual terrain triangle so mixed exposed/buried faces
// retain their visible part, including narrow ledge ends and grid diagonals.
export function jungleCragSupportGeometry(profile, meshes) {
  const vertices = [],
    step = profile.step,
    extent = profile.extent;
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const p = mesh.geometry.attributes.position,
      index = mesh.geometry.index;
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const points = [0, 1, 2].map((j) =>
        new THREE.Vector3()
          .fromBufferAttribute(p, index ? index.getX(i + j) : i + j)
          .applyMatrix4(mesh.matrixWorld),
      );
      if (new THREE.Triangle(...points).getNormal(new THREE.Vector3()).y < 0.65)
        continue;
      const box = new THREE.Box3().setFromPoints(points),
        minX = Math.max(0, Math.floor(box.min.x / step)),
        maxX = Math.min(profile.width - 2, Math.floor(box.max.x / step)),
        minZ = Math.max(0, Math.floor(box.min.z / step)),
        maxZ = Math.min(profile.width - 2, Math.floor(box.max.z / step));
      for (let iz = minZ; iz <= maxZ; iz++)
        for (let ix = minX; ix <= maxX; ix++) {
          const x = ix * step,
            z = iz * step,
            a = [x, z],
            b = [Math.min(extent, x + step), z],
            c = [x, Math.min(extent, z + step)],
            d = [b[0], c[1]];
          for (const ground of [
            [a, b, c],
            [d, c, b],
          ]) {
            let polygon = points;
            for (let edge = 0; edge < 3 && polygon.length; edge++) {
              const from = ground[edge],
                to = ground[(edge + 1) % 3];
              polygon = clip(
                polygon,
                (p) =>
                  (to[0] - from[0]) * (p.z - from[1]) -
                  (to[1] - from[1]) * (p.x - from[0]),
              );
            }
            if (!polygon.length) continue;
            polygon = clip(
              polygon,
              (p) => p.y - profile.surfaceHeight(p.x, p.z) - 0.005,
            );
            for (let j = 1; j < polygon.length - 1; j++) {
              const triangle = [polygon[0], polygon[j], polygon[j + 1]];
              if (new THREE.Triangle(...triangle).getArea() < 1e-10) continue;
              for (const p of triangle) vertices.push(p.x, p.y, p.z);
            }
          }
        }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  return geometry;
}

export function jungleCragSupport(profile, meshes) {
  const geometry = jungleCragSupportGeometry(profile, meshes);
  try {
    return new TriangleSolids(
      geometry.attributes.position.count
        ? [{ geometry, matrices: [new THREE.Matrix4()] }]
        : [],
      { layeredSupport: true },
    );
  } finally {
    geometry.dispose();
  }
}
