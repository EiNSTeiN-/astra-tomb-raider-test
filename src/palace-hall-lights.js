import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { extrude, geometryFromFaces, opening } from "./fitted-facades.js";

const THEMES = [
  ["arch", 1, 0.9],
  ["rectangle", 2, 0.62],
  ["oculus", 1, 0.96],
  ["arch", 2, 0.7],
  ["point", 1, 0.8],
  ["arch", 1, 0.95],
  ["shoulder", 2, 0.62],
  ["arch", 3, 0.4],
  ["diamond", 2, 0.7],
  ["oculus", 1, 1.0],
];

function contour(kind, x, y, width, height) {
  if (kind === "point")
    return [
      [x - width / 2, y - height / 2],
      [x + width / 2, y - height / 2],
      [x + width / 2, y + height * 0.12],
      [x, y + height / 2],
      [x - width / 2, y + height * 0.12],
    ];
  if (kind === "diamond")
    return [
      [x, y - height / 2],
      [x + width / 2, y],
      [x, y + height / 2],
      [x - width / 2, y],
    ];
  if (kind === "shoulder")
    return [
      [x - width / 2, y - height / 2],
      [x + width / 2, y - height / 2],
      [x + width / 2, y + height * 0.28],
      [x + width * 0.28, y + height / 2],
      [x - width * 0.28, y + height / 2],
      [x - width / 2, y + height * 0.28],
    ];
  const points = opening(
    x,
    y,
    width,
    height,
    kind === "oculus" ? "circle" : kind,
  );
  return points;
}

// Convex contours are counterclockwise. Offset their edge lines, retaining
// shared corner coordinates for the wall cut, sleeve and dressed mouth.
export function offsetPalaceLight(points, distance) {
  return points.map((p, i) => {
    const a = points[(i + points.length - 1) % points.length],
      b = points[(i + 1) % points.length],
      u = new T.Vector2(p[0] - a[0], p[1] - a[1]).normalize(),
      v = new T.Vector2(b[0] - p[0], b[1] - p[1]).normalize(),
      first = new T.Vector2(p[0] + u.y * distance, p[1] - u.x * distance),
      next = new T.Vector2(p[0] + v.y * distance, p[1] - v.x * distance),
      denominator = u.cross(v);
    if (Math.abs(denominator) < 1e-8)
      throw Error("Palace light needs distinct convex edges");
    return first
      .addScaledVector(u, next.sub(first).cross(v) / denominator)
      .toArray();
  });
}

export function palaceHallLights(index, wall) {
  if (wall.height < 4.5) return [];
  const [kind, requested, width] = THEMES[index],
    height =
      kind === "oculus"
        ? width
        : Math.min(1.55, Math.max(0.55, wall.height - 4.55)),
    top = wall.height - (wall.height < 5 ? 0.3 : 0.55),
    y = top - height / 2,
    outer = offsetPalaceLight(contour(kind, 0, 0, width, height), 0.17),
    outerWidth =
      Math.max(...outer.map((p) => p[0])) - Math.min(...outer.map((p) => p[0])),
    edges = [
      [-wall.length / 2 + 1.42, wall.door - wall.doorWidth / 2 - 0.3],
      [wall.door + wall.doorWidth / 2 + 0.3, wall.length / 2 - 1.42],
    ],
    result = [];
  for (const [flank, [lo, hi]] of edges.entries()) {
    const span = hi - lo,
      count = Math.min(
        requested,
        Math.floor((span + 0.09) / (outerWidth + 0.09)),
      );
    if (count < 1) continue;
    const pitch =
      outerWidth +
      Math.min(0.24, (span - count * outerWidth) / Math.max(1, count - 1));
    for (let i = 0; i < count; i++) {
      const x = (lo + hi) / 2 + (i - (count - 1) / 2) * pitch,
        points = contour(kind, x, y, width, height),
        cut = offsetPalaceLight(points, 0.03);
      result.push({
        id: `${wall.id}-${flank}-${i}`,
        kind,
        x,
        y,
        width,
        height,
        points,
        cut,
        bounds: {
          x0: Math.min(...cut.map((p) => p[0])),
          x1: Math.max(...cut.map((p) => p[0])),
          y0: Math.min(...cut.map((p) => p[1])),
          y1: Math.max(...cut.map((p) => p[1])),
        },
      });
    }
  }
  return result;
}

