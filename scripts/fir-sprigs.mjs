// Source-specific reconstruction for the credited Poly Haven Fir Tree 01.
// Repeated sprigs have identical UV/topology and differ by an affine transform.
import { readFile } from "node:fs/promises";
import { Matrix3, Matrix4, Vector3 } from "three";

export async function readFirSprigs(directory) {
  const gltf = JSON.parse(await readFile(`${directory}/scene.gltf`, "utf8"));
  const buffer = await readFile(`${directory}/${gltf.buffers[0].uri}`);
  const attribute = (i) => {
    const a = gltf.accessors[i],
      view = gltf.bufferViews[a.bufferView];
    if (view.byteStride || a.sparse)
      throw Error("Unexpected fir accessor layout");
    const Type = { 5126: Float32Array, 5125: Uint32Array }[a.componentType];
    return new Type(
      buffer.buffer,
      buffer.byteOffset + (view.byteOffset || 0) + (a.byteOffset || 0),
      a.count * { VEC3: 3, VEC2: 2, SCALAR: 1 }[a.type],
    );
  };
  const templates = new Map(),
    meshes = [];
  let maximumResidual = 0;
  for (const mesh of gltf.meshes) {
    const primitive = mesh.primitives.find((p) =>
      /twig/.test(gltf.materials[p.material].name),
    );
    const position = attribute(primitive.attributes.POSITION),
      normal = attribute(primitive.attributes.NORMAL),
      uv = attribute(primitive.attributes.TEXCOORD_0),
      indices = attribute(primitive.indices);
    const groups = [],
      owner = new Uint16Array(position.length / 3);
    let first = 0,
      wasNeedle = false;
    // The source atlas reserves u < .15 for stems. Each sprig stores its stems
    // followed by its disconnected needles. Validate each entire UV sequence
    // and every triangle below, rather than relying on counts alone.
    for (let i = 0; i < owner.length; i++) {
      const needle = uv[i * 2] > 0.15;
      if (!needle && wasNeedle) {
        groups.push({ first, end: i });
        first = i;
      }
      wasNeedle = needle;
    }
    groups.push({ first, end: owner.length });
    groups.forEach((group, i) => owner.fill(i, group.first, group.end));
    for (const group of groups) group.indices = [];
    for (let i = 0; i < indices.length; i += 3) {
      const id = owner[indices[i]],
        group = groups[id];
      if (owner[indices[i + 1]] !== id || owner[indices[i + 2]] !== id)
        throw Error("Triangle crosses a fir sprig");
      group.indices.push(
        indices[i] - group.first,
        indices[i + 1] - group.first,
        indices[i + 2] - group.first,
      );
    }
    for (const group of groups) {
      const { first, end } = group,
        count = end - first;
      const point = (i) => new Vector3().fromArray(position, (first + i) * 3);
      if (!templates.has(count)) {
        const origin = point(0),
          pivots = [0];
        let farthest = 0;
        for (let i = 1; i < count; i++) {
          const d = point(i).distanceToSquared(origin);
          if (d > farthest) {
            farthest = d;
            pivots[1] = i;
          }
        }
        const x = point(pivots[1]).sub(origin);
        farthest = 0;
        for (let i = 1; i < count; i++) {
          const d = point(i).sub(origin).cross(x).lengthSq();
          if (d > farthest) {
            farthest = d;
            pivots[2] = i;
          }
        }
        const z = point(pivots[2]).sub(origin).cross(x);
        farthest = 0;
        for (let i = 1; i < count; i++) {
          const d = Math.abs(point(i).sub(origin).dot(z));
          if (d > farthest) {
            farthest = d;
            pivots[3] = i;
          }
        }
        const basis = new Matrix4()
          .makeBasis(...pivots.slice(1).map((i) => point(i).sub(origin)))
          .setPosition(origin);
        if (Math.abs(basis.determinant()) < 1e-10)
          throw Error("Degenerate fir sprig");
        const template = {
          id: templates.size,
          count,
          pivots,
          inverse: basis.invert(),
          position: position.slice(first * 3, end * 3),
          normal: normal.slice(first * 3, end * 3),
          uv: uv.slice(first * 2, end * 2),
          indices: group.indices,
        };
        template.planes = sprigPlanes(template.position);
        templates.set(count, template);
      }
      const template = templates.get(count);
      if (
        group.indices.length !== template.indices.length ||
        group.indices.some((v, i) => v !== template.indices[i])
      )
        throw Error("Changed sprig topology");
      for (let i = 0; i < count * 2; i++)
        if (Math.abs(template.uv[i] - uv[first * 2 + i]) > 1e-6)
          throw Error("Changed sprig UVs");
      const origin = point(0);
      group.matrix = new Matrix4()
        .makeBasis(...template.pivots.slice(1).map((i) => point(i).sub(origin)))
        .setPosition(origin)
        .multiply(template.inverse);
      group.template = template;
      const sample = new Vector3();
      for (let i = 0; i < count; i++)
        maximumResidual = Math.max(
          maximumResidual,
          sample
            .fromArray(template.position, i * 3)
            .applyMatrix4(group.matrix)
            .distanceTo(point(i)),
        );
      delete group.indices;
    }
    meshes.push({ name: mesh.name, groups });
  }
  if (maximumResidual > 0.00002)
    throw Error(`Fir transform residual ${maximumResidual}`);
  return { templates: [...templates.values()], meshes, maximumResidual };
}

