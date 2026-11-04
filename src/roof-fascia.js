import * as T from "three";

function clip(polygon, z, greater) {
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      da = (a.z - z) * (greater ? 1 : -1),
      db = (b.z - z) * (greater ? 1 : -1);
    if (da >= 0) out.push(a);
    if (da * db < 0) out.push(a.clone().lerp(b, da / (da - db)));
  }
  return out;
}

// Read actual underside triangles, including lifted corners and missing cells.
// The upper face seats inside the slate by 4 mm; the lower edge retains the
// previous fascia's height. Two closed bands occupy only the roof footprint.
export function roofFasciaGeometry(
  roof,
  { width = 0.24, bottom = -0.05 } = {},
) {
  const p = roof.attributes.position,
    ids = roof.index,
    bounds = new T.Box3().setFromBufferAttribute(p),
    positions = [],
    normals = [],
    uv = [],
    edges = new Map();
  const vertex = (i) =>
      new T.Vector3().fromBufferAttribute(p, ids ? ids.getX(i) : i),
    key = (v) =>
      v
        .toArray()
        .map((n) => Math.round(n * 1e5))
        .join(","),
    triangle = (a, b, c) => {
      const n = new T.Triangle(a, b, c).getNormal(new T.Vector3());
      for (const v of [a, b, c]) {
        positions.push(v.x, v.y, v.z);
        normals.push(n.x, n.y, n.z);
        if (Math.abs(n.y) > 0.5) uv.push(v.x / 2, v.z / 2);
        else uv.push((Math.abs(n.x) > 0.5 ? v.z : v.x) / 2, v.y / 2);
      }
    };
  let cells = 0;
  for (let i = 0; i < (ids?.count ?? p.count); i += 3) {
    const source = [0, 1, 2].map((j) => vertex(i + j));
    if (new T.Triangle(...source).getNormal(new T.Vector3()).y >= -1e-6)
      continue;
    for (const [lo, hi] of [
      [bounds.min.z, bounds.min.z + width],
      [bounds.max.z - width, bounds.max.z],
    ]) {
      let polygon = clip(clip(source, lo, true), hi, false);
      polygon = polygon.filter(
        (v, j) =>
          v.distanceToSquared(polygon[(j + 1) % polygon.length]) > 1e-14,
      );
      if (polygon.length < 3) continue;
      const area = polygon
        .slice(1, -1)
        .reduce(
          (sum, v, j) =>
            sum + new T.Triangle(polygon[0], v, polygon[j + 2]).getArea(),
          0,
        );
      if (area < 1e-8) continue;
      const top = polygon
          .toReversed()
          .map((v) => v.clone().add(new T.Vector3(0, 0.004, 0))),
        floor = top.map((v) => new T.Vector3(v.x, bottom, v.z));
      if (top.some((v) => v.y <= bottom + 0.001))
        throw Error("Fascia requires space below the roof");
      for (let j = 1; j < top.length - 1; j++) {
        triangle(top[0], top[j], top[j + 1]);
        triangle(floor[0], floor[j + 1], floor[j]);
      }
      for (let j = 0; j < top.length; j++) {
        const a = top[j],
          b = top[(j + 1) % top.length],
          id = [key(a), key(b)].sort().join("|");
        if (edges.has(id)) edges.delete(id);
        else edges.set(id, [a, b]);
      }
      cells++;
    }
  }
  for (const [a, b] of edges.values()) {
    const c = new T.Vector3(a.x, bottom, a.z),
      d = new T.Vector3(b.x, bottom, b.z);
    triangle(a, c, d);
    triangle(a, d, b);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geometry.userData = { cells, width, bottom };
  return geometry;
}