function tidy(points) {
  points = points.filter((p, i) => {
    const q = points[(i + points.length - 1) % points.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7;
  });
  let changed = true;
  while (changed && points.length > 3) {
    changed = false;
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length],
        b = points[i],
        c = points[(i + 1) % points.length],
        area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(area) < 1e-8) {
        points.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  const area = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p[0] * q[1] - p[1] * q[0];
  }, 0);
  return points.length >= 3 && area > 1e-7 ? points : [];
}

function halfplane(points, a, b, inside) {
  const result = [],
    distance = (p) =>
      ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) *
      (inside ? 1 : -1);
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      q = points[(i + 1) % points.length],
      dp = distance(p),
      dq = distance(q);
    if (dp >= 0) result.push(p);
    if (dp >= 0 !== dq >= 0) {
      const t = dp / (dp - dq);
      result.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return tidy(result);
}

export function palaceLightIntersects(rect, light) {
  const b = light.bounds;
  return rect.x0 < b.x1 && rect.x1 > b.x0 && rect.y0 < b.y1 && rect.y1 > b.y0;
}

// Partition each dressed course around convex light profiles. Extruding each
// retained polygon seals even the tiny cells where an arch crosses a joint.
export function palaceLightWallCell(rect, lights, depth) {
  let pieces = [
    [
      [rect.x0, rect.y0],
      [rect.x1, rect.y0],
      [rect.x1, rect.y1],
      [rect.x0, rect.y1],
    ],
  ];
  for (const light of lights.filter((light) =>
    palaceLightIntersects(rect, light),
  )) {
    pieces = pieces.flatMap((polygon) => {
      let inside = polygon;
      const outside = [];
      for (let i = 0; i < light.cut.length && inside.length; i++) {
        const a = light.cut[i],
          b = light.cut[(i + 1) % light.cut.length],
          piece = halfplane(inside, a, b, false);
        if (piece.length) outside.push(piece);
        inside = halfplane(inside, a, b, true);
      }
      return outside;
    });
  }
  const parts = pieces.map((p) =>
    extrude(p, [], depth).translate(0, 0, depth / 2),
  );
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return geometry;
}

// Each ring sector is a closed solid. Its mouth flares outwards on both sides
// of the wall; the narrow blue sleeve stays seated inside the dressed stone.
function ring(points, backInner, backOuter, frontInner, frontOuter, z0, z1) {
  const a = offsetPalaceLight(points, backInner),
    b = offsetPalaceLight(points, backOuter),
    c = offsetPalaceLight(points, frontInner),
    d = offsetPalaceLight(points, frontOuter),
    faces = [];
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length,
      vertices = [a[i], a[j], b[j], b[i], c[i], c[j], d[j], d[i]].map(
        (p, k) => new T.Vector3(p[0], p[1], k < 4 ? z0 : z1),
      ),
      center = vertices
        .reduce((sum, p) => sum.add(p), new T.Vector3())
        .multiplyScalar(1 / 8);
    for (const ids of [
      [0, 1, 2, 3],
      [4, 7, 6, 5],
      [0, 4, 5, 1],
      [1, 5, 6, 2],
      [2, 6, 7, 3],
      [3, 7, 4, 0],
    ]) {
      let face = ids.map((k) => vertices[k]);
      const normal = new T.Triangle(...face.slice(0, 3)).getNormal(
          new T.Vector3(),
        ),
        middle = face
          .reduce((sum, p) => sum.add(p), new T.Vector3())
          .multiplyScalar(0.25);
      if (normal.dot(middle.sub(center)) < 0) face = face.reverse();
      faces.push(face);
    }
  }
  return geometryFromFaces(faces);
}

export function palaceLightFrame(light) {
  const points = light.points;
  return {
    reveal: ring(points, 0, 0.14, 0, 0.14, -0.5, 0.5),
    front: ring(points, 0, 0.14, 0.045, 0.17, 0.5, 0.6),
    back: ring(points, 0, 0.14, 0.045, 0.17, -0.5, -0.6),
    // A conservative bevel envelope keeps the same central aperture while
    // avoiding a separate camera record for every ring sector.
    camera: extrude(offsetPalaceLight(points, 0.17), [points], 1.2).translate(
      0,
      0,
      0.6,
    ),
  };
}
