// Sample whole disconnected leaves, retaining UVs and normals. Enlarging the
// retained leaf area compensates for sampling at distances where leaves become
// subpixel; this is not suitable for the near detail tier.
export function sampleFoliage(document, primitive, stride) {
  const position = primitive.getAttribute("POSITION");
  const indices = primitive.getIndices().getArray();
  const parents = Int32Array.from({ length: position.getCount() }, (_, i) => i);
  const root = (index) => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  for (let i = 0; i < indices.length; i += 3) {
    const r = root(indices[i]);
    parents[root(indices[i + 1])] = r;
    parents[root(indices[i + 2])] = r;
  }
  const components = new Map();
  for (let i = 0; i < parents.length; i++) {
    const r = root(i);
    if (!components.has(r)) components.set(r, []);
    components.get(r).push(i);
  }
  const remap = new Int32Array(parents.length).fill(-1);
  const attributes = primitive.listSemantics().map((semantic) => ({
    semantic,
    source: primitive.getAttribute(semantic),
    values: [],
  }));
  let component = 0,
    vertices = 0;
  const vertex = [],
    center = [0, 0, 0];
  for (const members of components.values()) {
    if (component++ % stride !== 0) continue;
    center.fill(0);
    for (const index of members) {
      position.getElement(index, vertex);
      for (let axis = 0; axis < 3; axis++)
        center[axis] += vertex[axis] / members.length;
    }
    for (const index of members) {
      remap[index] = vertices++;
      for (const attribute of attributes) {
        attribute.source.getElement(index, vertex);
        for (let axis = 0; axis < attribute.source.getElementSize(); axis++)
          attribute.values.push(
            attribute.semantic === "POSITION"
              ? center[axis] + (vertex[axis] - center[axis]) * Math.sqrt(stride)
              : vertex[axis],
          );
      }
    }
  }
  const triangles = [];
  for (let i = 0; i < indices.length; i += 3)
    if (remap[indices[i]] >= 0)
      triangles.push(
        remap[indices[i]],
        remap[indices[i + 1]],
        remap[indices[i + 2]],
      );
  const buffer = document.getRoot().listBuffers()[0];
  for (const { semantic, source, values } of attributes) {
    primitive.setAttribute(
      semantic,
      document
        .createAccessor()
        .setType(source.getType())
        .setArray(new Float32Array(values))
        .setBuffer(buffer),
    );
  }
  primitive.setIndices(
    document
      .createAccessor()
      .setType("SCALAR")
      .setArray(new Uint32Array(triangles))
      .setBuffer(buffer),
  );
  return {
    components: components.size,
    retained: Math.ceil(component / stride),
    triangles: triangles.length / 3,
  };
}
