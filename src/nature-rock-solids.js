import * as THREE from "three";
import { boxEntry } from "./camera-collision.js";

// Physics keeps the authored instance transforms, independent of the visible
// LOD's packed instance buffers. Six scan kernels are shared by hundreds of
// placements; both world instances and local triangles have spatial indexes.
export const NATURE_BODY_RADIUS = 0.55;
const CELL = 8,
  TRIANGLE_CELL = 0.3,
  EPSILON = 1e-8;

function cells(minX, minZ, maxX, maxZ, size, visit) {
  for (let z = Math.floor(minZ / size); z <= Math.floor(maxZ / size); z++)
    for (let x = Math.floor(minX / size); x <= Math.floor(maxX / size); x++)
      visit(`${x},${z}`);
}

function kernel(geometry) {
  const position = geometry.attributes.position,
    index = geometry.index;
  const triangles = [],
    grid = new Map();
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const vertices = [0, 1, 2].map((j) =>
      new THREE.Vector3().fromBufferAttribute(
        position,
        index ? index.getX(i + j) : i + j,
      ),
    );
    const bounds = new THREE.Box3().setFromPoints(vertices);
    const triangle = { vertices, bounds };
    triangles.push(triangle);
    cells(
      bounds.min.x,
      bounds.min.z,
      bounds.max.x,
      bounds.max.z,
      TRIANGLE_CELL,
      (key) => {
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(triangle);
      },
    );
  }
  geometry.computeBoundingBox();
  return { triangles, grid, bounds: geometry.boundingBox.clone() };
}

function candidates(shape, x, z, radius) {
  const result = new Set();
  cells(
    x - radius,
    z - radius,
    x + radius,
    z + radius,
    TRIANGLE_CELL,
    (key) => {
      for (const triangle of shape.grid.get(key) || []) result.add(triangle);
    },
  );
  return result;
}

function inTriangle(vertices, x, z) {
  const [a, b, c] = vertices;
  const determinant = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  if (Math.abs(determinant) < EPSILON) return null;
  const u = ((x - a.x) * (c.z - a.z) - (z - a.z) * (c.x - a.x)) / determinant;
  const v = ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) / determinant;
  return u >= -EPSILON && v >= -EPSILON && u + v <= 1 + EPSILON
    ? a.y + u * (b.y - a.y) + v * (c.y - a.y)
    : null;
}

// Exact maximum of a triangle over a horizontal disk: vertices, edge/circle
// intersections and the plane's uphill point on the circle cover all extrema.
// A point query gives the rendered triangle height used by the boot IK.
function diskHeight(vertices, x, z, radius) {
  let height = inTriangle(vertices, x, z) ?? -Infinity;
  if (!radius) return height;
  const r2 = radius * radius;
  for (let i = 0; i < 3; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % 3];
    if ((a.x - x) ** 2 + (a.z - z) ** 2 <= r2 + EPSILON)
      height = Math.max(height, a.y);
    const dx = b.x - a.x,
      dz = b.z - a.z,
      ox = a.x - x,
      oz = a.z - z;
    const aa = dx * dx + dz * dz,
      bb = 2 * (ox * dx + oz * dz),
      cc = ox * ox + oz * oz - r2;
    if (aa < EPSILON) continue;
    const discriminant = bb * bb - 4 * aa * cc;
    if (discriminant < 0) continue;
    for (const t of [
      (-bb - Math.sqrt(discriminant)) / (2 * aa),
      (-bb + Math.sqrt(discriminant)) / (2 * aa),
    ])
      if (t >= 0 && t <= 1) height = Math.max(height, a.y + (b.y - a.y) * t);
  }
  const [a, b, c] = vertices;
  const determinant = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  if (Math.abs(determinant) > EPSILON) {
    const gx =
      ((b.y - a.y) * (c.z - a.z) - (c.y - a.y) * (b.z - a.z)) / determinant;
    const gz =
      ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / determinant;
    const length = Math.hypot(gx, gz);
    if (length > EPSILON)
      height = Math.max(
        height,
        inTriangle(
          vertices,
          x + (radius * gx) / length,
          z + (radius * gz) / length,
        ) ?? -Infinity,
      );
  }
  return height;
}

function clipHeight(polygon, y, above) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const aInside = above ? a.y >= y : a.y <= y,
      bInside = above ? b.y >= y : b.y <= y;
    if (aInside) result.push(a);
    if (aInside !== bInside)
      result.push(a.clone().lerp(b, (y - a.y) / (b.y - a.y)));
  }
  return result;
}

function polygonTouchesDisk(polygon, x, z, radius) {
  if (!polygon.length) return false;
  let positive = false,
    negative = false,
    area = 0;
  const r2 = radius * radius;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x,
      dz = b.z - a.z,
      length = dx * dx + dz * dz;
    const t =
      length > EPSILON
        ? THREE.MathUtils.clamp(
            ((x - a.x) * dx + (z - a.z) * dz) / length,
            0,
            1,
          )
        : 0;
    if ((a.x + dx * t - x) ** 2 + (a.z + dz * t - z) ** 2 <= r2 + EPSILON)
      return true;
    const side = dx * (z - a.z) - dz * (x - a.x);
    positive ||= side > EPSILON;
    negative ||= side < -EPSILON;
    area += a.x * b.z - b.x * a.z;
  }
  return Math.abs(area) > EPSILON && !(positive && negative);
}

function contains(shape, x, y, z) {
  const heights = [];
  for (const triangle of candidates(shape, x, z, 0)) {
    const height = inTriangle(triangle.vertices, x, z);
    if (height !== null && height > y + 1e-6) heights.push(height);
  }
  heights.sort((a, b) => a - b);
  // Shared triangle edges and duplicate scan vertices are one crossing.
  return (
    heights.filter((height, i) => !i || height - heights[i - 1] > 1e-6).length %
      2 ===
    1
  );
}

