import { Vector3, Triangle, MathUtils } from "three";
import { desertNoise as noise } from "./desert-geology.js";

// Recess only exposed upper wall interiors. Buried joins, the paired back and
// every vertex of an upward tread/underside retain their original coordinates.
// The same modified triangles then feed drawing, closed collision and cameras.
export function fractureJungleCrag(
  vertices,
  indices,
  count,
  border,
  profile,
  site,
  level,
) {
  const protectedVertices = new Set(border),
    faces = [],
    adjacency = Array.from({ length: count }, () => []),
    triangle = new Triangle(),
    point = (i) => new Vector3(...vertices.slice(i * 3, i * 3 + 3));
  for (let i = 0; i < indices.length; i += 3) {
    const ids = indices.slice(i, i + 3);
    if (ids.some((id) => id >= count)) continue;
    const normal = triangle.set(...ids.map(point)).getNormal(new Vector3());
    if (Math.abs(normal.y) >= 0.45)
      for (const id of ids) protectedVertices.add(id);
    const face = { ids, normal };
    faces.push(face);
    for (const id of ids) adjacency[id].push(face);
  }
  const outward = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ][site.side];
  let changed = 0,
    maxRecess = 0;
  for (let id = 0; id < count; id++) {
    if (protectedVertices.has(id)) continue;
    const p = point(id),
      ground = (profile.surfaceHeight || profile.height)(p.x, p.z);
    if (p.y - ground < 1.8) continue;
    const along = site.side % 2 ? p.z : p.x,
      fault = noise(
        along * 0.34 + noise(p.y * 0.035, site.side, level.seed + 721) * 0.6,
        site.side * 3.1,
        level.seed + 617,
      ),
      veins = Math.pow(1 - Math.abs(fault * 2 - 1), 2),
      bed = noise(p.y * 0.65, along * 0.09, level.seed + 43),
      target =
        (0.08 + 0.38 * veins) *
        MathUtils.smoothstep(p.y - ground, 1.8, 3.2) *
        (0.7 + 0.3 * bed);
    let depth = target;
    for (let attempt = 0; attempt < 8; attempt++) {
      vertices[id * 3] = p.x + outward[0] * depth;
      vertices[id * 3 + 2] = p.z + outward[1] * depth;
      // No new walking faces, flipped cells or collapsed triangles may appear.
      const valid = adjacency[id].every(({ ids, normal }) => {
        triangle.set(...ids.map(point));
        const n = triangle.getNormal(new Vector3());
        return (
          triangle.getArea() > 1e-8 &&
          Math.abs(n.y) < 0.6 &&
          n.dot(normal) > 0.7
        );
      });
      if (valid) break;
      depth *= 0.5;
      if (attempt === 7) depth = 0;
    }
    vertices[id * 3] = p.x + outward[0] * depth;
    vertices[id * 3 + 2] = p.z + outward[1] * depth;
    if (depth > 0.001) {
      changed++;
      maxRecess = Math.max(maxRecess, depth);
    }
  }
  return { changed, maxRecess };
}
