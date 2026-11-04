import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { boxEntry, convexEntry } from "./camera-collision.js";
import { RoofCamera } from "./roof-camera.js";
import { materialTextureLoader } from "./asset-loading.js";

const PROFILE = [
  [0.34, 0],
  [0.38, 0.025],
  [0.38, 0.065],
  [0.32, 0.105],
  [0.28, 0.15],
  [0.28, 0.2],
  [0.33, 0.225],
  [0.34, 0.27],
  [0.3, 0.32],
  [0.25, 0.37],
  [0.2, 0.43],
  [0.19, 0.5],
  [0.23, 0.59],
  [0.27, 0.68],
  [0.26, 0.75],
  [0.22, 0.83],
  [0.15, 0.9],
  [0.12, 0.96],
  [0.12, 1.01],
  [0.18, 1.035],
  [0.18, 1.085],
  [0.12, 1.12],
  [0.075, 1.17],
  [0.1, 1.22],
  [0.13, 1.28],
  [0.12, 1.34],
  [0.075, 1.4],
  [0.03, 1.47],
  [0.012, 1.56],
];
const FORMS = {
  0: [0.76, 1, 6, 0],
  1: [0.88, 0.9, 8, 0],
  2: [0.8, 1.08, 8, 0],
  3: [0.84, 1, 6, 0.25],
  5: [0.86, 0.96, 8, 0.65],
  6: [0.95, 0.88, 10, 0],
  7: [0.72, 1.08, 6, 0.15],
  8: [0.9, 1.04, 8, 0.35],
};
export function monasteryFinialPlan(index) {
  const form = FORMS[index];
  if (!form) return null;
  const [height, width, lobes, twist] = form;
  return { height, width, lobes, twist, radius: 0.38 * width, segments: 64 };
}

