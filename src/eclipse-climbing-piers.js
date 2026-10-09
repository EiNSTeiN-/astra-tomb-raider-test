import * as THREE from "three";
import { pierCornerGeometry } from "./climbing-pier-geometry.js";

function slab(points, depth) {
  const shape = Array.isArray(points)
    ? new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)))
    : points;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -depth);
  const position = geometry.attributes.position,
    uv = geometry.attributes.uv,
    normal = geometry.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i);
    if (Math.abs(normal.getZ(i)) > 0.7) uv.setXY(i, x / 2, y / 2);
    else if (Math.abs(normal.getX(i)) > 0.7) uv.setXY(i, z / 2, y / 2);
    else uv.setXY(i, x / 2, z / 2);
  }
  return geometry;
}

function circle(radius, segments = 32) {
  return Array.from({ length: segments }, (_, i) => {
    const a = (i * Math.PI * 2) / segments;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  });
}

// Flat closed metal annuli retain real rims and backs. All relief backs are
// buried in the stone register, including graduations and the central star.
export function astrolabeRingGeometry(inner, outer, depth) {
  const segments = 48,
    positions = [],
    normals = [],
    uv = [],
    indices = [];
  const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d);
  for (let surface = 0; surface < 4; surface++) {
    const start = positions.length / 3;
    for (let i = 0; i < segments; i++) {
      const angle = (i * Math.PI * 2) / segments,
        x = Math.cos(angle),
        y = Math.sin(angle);
      for (let edge = 0; edge < 2; edge++) {
        const r =
          surface < 2 ? (edge ? outer : inner) : surface === 2 ? outer : inner;
        const z = surface < 2 ? (surface ? -depth : 0) : edge ? -depth : 0;
        positions.push(x * r, y * r, z);
        normals.push(
          ...(surface < 2
            ? [0, 0, surface ? -1 : 1]
            : [x * (surface === 2 ? 1 : -1), y * (surface === 2 ? 1 : -1), 0]),
        );
        uv.push(x * r, y * r);
      }
    }
    for (let i = 0; i < segments; i++) {
      const a = start + i * 2,
        b = a + 1,
        c = start + ((i + 1) % segments) * 2,
        d = c + 1;
      if (surface === 0 || surface === 2) quad(a, b, d, c);
      else quad(a, c, d, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return geometry;
}

export function buildEclipseClimbingPier({
  ledge,
  width,
  depth,
  ground,
  wallHeight,
  seed,
  style,
  materials,
  fixed,
  detail,
  mesh,
  facingGeometry,
}) {
  const radius = Math.min(
      ledge.index === 4 ? 1.06 : 0.94,
      (wallHeight - 0.99) / 2,
    ),
    center = wallHeight - radius - 0.49,
    square = radius + 0.36,
    low = center - square,
    high = center + square,
    segments = 32,
    inner = circle(radius),
    surround = circle(radius + 0.24),
    panels = [];
  mesh(
    new THREE.BoxGeometry(width - 0.02, 0.19, depth - 0.02),
    materials.stone,
    ledge.x,
    ground + 0.065,
    ledge.z,
    fixed,
    0.76,
  );
  mesh(
    new THREE.BoxGeometry(width - 0.84, wallHeight + 0.02, depth - 0.84),
    materials.stone,
    ledge.x,
    ground + wallHeight / 2,
    ledge.z,
    fixed,
    0.76,
  );
  const rows = Math.ceil(wallHeight / style.row),
    rise = wallHeight / rows;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = ledge.x + sx * (width / 2 - 0.165),
        z = ledge.z + sz * (depth / 2 - 0.165);
      mesh(
        new THREE.BoxGeometry(0.3, wallHeight + 0.02, 0.3),
        materials.stone,
        x,
        ground + wallHeight / 2,
        z,
        fixed,
        0.86,
      );
      for (let row = 0; row < rows; row++)
        mesh(
          pierCornerGeometry(rise - 0.012, seed++, sx, sz),
          materials.stone,
          x,
          ground + (row + 0.5) * rise,
          z,
          fixed,
          0.96 + (row % 3) * 0.025,
        );
    }
  for (let face = 0; face < 4; face++) {
    const angle = (face * Math.PI) / 2,
      half = (face % 2 ? width : depth) / 2,
      along = (face % 2 ? depth : width) / 2 - 0.3,
      add = (
        geometry,
        x,
        y,
        z,
        material = materials.stone,
        tint = 1,
        parent = fixed,
      ) => {
        const object = mesh(
          geometry,
          material,
          ledge.x + Math.cos(angle) * x + Math.sin(angle) * z,
          ground + y,
          ledge.z - Math.sin(angle) * x + Math.cos(angle) * z,
          parent,
          tint,
        );
        object.rotation.y = angle;
        return object;
      },
      wall = (left, right, bottom, top) => {
        const w = right - left,
          h = top - bottom;
        if (w < 0.001 || h < 0.001) return;
        const columns = Math.ceil(w / style.block),
          courses = Math.ceil(h / style.row),
          step = w / columns,
          rowHeight = h / courses;
        add(
          new THREE.BoxGeometry(w + 0.01, h + 0.02, 0.38),
          (left + right) / 2,
          (bottom + top) / 2,
          half - 0.245,
          materials.stone,
          0.77,
        );
        for (let row = 0; row < courses; row++) {
          const ends =
            row % 2
              ? [
                  left,
                  ...Array.from(
                    { length: columns },
                    (_, i) => left + (i + 0.5) * step,
                  ),
                  right,
                ]
              : Array.from({ length: columns + 1 }, (_, i) => left + i * step);
          for (let i = 1; i < ends.length; i++)
            add(
              facingGeometry(
                ends[i] - ends[i - 1] - 0.014,
                rowHeight - 0.014,
                0.27,
                seed++,
              ),
              (ends[i] + ends[i - 1]) / 2,
              bottom + (row + 0.5) * rowHeight,
              half - 0.16,
              materials.stone,
              0.98 + ((row * 7 + i * 3 + face) % 5) * 0.02,
            );
        }
      };
    wall(-along, along, 0, low);
    wall(-along, along, high, wallHeight);
    wall(-along, -square, low, high);
    wall(square, along, low, high);
    // Radial shoulder stones reach a square boundary with explicit corner
    // samples. Their continuous bearings close every dressed radial joint.
    const outer = circle(square).map(([x, y]) => {
      const scale = square / Math.max(Math.abs(x), Math.abs(y));
      return [x * scale, y * scale];
    });
    const bearing = new THREE.Shape([
      new THREE.Vector2(-square, -square),
      new THREE.Vector2(square, -square),
      new THREE.Vector2(square, square),
      new THREE.Vector2(-square, square),
    ]);
    bearing.holes.push(
      new THREE.Path(inner.map(([x, y]) => new THREE.Vector2(x, y)).reverse()),
    );
    add(slab(bearing, 0.38), 0, center, half - 0.055, materials.stone, 0.78);
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      for (const [points, tint] of [
        [[inner[i], surround[i], surround[next], inner[next]], 1.12],
        [[surround[i], outer[i], outer[next], surround[next]], 0.97],
      ]) {
        const offset = points.map(([x, y]) => [x, y + center]),
          midpoint = offset.reduce(
            (sum, p) => [sum[0] + p[0] / 4, sum[1] + p[1] / 4],
            [0, 0],
          ),
          dressed = offset.map(([x, y]) => {
            const length = Math.hypot(x - midpoint[0], y - midpoint[1]),
              fraction = Math.min(0.025, 0.005 / length);
            return [
              x + (midpoint[0] - x) * fraction,
              y + (midpoint[1] - y) * fraction,
            ];
          });
        add(
          slab(dressed, 0.095),
          0,
          0,
          half - 0.025,
          materials.stone,
          tint + (i % 4) * 0.012,
        );
      }
    }
    const plane = half - 0.37;
    add(slab(inner, 0.16), 0, center, plane, materials.orreryBack, 0.8);
    const dial = radius * 0.8;
    for (const [r, scaleY, rotation] of [
      [dial, 1, 0],
      [dial * 0.68, 1, 0],
      [dial * 0.9, 0.48, ((face % 2 ? -1 : 1) * Math.PI) / 5],
    ]) {
      const geometry = astrolabeRingGeometry(r - 0.025, r + 0.025, 0.055);
      geometry.scale(1, scaleY, 1);
      geometry.rotateZ(rotation);
      add(geometry, 0, center, plane + 0.032, materials.astral, 1, detail);
    }
    for (let tick = 0; tick < 32; tick++) {
      const a = (tick * Math.PI) / 16,
        length = tick % 4 ? 0.045 : 0.095,
        geometry = new THREE.BoxGeometry(0.025, length, 0.046);
      geometry.rotateZ(a - Math.PI / 2);
      add(
        geometry,
        Math.cos(a) * dial,
        center + Math.sin(a) * dial,
        plane + 0.008,
        materials.astral,
        1.08,
        detail,
      );
    }
    const star = Array.from({ length: 16 }, (_, i) => {
      const a = (i * Math.PI) / 8 + ((face + ledge.index) * Math.PI) / 16,
        r = dial * (i % 2 ? 0.095 : i % 4 ? 0.22 : 0.3);
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
    add(
      slab(star, 0.06),
      0,
      center,
      plane + 0.044,
      materials.astral,
      1.12,
      detail,
    );
    for (const a of [-Math.PI / 3, Math.PI / 4, Math.PI * 0.87])
      add(
        new THREE.CylinderGeometry(
          dial * 0.057,
          dial * 0.057,
          0.045,
          12,
        ).rotateX(Math.PI / 2),
        Math.cos(a) * dial * 0.58,
        center + Math.sin(a) * dial * 0.58,
        plane + 0.008,
        materials.astral,
        1.03,
        detail,
      );
    panels.push({
      face,
      radius,
      center: ground + center,
      bottom: ground + center - radius,
      top: ground + center + radius,
      plane,
      segments,
    });
  }
  return { panels };
}
