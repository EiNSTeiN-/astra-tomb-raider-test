import { Vector3 } from "three";

// The scans include a small photographed ground apron. Its UV islands meet
// the bottom of the trunk, stay low and face mostly upward. Keep these apart
// from the tall bark islands: a real raised root must remain a usable tread.
export function jungleApronTriangles(geometry, scale) {
  const position = geometry.attributes.position,
    uv = geometry.attributes.uv,
    index = geometry.index;
  if (!uv) return [];
  const parent = Uint32Array.from({ length: position.count }, (_, i) => i),
    find = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    },
    join = (a, b) => (parent[find(a)] = find(b)),
    vertices = new Map();
  let bottom = Infinity;
  for (let i = 0; i < position.count; i++) {
    bottom = Math.min(bottom, position.getY(i));
    // Normal seams may duplicate a vertex within one texture island. Join
    // matching position/UV records without crossing the atlas's chart seams.
    const key = [
      position.getX(i),
      position.getY(i),
      position.getZ(i),
      uv.getX(i),
      uv.getY(i),
    ]
      .map((n) => Math.round(n * 1e7))
      .join();
    if (vertices.has(key)) join(i, vertices.get(key));
    else vertices.set(key, i);
  }
  const count = index ? index.count : position.count,
    vertex = (i) => (index ? index.getX(i) : i);
  for (let i = 0; i < count; i += 3) {
    join(vertex(i), vertex(i + 1));
    join(vertex(i), vertex(i + 2));
  }
  const islands = new Map(),
    a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    normal = new Vector3();
  for (let i = 0; i < count; i += 3) {
    const root = find(vertex(i));
    if (!islands.has(root))
      islands.set(root, {
        faces: [],
        low: Infinity,
        high: -Infinity,
        area: 0,
        upward: 0,
      });
    const island = islands.get(root);
    a.fromBufferAttribute(position, vertex(i));
    b.fromBufferAttribute(position, vertex(i + 1));
    c.fromBufferAttribute(position, vertex(i + 2));
    island.low = Math.min(island.low, a.y, b.y, c.y);
    island.high = Math.max(island.high, a.y, b.y, c.y);
    normal.subVectors(b, a).cross(c.clone().sub(a));
    island.area += normal.length();
    island.upward += normal.y;
    island.faces.push(i / 3);
  }
  return [...islands.values()]
    .filter(
      (island) =>
        (island.low - bottom) * scale <= 0.25 &&
        (island.high - bottom) * scale <= 0.65 &&
        island.area > 0 &&
        island.upward / island.area >= 0.65,
    )
    .flatMap((island) => island.faces);
}
