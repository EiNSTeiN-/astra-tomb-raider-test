// Collapse each disconnected leaf to a textured diamond instead of deleting
// whole leaves. Far detail samples leaves and grows their area to retain cover.
export function preserveCanopy(document, primitive, stride = 1) {
  const position = primitive.getAttribute("POSITION"),
    normal = primitive.getAttribute("NORMAL"),
    uv = primitive.getAttribute("TEXCOORD_0");
  const indices = primitive.getIndices().getArray(),
    count = position.getCount();
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
    triangles = [];
  const p = [],
    n = [],
    tex = [];
  let number = 0,
    retained = 0;
  for (const members of components.values()) {
    if (number++ % stride) continue;
    if (members.length > 128 || members.length < 4)
      throw new Error(`Unexpected leaf topology: ${members.length} vertices`);
    let left = members[0],
      right = left,
      tip = left,
      base = left,
      minU = Infinity,
      maxU = -Infinity,
      minV = Infinity,
      maxV = -Infinity;
    const center = [0, 0, 0];
    for (const i of members) {
      uv.getElement(i, tex);
      position.getElement(i, p);
      if (tex[0] < minU) {
        minU = tex[0];
        left = i;
      }
      if (tex[0] > maxU) {
        maxU = tex[0];
        right = i;
      }
      if (tex[1] < minV) {
        minV = tex[1];
        tip = i;
      }
      if (tex[1] > maxV) {
        maxV = tex[1];
        base = i;
      }
      for (let a = 0; a < 3; a++) center[a] += p[a] / members.length;
    }
    const selected = [tip, left, base, right],
      start = positions.length / 3,
      scale = Math.sqrt(stride);
    for (const i of selected) {
      position.getElement(i, p);
      normal.getElement(i, n);
      uv.getElement(i, tex);
      for (let a = 0; a < 3; a++) {
        positions.push(center[a] + (p[a] - center[a]) * scale);
        normals.push(n[a]);
      }
      uvs.push(tex[0], tex[1]);
    }
    // Match the source leaf's front face, regardless of UV orientation.
    const a = positions.slice(start * 3, start * 3 + 3),
      b = positions.slice(start * 3 + 3, start * 3 + 6),
      c = positions.slice(start * 3 + 6, start * 3 + 9);
    const ab = b.map((v, i) => v - a[i]),
      ac = c.map((v, i) => v - a[i]);
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const forward =
      cross.reduce((sum, v, i) => sum + v * normals[start * 3 + i], 0) > 0;
    triangles.push(
      ...(forward ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map(
        (i) => start + i,
      ),
    );
    retained++;
  }
  const buffer = document.getRoot().listBuffers()[0];
  const accessor = (type, array) =>
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
  primitive.getMaterial().setAlphaMode("MASK").setAlphaCutoff(0.35);
  return {
    original: components.size,
    retained,
    triangles: triangles.length / 3,
  };
}
