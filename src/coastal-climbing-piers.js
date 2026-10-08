import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { pierCornerGeometry } from "./climbing-pier-geometry.js";
import { shellReliefGeometry, vaultStoneGeometry } from "./palace-geometry.js";

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

// The palace's existing fan surface gains a complete rim and a planar back.
// Both diameter edges follow the original radial rows, including their relief.
export function closedShellReliefGeometry(width) {
  const face = shellReliefGeometry(width),
    position = face.attributes.position,
    radial = 9,
    segments = 40,
    stride = segments + 1,
    rim = [
      ...Array.from({ length: stride }, (_, i) => radial * stride + i),
      ...Array.from(
        { length: radial },
        (_, i) => (radial - 1 - i) * stride + segments,
      ),
      ...Array.from({ length: radial - 1 }, (_, i) => (i + 1) * stride),
    ],
    positions = [],
    uvs = [],
    vertex = (index) =>
      new THREE.Vector3().fromBufferAttribute(position, index).toArray(),
    triangle = (a, b, c) => {
      for (const p of [a, b, c]) {
        positions.push(...p);
        uvs.push(p[0] / 2, p[1] / 2);
      }
    };
  for (let i = 0; i < rim.length; i++) {
    const a = vertex(rim[i]),
      b = vertex(rim[(i + 1) % rim.length]),
      backA = [a[0], a[1], -0.045],
      backB = [b[0], b[1], -0.045];
    triangle(b, a, backA);
    triangle(b, backA, backB);
  }
  for (let i = 0; i < segments; i++) {
    const a = vertex(radial * stride + i),
      b = vertex(radial * stride + i + 1);
    triangle([0, 0, -0.045], [b[0], b[1], -0.045], [a[0], a[1], -0.045]);
  }
  const sides = new THREE.BufferGeometry();
  sides.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  sides.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  sides.computeVertexNormals();
  const expanded = face.toNonIndexed(),
    result = mergeGeometries([expanded, sides]);
  face.dispose();
  expanded.dispose();
  sides.dispose();
  return result;
}

// Jointed classical stone frames and blue tidal plaster connect these piers
// with the palace galleries. Every recess and ornament has physical backing.
export function buildCoastalClimbingPier({
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
  const radius = ledge.index === 4 ? 0.94 : 0.8,
    panelHeight = Math.min(2.8, wallHeight - 0.85),
    bottom = wallHeight - panelHeight - 0.35,
    top = bottom + panelHeight,
    spring = top - radius,
    outer = radius + 0.26,
    arc = (r, from = 0, to = Math.PI, segments = 26) =>
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
      };
    wall(-along, -outer, 0, wallHeight);
    wall(outer, along, 0, wallHeight);
    wall(-outer, outer, 0, bottom);
    wall(-outer, outer, top + 0.26, wallHeight);
    for (const side of [-1, 1]) {
      const points = [
          new THREE.Vector2(0, top + 0.26),
          new THREE.Vector2(side * outer, top + 0.26),
          new THREE.Vector2(side * outer, spring),
          ...arc(outer, side > 0 ? 0 : Math.PI, Math.PI / 2, 13),
        ],
        jambHeight = spring - bottom,
        jambRows = Math.ceil(jambHeight / style.row),
        jambRise = jambHeight / jambRows;
      add(slab(points, 0.27), 0, 0, half - 0.075, materials.stone, 0.93);
      add(
        new THREE.BoxGeometry(0.26, jambHeight + 0.02, 0.24),
        side * (radius + 0.13),
        (bottom + spring) / 2,
        half - 0.185,
        materials.stone,
        0.76,
      );
      // Three dressed ribs form real shallow grooves over the continuous jamb.
      for (let row = 0; row < jambRows; row++)
        for (const flute of [-1, 0, 1])
          add(
            facingGeometry(0.068, jambRise - 0.01, 0.065, seed++),
            side * (radius + 0.13) + flute * 0.08,
            bottom + (row + 0.5) * jambRise,
            half - 0.062,
            materials.stone,
            1.03,
          );
      add(
        new THREE.BoxGeometry(0.35, 0.14, 0.29),
        side * (radius + 0.13),
        spring - 0.03,
        half - 0.19,
        materials.stone,
        1.03,
      );
    }
    const panel = [
        new THREE.Vector2(-radius, bottom),
        new THREE.Vector2(radius, bottom),
        ...arc(radius),
      ],
      ring = [...arc(outer), ...arc(radius, Math.PI, 0)],
      plane = half - 0.3;
    add(slab(panel, 0.16), 0, 0, plane, materials.plaster, 0.88);
    add(slab(ring, 0.22), 0, 0, half - 0.1, materials.stone, 0.78);
    for (let stone = 0; stone < 13; stone++)
      add(
        vaultStoneGeometry(
          radius,
          outer,
          (stone * Math.PI) / 13 + 0.002,
          ((stone + 1) * Math.PI) / 13 - 0.002,
          0.24,
          2,
        ),
        0,
        spring,
        half - 0.16,
        materials.stone,
        0.95 + (stone % 3) * 0.025,
      );
    add(
      new THREE.BoxGeometry(outer * 2 + 0.15, 0.16, 0.3),
      0,
      bottom + 0.02,
      half - 0.19,
      materials.stone,
      1.02,
    );
    const shellWidth = Math.min(radius * 1.55, panelHeight * 0.62);
    add(
      closedShellReliefGeometry(shellWidth),
      0,
      bottom + panelHeight * 0.55,
      half - 0.28,
      materials.stone,
      1.06,
    );
    for (let wave = 0; wave < 2; wave++) {
      const points = Array.from({ length: 25 }, (_, i) => {
          const x = (-0.73 + (i * 1.46) / 24) * radius,
            y =
              bottom +
              panelHeight * (0.2 + wave * 0.12) +
              Math.sin(
                (i / 24) * Math.PI * 3 + ((ledge.index + face) % 2) * Math.PI,
              ) *
                0.035;
          return new THREE.Vector3(x, y, 0);
        }),
        curve = new THREE.CatmullRomCurve3(points);
      add(
        new THREE.TubeGeometry(curve, 32, 0.024, 6, false),
        0,
        0,
        half - 0.29,
        materials.metal,
        0.83,
        detail,
      );
      // Seated terminal bosses close the tube ends and share the panel bearing.
      for (const point of [points[0], points.at(-1)])
        add(
          new THREE.SphereGeometry(0.028, 8, 6),
          point.x,
          point.y,
          half - 0.29,
          materials.metal,
          0.9,
          detail,
        );
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
