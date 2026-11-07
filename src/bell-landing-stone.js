import * as THREE from "three";

// A closed dressed stone with an inset shoulder and a slightly hewn boss.
// The back and outer ring stay inside the caller's exact rectangular cell.
export function bellStoneGeometry(
  w,
  h,
  d,
  seed,
  { rise = 0.08, bevel = 0.055, facet = 0.004 } = {},
) {
  const cut = Math.min(0.012, w * 0.04, h * 0.04),
    inset = Math.min(bevel, w * 0.2, h * 0.22),
    hw = w / 2,
    hh = h / 2,
    outline = [
      [-hw + cut, -hh],
      [hw - cut, -hh],
      [hw, -hh + cut],
      [hw, hh - cut],
      [hw - cut, hh],
      [-hw + cut, hh],
      [-hw, hh - cut],
      [-hw, -hh + cut],
    ],
    back = outline.map(([x, y]) => [x, y, -d / 2]),
    shoulder = outline.map(([x, y]) => [
      x,
      y,
      d / 2 - Math.min(rise, d * 0.75),
    ]),
    face = outline.map(([x, y]) => [
      x * (1 - (2 * inset) / w) + Math.sin(seed * 2.3) * inset * 0.06,
      y * (1 - (2 * inset) / h) + Math.cos(seed * 1.7) * inset * 0.06,
      d / 2,
    ]),
    positions = [],
    normals = [],
    uvs = [],
    shiftU = (seed * 0.137) % 1,
    shiftV = (seed * 0.283) % 1;
  const triangle = (a, b, c) => {
    let points = [a, b, c];
    const va = new THREE.Vector3(...a),
      vb = new THREE.Vector3(...b),
      vc = new THREE.Vector3(...c),
      normal = vb.sub(va).cross(vc.sub(va)).normalize(),
      center = new THREE.Vector3(...a)
        .add(new THREE.Vector3(...b))
        .add(new THREE.Vector3(...c))
        .multiplyScalar(1 / 3);
    if (normal.dot(center) < 0) {
      points = [a, c, b];
      normal.negate();
    }
    const axis =
      Math.abs(normal.z) >= Math.abs(normal.x) &&
      Math.abs(normal.z) >= Math.abs(normal.y)
        ? 2
        : Math.abs(normal.x) >= Math.abs(normal.y)
          ? 0
          : 1;
    for (const p of points) {
      positions.push(...p);
      normals.push(...normal.toArray());
      uvs.push(
        (axis === 0 ? p[2] : p[0]) / 2 + shiftU,
        (axis === 1 ? p[2] : p[1]) / 2 + shiftV,
      );
    }
  };
  for (const [a, b] of [
    [back, shoulder],
    [shoulder, face],
  ])
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      triangle(a[i], a[j], b[j]);
      triangle(a[i], b[j], b[i]);
    }
  const frontCenter = [
    face.reduce((n, p) => n + p[0], 0) / 8,
    face.reduce((n, p) => n + p[1], 0) / 8,
    d / 2 - facet * (0.5 + 0.5 * Math.sin(seed)),
  ];
  // Every front XY sample also occurs on the buried back. FacadeCamera can
  // retain the actual sloping shoulders as closed finite triangle cells.
  const rear = face.map(([x, y]) => [x, y, -d / 2]),
    rearCenter = [frontCenter[0], frontCenter[1], -d / 2];
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    triangle(back[i], back[j], rear[j]);
    triangle(back[i], rear[j], rear[i]);
    triangle(rearCenter, rear[j], rear[i]);
    triangle(frontCenter, face[i], face[j]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

export function bellStoneCells(span, count, offset = 0, gap = 0.012) {
  const step = span / count,
    cells = [];
  for (
    let start = -span / 2 - offset * step;
    start < span / 2 - 1e-6;
    start += step
  ) {
    const lo = Math.max(-span / 2, start),
      hi = Math.min(span / 2, start + step);
    if (hi - lo > gap)
      cells.push({ center: (lo + hi) / 2, width: hi - lo - gap });
  }
  return cells;
}