function clip(polygon, a, b) {
  const out = [],
    distance = (p) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i],
      q = polygon[(i + 1) % polygon.length],
      d = distance(p),
      e = distance(q);
    if (d >= -1e-10) out.push(p);
    if (d * e < 0) out.push(p.clone().lerp(q, d / (d - e)));
  }
  return out.filter(
    (p, i) => p.distanceToSquared(out[(i + 1) % out.length]) > 1e-14,
  );
}
function roofCells(geometry, outline) {
  const p = geometry.attributes.position,
    ids = geometry.index,
    result = [];
  for (let i = 0; i < (ids?.count ?? p.count); i += 3) {
    let v = [0, 1, 2].map((j) =>
      new T.Vector3().fromBufferAttribute(p, ids ? ids.getX(i + j) : i + j),
    );
    if (new T.Triangle(...v).getNormal(new T.Vector3()).y <= 1e-6) continue;
    for (let j = 0; j < outline.length && v.length; j++)
      v = clip(v, outline[j], outline[(j + 1) % outline.length]);
    if (
      v.length >= 3 &&
      v
        .slice(1, -1)
        .reduce(
          (sum, b, j) => sum + new T.Triangle(v[0], b, v[j + 2]).getArea(),
          0,
        ) > 1e-9
    )
      result.push(v);
  }
  return result;
}
function saddle(cells, top) {
  const positions = [],
    edges = new Map(),
    key = (p) =>
      p
        .toArray()
        .map((n) => Math.round(n * 1e5))
        .join(","),
    triangle = (a, b, c) =>
      positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  for (const cell of cells) {
    const upper = cell.map((p) => new T.Vector3(p.x, top, p.z)),
      lower = cell.map((p) => p.clone().add(new T.Vector3(0, -0.006, 0)));
    for (let j = 1; j < cell.length - 1; j++) {
      triangle(upper[0], upper[j], upper[j + 1]);
      triangle(lower[0], lower[j + 1], lower[j]);
    }
    for (let j = 0; j < cell.length; j++) {
      const a = lower[j],
        b = lower[(j + 1) % cell.length],
        id = [key(a), key(b)].sort().join("|");
      if (edges.has(id)) edges.delete(id);
      else edges.set(id, [a, b]);
    }
  }
  for (const [a, b] of edges.values()) {
    const c = new T.Vector3(a.x, top, a.z),
      d = new T.Vector3(b.x, top, b.z);
    triangle(a, b, d);
    triangle(a, d, c);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

class FinialCamera {
  constructor(base, sections) {
    this.base = new RoofCamera(base);
    this.sections = sections;
  }
  entry(a, b, radius = 0) {
    let hit = this.base.entry(a, b, radius);
    for (const { box, planes } of this.sections) {
      if (boxEntry(a, b, box, radius, true) === null) continue;
      const t = convexEntry(a, b, planes, radius);
      if (t !== null) hit = hit === null ? t : Math.min(hit, t);
    }
    return hit;
  }
}

export function monasteryFinialGeometry(slate, snow, index) {
  const plan = monasteryFinialPlan(index);
  if (!plan) throw Error("Open pavilion has no finial");
  const outline = Array.from(
      { length: 8 },
      (_, j) =>
        new T.Vector3(
          Math.cos((j * Math.PI) / 4) * plan.radius,
          0,
          Math.sin((j * Math.PI) / 4) * plan.radius,
        ),
    ),
    cells = roofCells(slate, outline),
    snowCells = roofCells(snow, outline),
    anchor = Math.max(...snowCells.flat().map((p) => p.y)) + 0.025;
  if (!cells.length || !snowCells.length || !Number.isFinite(anchor))
    throw Error("Missing finial roof bearing");
  const base = saddle(cells, anchor),
    positions = [],
    uv = [],
    indices = [],
    rings = [],
    sections = [];
  for (const [r, y] of PROFILE) {
    const points = [];
    for (let j = 0; j < plan.segments; j++) {
      const angle = (j / plan.segments) * Math.PI * 2,
        flute = Math.sin(angle * plan.lobes + y * plan.twist * 8),
        envelope = Math.sin(Math.PI * Math.min(1, y / 1.56)) ** 2,
        radius = r * plan.width * (1 + 0.035 * flute * envelope),
        p = new T.Vector3(
          Math.cos(angle) * radius,
          anchor - 0.004 + y * plan.height,
          Math.sin(angle) * radius,
        );
      positions.push(...p.toArray());
      uv.push(j / plan.segments, y);
      points.push(p);
    }
    rings.push(points);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < plan.segments; j++) {
      const a = i * plan.segments + j,
        b = i * plan.segments + ((j + 1) % plan.segments),
        c = a + plan.segments,
        d = b + plan.segments;
      indices.push(a, c, b, b, c, d);
    }
    // Each short frustum follows the actual fluted rings. Convex hulls are
    // conservative only across the shallow grooves, not across the necks.
    const hull = new ConvexGeometry([...rings[i], ...rings[i + 1]]),
      p = hull.attributes.position,
      n = hull.attributes.normal,
      planes = [],
      seen = new Set();
    for (let j = 0; j < p.count; j += 3) {
      const v = new T.Vector3().fromBufferAttribute(n, j),
        at = new T.Vector3().fromBufferAttribute(p, j),
        plane = [v.x, v.y, v.z, v.dot(at)],
        key = plane.map((x) => x.toFixed(7)).join(",");
      if (!seen.has(key)) {
        seen.add(key);
        planes.push(plane);
      }
    }
    hull.computeBoundingBox();
    sections.push({ box: hull.boundingBox.clone(), planes });
    hull.dispose();
  }
  for (const [first, up] of [
    [0, false],
    [(rings.length - 1) * plan.segments, true],
  ]) {
    const center = positions.length / 3;
    positions.push(0, positions[first * 3 + 1], 0);
    uv.push(0.5, up ? 1.56 : 0);
    for (let j = 0; j < plan.segments; j++) {
      const a = first + j,
        b = first + ((j + 1) % plan.segments);
      indices.push(...(up ? [center, b, a] : [center, a, b]));
    }
  }
  const body = new T.BufferGeometry();
  body.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  body.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  body.setIndex(indices);
  body.computeVertexNormals();
  const parts = [base, body.toNonIndexed()];
  body.dispose();
  const bronze = new T.Color(0xa0824e),
    edge = new T.Color(0xc4aa74),
    patina = new T.Color(0x45665b),
    color = new T.Color();
  for (const [part, g] of parts.entries()) {
    const p = g.attributes.position,
      n = g.attributes.normal,
      colors = [],
      coords = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i) - anchor,
        z = p.getZ(i),
        angle = Math.atan2(z, x),
        groove = 0.5 + 0.5 * Math.sin(angle * plan.lobes + y * plan.twist * 8),
        tarnish = T.MathUtils.clamp(
          (groove - 0.55) * 1.15 + Math.max(0, -n.getY(i)) * 0.5,
          0,
          0.72,
        ),
        variation = 0.94 + 0.06 * Math.sin(x * 23 + y * 11 + z * 29 + index);
      color
        .copy(bronze)
        .lerp(edge, Math.max(0, n.getY(i)) * 0.65)
        .lerp(patina, tarnish)
        .multiplyScalar(variation);
      colors.push(color.r, color.g, color.b);
      const first = i - (i % 3),
        face = [0, 1, 2].map((j) =>
          new T.Vector3().fromBufferAttribute(p, first + j),
        ),
        normal = new T.Triangle(...face).getNormal(new T.Vector3());
      if (part === 0) {
        if (
          Math.abs(normal.y) >= Math.max(Math.abs(normal.x), Math.abs(normal.z))
        )
          coords.push(x / 0.2, z / 0.2);
        else if (Math.abs(normal.x) >= Math.abs(normal.z))
          coords.push(z / 0.2, y / 0.2);
        else coords.push(x / 0.2, y / 0.2);
      } else if (
        Math.max(...face.map((v) => v.y)) - Math.min(...face.map((v) => v.y)) <
        1e-7
      )
        coords.push(x / 0.2, z / 0.2);
      else {
        const uv = g.attributes.uv,
          us = [0, 1, 2].map((j) => uv.getX(first + j));
        let u = uv.getX(i);
        if (Math.max(...us) - Math.min(...us) > 0.5 && u < 0.5) u += 1;
        // An integral repeat count closes the normal/roughness maps at 2π.
        coords.push(u * 8, y / 0.2);
      }
    }
    g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(coords, 2));
    g.setAttribute(
      "monasteryFinial",
      new T.Float32BufferAttribute(new Float32Array(p.count).fill(part + 1), 1),
    );
  }
  const camera = new FinialCamera(base, sections),
    geometry = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  geometry.userData = { ...plan, anchor, bearingCells: cells.length };
  return { geometry, camera };
}

export function monasteryFinialMaterial() {
  const loader = materialTextureLoader(),
    normalMap = loader.load("/assets/textures/forge-metal-normal.jpg"),
    roughnessMap = loader.load("/assets/textures/forge-metal-roughness.jpg");
  for (const texture of [normalMap, roughnessMap]) {
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = 8;
  }
  return new T.MeshStandardMaterial({
    name: "Weathered cast finial bronze",
    color: 0xffffff,
    vertexColors: true,
    metalness: 0.78,
    roughness: 0.9,
    normalMap,
    roughnessMap,
    normalScale: new T.Vector2(0.16, 0.16),
  });
}
