import * as THREE from "three";
import { pierCornerGeometry } from "./climbing-pier-geometry.js";

function slab(points, depth) {
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points), {
    depth,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -depth);
  const position = geometry.attributes.position,
    uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, position.getX(i) / 2, position.getY(i) / 2);
  return geometry;
}

function painted(geometry, tint = 1) {
  const colors = [];
  for (let i = 0; i < geometry.attributes.position.count; i++)
    colors.push(1.07 * tint, 0.61 * tint, 0.5 * tint);
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

// Batching expands every triangle. Index only exact duplicates, including all
// material attributes, so hard normals, UV seams and paint edges stay intact.
export function indexSnowPierGeometry(group) {
  let before = 0,
    after = 0;
  for (const object of group.children) {
    const geometry = object.geometry;
    if (!geometry || geometry.index) continue;
    const attributes = Object.entries(geometry.attributes),
      values = attributes.map(() => []),
      vertices = new Map(),
      indices = [];
    before += geometry.attributes.position.count;
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      const components = attributes.flatMap(([, attribute]) =>
          Array.from(
            { length: attribute.itemSize },
            (_, k) => attribute.array[i * attribute.itemSize + k],
          ),
        ),
        key = components
          .map((component) => (Object.is(component, -0) ? "-0" : component))
          .join(",");
      let index = vertices.get(key);
      if (index === undefined) {
        index = vertices.size;
        vertices.set(key, index);
        for (let a = 0; a < attributes.length; a++) {
          const attribute = attributes[a][1];
          for (let k = 0; k < attribute.itemSize; k++)
            values[a].push(attribute.array[i * attribute.itemSize + k]);
        }
      }
      indices.push(index);
    }
    for (let a = 0; a < attributes.length; a++) {
      const [name, attribute] = attributes[a];
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(
          new attribute.array.constructor(values[a]),
          attribute.itemSize,
          attribute.normalized,
        ),
      );
    }
    geometry.setIndex(indices);
    after += geometry.attributes.position.count;
  }
  return { before, after };
}

