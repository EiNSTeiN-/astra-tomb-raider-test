import * as THREE from "three";
import { boxEntry } from "./camera-collision.js";

// Finite, closed triangle surfaces use an XZ index for body and point queries.
// Transforms must stay upright, with uniform horizontal scale. CPU kernels
// copy positions, so batching can release the original render geometries.
const DEFAULT_BODY_RADIUS = 0.55;
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
    const bounds = new THREE.Box3().setFromPoints(vertices),
      normal = new THREE.Vector3().crossVectors(
        vertices[1].clone().sub(vertices[0]),
        vertices[2].clone().sub(vertices[0]),
      );
    const triangle = {
      vertices,
      bounds,
      normalY: normal.y,
      normalXZ: Math.hypot(normal.x, normal.z),
    };
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

// Walk only the cells crossed by a ray. A scanned trunk can have thousands of
// triangles; testing every one for each camera-body ray scales poorly. The
// triangle index already includes every cell touched by its bounding box.
function segmentCandidates(shape, start, end) {
  const result = new Set(),
    dx = end.x - start.x,
    dz = end.z - start.z,
    sx = Math.sign(dx),
    sz = Math.sign(dz),
    endX = Math.floor(end.x / TRIANGLE_CELL),
    endZ = Math.floor(end.z / TRIANGLE_CELL),
    visit = (x, z) => {
      for (const triangle of shape.grid.get(`${x},${z}`) || [])
        result.add(triangle);
    };
  let x = Math.floor(start.x / TRIANGLE_CELL),
    z = Math.floor(start.z / TRIANGLE_CELL),
    tx = sx
      ? ((x + (sx > 0 ? 1 : 0)) * TRIANGLE_CELL - start.x) / dx
      : Infinity,
    tz = sz
      ? ((z + (sz > 0 ? 1 : 0)) * TRIANGLE_CELL - start.z) / dz
      : Infinity;
  const stepX = sx ? TRIANGLE_CELL / Math.abs(dx) : Infinity,
    stepZ = sz ? TRIANGLE_CELL / Math.abs(dz) : Infinity,
    count = Math.abs(endX - x) + Math.abs(endZ - z) + 3;
  for (let i = 0; i < count; i++) {
    visit(x, z);
    if (x === endX && z === endZ) break;
    if (Math.abs(tx - tz) < 1e-12) {
      visit(x + sx, z);
      visit(x, z + sz);
      x += sx;
      z += sz;
      tx += stepX;
      tz += stepZ;
    } else if (tx < tz) {
      x += sx;
      tx += stepX;
    } else {
      z += sz;
      tz += stepZ;
    }
  }
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

export class TriangleSolids {
  constructor(placements, { layeredSupport = false } = {}) {
    this.layeredSupport = layeredSupport;
    this.cells = new Map();
    this.solids = [];
    const shapes = new Map();
    this.shapeCount = 0;
    for (const { geometry, matrices } of placements) {
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
      for (const authored of matrices) {
        const matrix = authored.clone(),
          inverse = matrix.clone().invert();
        const bounds = shape.bounds.clone().applyMatrix4(matrix),
          e = matrix.elements;
        const solid = {
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

  support(x, z, maxY = Infinity, radius = 0, minUp = 0) {
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
        z - radius > solid.bounds.max.z ||
        solid.bounds.min.y > maxY + 0.2 + 1e-6
      )
        continue;
      const p = new THREE.Vector3(x, 0, z).applyMatrix4(solid.inverse),
        localRadius = radius / solid.horizontalScale;
      let top = -Infinity;
      for (const triangle of candidates(solid.shape, p.x, p.z, localRadius)) {
        // Optional walkable-face selection for body support. Raw point/ray
        // queries retain every surface. Inverse scale transforms the normal;
        // upright rotation does not change its world-space vertical component.
        if (minUp) {
          const y = triangle.normalY * solid.horizontalScale,
            xz = triangle.normalXZ * solid.verticalScale;
          if (!(y / Math.hypot(y, xz) >= minUp)) continue;
        }
        const height = diskHeight(triangle.vertices, p.x, p.z, localRadius);
        // A layered construction can have a standing base below an overhead
        // roof at the same footprint. Select eligible faces before taking the
        // maximum, rather than rejecting the entire shape for its higher roof.
        if (
          this.layeredSupport &&
          height * solid.verticalScale + solid.matrix.elements[13] >
            maxY + 0.2 + 1e-6
        )
          continue;
        top = Math.max(top, height);
      }
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

  blocked(x, y, z, clearance = 1.8, radius = DEFAULT_BODY_RADIUS) {
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

  // A descending cylinder can meet the side of a scan after its horizontal
  // move was clear. Project it away from a clipped blocking face; the caller
  // checks the complete world and repeats for neighboring faces if needed.
  separation(x, y, z, clearance = 1.8, radius = DEFAULT_BODY_RADIUS) {
    let best = null;
    for (const solid of this.nearby(
      x - radius,
      z - radius,
      x + radius,
      z + radius,
    )) {
      if (
        y >= solid.bounds.max.y - 0.015 ||
        y + clearance < solid.bounds.min.y + 0.015
      )
        continue;
      const p = new THREE.Vector3(x, y, z).applyMatrix4(solid.inverse),
        bottom = p.y + 0.015 / solid.verticalScale,
        top = p.y + (clearance - 0.015) / solid.verticalScale,
        r = radius / solid.horizontalScale;
      for (const triangle of candidates(solid.shape, p.x, p.z, r)) {
        if (triangle.bounds.max.y < bottom || triangle.bounds.min.y > top)
          continue;
        const polygon = clipHeight(
          clipHeight(triangle.vertices, bottom, true),
          top,
          false,
        );
        if (!polygonTouchesDisk(polygon, p.x, p.z, r)) continue;
        let distance2 = Infinity,
          nearestX = 0,
          nearestZ = 0;
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i],
            b = polygon[(i + 1) % polygon.length],
            dx = b.x - a.x,
            dz = b.z - a.z,
            length = dx * dx + dz * dz,
            t =
              length > EPSILON
                ? THREE.MathUtils.clamp(
                    ((p.x - a.x) * dx + (p.z - a.z) * dz) / length,
                    0,
                    1,
                  )
                : 0,
            px = a.x + dx * t,
            pz = a.z + dz * t,
            d2 = (p.x - px) ** 2 + (p.z - pz) ** 2;
          if (d2 < distance2) {
            distance2 = d2;
            nearestX = px;
            nearestZ = pz;
          }
        }
        const inside = polygonTouchesDisk(polygon, p.x, p.z, 0),
          distance = Math.sqrt(distance2);
        let dx = inside ? nearestX - p.x : p.x - nearestX,
          dz = inside ? nearestZ - p.z : p.z - nearestZ;
        if (distance < 1e-8) {
          const normal = triangle.vertices[1]
            .clone()
            .sub(triangle.vertices[0])
            .cross(triangle.vertices[2].clone().sub(triangle.vertices[0]));
          dx = normal.x;
          dz = normal.z;
        }
        if (Math.hypot(dx, dz) < 1e-8) continue;
        const push = new THREE.Vector3(dx, 0, dz)
          .normalize()
          .transformDirection(solid.matrix)
          .multiplyScalar(
            (inside ? r + distance : r - distance) * solid.horizontalScale +
              0.0005,
          );
        if (!best || push.lengthSq() > best.lengthSq()) best = push;
      }
    }
    return best;
  }

  // Bounded visual contact correction for a deformed boot/bevel. Find the
  // nearest actual surface in world space, including unequal vertical scale.
  pointExit(x, y, z, limit = 0.03) {
    const point = new THREE.Vector3(x, y, z),
      nearest = new THREE.Vector3(),
      triangle = new THREE.Triangle();
    let result = null,
      best = limit;
    for (const solid of this.nearby(
      x - limit,
      z - limit,
      x + limit,
      z + limit,
    )) {
      if (y < solid.bounds.min.y || y > solid.bounds.max.y) continue;
      const local = point.clone().applyMatrix4(solid.inverse);
      if (!contains(solid.shape, local.x, local.y, local.z)) continue;
      for (const face of candidates(
        solid.shape,
        local.x,
        local.z,
        limit / solid.horizontalScale,
      )) {
        if (
          local.y < face.bounds.min.y - limit / solid.verticalScale ||
          local.y > face.bounds.max.y + limit / solid.verticalScale
        )
          continue;
        triangle.set(
          ...face.vertices.map((v) => v.clone().applyMatrix4(solid.matrix)),
        );
        triangle.closestPointToPoint(point, nearest);
        const distance = nearest.distanceTo(point);
        if (distance > 1e-8 && distance < best) {
          best = distance;
          result = nearest
            .clone()
            .sub(point)
            .multiplyScalar((distance + 0.001) / distance);
        }
      }
    }
    return result;
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
      const triangles = segmentCandidates(solid.shape, start, end),
        low = Math.min(start.y, end.y),
        high = Math.max(start.y, end.y);
      ray.set(start, end.sub(start).normalize());
      for (const triangle of triangles) {
        if (triangle.bounds.min.y > high || triangle.bounds.max.y < low)
          continue;
        if (!ray.intersectTriangle(...triangle.vertices, false, hit)) continue;
        const t = hit.distanceTo(start) / length;
        if (t <= 1 && (result === null || t < result)) result = t;
      }
    }
    return result;
  }
}
