import * as THREE from "three";

// Clip the terrain's actual grid triangles to a small inlay footprint. Merely
// sampling a quad's corners would bridge the diagonal in a sloping grid cell.
export function terrainInlayGeometry(profile, box, origin, chip = 0) {
  const step = profile.step,
    minX = box.x - box.w / 2,
    maxX = box.x + box.w / 2,
    minZ = box.z - box.d / 2,
    maxZ = box.z + box.d / 2;
  const positions = [],
    uv = [],
    inlayUv = [];
  const clip = (polygon, axis, bound, greater) => {
    const out = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        da = (a[axis] - bound) * (greater ? 1 : -1),
        db = (b[axis] - bound) * (greater ? 1 : -1);
      if (da >= 0) out.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        out.push(a.map((v, j) => v + (b[j] - v) * t));
      }
    }
    return out;
  };
  for (let z = Math.floor(minZ / step) * step; z < maxZ; z += step)
    for (let x = Math.floor(minX / step) * step; x < maxX; x += step) {
      const a = [x, profile.height(x, z), z],
        b = [x, profile.height(x, z + step), z + step],
        c = [x + step, profile.height(x + step, z + step), z + step],
        d = [x + step, profile.height(x + step, z), z];
      for (let polygon of [
        [a, b, d],
        [b, c, d],
      ]) {
        for (const [axis, bound, greater] of [
          [0, minX, true],
          [0, maxX, false],
          [2, minZ, true],
          [2, maxZ, false],
        ])
          polygon = clip(polygon, axis, bound, greater);
        // A shallow clipped corner breaks the rectangular tile silhouette.
        if (chip > 0 && polygon.length) {
          const out = [];
          for (let i = 0; i < polygon.length; i++) {
            const p = polygon[i],
              q = polygon[(i + 1) % polygon.length],
              dp = maxX + maxZ - chip - p[0] - p[2],
              dq = maxX + maxZ - chip - q[0] - q[2];
            if (dp >= 0) out.push(p);
            if (dp >= 0 !== dq >= 0) {
              const t = dp / (dp - dq);
              out.push(p.map((v, j) => v + (q[j] - v) * t));
            }
          }
          polygon = out;
        }
        for (let i = 1; i < polygon.length - 1; i++)
          for (const p of [polygon[0], polygon[i], polygon[i + 1]]) {
            positions.push(
              p[0] - origin.x,
              p[1] - origin.y + 0.003,
              p[2] - origin.z,
            );
            // Match the underlying court's world-space paving coordinates.
            uv.push(p[0] / 5, p[2] / 5);
            inlayUv.push(
              (p[0] - minX) / box.w,
              (p[2] - minZ) / box.d,
              (maxX + maxZ - chip - p[0] - p[2]) / Math.min(box.w, box.d),
            );
          }
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute(
    "inlayUv",
    new THREE.Float32BufferAttribute(inlayUv, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}
