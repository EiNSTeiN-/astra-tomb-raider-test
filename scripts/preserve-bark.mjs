import { MeshoptSimplifier } from "meshoptimizer";
import { compactPrimitive } from "@gltf-transform/functions";

// A conservative coverage mask of the source UV islands. Padding between
// islands is extruded colour, not bark that can safely cover a reduced face.
export function barkCoverage(primitive, size = 1024) {
  const uv = primitive.getAttribute("TEXCOORD_0").getArray(),
    indices = primitive.getIndices().getArray(),
    mask = new Uint8Array(size * size);
  if (!uv.every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
    throw new Error("Bark source UVs must lie within the texture atlas");
  const mark = (x, y) => {
    x = Math.max(0, Math.min(size - 1, Math.floor(x)));
    y = Math.max(0, Math.min(size - 1, Math.floor(y)));
    mask[y * size + x] = 1;
  };
  for (let i = 0; i < indices.length; i += 3) {
    const p = [indices[i], indices[i + 1], indices[i + 2]].map((v) => [
        uv[v * 2] * size,
        uv[v * 2 + 1] * size,
      ]),
      [a, b, c] = p,
      det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    // Include thin source triangles and their boundaries, even when they have
    // no pixel centre inside. The one-pixel dilation below allows filtering.
    for (let edge = 0; edge < 3; edge++) {
      const from = p[edge],
        to = p[(edge + 1) % 3],
        steps = Math.max(
          1,
          Math.ceil(
            Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])) * 2,
          ),
        );
      for (let j = 0; j <= steps; j++)
        mark(
          from[0] + ((to[0] - from[0]) * j) / steps,
          from[1] + ((to[1] - from[1]) * j) / steps,
        );
    }
    if (Math.abs(det) < 1e-12) continue;
    for (
      let y = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
      y <= Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
        x <= Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
        x++
      ) {
        const u =
            ((b[1] - c[1]) * (x + 0.5 - c[0]) +
              (c[0] - b[0]) * (y + 0.5 - c[1])) /
            det,
          v =
            ((c[1] - a[1]) * (x + 0.5 - c[0]) +
              (a[0] - c[0]) * (y + 0.5 - c[1])) /
            det;
        if (u >= 0 && v >= 0 && u + v <= 1) mask[y * size + x] = 1;
      }
  }
  const filtered = mask.slice();
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (!mask[y * size + x]) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (x + dx >= 0 && y + dy >= 0 && x + dx < size && y + dy < size)
            filtered[(y + dy) * size + x + dx] = 1;
    }
  return { size, mask: filtered };
}

export function barkLeaks(uv, indices, { size, mask }) {
  const leaks = [];
  const covered = (x, y) => {
    if (!Number.isFinite(x + y) || x < 0 || y < 0 || x > size || y > size)
      return false;
    return !!mask[
      Math.min(size - 1, Math.floor(y)) * size +
        Math.min(size - 1, Math.floor(x))
    ];
  };
  for (let i = 0; i < indices.length; i += 3) {
    const ids = [indices[i], indices[i + 1], indices[i + 2]],
      p = ids.map((v) => [uv[v * 2] * size, uv[v * 2 + 1] * size]),
      [a, b, c] = p,
      det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (p.some((v) => v.some((n) => !Number.isFinite(n)))) {
      leaks.push(ids);
      continue;
    }
    let outside = false;
    for (let edge = 0; edge < 3 && !outside; edge++) {
      const from = p[edge],
        to = p[(edge + 1) % 3],
        steps = Math.max(
          1,
          Math.ceil(
            Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])) * 2,
          ),
        );
      for (let j = 0; j <= steps; j++) {
        if (
          !covered(
            from[0] + ((to[0] - from[0]) * j) / steps,
            from[1] + ((to[1] - from[1]) * j) / steps,
          )
        ) {
          outside = true;
          break;
        }
      }
    }
    // Inspect every covered texel, not just a few barycentric samples that
    // could skip a thin strip of atlas padding inside a large reduced face.
    if (!outside && Math.abs(det) > 1e-12)
      for (
        let y = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
        y <= Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1]))) &&
        !outside;
        y++
      )
        for (
          let x = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
          x <= Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
          x++
        ) {
          const u =
              ((b[1] - c[1]) * (x + 0.5 - c[0]) +
                (c[0] - b[0]) * (y + 0.5 - c[1])) /
              det,
            v =
              ((c[1] - a[1]) * (x + 0.5 - c[0]) +
                (a[0] - c[0]) * (y + 0.5 - c[1])) /
              det;
          if (u >= 0 && v >= 0 && u + v <= 1 && !covered(x + 0.5, y + 0.5)) {
            outside = true;
            break;
          }
        }
    if (outside) leaks.push(ids);
  }
  return leaks;
}

