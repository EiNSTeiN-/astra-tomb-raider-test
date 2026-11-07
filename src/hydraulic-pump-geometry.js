import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Local coordinates share the existing wheel pedestal. The barrel is set back
// from the wheel, with a short bearing shaft joining its retained hub.
const PROFILES = [
  [
    [0, 0.435],
    [0.13, 0.435],
    [0.18, 0.49],
    [0.16, 0.53],
    [0.14, 0.57],
    [0.185, 0.64],
    [0.21, 0.72],
    [0.21, 0.82],
    [0.19, 0.89],
    [0.15, 1.01],
    [0.085, 1.09],
    [0.085, 1.24],
    [0.1, 1.28],
    [0.1, 1.39],
    [0.09, 1.44],
    [0, 1.44],
  ],
  [
    [0, 0.435],
    [0.13, 0.435],
    [0.18, 0.51],
    [0.15, 0.55],
    [0.19, 0.59],
    [0.22, 0.63],
    [0.22, 0.84],
    [0.19, 0.91],
    [0.12, 1.03],
    [0.085, 1.09],
    [0.085, 1.24],
    [0.1, 1.28],
    [0.1, 1.42],
    [0.09, 1.46],
    [0, 1.46],
  ],
  [
    [0, 0.435],
    [0.13, 0.435],
    [0.18, 0.49],
    [0.15, 0.54],
    [0.19, 0.59],
    [0.2, 0.64],
    [0.2, 0.83],
    [0.18, 0.9],
    [0.145, 1.02],
    [0.085, 1.09],
    [0.085, 1.24],
    [0.1, 1.28],
    [0.1, 1.4],
    [0.085, 1.45],
    [0, 1.45],
  ],
];

export function hydraulicPumpGeometry(variant) {
  const profile = PROFILES[variant];
  if (!profile) throw new RangeError("Unknown hydraulic pump casting");
  const parts = [],
    body = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      variant === 1 ? 8 : 64,
    ),
    position = body.attributes.position;
  if (variant === 2) {
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i),
        z = position.getZ(i),
        y = position.getY(i),
        angle = Math.atan2(x, z),
        fade = Math.max(0, Math.min(1, (y - 0.59) / 0.05, (1.02 - y) / 0.12)),
        radius = 1 - fade * 0.12 * (0.5 + 0.5 * Math.cos(angle * 8));
      position.setXYZ(i, x * radius, y, z * radius);
    }
  }
  for (let i = 0; i < position.count; i++) {
    const t = THREE.MathUtils.clamp((position.getY(i) - 1.01) / 0.08, 0, 1);
    position.setZ(i, position.getZ(i) - 0.12 + t * 0.085);
  }
  const expanded = body.toNonIndexed();
  body.dispose();
  if (variant === 1) expanded.computeVertexNormals();
  else {
    // Average matching ring vertices, including the angular seam. The separate
    // octagonal chest retains its dressed face normals.
    const normals = new Map();
    expanded.computeVertexNormals();
    const p = expanded.attributes.position,
      n = expanded.attributes.normal;
    const key = (i) =>
      [p.getX(i), p.getY(i), p.getZ(i)]
        .map((v) => Math.round(v * 1e6))
        .join(",");
    for (let i = 0; i < p.count; i++) {
      const k = key(i);
      if (!normals.has(k)) normals.set(k, new THREE.Vector3());
      normals.get(k).add(new THREE.Vector3().fromBufferAttribute(n, i));
    }
    for (let i = 0; i < p.count; i++) {
      const normal = normals.get(key(i)).normalize();
      n.setXYZ(i, normal.x, normal.y, normal.z);
    }
  }
  parts.push(expanded);
  const cylinder = (r, length, x, y, z, axis, sides = 24) => {
    const geometry = new THREE.CylinderGeometry(r, r, length, sides);
    if (axis === "z") geometry.rotateX(Math.PI / 2);
    geometry.translate(x, y, z);
    const expanded = geometry.toNonIndexed();
    geometry.dispose();
    parts.push(expanded);
  };
  // Cast joint flanges overlap the continuous body beneath their machined rims.
  cylinder(0.23, 0.04, 0, 0.605, -0.12, "y", variant === 1 ? 8 : 48);
  cylinder(0.185, 0.035, 0, 0.94, -0.12, "y", variant === 1 ? 8 : 48);
  // The rear connection enters the existing stone wall below its water line.
  cylinder(0.065, 0.46, 0, 0.75, -0.47, "z");
  cylinder(0.095, 0.055, 0, 0.75, -0.3, "z");
  // Shoulder and axle are seated into the barrel and the unchanged wheel hub.
  cylinder(0.105, 0.105, 0, 1.35, -0.01, "z");
  cylinder(0.065, 0.13, 0, 1.35, 0.035, "z");
  for (const x of [-0.27, 0.27])
    for (const z of [-0.2, 0.2]) cylinder(0.028, 0.045, x, 0.4625, z, "y", 6);
  const geometry = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  geometry.name = [
    "Moulded round pump",
    "Octagonal valve chest",
    "Fluted pump barrel",
  ][variant];
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
