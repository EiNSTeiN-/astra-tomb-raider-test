import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { stoneBlockGeometry } from "./temple-architecture.js";

// Staggered ashlar stays inside the preceding wall's collision envelope.
// A recessed closed backing fills the joints and enters the gallery floor.
function wallFooting(wall, surface) {
  const vertical = wall.d > wall.w,
    length = Math.max(wall.w, wall.d),
    thickness = Math.min(wall.w, wall.d);
  let footing = 0;
  const samples = Math.ceil(length / 0.35);
  for (let i = 0; i <= samples; i++)
    for (const side of [-1, 1]) {
      const along = -length / 2 + (length * i) / samples,
        across = side * (thickness / 2 + 0.01);
      footing = Math.min(
        footing,
        surface(
          wall.x + (vertical ? across : along),
          wall.z + (vertical ? along : across),
        ),
      );
    }
  return footing - 0.14;
}

export function galleryWallGeometry(wall, seed, surface = () => 0) {
  const vertical = wall.d > wall.w,
    length = Math.max(wall.w, wall.d),
    thickness = Math.min(wall.w, wall.d),
    courseHeight = 6.8 / 6,
    bond = length / 4,
    parts = [];
  const footing = wallFooting(wall, surface);
  for (let row = 0; row < 6; row++) {
    const cuts = [-length / 2];
    for (
      let cut = -length / 2 + (row % 2 ? bond / 2 : bond);
      cut < length / 2 - 0.01;
      cut += bond
    )
      cuts.push(cut);
    cuts.push(length / 2);
    for (let i = 0; i < cuts.length - 1; i++) {
      const span = cuts[i + 1] - cuts[i] - 0.018,
        along = (cuts[i + 1] + cuts[i]) / 2,
        bottom = row ? row * courseHeight + 0.009 : footing,
        top = (row + 1) * courseHeight - 0.009;
      const geometry = stoneBlockGeometry(
        vertical ? thickness : span,
        top - bottom,
        vertical ? span : thickness,
        seed + row * 103 + i * 7919,
        0.024,
      );
      geometry.translate(
        vertical ? 0 : along,
        (top + bottom) / 2,
        vertical ? along : 0,
      );
      parts.push(geometry);
    }
  }
  const facing = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  // Retain the original cap's nominal position and dimensions. Its limestone
  // material replaces the nearly black uninterrupted accent above each wall.
  const cap = stoneBlockGeometry(
    wall.w + 0.16,
    0.2,
    wall.d + 0.16,
    seed + 4,
  ).translate(0, 6.8, 0);
  return { facing, cap };
}

// A single extruded footprint closes the mortar at collinear joins and corners.
// Its exposed ends sit 5 cm behind the ashlar ends, clear of their chipped faces.
// The coordinate grid emits each boundary once, with no overlapping core faces.
export function galleryBackingGeometry(walls, surface = () => 0) {
  const rectangles = walls.map((w) => ({
    x: w.x,
    z: w.z,
    w: w.w - (w.d > w.w ? 0.08 : 0.1),
    d: w.d - (w.d > w.w ? 0.1 : 0.08),
  }));
  for (let i = 0; i < walls.length; i++)
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i],
        b = walls[j],
        vertical = a.d > a.w;
      if (vertical !== b.d > b.w) continue;
      if (vertical ? Math.abs(a.x - b.x) > 1e-6 : Math.abs(a.z - b.z) > 1e-6)
        continue;
      const gap = vertical
        ? Math.abs(a.z - b.z) - (a.d + b.d) / 2
        : Math.abs(a.x - b.x) - (a.w + b.w) / 2;
      if (Math.abs(gap) > 1e-6) continue;
      rectangles.push({
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        w: vertical ? Math.min(a.w, b.w) - 0.08 : 0.2,
        d: vertical ? 0.2 : Math.min(a.d, b.d) - 0.08,
      });
    }
  const xs = [
      ...new Set(rectangles.flatMap((r) => [r.x - r.w / 2, r.x + r.w / 2])),
    ].sort((a, b) => a - b),
    zs = [
      ...new Set(rectangles.flatMap((r) => [r.z - r.d / 2, r.z + r.d / 2])),
    ].sort((a, b) => a - b),
    occupied = new Set(),
    positions = [],
    uv = [],
    bottom = Math.min(...walls.map((w) => wallFooting(w, surface))) - 0.02,
    top = 6.8;
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < zs.length - 1; j++) {
      const x = (xs[i] + xs[i + 1]) / 2,
        z = (zs[j] + zs[j + 1]) / 2;
      if (
        rectangles.some(
          (r) => Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2,
        )
      )
        occupied.add(i + "," + j);
    }
  function face(points, normal) {
    const a = new THREE.Vector3(...points[0]),
      b = new THREE.Vector3(...points[1]),
      c = new THREE.Vector3(...points[2]);
    if (
      b
        .sub(a)
        .cross(c.sub(a))
        .dot(new THREE.Vector3(...normal)) < 0
    )
      points.reverse();
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const p = points[i];
      positions.push(...p);
      uv.push((normal[0] ? p[2] : p[0]) / 5, (normal[1] ? p[2] : p[1]) / 5);
    }
  }
  for (const key of occupied) {
    const [i, j] = key.split(",").map(Number),
      x0 = xs[i],
      x1 = xs[i + 1],
      z0 = zs[j],
      z1 = zs[j + 1];
    face(
      [
        [x0, top, z0],
        [x1, top, z0],
        [x1, top, z1],
        [x0, top, z1],
      ],
      [0, 1, 0],
    );
    face(
      [
        [x0, bottom, z0],
        [x1, bottom, z0],
        [x1, bottom, z1],
        [x0, bottom, z1],
      ],
      [0, -1, 0],
    );
    if (!occupied.has(i - 1 + "," + j))
      face(
        [
          [x0, bottom, z0],
          [x0, top, z0],
          [x0, top, z1],
          [x0, bottom, z1],
        ],
        [-1, 0, 0],
      );
    if (!occupied.has(i + 1 + "," + j))
      face(
        [
          [x1, bottom, z0],
          [x1, top, z0],
          [x1, top, z1],
          [x1, bottom, z1],
        ],
        [1, 0, 0],
      );
    if (!occupied.has(i + "," + (j - 1)))
      face(
        [
          [x0, bottom, z0],
          [x0, top, z0],
          [x1, top, z0],
          [x1, bottom, z0],
        ],
        [0, 0, -1],
      );
    if (!occupied.has(i + "," + (j + 1)))
      face(
        [
          [x0, bottom, z1],
          [x0, top, z1],
          [x1, top, z1],
          [x1, bottom, z1],
        ],
        [0, 0, 1],
      );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}