export function barkBoundaryLocks(indices, count) {
  const edges = new Map(),
    locks = new Uint8Array(count);
  for (let i = 0; i < indices.length; i += 3)
    for (let edge = 0; edge < 3; edge++) {
      const a = indices[i + edge],
        b = indices[i + ((edge + 1) % 3)],
        key = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  // Preserve UV-chart boundaries by index. LockBorder alone only guarantees
  // physical boundaries; it can still collapse the matching sides of a seam.
  for (const [key, count] of edges)
    if (count === 1)
      for (const index of key.split(",").map(Number)) locks[index] = 1;
  return locks;
}

export async function preserveBark(document, primitive, source, coverage) {
  await MeshoptSimplifier.ready;
  const position = source.getAttribute("POSITION").getArray(),
    normal = source.getAttribute("NORMAL").getArray(),
    uv = source.getAttribute("TEXCOORD_0").getArray(),
    original = new Uint32Array(source.getIndices().getArray()),
    count = position.length / 3,
    locks = barkBoundaryLocks(original, count),
    attributes = new Float32Array(count * 5),
    scale = MeshoptSimplifier.getScale(position, 3),
    passes = [];
  for (let i = 0; i < count; i++)
    attributes.set(
      [
        normal[i * 3],
        normal[i * 3 + 1],
        normal[i * 3 + 2],
        uv[i * 2],
        uv[i * 2 + 1],
      ],
      i * 5,
    );
  let reduced;
  for (let pass = 0; pass < 8; pass++) {
    const [indices, error] = MeshoptSimplifier.simplifyWithAttributes(
        original,
        position,
        3,
        attributes,
        5,
        [0.5, 0.5, 0.5, 4, 4],
        locks,
        6000,
        0.012,
        ["LockBorder"],
      ),
      leaks = barkLeaks(uv, indices, coverage);
    passes.push({
      triangles: indices.length / 3,
      error,
      leaks: leaks.length,
      locked: locks.reduce((sum, value) => sum + value, 0),
    });
    if (!leaks.length) {
      reduced = indices;
      break;
    }
    // Restore the source around remaining UV folds. Keeping those vertices
    // prevents a new diagonal from crossing the concave outline of an island.
    const padding = scale * 0.015 * (pass + 1);
    for (const ids of leaks) {
      const lo = [0, 1, 2].map(
          (axis) =>
            Math.min(...ids.map((id) => position[id * 3 + axis])) - padding,
        ),
        hi = [0, 1, 2].map(
          (axis) =>
            Math.max(...ids.map((id) => position[id * 3 + axis])) + padding,
        );
      for (let i = 0; i < count; i++)
        if (
          [0, 1, 2].every(
            (axis) =>
              position[i * 3 + axis] >= lo[axis] &&
              position[i * 3 + axis] <= hi[axis],
          )
        )
          locks[i] = 1;
    }
  }
  if (!reduced)
    throw new Error("Trunk reduction still crosses bark atlas padding");
  const buffer = document.getRoot().listBuffers()[0];
  for (const semantic of primitive.listSemantics())
    primitive.setAttribute(semantic, null);
  for (const semantic of source.listSemantics()) {
    const sourceAttribute = source.getAttribute(semantic);
    primitive.setAttribute(
      semantic,
      document
        .createAccessor()
        .setType(sourceAttribute.getType())
        .setNormalized(sourceAttribute.getNormalized())
        .setArray(sourceAttribute.getArray().slice())
        .setBuffer(buffer),
    );
  }
  primitive.setIndices(
    document
      .createAccessor()
      .setType("SCALAR")
      .setArray(reduced)
      .setBuffer(buffer),
  );
  compactPrimitive(primitive);
  return {
    sourceTriangles: original.length / 3,
    triangles: reduced.length / 3,
    passes,
  };
}
