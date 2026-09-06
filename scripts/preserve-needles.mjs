// Thin disconnected needles vanish under triangle-error simplification. Sample
// complete needles instead, increasing their area to retain distant coverage.
export function preserveNeedles(document, primitive, stride) {
  const pos = primitive.getAttribute("POSITION"),
    normal = primitive.getAttribute("NORMAL"),
    uv = primitive.getAttribute("TEXCOORD_0");
  const indices = primitive.getIndices().getArray(),
    count = pos.getCount();
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const root = (a) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  for (let i = 0; i < indices.length; i += 3) {
    const a = root(indices[i]);
    parent[root(indices[i + 1])] = a;
    parent[root(indices[i + 2])] = a;
  }
  const components = new Map();
  for (let i = 0; i < count; i++) {
    const r = root(i);
    if (!components.has(r)) components.set(r, []);
    components.get(r).push(i);
  }
  const positions = [],
    normals = [],
    uvs = [],
    triangles = [],
    remap = new Int32Array(count).fill(-1),
    p = [],
    n = [],
    tex = [];
  let needle = 0,
    stem = 0,
    retained = 0;
  for (const members of components.values()) {
    const thin = members.length === 6;
    if (thin ? needle++ % stride : stem++ % Math.max(1, stride / 4)) continue;
    const center = [0, 0, 0];
    for (const i of members) {
      pos.getElement(i, p);
      for (let a = 0; a < 3; a++) center[a] += p[a] / members.length;
    }
    const scale = thin ? Math.sqrt(stride) * 0.8 : 1;
    for (const i of members) {
      remap[i] = positions.length / 3;
      pos.getElement(i, p);
      normal.getElement(i, n);
      uv.getElement(i, tex);
      for (let a = 0; a < 3; a++) {
        positions.push(center[a] + (p[a] - center[a]) * scale);
        normals.push(n[a]);
      }
      uvs.push(tex[0], tex[1]);
    }
    retained++;
  }
  for (let i = 0; i < indices.length; i += 3)
    if (remap[indices[i]] !== -1)
      triangles.push(
        remap[indices[i]],
        remap[indices[i + 1]],
        remap[indices[i + 2]],
      );
  const buffer = document.getRoot().listBuffers()[0],
    accessor = (type, array) =>
      document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  for (const semantic of primitive.listSemantics())
    primitive.setAttribute(semantic, null);
  primitive.setAttribute(
    "POSITION",
    accessor("VEC3", new Float32Array(positions)),
  );
  primitive.setAttribute("NORMAL", accessor("VEC3", new Float32Array(normals)));
  primitive.setAttribute("TEXCOORD_0", accessor("VEC2", new Float32Array(uvs)));
  primitive.setIndices(accessor("SCALAR", new Uint32Array(triangles)));
  return {
    components: components.size,
    retained,
    triangles: triangles.length / 3,
  };
}