// Blind arched monastery bays have complete whitewash backs. Painted timber,
// seated bronze and sill snow remain within the existing solid pier envelope.
export function buildSnowClimbingPier({
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
  const radius = ledge.index === 4 ? 0.88 : 0.72,
    panelHeight = Math.min(2.8, wallHeight - 0.6),
    bottom = wallHeight - panelHeight - 0.25,
    top = bottom + panelHeight,
    spring = top - radius,
    outer = radius + 0.12,
    arc = (r, from = 0, to = Math.PI, segments = 20) =>
      Array.from({ length: segments + 1 }, (_, i) => {
        const a = from + ((to - from) * i) / segments;
        return new THREE.Vector2(r * Math.cos(a), spring + r * Math.sin(a));
      }),
    panels = [];
  mesh(
    new THREE.BoxGeometry(width - 0.02, 0.19, depth - 0.02),
    materials.stone,
    ledge.x,
    ground + 0.065,
    ledge.z,
    fixed,
    0.75,
  );
  mesh(
    new THREE.BoxGeometry(width - 0.64, wallHeight + 0.02, depth - 0.64),
    materials.stone,
    ledge.x,
    ground + wallHeight / 2,
    ledge.z,
    fixed,
    0.75,
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
        0.88,
      );
      for (let row = 0; row < rows; row++)
        mesh(
          pierCornerGeometry(rise - 0.012, seed++, sx, sz),
          materials.stone,
          x,
          ground + (row + 0.5) * rise,
          z,
          fixed,
          0.94 + (row % 4) * 0.02,
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
      wall = (left, right, low, high) => {
        const w = right - left,
          h = high - low,
          columns = Math.ceil(w / style.block),
          courses = Math.ceil(h / style.row),
          step = w / columns,
          rowHeight = h / courses;
        add(
          new THREE.BoxGeometry(w + 0.01, h + 0.02, 0.27),
          (left + right) / 2,
          (low + high) / 2,
          half - 0.21,
          materials.stone,
          0.76,
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
              low + (row + 0.5) * rowHeight,
              half - 0.19,
              materials.stone,
              0.92 + ((row * 7 + i * 3 + face) % 5) * 0.02,
            );
        }
      },
      wood = (geometry, x, y, z) =>
        add(painted(geometry), x, y, z, materials.timber),
      bronzeBar = (a, b, w = 0.055) => {
        const delta = new THREE.Vector2(b[0] - a[0], b[1] - a[1]),
          object = add(
            new THREE.BoxGeometry(w, delta.length() + 0.035, 0.09),
            (a[0] + b[0]) / 2,
            (a[1] + b[1]) / 2,
            half - 0.255,
            materials.metal,
            0.82,
            detail,
          );
        object.rotateZ(-Math.atan2(delta.x, delta.y));
      };
    wall(-along, -outer, 0, wallHeight);
    wall(outer, along, 0, wallHeight);
    wall(-outer, outer, 0, bottom);
    wall(-outer, outer, top + 0.12, wallHeight);
    for (const side of [-1, 1]) {
      const points = [
        new THREE.Vector2(0, top + 0.12),
        new THREE.Vector2(side * outer, top + 0.12),
        new THREE.Vector2(side * outer, spring),
        ...arc(outer, side > 0 ? 0 : Math.PI, Math.PI / 2, 10),
      ];
      add(slab(points, 0.27), 0, 0, half - 0.075, materials.stone, 0.93);
      wood(
        new THREE.BoxGeometry(0.12, spring - bottom + 0.02, 0.22),
        side * (radius + 0.06),
        (bottom + spring) / 2,
        half - 0.165,
      );
      wood(
        new THREE.BoxGeometry(0.2, 0.14, 0.25),
        side * (radius + 0.06),
        spring - 0.01,
        half - 0.165,
      );
    }
    const panel = [
        new THREE.Vector2(-radius, bottom),
        new THREE.Vector2(radius, bottom),
        ...arc(radius),
      ],
      ring = [...arc(outer), ...arc(radius, Math.PI, 0)],
      plane = half - 0.28;
    add(slab(panel, 0.14), 0, 0, plane, materials.plaster, 0.88);
    wood(slab(ring, 0.24), 0, 0, half - 0.055);
    wood(
      new THREE.BoxGeometry(outer * 2 + 0.16, 0.17, 0.29),
      0,
      bottom + 0.02,
      half - 0.2,
    );
    // The shallow drift's bottom overlaps the sill; its outer lip stays within
    // the pier, well below the standing roof and the explorer's mantle path.
    add(
      new THREE.BoxGeometry(outer * 2 + 0.13, 0.035, 0.27),
      0,
      bottom + 0.118,
      half - 0.2,
      materials.snow,
      0.95,
      detail,
    );
    const center = bottom + panelHeight * 0.65,
      wheelRadius = radius * 0.56;
    add(
      new THREE.TorusGeometry(wheelRadius, 0.035, 6, 36),
      0,
      center,
      half - 0.255,
      materials.metal,
      0.9,
      detail,
    );
    for (let spoke = 0; spoke < 8; spoke++) {
      const a =
        (spoke * Math.PI) / 4 + (((ledge.index + face) % 2) * Math.PI) / 8;
      bronzeBar(
        [0, center],
        [wheelRadius * Math.cos(a), center + wheelRadius * Math.sin(a)],
        0.048,
      );
    }
    add(
      new THREE.CylinderGeometry(0.095, 0.095, 0.09, 12).rotateX(Math.PI / 2),
      0,
      center,
      half - 0.255,
      materials.metal,
      0.92,
      detail,
    );
    const knotY = bottom + panelHeight * 0.27,
      unit = radius * 0.27;
    for (const sign of [-1, 1]) {
      const x = sign * unit * 0.58,
        y = knotY + sign * unit * 0.58,
        points = [
          [x, y + unit],
          [x + unit, y],
          [x, y - unit],
          [x - unit, y],
        ];
      for (let i = 0; i < points.length; i++)
        bronzeBar(points[i], points[(i + 1) % points.length], 0.045);
    }
    panels.push({
      face,
      width: radius * 2,
      height: panelHeight,
      bottom: ground + bottom,
      top: ground + top,
      spring: ground + spring,
      radius,
      plane,
    });
  }
  return { panels };
}