export class NatureRockSolids {
  constructor(patches, worldMatrix = new THREE.Matrix4()) {
    this.cells = new Map();
    this.solids = [];
    const shapes = new Map();
    this.shapeCount = 0;
    for (const patch of patches) {
      if (!["rock", "gravel"].includes(patch.kind)) continue;
      const geometry = patch.tiers[0][0].geometry;
      // LOD patches have distinct geometry wrappers for their coverage buffer,
      // but share immutable position/index attributes with the source scan.
      const position = geometry.attributes.position;
      if (!shapes.has(position)) shapes.set(position, new Map());
      const variants = shapes.get(position);
      if (!variants.has(geometry.index)) {
        variants.set(geometry.index, kernel(geometry));
        this.shapeCount++;
      }
      const shape = variants.get(geometry.index);
      for (const authored of patch.matrices) {
        const matrix = worldMatrix.clone().multiply(authored),
          inverse = matrix.clone().invert();
        const bounds = shape.bounds.clone().applyMatrix4(matrix),
          e = matrix.elements;
        const solid = {
          natureRock: true,
          shape,
          matrix,
          inverse,
          bounds,
          horizontalScale: Math.hypot(e[0], e[2]),
          verticalScale: e[5],
        };
        this.solids.push(solid);
        cells(
          bounds.min.x,
          bounds.min.z,
          bounds.max.x,
          bounds.max.z,
          CELL,
          (key) => {
            if (!this.cells.has(key)) this.cells.set(key, []);
            this.cells.get(key).push(solid);
          },
        );
      }
    }
  }

  nearby(minX, minZ, maxX = minX, maxZ = minZ) {
    const result = new Set();
    cells(minX, minZ, maxX, maxZ, CELL, (key) => {
      for (const solid of this.cells.get(key) || []) result.add(solid);
    });
    return result;
  }

  support(x, z, maxY = Infinity, radius = 0) {
    let result = null;
    for (const solid of this.nearby(
      x - radius,
      z - radius,
      x + radius,
      z + radius,
    )) {
      if (
        x + radius < solid.bounds.min.x ||
        x - radius > solid.bounds.max.x ||
        z + radius < solid.bounds.min.z ||
        z - radius > solid.bounds.max.z
      )
        continue;
      const p = new THREE.Vector3(x, 0, z).applyMatrix4(solid.inverse),
        localRadius = radius / solid.horizontalScale;
      let top = -Infinity;
      for (const triangle of candidates(solid.shape, p.x, p.z, localRadius))
        top = Math.max(
          top,
          diskHeight(triangle.vertices, p.x, p.z, localRadius),
        );
      const height = top * solid.verticalScale + solid.matrix.elements[13];
      if (
        Number.isFinite(height) &&
        height <= maxY + 0.2 + 1e-6 &&
        height > (result?.height ?? -Infinity)
      )
        result = { height, surface: solid };
    }
    return result;
  }

  blocked(x, y, z, clearance = 1.8, radius = NATURE_BODY_RADIUS) {
    for (const solid of this.nearby(
      x - radius,
      z - radius,
      x + radius,
      z + radius,
    )) {
      if (
        x + radius < solid.bounds.min.x ||
        x - radius > solid.bounds.max.x ||
        z + radius < solid.bounds.min.z ||
        z - radius > solid.bounds.max.z ||
        y >= solid.bounds.max.y - 0.015 ||
        y + clearance < solid.bounds.min.y + 0.015
      )
        continue;
      const p = new THREE.Vector3(x, y, z).applyMatrix4(solid.inverse);
      if (!clearance) {
        if (contains(solid.shape, p.x, p.y, p.z)) return true;
        continue;
      }
      const bottom = p.y + 0.015 / solid.verticalScale,
        top = p.y + (clearance - 0.015) / solid.verticalScale;
      const localRadius = radius / solid.horizontalScale;
      for (const triangle of candidates(solid.shape, p.x, p.z, localRadius)) {
        if (triangle.bounds.max.y < bottom || triangle.bounds.min.y > top)
          continue;
        const polygon = clipHeight(
          clipHeight(triangle.vertices, bottom, true),
          top,
          false,
        );
        if (polygonTouchesDisk(polygon, p.x, p.z, localRadius)) return true;
      }
      if (contains(solid.shape, p.x, (bottom + top) / 2, p.z)) return true;
    }
    return false;
  }

  // Sight and sound use the actual triangle surface without the body margin.
  entry(from, to) {
    const start = new THREE.Vector3(),
      end = new THREE.Vector3(),
      hit = new THREE.Vector3();
    const ray = new THREE.Ray();
    let result = null;
    for (const solid of this.nearby(
      Math.min(from.x, to.x),
      Math.min(from.z, to.z),
      Math.max(from.x, to.x),
      Math.max(from.z, to.z),
    )) {
      if (boxEntry(from, to, solid.bounds, 0, true) === null) continue;
      start.copy(from).applyMatrix4(solid.inverse);
      end.copy(to).applyMatrix4(solid.inverse);
      if (contains(solid.shape, start.x, start.y, start.z)) return 0;
      const length = start.distanceTo(end);
      if (length < EPSILON) continue;
      ray.set(start, end.sub(start).normalize());
      for (const triangle of solid.shape.triangles) {
        if (!ray.intersectTriangle(...triangle.vertices, false, hit)) continue;
        const t = hit.distanceTo(start) / length;
        if (t <= 1 && (result === null || t < result)) result = t;
      }
    }
    return result;
  }
}
