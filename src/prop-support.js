import * as THREE from "three";

// Preserve the actual upward faces before a small prop is merged. A curved
// canopy or lid must not support feet on the highest corner of its AABB.
export function propSupportHeight(mesh) {
  mesh.updateWorldMatrix(true, false);
  const g = mesh.geometry,
    p = g.attributes.position,
    triangles = [],
    bounds = new THREE.Box3().setFromObject(mesh),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const count = g.index?.count ?? p.count;
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(p, g.index ? g.index.getX(i) : i).applyMatrix4(
      mesh.matrixWorld,
    );
    b.fromBufferAttribute(
      p,
      g.index ? g.index.getX(i + 1) : i + 1,
    ).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(
      p,
      g.index ? g.index.getX(i + 2) : i + 2,
    ).applyMatrix4(mesh.matrixWorld);
    const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    // This winding has an upward face normal. Vertical faces have no support.
    if (denominator >= -1e-10) continue;
    triangles.push([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, denominator]);
  }
  return (x, z) => {
    x = Math.max(bounds.min.x, Math.min(bounds.max.x, x));
    z = Math.max(bounds.min.z, Math.min(bounds.max.z, z));
    let height = bounds.min.y;
    for (const [ax, ay, az, bx, by, bz, cx, cy, cz, d] of triangles) {
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d,
        v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d,
        w = 1 - u - v;
      if (Math.min(u, v, w) >= -1e-7)
        height = Math.max(height, u * ay + v * by + w * cy);
    }
    return height;
  };
}
