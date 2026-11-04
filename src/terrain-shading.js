import * as THREE from "three";

// A smooth height-field derivative can point through an adjacent steep triangle.
// Split only those draw corners, retaining the existing smooth normal elsewhere.
// Every other attribute follows its original vertex, preserving the surface.
export function fitTerrainNormals(geometry) {
  const position = geometry.getAttribute("position"),
    normal = geometry.getAttribute("normal"),
    index = geometry.index,
    count = index?.count ?? position.count,
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    face = new THREE.Vector3(),
    n = new THREE.Vector3(),
    repairs = [];
  for (let i = 0; i < count; i += 3) {
    const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j));
    a.fromBufferAttribute(position, ids[0]);
    b.fromBufferAttribute(position, ids[1]).sub(a);
    c.fromBufferAttribute(position, ids[2]).sub(a);
    face.crossVectors(b, c).normalize();
    for (let j = 0; j < 3; j++)
      if (n.fromBufferAttribute(normal, ids[j]).dot(face) < 0)
        repairs.push({ corner: i + j, vertex: ids[j], face: face.clone() });
  }
  if (!repairs.length) return 0;
  if (!index) {
    for (const r of repairs)
      normal.setXYZ(r.vertex, r.face.x, r.face.y, r.face.z);
    normal.needsUpdate = true;
    return repairs.length;
  }
  const first = position.count;
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const size = attribute.itemSize,
      data = new attribute.array.constructor((first + repairs.length) * size);
    data.set(attribute.array);
    for (let i = 0; i < repairs.length; i++) {
      const r = repairs[i];
      data.set(
        attribute.array.subarray(r.vertex * size, (r.vertex + 1) * size),
        (first + i) * size,
      );
    }
    const copy = attribute.clone();
    copy.array = data;
    copy.count = data.length / size;
    geometry.setAttribute(name, copy);
  }
  const indices = Array.from(index.array),
    fitted = geometry.getAttribute("normal");
  for (let i = 0; i < repairs.length; i++) {
    const r = repairs[i],
      id = first + i;
    indices[r.corner] = id;
    fitted.setXYZ(id, r.face.x, r.face.y, r.face.z);
  }
  geometry.setIndex(indices);
  return repairs.length;
}
