import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export function campBox(w, h, d, r = 0.02) {
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 4, h / 4, d / 4));
}
export function campStone(seed = 0) {
  const geometry = new THREE.SphereGeometry(1, 12, 8),
    p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      r =
        1 +
        0.1 * Math.sin(x * 5 + z * 7 + seed) +
        0.08 * Math.cos(y * 8 - z * 3 + seed);
    p.setXYZ(i, x * r, Math.max(-0.65, y * r), z * r);
  }
  geometry.computeVertexNormals();
  return geometry;
}
export function campLog(length, radius, seed) {
  const g = new THREE.CylinderGeometry(
      radius * 0.86,
      radius,
      length,
      16,
      6,
      true,
    ),
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      a = Math.atan2(z, x),
      r =
        1 +
        0.055 * Math.sin(a * 7 + y * 3 + seed) +
        0.045 * Math.cos(a * 11 - y * 8);
    p.setXYZ(i, x * r + 0.018 * Math.sin(y * 6 + seed), y, z * r);
  }
  g.rotateZ(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
export function bedrollGeometry() {
  const g = new THREE.CylinderGeometry(0.18, 0.17, 1.02, 32, 16),
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      a = Math.atan2(z, x),
      cinch = 1 - 0.18 * Math.exp(-Math.pow((Math.abs(y) - 0.32) / 0.047, 2)),
      wrinkle =
        1 +
        0.018 * Math.sin(a * 15 + y * 43) +
        0.035 * Math.sin(y * 17 + a * 3);
    p.setXYZ(i, x * cinch * wrinkle, y, z * cinch * wrinkle);
  }
  g.rotateZ(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
export function campTube(points, radius = 0.008, segments = 24) {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
    segments,
    radius,
    6,
    false,
  );
}
export function tintCampGeometry(g, shade = 1) {
  const p = g.attributes.position,
    colors = new Float32Array(p.count * 3).fill(shade);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}
