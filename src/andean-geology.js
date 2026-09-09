import * as THREE from "three";
import { skyRockNoise } from "./sky-geology.js";

const TAU = Math.PI * 2;
const clamp = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const peaks = [
  [
    [0.18, 130, 0.24],
    [1.06, 190, 0.3],
    [2.7, 105, 0.2],
    [4.05, 200, 0.32],
    [5.4, 110, 0.24],
  ],
  [
    [0.55, 180, 0.21],
    [1.6, 270, 0.25],
    [3.1, 150, 0.32],
    [4.8, 260, 0.26],
    [5.8, 160, 0.22],
  ],
  [
    [0.15, 310, 0.2],
    [1.23, 230, 0.27],
    [2.35, 340, 0.22],
    [3.8, 260, 0.28],
    [5.15, 310, 0.23],
  ],
];

// Sampling on a circle keeps every noise octave and warped drainage channel
// periodic. Nearby angles share spurs; they are not independent random peaks.
function circleNoise(angle, scale, seed, radial = 0) {
  return skyRockNoise(
    Math.cos(angle) * scale + radial,
    Math.sin(angle) * scale - radial * 0.61,
    seed,
  );
}

export function andeanHeight(angle, across, layer) {
  const t = clamp(across),
    seed = 183 + layer * 79;
  const broad = circleNoise(angle, 3.8, seed);
  let peak = [190, 360, 580][layer] + [140, 210, 280][layer] * broad;
  for (const [center, height, width] of peaks[layer]) {
    const d = Math.atan2(Math.sin(angle - center), Math.cos(angle - center));
    peak += height * Math.exp(-Math.pow(d / width, 2));
  }
  // Sharp subsidiary summits break the broad massifs at two physical scales.
  const crag = 1 - Math.abs(circleNoise(angle, 15, seed + 1) * 2 - 1);
  const tooth = 1 - Math.abs(circleNoise(angle, 43, seed + 2) * 2 - 1);
  peak *= 0.83 + crag * 0.13 + tooth * 0.035;
  const crest = 0.37 + (circleNoise(angle, 6, seed + 3) - 0.5) * 0.12;
  const flank = clamp(t < crest ? t / crest : (1 - t) / (1 - crest));
  const warp = circleNoise(angle, 7, seed + 4, t * 1.3) - 0.5;
  const channel = circleNoise(
    angle + warp * 0.07 * (1 - flank),
    25,
    seed + 5,
    t * 2.4,
  );
  const tributary = circleNoise(angle + warp * 0.04, 64, seed + 6, t * 5);
  const gullies =
    Math.pow(1 - Math.abs(channel * 2 - 1), 5) * 0.33 +
    Math.pow(1 - Math.abs(tributary * 2 - 1), 4) * 0.1;
  const apron = Math.pow(flank, 1.38 + broad * 0.35);
  const incision = gullies * Math.pow(Math.sin(Math.PI * flank), 0.8) * flank;
  // Broad toe buttresses and shallow bedding survive between the incisions.
  const spur =
    smooth(0.03, 0.25, flank) *
    (1 - smooth(0.45, 0.93, flank)) *
    Math.pow(circleNoise(angle, 13, seed + 7, t * 0.6), 2) *
    0.1;
  const bedding =
    Math.sin(apron * 27 + broad * 6) * 0.009 * Math.sin(Math.PI * flank);
  const fracture =
    circleNoise(angle, 57 + t * 43, seed + 8, t * 27) * 0.55 +
    circleNoise(angle, 117 + t * 61, seed + 9, t * 49) * 0.3 +
    circleNoise(angle, 213 + t * 97, seed + 10, t * 81) * 0.15;
  const shattered =
    (fracture - 0.5) * 0.19 * Math.pow(Math.sin(Math.PI * t), 0.65);
  return (
    [-125, -160, -210][layer] +
    Math.max(0, apron - incision + spur + bedding + shattered) * peak
  );
}

