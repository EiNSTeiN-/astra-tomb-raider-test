import { Vector3, Triangle } from "three";

function clipHeight(polygon, height, above) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const insideA = above ? a.y >= height : a.y <= height;
    const insideB = above ? b.y >= height : b.y <= height;
    if (insideA) result.push(a);
    if (insideA !== insideB)
      result.push(a.clone().lerp(b, (height - a.y) / (b.y - a.y)));
  }
  return result;
}

// Project onto a real upward face close to the supported root height. Work
// from the copied physical triangles, so batching and rendered LOD do not
// invalidate the target. The caller bounds the actual ankle displacement.
export function restingFoothold(surface, ankle, height, radius = 0.65) {
  const kernel = surface.triangles;
  if (!kernel) return null;
  const query = new Vector3(ankle.x, 0, ankle.z);
  const flat = new Triangle(),
    nearest = new Vector3(),
    bary = new Vector3();
  let best = null,
    distance = radius * radius;
  for (const part of kernel.nearby(
    ankle.x - radius,
    ankle.z - radius,
    ankle.x + radius,
    ankle.z + radius,
  )) {
    if (part.bounds.max.y < height - 0.012 || part.bounds.min.y > height + 0.02)
      continue;
    for (const triangle of part.shape.triangles) {
      const vertices = triangle.vertices.map((v) =>
        v.clone().applyMatrix4(part.matrix),
      );
      const normal = vertices[1]
        .clone()
        .sub(vertices[0])
        .cross(vertices[2].clone().sub(vertices[0]));
      if (normal.y / normal.length() < 0.65) continue;
      const polygon = clipHeight(
        clipHeight(vertices, height - 0.012, true),
        height + 0.02,
        false,
      );
      for (let i = 1; i < polygon.length - 1; i++) {
        const points = [polygon[0], polygon[i], polygon[i + 1]];
        flat.set(...points.map((p) => new Vector3(p.x, 0, p.z)));
        if (flat.getArea() < 1e-10) continue;
        flat.closestPointToPoint(query, nearest);
        // Keep an edge projection just inside its face so point probes do not
        // alternate across a shared edge because of floating-point rounding.
        if (nearest.distanceToSquared(query) > 1e-10) {
          const center = flat.getMidpoint(new Vector3());
          const span = center.distanceTo(nearest);
          if (span > 1e-8) nearest.lerp(center, Math.min(0.2, 0.006 / span));
        }
        flat.getBarycoord(nearest, bary);
        const point = points[0]
          .clone()
          .multiplyScalar(bary.x)
          .addScaledVector(points[1], bary.y)
          .addScaledVector(points[2], bary.z);
        const d = (point.x - ankle.x) ** 2 + (point.z - ankle.z) ** 2;
        if (d < distance) {
          distance = d;
          best = { point, normal: normal.clone().normalize() };
        }
      }
    }
  }
  return best;
}
