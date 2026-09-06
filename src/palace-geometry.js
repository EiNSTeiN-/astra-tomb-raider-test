import * as THREE from "three";

// A closed annular voussoir. Short curved faces are subdivided while joints
// remain planar; front/back and radial faces seal every broken vault block.
export function vaultStoneGeometry(inner, outer, a0, a1, depth, segments = 3) {
  const positions = [],
    normals = [],
    uv = [];
  const point = (r, a, z) => [Math.cos(a) * r, Math.sin(a) * r, z];
  const face = (points, outward) => {
    const normal = new THREE.Vector3()
      .subVectors(
        new THREE.Vector3(...points[1]),
        new THREE.Vector3(...points[0]),
      )
      .cross(
        new THREE.Vector3().subVectors(
          new THREE.Vector3(...points[2]),
          new THREE.Vector3(...points[0]),
        ),
      )
      .normalize();
    if (normal.dot(new THREE.Vector3(...outward)) < 0) {
      points.reverse();
      normal.negate();
    }
    for (let i = 1; i < points.length - 1; i++)
      for (const p of [points[0], points[i], points[i + 1]]) {
        positions.push(...p);
        normals.push(...normal.toArray());
        uv.push(
          (Math.abs(normal.x) > 0.7 ? p[2] : p[0]) / 2,
          (Math.abs(normal.y) > 0.7 ? p[2] : p[1]) / 2,
        );
      }
  };
  for (let i = 0; i < segments; i++) {
    const a = a0 + ((a1 - a0) * i) / segments,
      b = a0 + ((a1 - a0) * (i + 1)) / segments,
      m = (a + b) / 2;
    face(
      [
        point(outer, a, -depth / 2),
        point(outer, b, -depth / 2),
        point(outer, b, depth / 2),
        point(outer, a, depth / 2),
      ],
      [Math.cos(m), Math.sin(m), 0],
    );
    face(
      [
        point(inner, a, -depth / 2),
        point(inner, b, -depth / 2),
        point(inner, b, depth / 2),
        point(inner, a, depth / 2),
      ],
      [-Math.cos(m), -Math.sin(m), 0],
    );
    for (const side of [-1, 1])
      face(
        [
          point(inner, a, (side * depth) / 2),
          point(outer, a, (side * depth) / 2),
          point(outer, b, (side * depth) / 2),
          point(inner, b, (side * depth) / 2),
        ],
        [0, 0, side],
      );
  }
  face(
    [
      point(inner, a0, -depth / 2),
      point(outer, a0, -depth / 2),
      point(outer, a0, depth / 2),
      point(inner, a0, depth / 2),
    ],
    [Math.sin(a0), -Math.cos(a0), 0],
  );
  face(
    [
      point(inner, a1, -depth / 2),
      point(outer, a1, -depth / 2),
      point(outer, a1, depth / 2),
      point(inner, a1, depth / 2),
    ],
    [-Math.sin(a1), Math.cos(a1), 0],
  );
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function flutedColumnGeometry(height, radius = 0.94) {
  const segments = 80,
    rings = 8,
    positions = [],
    uv = [],
    indices = [];
  for (let y = 0; y <= rings; y++)
    for (let i = 0; i <= segments; i++) {
      const t = y / rings,
        a = (i / segments) * Math.PI * 2;
      const r =
        radius * (1 - 0.12 * t) +
        0.035 * Math.sin(t * Math.PI) -
        0.072 * (0.5 + 0.5 * Math.cos(a * 20));
      positions.push(Math.cos(a) * r, t * height, Math.sin(a) * r);
      uv.push((a * radius) / 2, (t * height) / 2);
      if (y < rings && i < segments) {
        const n = y * (segments + 1) + i;
        indices.push(n, n + segments + 1, n + 1);
        indices.push(n + 1, n + segments + 1, n + segments + 2);
      }
    }
  // Cap vertices are separate so the moulded ends keep planar normals.
  for (const top of [false, true]) {
    const start = positions.length / 3,
      row = top ? rings * (segments + 1) : 0;
    positions.push(0, top ? height : 0, 0);
    uv.push(0, 0);
    for (let i = 0; i <= segments; i++) {
      const n = (row + i) * 3;
      positions.push(...positions.slice(n, n + 3));
      uv.push(positions[n] / 2, positions[n + 2] / 2);
    }
    for (let i = 0; i < segments; i++)
      indices.push(start, start + i + (top ? 2 : 1), start + i + (top ? 1 : 2));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function shellReliefGeometry(width = 1.15) {
  const positions = [],
    uv = [],
    indices = [],
    radial = 9,
    segments = 40;
  for (let r = 0; r <= radial; r++)
    for (let i = 0; i <= segments; i++) {
      const t = r / radial,
        a = (i / segments) * Math.PI;
      const x = (Math.cos(a) * t * width) / 2,
        y = Math.sin(a) * t * width * 0.54;
      const depth =
        0.035 +
        0.14 *
          Math.sin(t * Math.PI) *
          (0.55 + 0.45 * Math.pow(Math.sin(a * 10), 2));
      positions.push(x, y, depth);
      uv.push(x / 2, y / 2);
      if (r < radial && i < segments) {
        const n = r * (segments + 1) + i;
        if (r > 0) indices.push(n, n + segments + 1, n + 1);
        indices.push(n + 1, n + segments + 1, n + segments + 2);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function vaultCellPresent(angleIndex, row, damage = 0) {
  if (
    damage === 1 &&
    row >= 3 &&
    angleIndex >= 8 + (row % 2) &&
    angleIndex <= 15 - (row % 2)
  )
    return false;
  if (
    damage === 2 &&
    row <= 2 &&
    angleIndex >= 4 + row &&
    angleIndex <= 13 - row
  )
    return false;
  if (
    damage === 3 &&
    row >= 2 &&
    row <= 4 &&
    angleIndex >= 10 - (row % 2) &&
    angleIndex <= 14 + (row % 2)
  )
    return false;
  return true;
}