// Bilinear lookup on the generated polar height field. Used only while baking
// illumination; the playable terrain and its collision height are independent.
export function sampleAndeanHeight(geometry, x, z) {
  const { center, radius, width, segments, rings } = geometry.userData;
  const dx = x - center,
    dz = z - center,
    t = (Math.hypot(dx, dz) - radius) / width;
  if (t < 0 || t > 1) return -Infinity;
  const u = (((Math.atan2(dz, dx) + TAU) % TAU) / TAU) * segments;
  const v = t * rings,
    a = Math.floor(u),
    b = Math.min(rings - 1, Math.floor(v));
  const fx = u - a,
    fy = v - b,
    p = geometry.attributes.position;
  const h = (r, i) => p.getY(r * (segments + 1) + i);
  const lo = h(b, a) * (1 - fx) + h(b, a + 1) * fx;
  const hi = h(b + 1, a) * (1 - fx) + h(b + 1, a + 1) * fx;
  return lo * (1 - fy) + hi * fy;
}

export function bakeAndeanLight(geometry, sunDirection) {
  const p = geometry.attributes.position,
    { width, radius, segments, rings } = geometry.userData;
  const sun = sunDirection.clone().normalize(),
    horizontal = Math.hypot(sun.x, sun.z);
  const light = new Float32Array(p.count * 2),
    step = width / rings;
  for (let r = 0; r <= rings; r++)
    for (let a = 0; a < segments; a++) {
      const i = r * (segments + 1) + a,
        x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      let visibility = 1,
        cavity = 0;
      // A widening soft horizon prevents hard grid-sized shadow bands. Samples
      // extend across the massif, including a ridge on its far side.
      if (horizontal > 0.001)
        for (let j = 1; j <= 32; j++) {
          const d = step * (j * 0.6 + j * j * 0.055);
          const h = sampleAndeanHeight(
            geometry,
            x + (sun.x / horizontal) * d,
            z + (sun.z / horizontal) * d,
          );
          visibility = Math.min(
            visibility,
            smooth(-0.06, 0.09, (y + (sun.y / horizontal) * d - h + 1.5) / d),
          );
        }
      for (const d of [
        step * 2,
        Math.max(step * 4, ((radius * TAU) / segments) * 3),
      ]) {
        let rise = 0;
        for (let k = 0; k < 8; k++) {
          const h = sampleAndeanHeight(
            geometry,
            x + Math.cos((k * TAU) / 8) * d,
            z + Math.sin((k * TAU) / 8) * d,
          );
          rise += Math.max(0, Math.min(1.5, (h - y) / d));
        }
        cavity += rise / 16;
      }
      light[i * 2] = visibility;
      light[i * 2 + 1] = Math.max(0.35, 1 - cavity * 0.55);
    }
  for (let r = 0; r <= rings; r++) {
    const a = r * (segments + 1),
      b = a + segments;
    light[b * 2] = light[a * 2];
    light[b * 2 + 1] = light[a * 2 + 1];
  }
  geometry.setAttribute("ridgeLight", new THREE.BufferAttribute(light, 2));
}

export function andeanGeometry(
  extent,
  layer,
  sun = new THREE.Vector3(-80, 88, -65),
) {
  const segments = [512, 448, 384][layer],
    rings = [48, 40, 36][layer];
  const radius = extent * [0.93, 1.55, 2.25][layer],
    width = [520, 760, 1150][layer];
  const positions = [],
    indices = [];
  for (let r = 0; r <= rings; r++)
    for (let i = 0; i <= segments; i++) {
      // Use exactly zero at the circular seam, including noise and baked light.
      const a = ((i % segments) / segments) * TAU,
        t = r / rings,
        d = radius + t * width;
      positions.push(
        extent / 2 + Math.cos(a) * d,
        andeanHeight(a, t, layer),
        extent / 2 + Math.sin(a) * d,
      );
      if (r < rings && i < segments) {
        const n = r * (segments + 1) + i;
        indices.push(
          n,
          n + 1,
          n + segments + 1,
          n + 1,
          n + segments + 2,
          n + segments + 1,
        );
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const n = geometry.attributes.normal;
  for (let r = 0; r <= rings; r++) {
    const a = r * (segments + 1),
      b = a + segments;
    const normal = new THREE.Vector3()
      .fromBufferAttribute(n, a)
      .add(new THREE.Vector3().fromBufferAttribute(n, b))
      .normalize();
    n.setXYZ(a, normal.x, normal.y, normal.z);
    n.setXYZ(b, normal.x, normal.y, normal.z);
  }
  geometry.userData = {
    segments,
    rings,
    radius,
    width,
    layer,
    center: extent / 2,
  };
  bakeAndeanLight(geometry, sun);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