export function sprigPlanes(positions) {
  const center = new Vector3();
  for (let i = 0; i < positions.length; i += 3)
    center.add(new Vector3().fromArray(positions, i));
  center.multiplyScalar(3 / positions.length);
  const covariance = Array.from({ length: 3 }, () => [0, 0, 0]),
    eigenvectors = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  for (let i = 0; i < positions.length; i += 3) {
    const p = new Vector3().fromArray(positions, i).sub(center).toArray();
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++) covariance[a][b] += p[a] * p[b];
  }
  // Jacobi eigensolver for the symmetric covariance matrix.
  for (let iteration = 0; iteration < 32; iteration++) {
    let p = 0,
      q = 1;
    for (const [a, b] of [
      [0, 2],
      [1, 2],
    ])
      if (Math.abs(covariance[a][b]) > Math.abs(covariance[p][q])) {
        p = a;
        q = b;
      }
    if (Math.abs(covariance[p][q]) < 1e-12) break;
    const angle =
        0.5 *
        Math.atan2(2 * covariance[p][q], covariance[q][q] - covariance[p][p]),
      c = Math.cos(angle),
      s = Math.sin(angle);
    for (let k = 0; k < 3; k++) {
      const a = covariance[k][p],
        b = covariance[k][q];
      covariance[k][p] = c * a - s * b;
      covariance[k][q] = s * a + c * b;
    }
    for (let k = 0; k < 3; k++) {
      const a = covariance[p][k],
        b = covariance[q][k];
      covariance[p][k] = c * a - s * b;
      covariance[q][k] = s * a + c * b;
      const x = eigenvectors[k][p],
        y = eigenvectors[k][q];
      eigenvectors[k][p] = c * x - s * y;
      eigenvectors[k][q] = s * x + c * y;
    }
  }
  const order = [0, 1, 2].sort((a, b) => covariance[b][b] - covariance[a][a]);
  const axis = order.map((i) =>
    new Vector3(...eigenvectors.map((row) => row[i])).normalize(),
  );
  return [
    [axis[1], axis[0]],
    [axis[2], axis[0]],
    [axis[1], axis[2]],
  ].map(([u, v]) => {
    const w = new Vector3().crossVectors(u, v).normalize(),
      min = [Infinity, Infinity],
      max = [-Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      const point = new Vector3().fromArray(positions, i).sub(center);
      for (const [a, d] of [point.dot(u), point.dot(v)].entries()) {
        min[a] = Math.min(min[a], d);
        max[a] = Math.max(max[a], d);
      }
    }
    for (let a = 0; a < 2; a++) {
      const pad = (max[a] - min[a]) * 0.04;
      min[a] -= pad;
      max[a] += pad;
    }
    return { center, u, v, w, min, max };
  });
}

export function sprigCards(groups, { planes = 3, stride = 1 } = {}) {
  const positions = [],
    normals = [],
    uvs = [],
    indices = [];
  // All tiers sample the same ordered source sprigs. Two perpendicular cards
  // keep the reduced tiers visible from either side of a branch.
  for (let i = 0; i < groups.length; i++) {
    const block = Math.floor(i / stride);
    const hash = Math.imul(block + 1, 0x9e3779b1) >>> 16;
    const available = Math.min(stride, groups.length - block * stride);
    if (i % stride !== hash % available) continue;
    const { template, matrix } = groups[i],
      scale = Math.sqrt(stride);
    for (let j = 0; j < planes; j++) {
      const plane = template.planes[j],
        start = positions.length / 3,
        cell = template.id * 3 + j,
        cx = cell % 6,
        cy = Math.floor(cell / 6);
      const normal = plane.w
        .clone()
        .applyMatrix3(new Matrix3().getNormalMatrix(matrix))
        .normalize();
      for (const [s, t] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]) {
        const x = plane.min[0] + s * (plane.max[0] - plane.min[0]),
          y = plane.min[1] + t * (plane.max[1] - plane.min[1]);
        const point = plane.center
          .clone()
          .addScaledVector(plane.u, x * scale)
          .addScaledVector(plane.v, y * scale)
          .applyMatrix4(matrix);
        positions.push(...point.toArray());
        normals.push(...normal.toArray());
        uvs.push((cx + s) / 6, (cy + t) / 4);
      }
      indices.push(
        ...(matrix.determinant() < 0
          ? [start, start + 2, start + 1, start, start + 3, start + 2]
          : [start, start + 1, start + 2, start, start + 2, start + 3]),
      );
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}
