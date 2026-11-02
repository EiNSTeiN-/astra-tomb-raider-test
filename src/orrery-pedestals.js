import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { projectStoneUVs } from "./stone-uv.js";

// Height fraction, radius, polygon blend and stone tone. The circular lower
// course shares the 32-sided buried footing; every profile ends at the same
// spindle seat. Higher faces vary without moving the coupled ring mechanism.
const PROFILES = [
  [
    "Meridian courses",
    12,
    0,
    [
      [0, 4, 0, 0.78],
      [0.035, 4, 0, 1],
      [0.09, 3.82, 0.55, 1],
      [0.15, 3.82, 1, 0.8],
      [0.2, 3.4, 1, 0.8],
      [0.74, 3.13, 1, 0.8],
      [0.8, 3.42, 1, 1.1],
      [0.9, 3.42, 1, 1.1],
      [0.94, 3.24, 1, 0.9],
      [1, 3.24, 1, 0.9],
    ],
  ],
  [
    "Portal octagon",
    8,
    0,
    [
      [0, 4, 0, 0.8],
      [0.04, 4, 0, 1.1],
      [0.12, 3.82, 1, 1.1],
      [0.2, 3.3, 1, 0.78],
      [0.65, 3.05, 1, 0.78],
      [0.72, 3.65, 1, 1],
      [0.86, 3.65, 1, 1],
      [0.94, 3.2, 1, 0.85],
      [1, 3.2, 1, 0.85],
    ],
  ],
  [
    "Earth-axis registers",
    8,
    Math.PI / 8,
    [
      [0, 4, 0, 0.8],
      [0.05, 4, 0, 1.1],
      [0.14, 3.72, 1, 1.1],
      [0.22, 3.72, 1, 0.8],
      [0.28, 3.2, 1, 0.8],
      [0.43, 3.2, 1, 0.8],
      [0.47, 3.38, 1, 1.12],
      [0.53, 3.38, 1, 1.12],
      [0.57, 3.2, 1, 0.8],
      [0.78, 3.2, 1, 0.8],
      [0.86, 3.58, 1, 1.12],
      [0.95, 3.58, 1, 1.12],
      [1, 3.23, 1, 0.9],
    ],
  ],
  [
    "Lunar shoulder",
    32,
    0,
    [
      [0, 4, 0, 0.8],
      [0.04, 4, 0, 1],
      [0.1, 3.9, 1, 1],
      [0.19, 3.64, 1, 0.9],
      [0.34, 3.35, 1, 0.8],
      [0.54, 3.17, 1, 0.8],
      [0.68, 3.3, 1, 0.9],
      [0.81, 3.6, 1, 1.1],
      [0.92, 3.64, 1, 1.1],
      [1, 3.3, 1, 0.95],
    ],
  ],
  [
    "Archive square",
    4,
    Math.PI / 4,
    [
      [0, 4, 0, 0.8],
      [0.04, 4, 0, 1.1],
      [0.12, 3.85, 1, 1.1],
      [0.2, 3.5, 1, 0.8],
      [0.75, 3.5, 1, 0.8],
      [0.81, 3.78, 1, 1.12],
      [0.9, 3.78, 1, 1.12],
      [0.95, 3.4, 1, 0.95],
      [1, 3.4, 1, 0.95],
    ],
  ],
  [
    "Solar collar",
    16,
    0,
    [
      [0, 4, 0, 0.8],
      [0.035, 4, 0, 1.1],
      [0.1, 3.82, 1, 1.1],
      [0.18, 3.5, 1, 0.85],
      [0.31, 3.26, 1, 0.8],
      [0.62, 3.26, 1, 0.8],
      [0.7, 3.5, 1, 1.1],
      [0.8, 3.72, 1, 1.1],
      [0.91, 3.72, 1, 1.1],
      [1, 3.25, 1, 0.95],
    ],
  ],
  [
    "Western hexagon",
    6,
    Math.PI / 6,
    [
      [0, 4, 0, 0.8],
      [0.04, 4, 0, 1.1],
      [0.12, 3.8, 1, 1.1],
      [0.24, 3.7, 1, 0.9],
      [0.32, 3.3, 1, 0.8],
      [0.7, 3.3, 1, 0.8],
      [0.8, 3.62, 1, 1.1],
      [0.93, 3.62, 1, 1.1],
      [1, 3.25, 1, 0.95],
    ],
  ],
  [
    "Astral shoulders",
    8,
    Math.PI / 8,
    [
      [0, 4, 0, 0.8],
      [0.04, 4, 0, 1.1],
      [0.13, 3.75, 1, 1.1],
      [0.21, 3.35, 1, 0.8],
      [0.42, 3.05, 1, 0.8],
      [0.58, 3.05, 1, 0.8],
      [0.76, 3.6, 1, 1.05],
      [0.88, 3.6, 1, 1.05],
      [1, 3.2, 1, 0.95],
    ],
  ],
  [
    "Circuit diamond",
    4,
    0,
    [
      [0, 4, 0, 0.8],
      [0.04, 4, 0, 1.1],
      [0.12, 3.82, 1, 1.1],
      [0.19, 3.65, 1, 0.9],
      [0.27, 3.45, 1, 0.8],
      [0.64, 3.45, 1, 0.8],
      [0.72, 3.65, 1, 1.1],
      [0.8, 3.65, 1, 1.1],
      [0.88, 3.35, 1, 0.95],
      [1, 3.35, 1, 0.95],
    ],
  ],
  [
    "Hollow-earth strata",
    32,
    0,
    [
      [0, 4, 0, 0.8],
      [0.04, 4, 0, 1.1],
      [0.11, 3.86, 1, 1.1],
      [0.18, 3.64, 1, 0.8],
      [0.27, 3.64, 1, 0.8],
      [0.31, 3.8, 1, 1.12],
      [0.38, 3.8, 1, 1.12],
      [0.44, 3.5, 1, 0.8],
      [0.58, 3.5, 1, 0.8],
      [0.64, 3.7, 1, 1.12],
      [0.72, 3.7, 1, 1.12],
      [0.79, 3.3, 1, 0.8],
      [0.92, 3.3, 1, 0.8],
      [1, 3.45, 1, 1],
    ],
  ],
  [
    "Atlas bearing",
    12,
    Math.PI / 12,
    [
      [0, 4, 0, 0.8],
      [0.04, 4, 0, 1.1],
      [0.11, 3.88, 1, 1.1],
      [0.21, 3.6, 1, 0.85],
      [0.56, 3.2, 1, 0.8],
      [0.67, 3.2, 1, 0.8],
      [0.77, 3.75, 1, 1.12],
      [0.91, 3.75, 1, 1.12],
      [1, 3.3, 1, 0.95],
    ],
  ],
];
const SEGMENTS = 96;
export function orreryPedestalPlan(index) {
  const p = PROFILES[index];
  if (!p) throw new RangeError(`Unknown orrery pedestal ${index}`);
  return {
    index,
    name: p[0],
    sides: p[1],
    phase: p[2],
    sections: p[3].map((s) => [...s]),
  };
}
function polygonRadius(angle, sides, phase = 0) {
  const period = (Math.PI * 2) / sides,
    delta = ((((angle - phase) % period) + period) % period) - period / 2;
  return Math.cos(Math.PI / sides) / Math.cos(delta);
}
function rings(plan, bottom, top) {
  return plan.sections.map(([t, r, blend, tone]) => ({
    tone,
    points: Array.from({ length: SEGMENTS }, (_, i) => {
      const angle = (i * Math.PI * 2) / SEGMENTS,
        shape = THREE.MathUtils.lerp(
          polygonRadius(angle, 32),
          polygonRadius(angle, plan.sides, plan.phase),
          blend,
        ),
        // The footing overlaps the first 3.5 cm of the body. Recess the lower
        // skin so differently shaded stone cannot share a coplanar strip.
        radius = (r - (t === 0 ? 0.01 : 0)) * shape;
      return new THREE.Vector3(
        Math.sin(angle) * radius,
        THREE.MathUtils.lerp(bottom, top, t),
        Math.cos(angle) * radius,
      );
    }),
  }));
}

