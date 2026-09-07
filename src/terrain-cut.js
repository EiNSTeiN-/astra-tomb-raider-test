import * as THREE from "three";

// Subtract interior volumes from only the triangles that cross them. This keeps
// the courtyard above an underground room, while opening its entrance through
// a reservoir bank. Real geometry is shared by color, normals and shadow passes.
export function cutTerrainGeometry(source, volumes) {
  if (!volumes?.length) return source;
  source.computeBoundingBox();
  const intersects = (a, b) =>
    ["x", "y", "z"].every(
      (axis) => a.max[axis] >= b.min[axis] && a.min[axis] <= b.max[axis],
    );
  const nearby = volumes.filter((volume) =>
    intersects(source.boundingBox, volume),
  );
  if (!nearby.length) return source;
  const names = Object.keys(source.attributes);
  const offsets = new Map();
  let stride = 0;
  for (const name of names) {
    offsets.set(name, stride);
    stride += source.attributes[name].itemSize;
  }
  const pos = offsets.get("position");
  const read = (index) => {
    const values = [];
    for (const name of names) {
      const attribute = source.attributes[name];
      for (let c = 0; c < attribute.itemSize; c++)
        values.push(attribute.array[index * attribute.itemSize + c]);
    }
    return values;
  };
  const clip = (polygon, axis, bound, greater) => {
    const output = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const da = (a[pos + axis] - bound) * (greater ? 1 : -1);
      const db = (b[pos + axis] - bound) * (greater ? 1 : -1);
      if (da >= 0) output.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        output.push(a.map((value, c) => value + (b[c] - value) * t));
      }
    }
    return output;
  };
  const subtract = (polygon, box) => {
    let inside = polygon;
    const outside = [];
    for (const [axis, name] of ["x", "y", "z"].entries())
      for (const [bound, greater] of [
        [box.min[name], true],
        [box.max[name], false],
      ]) {
        const piece = clip(inside, axis, bound, !greater);
        if (piece.length >= 3) outside.push(piece);
        inside = clip(inside, axis, bound, greater);
        if (inside.length < 3) return outside;
      }
    return outside;
  };
  const output = [];
  const count = source.index?.count ?? source.attributes.position.count;
  for (let i = 0; i < count; i += 3) {
    let pieces = [
      [0, 1, 2].map((j) =>
        read(source.index ? source.index.getX(i + j) : i + j),
      ),
    ];
    for (const box of nearby)
      pieces = pieces.flatMap((polygon) => {
        if (
          ["x", "y", "z"].some(
            (axis, c) =>
              polygon.every((vertex) => vertex[pos + c] <= box.min[axis]) ||
              polygon.every((vertex) => vertex[pos + c] >= box.max[axis]),
          )
        )
          return [polygon];
        return subtract(polygon, box);
      });
    for (const polygon of pieces)
      for (let j = 1; j < polygon.length - 1; j++) {
        const a = new THREE.Vector3(...polygon[0].slice(pos, pos + 3));
        const b = new THREE.Vector3(...polygon[j].slice(pos, pos + 3));
        const c = new THREE.Vector3(...polygon[j + 1].slice(pos, pos + 3));
        if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-14)
          output.push(polygon[0], polygon[j], polygon[j + 1]);
      }
  }
  const geometry = new THREE.BufferGeometry();
  for (const name of names) {
    const attribute = source.attributes[name],
      offset = offsets.get(name);
    geometry.setAttribute(
      name,
      new THREE.Float32BufferAttribute(
        output.flatMap((vertex) =>
          vertex.slice(offset, offset + attribute.itemSize),
        ),
        attribute.itemSize,
        attribute.normalized,
      ),
    );
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
