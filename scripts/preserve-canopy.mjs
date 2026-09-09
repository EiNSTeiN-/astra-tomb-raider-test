// Fit a two-triangle card to each disconnected leaf using its full UV bounds.
// The original alpha mask supplies the silhouette. Distant tiers sample whole
// leaves and expand their area; they remain an approximation of dense foliage.
export function preserveCanopy(
  document,
  primitive,
  stride = 1,
  source = primitive,
) {
  const position = source.getAttribute("POSITION"),
    normal = source.getAttribute("NORMAL"),
    uv = source.getAttribute("TEXCOORD_0");
  const indices = source.getIndices().getArray(),
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
    bounds = [],
    triangles = [];
  let number = 0,
    retained = 0;
  for (const members of components.values()) {
    if (number++ % stride) continue;
    if (members.length > 128 || members.length < 4)
      throw new Error(`Unexpected leaf topology: ${members.length} vertices`);
    const samples = members.map((i) => ({
      p: position.getElement(i, []),
      n: normal.getElement(i, []),
      uv: uv.getElement(i, []),
    }));
    const mean = [0, 0],
      center = [0, 0, 0],
      meanNormal = [0, 0, 0];
    let minU = Infinity,
      maxU = -Infinity,
      minV = Infinity,
      maxV = -Infinity;
    for (const s of samples) {
      minU = Math.min(minU, s.uv[0]);
      maxU = Math.max(maxU, s.uv[0]);
      minV = Math.min(minV, s.uv[1]);
      maxV = Math.max(maxV, s.uv[1]);
      for (let a = 0; a < 2; a++) mean[a] += s.uv[a] / samples.length;
      for (let a = 0; a < 3; a++) {
        center[a] += s.p[a] / samples.length;
        meanNormal[a] += s.n[a] / samples.length;
      }
    }
    // Fit a plane from every source vertex's UV and position. Its full UV
    // rectangle contains the leaf boundary; the supplied mask defines the edge.
    // Selecting only four extreme source vertices cuts that boundary into a
    // diamond and cannot be repaired by enabling alpha testing afterward.
    let uu = 0,
      uvSum = 0,
      vv = 0;
    const pu = [0, 0, 0],
      pv = [0, 0, 0];
    for (const s of samples) {
      const u = s.uv[0] - mean[0],
        v = s.uv[1] - mean[1];
      uu += u * u;
      uvSum += u * v;
      vv += v * v;
      for (let a = 0; a < 3; a++) {
        pu[a] += u * (s.p[a] - center[a]);
        pv[a] += v * (s.p[a] - center[a]);
      }
    }
    const det = uu * vv - uvSum * uvSum;
    if (det <= 1e-14)
      throw new Error("Leaf has degenerate texture coordinates");
    const uAxis = pu.map((p, a) => (p * vv - pv[a] * uvSum) / det);
    const vAxis = pv.map((p, a) => (p * uu - pu[a] * uvSum) / det);
    const length = Math.hypot(...meanNormal);
    if (length < 1e-6) throw new Error("Leaf has no consistent front normal");
    const start = positions.length / 3,
      scale = Math.sqrt(stride);
    for (const [u, v] of [
      [minU, minV],
      [maxU, minV],
      [maxU, maxV],
      [minU, maxV],
    ]) {
      for (let a = 0; a < 3; a++) {
        positions.push(
          center[a] +
            (uAxis[a] * (u - mean[0]) + vAxis[a] * (v - mean[1])) * scale,
        );
        normals.push(meanNormal[a] / length);
      }
      uvs.push(u, v);
      bounds.push(minU, minV, maxU, maxV);
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
  primitive.setAttribute(
    "_LEAF_BOUNDS",
    accessor("VEC4", new Float32Array(bounds)),
  );
  primitive.setIndices(accessor("SCALAR", new Uint32Array(triangles)));
  primitive.getMaterial().setAlphaMode("MASK").setAlphaCutoff(0.35);
  return {
    original: components.size,
    retained,
    triangles: triangles.length / 3,
  };
}