export function orreryPedestalGeometry(index, bottom, top = 3) {
  const plan = orreryPedestalPlan(index),
    rows = rings(plan, bottom, top),
    positions = [],
    colors = [];
  const tri = (a, b, c, ta, tb = ta, tc = ta) => {
    positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());
    for (const t of [ta, tb, tc]) colors.push(t, t * 0.993, t * 0.975);
  };
  for (let row = 1; row < rows.length; row++)
    for (let i = 0; i < SEGMENTS; i++) {
      const j = (i + 1) % SEGMENTS,
        a = rows[row - 1],
        b = rows[row];
      tri(a.points[i], a.points[j], b.points[i], a.tone, a.tone, b.tone);
      tri(a.points[j], b.points[j], b.points[i], a.tone, b.tone, b.tone);
    }
  for (let i = 0; i < SEGMENTS; i++) {
    const j = (i + 1) % SEGMENTS,
      lo = rows[0],
      hi = rows.at(-1);
    tri(new THREE.Vector3(0, bottom, 0), lo.points[j], lo.points[i], lo.tone);
    tri(new THREE.Vector3(0, top, 0), hi.points[i], hi.points[j], hi.tone);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      new Float32Array((positions.length / 3) * 2),
      2,
    ),
  );
  g.computeVertexNormals();
  projectStoneUVs(g);
  g.userData.pedestal = { index, name: plan.name, sections: rows.length };
  return g;
}

// Each vertical interval has a small convex camera envelope. The complete
// body keeps its concave mouldings; a single outer box would fill the empty
// upper corners of its square and hexagonal sections.
export function captureOrreryPedestal(game, mesh, index, bottom, top = 3) {
  if (!game.cameraSurfaces) return 0;
  const rows = rings(orreryPedestalPlan(index), bottom, top);
  let count = 0;
  for (let row = 1; row < rows.length; row++) {
    const hull = new ConvexGeometry([
        ...rows[row - 1].points,
        ...rows[row].points,
      ]),
      p = hull.attributes.position,
      n = hull.attributes.normal,
      planes = [],
      seen = new Set(),
      normal = new THREE.Vector3(),
      point = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      normal.fromBufferAttribute(n, i).normalize();
      point.fromBufferAttribute(p, i);
      const d = normal.dot(point),
        values = [normal.x, normal.y, normal.z, d],
        key = values.map((v) => Math.round(v * 1e6)).join(",");
      if (!seen.has(key)) {
        seen.add(key);
        planes.push(values);
      }
    }
    const proxy = new THREE.Mesh(hull, mesh.material);
    proxy.position.copy(mesh.position);
    proxy.quaternion.copy(mesh.quaternion);
    proxy.scale.copy(mesh.scale);
    mesh.parent.add(proxy);
    game.cameraSurfaces.capture(proxy, { small: true, thin: true, planes });
    mesh.parent.remove(proxy);
    hull.dispose();
    count++;
  }
  return count;
}
