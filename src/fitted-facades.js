import * as T from "three";
import { RoofCamera } from "./roof-camera.js";
import { boxEntry } from "./camera-collision.js";

// Read delivered triangles, rather than an analytic height or a bounding box.
// Both roofs are still unbatched when their shared wall joints are authored.
export function roofFaceHeight(
  mesh,
  upward = true,
  { allowMissing = false } = {},
) {
  mesh.updateMatrix();
  const p = mesh.geometry.attributes.position,
    index = mesh.geometry.index,
    grid = new Map();
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const v = [0, 1, 2].map((j) =>
      new T.Vector3()
        .fromBufferAttribute(p, index ? index.getX(i + j) : i + j)
        .applyMatrix4(mesh.matrix),
    );
    const n = new T.Triangle(...v).getNormal(new T.Vector3());
    if ((upward ? n.y : -n.y) < 1e-6) continue;
    const b = new T.Box3().setFromPoints(v);
    for (let z = Math.floor(b.min.z); z <= Math.floor(b.max.z); z++)
      for (let x = Math.floor(b.min.x); x <= Math.floor(b.max.x); x++) {
        const key = `${x},${z}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(v);
      }
  }
  return (x, z) => {
    let result = upward ? -Infinity : Infinity;
    for (const [a, b, c] of grid.get(`${Math.floor(x)},${Math.floor(z)}`) ||
      []) {
      const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z),
        u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d,
        v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
      if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
      const y = u * a.y + v * b.y + (1 - u - v) * c.y;
      result = upward ? Math.max(result, y) : Math.min(result, y);
    }
    if (!Number.isFinite(result)) {
      if (allowMissing) return null;
      throw Error(`Roof joint outside delivered shell: ${x},${z}`);
    }
    return result;
  };
}

// Reorient a closed XY extrusion into a height field. Its triangle cells keep
// the real arch/circle openings clear, including the camera's spherical margin.
export class FacadeCamera {
  constructor(geometry) {
    const turned = geometry.clone(),
      p = turned.attributes.position;
    for (let i = 0; i < p.count; i++)
      p.setXYZ(i, p.getX(i), p.getZ(i), -p.getY(i));
    this.surface = new RoofCamera(turned);
    turned.dispose();
  }
  entry(a, b, radius = 0) {
    return this.surface.entry(
      new T.Vector3(a.x, a.z, -a.y),
      new T.Vector3(b.x, b.z, -b.y),
      radius,
    );
  }
}

// One indexed camera assembly per court; each member retains its finite shape.
export class PavilionCamera {
  constructor(parts) {
    this.parts = parts;
  }
  entry(from, to, radius = 0) {
    let result = null;
    for (const { inverse, box, kernel } of this.parts) {
      const a = from.clone().applyMatrix4(inverse),
        b = to.clone().applyMatrix4(inverse);
      if (boxEntry(a, b, box, radius, true) === null) continue;
      const t = kernel
        ? kernel.entry(a, b, radius)
        : boxEntry(a, b, box, radius);
      if (t !== null) result = Math.min(result ?? 1, t);
    }
    return result;
  }
}

export function geometryFromFaces(faces) {
  const positions = [],
    uv = [];
  for (const face of faces) {
    const n = new T.Triangle(...face.slice(0, 3)).getNormal(new T.Vector3());
    for (let i = 1; i < face.length - 1; i++)
      for (const p of [face[0], face[i], face[i + 1]]) {
        positions.push(p.x, p.y, p.z);
        const ax = Math.abs(n.x),
          ay = Math.abs(n.y),
          az = Math.abs(n.z);
        if (ay >= ax && ay >= az) uv.push(p.x / 2, p.z / 2);
        else if (ax >= az) uv.push(p.z / 2, p.y / 2);
        else uv.push(p.x / 2, p.y / 2);
      }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function opening(cx, cy, w, h, kind = "rectangle") {
  if (kind === "circle")
    return Array.from({ length: 32 }, (_, i) => {
      const a = (i * Math.PI) / 16;
      return [cx + (Math.cos(a) * w) / 2, cy + (Math.sin(a) * h) / 2];
    });
  if (kind === "arch") {
    const result = [
      [cx - w / 2, cy - h / 2],
      [cx + w / 2, cy - h / 2],
      [cx + w / 2, cy + h / 2 - w / 2],
    ];
    for (let i = 1; i <= 16; i++) {
      const a = (i * Math.PI) / 16;
      result.push([
        cx + (Math.cos(a) * w) / 2,
        cy + h / 2 - w / 2 + (Math.sin(a) * w) / 2,
      ]);
    }
    return result;
  }
  return [
    [cx - w / 2, cy - h / 2],
    [cx + w / 2, cy - h / 2],
    [cx + w / 2, cy + h / 2],
    [cx - w / 2, cy + h / 2],
  ];
}
function shape(points, holes = []) {
  // The height readers return single-precision roof samples. Remove redundant
  // points along straight edges before Earcut sees their rounding slivers.
  points = [...points];
  let changed = true;
  while (changed && points.length > 3) {
    changed = false;
    for (let i = 0; i < points.length; i++) {
      const a = new T.Vector2(
          ...points[(i + points.length - 1) % points.length],
        ),
        b = new T.Vector2(...points[i]),
        c = new T.Vector2(...points[(i + 1) % points.length]),
        ac = c.clone().sub(a),
        ab = b.clone().sub(a);
      if (Math.abs(ac.cross(ab)) / ac.length() < 1e-5) {
        points.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  const s = new T.Shape(points.map((p) => new T.Vector2(...p)));
  for (const h of holes)
    s.holes.push(new T.Path(h.map((p) => new T.Vector2(...p))));
  return s;
}
export function extrude(points, holes, depth) {
  const { shape: outer, holes: rings } = shape(points, holes).extractPoints(),
    cells = T.ShapeUtils.triangulateShape(outer, rings),
    vertices = [...outer, ...rings.flat()],
    faces = [];
  // Earcut can bridge aligned holes with a long collinear edge. Seal each
  // delivered triangle as a prism, as with the monastery's carved doors.
  // This also gives the camera and body reader the same closed cells.
  for (const cell of cells) {
    let p = cell.map((i) => vertices[i]);
    const area = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0]));
    if (Math.abs(area) < 1e-8) continue;
    if (area < 0) p = p.reverse();
    const front = p.map((v) => new T.Vector3(v.x, v.y, 0)),
      back = p.map((v) => new T.Vector3(v.x, v.y, -depth));
    faces.push(front, [...back].reverse());
    for (let i = 0; i < 3; i++)
      faces.push([front[i], back[i], back[(i + 1) % 3], front[(i + 1) % 3]]);
  }
  return geometryFromFaces(faces);
}

// Long side grain follows Y; caps and bevels use the dominant face plane so
// a diagonal corner never collapses both texture axes onto the same line.
export function projectTimberUVs(geometry) {
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i)),
      az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) / 2, p.getZ(i) / 2);
    else uv.setXY(i, p.getY(i) / 2, (ax >= az ? p.getZ(i) : p.getX(i)) / 2);
  }
  return geometry;
}
