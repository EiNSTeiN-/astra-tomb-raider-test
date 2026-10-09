import * as THREE from "three";
import { pierCornerGeometry } from "./climbing-pier-geometry.js";

function profileGeometry(points, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(...points[0]);
  for (const point of points.slice(1)) shape.lineTo(...point);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
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

function hexagon(width, height, bottom = 0) {
  const shoulder = 0.38;
  return [
    [0, bottom],
    [width / 2, bottom + shoulder],
    [width / 2, bottom + height - shoulder],
    [0, bottom + height],
    [-width / 2, bottom + height - shoulder],
    [-width / 2, bottom + shoulder],
  ];
}

// These closed, opaque calcite reliefs have separate planar facets. Their
// buried back faces seat in the niche; they are not floating mineral shards.
function calciteGeometry(width, height) {
  const outline = [
      [0, 0, 0.025],
      [width / 2, height * 0.22, 0.035],
      [width / 2, height * 0.76, 0.025],
      [0, height, 0.035],
      [-width / 2, height * 0.76, 0.02],
      [-width / 2, height * 0.22, 0.035],
    ],
    ridge = [width * 0.075, height * 0.49, 0.13],
    positions = [],
    uv = [],
    triangle = (...points) => {
      for (const point of points) {
        positions.push(...point);
        uv.push(point[0] / 2, point[1] / 2);
      }
    };
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i],
      b = outline[(i + 1) % outline.length],
      backA = [a[0], a[1], -0.04],
      backB = [b[0], b[1], -0.04];
    triangle(ridge, a, b);
    triangle([0, height / 2, -0.04], backB, backA);
    triangle(a, backA, b);
    triangle(b, backA, backB);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

// Cut limestone shoulders fit the six-sided register. Each frame joint has a
// continuous buried bearing, and the calcite reliefs retain a closed rock back.
export function buildCrystalClimbingPier({
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
  const panelWidth = ledge.index === 4 ? 1.95 : 1.65,
    panelHeight = Math.min(3.25, wallHeight - 0.95),
    bottom = wallHeight - panelHeight - 0.42,
    top = bottom + panelHeight,
    inner = hexagon(panelWidth, panelHeight, bottom),
    outer = hexagon(panelWidth + 0.52, panelHeight + 0.52, bottom - 0.26),
    panels = [];
  mesh(
    new THREE.BoxGeometry(width - 0.02, 0.19, depth - 0.02),
    materials.stone,
    ledge.x,
    ground + 0.065,
    ledge.z,
    fixed,
    0.74,
  );
  mesh(
    new THREE.BoxGeometry(width - 0.84, wallHeight + 0.02, depth - 0.84),
    materials.stone,
    ledge.x,
    ground + wallHeight / 2,
    ledge.z,
    fixed,
    0.74,
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
      wall = (low, high) => {
        const h = high - low,
          count = Math.ceil(h / style.row),
          rowHeight = h / count,
          columns = Math.ceil((along * 2) / style.block),
          step = (along * 2) / columns;
        add(
          new THREE.BoxGeometry(along * 2 + 0.01, h + 0.02, 0.38),
          0,
          (low + high) / 2,
          half - 0.245,
          materials.stone,
          0.77,
        );
        for (let row = 0; row < count; row++) {
          const ends =
            row % 2
              ? [
                  -along,
                  ...Array.from(
                    { length: columns },
                    (_, i) => -along + (i + 0.5) * step,
                  ),
                  along,
                ]
              : Array.from(
                  { length: columns + 1 },
                  (_, i) => -along + i * step,
                );
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
              half - 0.16,
              materials.stone,
              0.95 + ((row * 7 + i * 3 + face) % 5) * 0.022,
            );
        }
      },
      low = bottom - 0.26,
      high = top + 0.26,
      shoulderWidth = (panelWidth + 0.52) / 2,
      edge = (y) =>
        shoulderWidth * Math.min(1, (y - low) / 0.38, (high - y) / 0.38);
    wall(0, low);
    wall(high, wallHeight);
    // Split each shoulder at the actual changes of slope. Closed trapezoids
    // carry the joints; dressed row fronts meet the diagonal frame precisely.
    const cuts = [low, low + 0.38, high - 0.38, high];
    for (const side of [-1, 1])
      for (let section = 1; section < cuts.length; section++) {
        const a = cuts[section - 1],
          b = cuts[section],
          shape = (start, end, inset = 0) => [
            [side * (edge(start) + inset), start],
            [side * (along - inset), start],
            [side * (along - inset), end],
            [side * (edge(end) + inset), end],
          ];
        add(
          profileGeometry(shape(a, b), 0.38),
          0,
          0,
          half - 0.055,
          materials.stone,
          0.77,
        );
        const count = Math.ceil((b - a) / style.row),
          rowHeight = (b - a) / count;
        for (let row = 0; row < count; row++)
          add(
            profileGeometry(
              shape(
                a + row * rowHeight + 0.007,
                a + (row + 1) * rowHeight - 0.007,
                0.006,
              ),
              0.08,
            ),
            0,
            0,
            half - 0.025,
            materials.stone,
            0.99 + ((row + face + ledge.index) % 3) * 0.025,
          );
      }
    for (let segment = 0; segment < inner.length; segment++) {
      const next = (segment + 1) % inner.length,
        points = [inner[segment], outer[segment], outer[next], inner[next]],
        center = points.reduce(
          (sum, point) => [sum[0] + point[0] / 4, sum[1] + point[1] / 4],
          [0, 0],
        ),
        dressed = points.map(([x, y]) => {
          const length = Math.hypot(x - center[0], y - center[1]),
            fraction = Math.min(0.035, 0.008 / length);
          return [
            x + (center[0] - x) * fraction,
            y + (center[1] - y) * fraction,
          ];
        });
      add(
        profileGeometry(points, 0.3),
        0,
        0,
        half - 0.12,
        materials.stone,
        0.78,
      );
      add(
        profileGeometry(dressed, 0.19),
        0,
        0,
        half - 0.025,
        materials.stone,
        1.12,
      );
    }
    const plane = half - 0.37;
    add(profileGeometry(inner, 0.16), 0, 0, plane, materials.stone, 0.48);
    const height = panelHeight - 0.36;
    for (const [x, y, w, h] of [
      [-0.1, bottom + 0.18, 0.42, height],
      [-0.5, bottom + 0.48, 0.15, height * 0.52],
      [0.46, bottom + 0.39, 0.17, height * 0.67],
    ]) {
      add(
        calciteGeometry(w, h),
        x,
        y,
        plane + 0.018,
        materials.calcite,
        1 + (face % 2) * 0.025,
        detail,
      );
      for (const offset of [0.12, h - 0.12])
        add(
          new THREE.BoxGeometry(w + 0.1, 0.075, 0.12),
          x,
          y + offset,
          plane + 0.035,
          materials.metal,
          0.9,
          detail,
        );
    }
    panels.push({
      face,
      width: panelWidth,
      height: panelHeight,
      bottom: ground + bottom,
      top: ground + top,
      plane,
      shoulder: 0.38,
    });
  }
  return { panels };
}
