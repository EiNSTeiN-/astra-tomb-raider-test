import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { random } from "./campaign.js";

// Clip a convex polygon to n·p <= limit. Adjacent cells share the same cut;
// the narrow inset below supplies a physical joint rather than a painted grid.
function clip(poly, nx, ny, limit) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const da = a[0] * nx + a[1] * ny - limit;
    const db = b[0] * nx + b[1] * ny - limit;
    if (da <= 1e-8) out.push(a);
    if (da < 0 !== db < 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out.filter((a, i) => {
    const b = out[(i + 1) % out.length];
    return Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-7;
  });
}

export function insetStonePolygon(poly, distance) {
  let out = poly.map((p) => [...p]);
  for (let i = 0; i < poly.length && out.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    out = clip(
      out,
      dy / length,
      -dx / length,
      (a[0] * dy - a[1] * dx) / length - distance,
    );
  }
  return out;
}

export function fittedStoneCells(boundary, seed = 1, scale = 1.25) {
  const rng = random(seed),
    sites = [];
  const xs = boundary.map((p) => p[0]),
    ys = boundary.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const cols = Math.max(1, Math.round((maxX - minX) / scale));
  const rows = Math.max(1, Math.round((maxY - minY) / (scale * 0.65)));
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++)
      sites.push([
        minX + ((col + 0.5 + (rng() - 0.5) * 0.55) * (maxX - minX)) / cols,
        minY + ((row + 0.5 + (rng() - 0.5) * 0.45) * (maxY - minY)) / rows,
      ]);
  const cells = [];
  for (const a of sites) {
    let poly = boundary.map((p) => [...p]);
    for (const b of sites) {
      if (a === b) continue;
      poly = clip(
        poly,
        b[0] - a[0],
        b[1] - a[1],
        (b[0] * b[0] + b[1] * b[1] - a[0] * a[0] - a[1] * a[1]) / 2,
      );
      if (poly.length < 3) break;
    }
    if (poly.length >= 3) cells.push(poly);
  }
  return cells;
}

// Closed convex stone with a shallow crown and chamfered front/back edges.
// Ring correspondence is retained at sharp corners so the bevel stays sealed.
export function fittedStoneGeometry(poly, depth, seed = 1) {
  const rng = random(seed),
    p = [],
    uv = [],
    colors = [];
  const center = poly.reduce(
    (s, a) => [s[0] + a[0] / poly.length, s[1] + a[1] / poly.length],
    [0, 0],
  );
  const shade = 0.78 + rng() * 0.26;
  const bevel = Math.min(0.065, depth * 0.12);
  const front = poly.map((a) => {
    const dx = a[0] - center[0],
      dy = a[1] - center[1];
    const f = Math.max(0.65, 1 - bevel / Math.hypot(dx, dy));
    return [center[0] + dx * f, center[1] + dy * f, depth / 2];
  });
  const back = front.map((a) => [a[0], a[1], -depth / 2]);
  const outerF = poly.map((a) => [...a, depth / 2 - bevel]);
  const outerB = poly.map((a) => [...a, -depth / 2 + bevel]);
  const tri = (a, b, c) => {
    const ab = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    const ac = new THREE.Vector3(...c).sub(new THREE.Vector3(...a));
    const n = ab.cross(ac).normalize();
    const axis = Math.abs(n.z) > 0.5 ? 2 : Math.abs(n.x) > 0.5 ? 0 : 1;
    for (const v of [a, b, c]) {
      p.push(...v);
      uv.push(
        (axis === 0 ? v[2] : v[0]) * 0.5,
        (axis === 1 ? v[2] : v[1]) * 0.5,
      );
      colors.push(shade, shade * 0.993, shade * 0.96);
    }
  };
  const join = (a, b, i, j) => {
    tri(a[i], b[i], a[j]);
    tri(a[j], b[i], b[j]);
  };
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    tri([center[0], center[1], depth / 2 + 0.018], front[i], front[j]);
    join(front, outerF, i, j);
    join(outerF, outerB, i, j);
    join(outerB, back, i, j);
    tri([center[0], center[1], -depth / 2], back[j], back[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export function fittedWallGeometry(boundary, depth, seed = 1, scale = 1.25) {
  const cells = fittedStoneCells(boundary, seed, scale);
  const parts = cells
    .map((p, i) => insetStonePolygon(p, 0.014))
    .filter((p) => p.length >= 3)
    .map((p, i) => fittedStoneGeometry(p, depth, seed + i * 17));
  const stones = parts.length;
  // Deep packed stone backs the fitted faces. Joints retain their recess but
  // cannot reveal daylight through a solid wall or the back of a niche.
  const core = fittedStoneGeometry(boundary, depth * 0.72, seed);
  const colors = core.attributes.color;
  for (let i = 0; i < colors.count; i++) colors.setXYZ(i, 0.34, 0.35, 0.33);
  parts.push(core);
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  g.userData.stones = stones;
  return g;
}
