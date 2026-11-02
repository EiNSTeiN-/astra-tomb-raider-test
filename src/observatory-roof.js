import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { domePanelGeometry } from "./observatory-geometry.js";
import { roofFrame } from "./observatory-roof-plan.js";

function section(radius, plan, angle, theta) {
  const frame = roofFrame(radius, plan.rise, plan.opening, theta, plan),
    normal = new THREE.Vector3(
      frame.normalRadius * Math.cos(angle),
      frame.normalY,
      frame.normalRadius * Math.sin(angle),
    );
  return {
    point: new THREE.Vector3(
      Math.cos(angle) * frame.radius,
      frame.height,
      Math.sin(angle) * frame.radius,
    ),
    normal,
  };
}
// Closed, bevelled metal straps. The lower edge enters the bronze skin; end
// caps remain present when a shutter opens and exposes its cut edges.
function strap(samples, width, lift = 0) {
  const cross = [
      [-0.5, -0.04],
      [0.5, -0.04],
      [0.5, 0.06],
      [0.35, 0.095],
      [-0.35, 0.095],
      [-0.5, 0.06],
    ],
    positions = [],
    uv = [],
    indices = [];
  for (let i = 0; i < samples.length; i++) {
    const current = samples[i],
      tangent = samples[Math.min(samples.length - 1, i + 1)].point
        .clone()
        .sub(samples[Math.max(0, i - 1)].point)
        .normalize(),
      across = current.normal.clone().cross(tangent).normalize();
    for (const [u, v] of cross) {
      const p = current.point
        .clone()
        .addScaledVector(across, u * width)
        .addScaledVector(current.normal, v + lift);
      positions.push(...p);
      uv.push(u + 0.5, i / (samples.length - 1));
    }
  }
  for (let i = 0; i < samples.length - 1; i++)
    for (let j = 0; j < cross.length; j++) {
      const a = i * cross.length + j,
        b = a + cross.length,
        d = i * cross.length + ((j + 1) % cross.length),
        c = d + cross.length;
      indices.push(a, d, c, a, c, b);
    }
  const end = (samples.length - 1) * cross.length;
  for (let j = 1; j < cross.length - 1; j++)
    indices.push(0, j + 1, j, end, end + j, end + j + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
export function observatoryRoofPanel(radius, plan, a0, a1) {
  const parts = [
      domePanelGeometry(radius, plan.rise, a0, a1, plan.opening, plan),
    ],
    headings = [a0 + 0.016, (a0 + a1) / 2, a1 - 0.016],
    bands = [0.34, 0.68].map(
      (t) => plan.opening + (Math.PI / 2 - plan.opening) * t,
    ),
    bolt = new THREE.CylinderGeometry(0.085, 0.085, 0.085, 6),
    up = new THREE.Vector3(0, 1, 0);
  const sample = (a, t) => section(radius, plan, a, t);
  for (const a of headings)
    parts.push(
      strap(
        Array.from({ length: 25 }, (_, i) =>
          sample(
            a,
            plan.opening +
              0.008 +
              ((Math.PI / 2 - plan.opening - 0.016) * i) / 24,
          ),
        ),
        0.19,
        0.015,
      ),
    );
  for (const t of bands)
    parts.push(
      strap(
        Array.from({ length: 19 }, (_, i) =>
          sample(a0 + 0.016 + ((a1 - a0 - 0.032) * i) / 18, t),
        ),
        0.17,
        -0.012,
      ),
    );
  for (const a of headings)
    for (const t of bands) {
      const s = sample(a, t),
        q = new THREE.Quaternion().setFromUnitVectors(up, s.normal),
        matrix = new THREE.Matrix4().compose(
          s.point.addScaledVector(s.normal, 0.11),
          q,
          new THREE.Vector3(1, 1, 1),
        );
      parts.push(bolt.clone().applyMatrix4(matrix));
    }
  bolt.dispose();
  const geometry = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.roof = { name: plan.name, ribs: 3, bands: 2, fasteners: 6 };
  return geometry;
}
