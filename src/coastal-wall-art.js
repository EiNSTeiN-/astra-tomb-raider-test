import * as THREE from "three";
import { HYDRAULIC_TRIALS } from "./hydraulic-rules.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { vaultStoneGeometry } from "./palace-geometry.js";

// Shallow ceramic records of the working circuits, rather than another set of
// live controls. Coordinates are on the inward (-Z) face of a chamber wall.
const records = [
  null,
  {
    name: "Harbor balance",
    motif: "scales",
    centers: [
      [-3.25, 3.65],
      [0, 3.65],
      [3.25, 3.65],
    ],
  },
  {
    name: "Coral pump",
    motif: "coral",
    centers: [
      [-3.3, 3.3],
      [0, 4.15],
      [3.3, 3.3],
    ],
  },
  {
    name: "Tidekeeper return",
    motif: "tides",
    centers: [
      [-3.3, 4.15],
      [0, 3.05],
      [3.3, 4.15],
    ],
  },
  {
    name: "Isolated intake",
    motif: "steps",
    centers: [
      [-3.3, 4.3],
      [0, 3.7],
      [3.3, 3.1],
    ],
  },
  {
    name: "Arcade counterflow",
    motif: "arcade",
    centers: [
      [-3.3, 4.1],
      [0, 3.35],
      [3.3, 4.1],
    ],
  },
  {
    name: "Queen circulation",
    motif: "crown",
    centers: [
      [-3.3, 3.3],
      [0, 4.3],
      [3.3, 3.3],
    ],
  },
  {
    name: "Pressure reserve",
    motif: "reserve",
    centers: [
      [-3.3, 4.05],
      [0, 3.05],
      [3.3, 4.05],
    ],
  },
  {
    name: "Abyssal lock",
    motif: "lock",
    centers: [
      [-3.3, 3.3],
      [0, 4.3],
      [3.3, 3.3],
    ],
  },
];

export function coastalWallRecord(stage) {
  const record = records[stage],
    trial = HYDRAULIC_TRIALS[stage];
  if (!record || !trial) throw new RangeError("Unknown coastal wall record");
  return {
    stage,
    name: record.name,
    motif: record.motif,
    centers: record.centers.map((p) => [...p]),
    capacity: [...trial.capacity],
    target: [...trial.target],
    links: trial.links.map((p) => [...p]),
  };
}

function plaque(points, depth) {
  const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(...p)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
  return geometry;
}

// The ceramic fill is clipped to its vessel silhouette; it cannot spill across
// a narrowed neck or faceted side. It is an engraving of the target measure.
function below(points, y) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (a[1] <= y) result.push(a);
    if ((a[1] < y && b[1] > y) || (a[1] > y && b[1] < y)) {
      const t = (y - a[1]) / (b[1] - a[1]);
      result.push([a[0] + (b[0] - a[0]) * t, y]);
    }
  }
  return result;
}

export function buildCoastalWallArt(stage, materials, place) {
  // Recess the assembly into the old core. Even its deepest ornament remains
  // behind the old inward face, preserving the existing body aisle.
  const add = (geometry, material, x, y, z) =>
    place(geometry, material, x, y, z + 0.3);
  const plan = coastalWallRecord(stage),
    m = materials;
  let seed = 9049 + stage * 431;
  const block = (w, h, depth, material, x, y, z) =>
    add(stoneBlockGeometry(w, h, depth, ++seed, 0.008), material, x, y, z);
  const line = (
    a,
    b,
    width = 0.045,
    material = m.metal,
    z = -0.565,
    depth = 0.12,
  ) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const mesh = block(
      width,
      Math.hypot(dx, dy) + width * 0.25,
      depth,
      material,
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      z,
    );
    mesh.rotation.z = -Math.atan2(dx, dy);
    return mesh;
  };
  const path = (points, width, material, z, depth) => {
    for (let i = 1; i < points.length; i++)
      line(points[i - 1], points[i], width, material, z, depth);
  };
  const ring = (
    x,
    y,
    radius,
    a0 = 0,
    a1 = Math.PI * 2,
    width = 0.045,
    material = m.metal,
  ) => {
    const count = Math.max(3, Math.ceil((a1 - a0) * radius * 9));
    for (let i = 0; i < count; i++) {
      add(
        vaultStoneGeometry(
          radius,
          radius + width,
          a0 + ((a1 - a0) * i) / count,
          a0 + ((a1 - a0) * (i + 1)) / count,
          0.12,
          2,
        ),
        material,
        x,
        y,
        -0.565,
      );
    }
  };
  // A closed bed crosses the recessed backing at Z=-0.14. The surrounding
  // old masonry face remains at -0.41, ahead of every decorative vertex.
  block(11.3, 4.85, 0.105, m.dark, 0, 3.6, -0.442);
  for (let row = 0; row < 6; row++) {
    const h = 4.66 / 6,
      step = row % 2 ? 1.13 : 2.26;
    for (let left = -5.54; left < 5.54 - 0.01; left += step) {
      const right = Math.min(5.54, left + step);
      block(
        right - left - 0.014,
        h - 0.014,
        0.065,
        (row + stage) % 5 === 0 ? m.inlay : m.chamberInset,
        (left + right) / 2,
        1.27 + (row + 0.5) * h,
        -0.48,
      );
    }
  }
  for (const x of [-5.6, 5.6]) block(0.16, 4.94, 0.17, m.trim, x, 3.6, -0.51);
  for (const y of [1.18, 6.02]) block(11.35, 0.15, 0.17, m.trim, 0, y, -0.51);
  for (const y of [1.43, 5.77]) line([-5.32, y], [5.32, y], 0.032, m.metal);
  for (const x of [-5.3, 5.3]) line([x, 1.43], [x, 5.77], 0.032, m.metal);

  if (plan.motif === "scales") {
    path(
      [
        [-4.7, 4.92],
        [0, 5.52],
        [4.7, 4.92],
      ],
      0.1,
      m.trim,
    );
    line([0, 4.65], [0, 5.45], 0.075);
    for (const x of [-4.3, 4.3]) {
      line([x, 3.45], [x, 4.95]);
      ring(x, 3.5, 0.34, Math.PI, Math.PI * 2, 0.1, m.trim);
    }
  } else if (plan.motif === "coral") {
    for (const side of [-1, 1]) {
      const x = side * 4.7;
      path(
        [
          [x, 1.65],
          [x + side * 0.12, 3.45],
          [x - side * 0.12, 5.25],
        ],
        0.08,
        m.trim,
      );
      for (let j = 0; j < 5; j++) {
        const y = 2.35 + j * 0.52,
          dx = (j % 2 ? -1 : 1) * side;
        path(
          [
            [x, y],
            [x + dx * 0.42, y + 0.2],
            [x + dx * 0.52, y + 0.53],
          ],
          0.07,
          m.trim,
        );
      }
    }
    ring(0, 4.15, 1.1, 0, Math.PI, 0.1, m.trim);
  } else if (plan.motif === "tides") {
    for (let j = 0; j < 3; j++) {
      const points = Array.from({ length: 49 }, (_, i) => [
        -4.9 + (i * 9.8) / 48,
        5.06 + j * 0.19 + Math.sin((i * Math.PI) / 8) * 0.085,
      ]);
      path(points, 0.035, m.metal);
    }
    ring(0, 3.05, 1.15, 0, Math.PI * 2, 0.09, m.trim);
  } else if (plan.motif === "steps") {
    path(
      [
        [-4.7, 5.35],
        [-1.65, 5.35],
        [-1.65, 4.78],
        [1.65, 4.78],
        [1.65, 4.2],
        [4.7, 4.2],
      ],
      0.14,
      m.trim,
    );
    for (const x of [-4.7, 4.7])
      line([x, 1.7], [x, x < 0 ? 5.3 : 4.2], 0.1, m.trim);
  } else if (plan.motif === "arcade") {
    for (const [x, y] of plan.centers) {
      ring(x, y + 0.23, 1.12, 0, Math.PI, 0.1, m.trim);
      for (const side of [-1, 1])
        line([x + side * 1.17, 2.42], [x + side * 1.17, y + 0.25], 0.1, m.trim);
    }
  } else if (plan.motif === "crown") {
    for (const [x, y] of plan.centers)
      ring(x, y, 1.12, 0, Math.PI * 2, 0.08, m.trim);
    path(
      [
        [-1.18, 5.28],
        [-0.86, 5.57],
        [-0.43, 5.3],
        [0, 5.63],
        [0.43, 5.3],
        [0.86, 5.57],
        [1.18, 5.28],
      ],
      0.06,
      m.metal,
    );
  } else if (plan.motif === "reserve") {
    for (const [x, y] of plan.centers)
      ring(x, y, 1.16, 0, Math.PI * 2, 0.07, m.trim);
    for (const side of [-1, 1]) {
      const x = side * 4.9;
      line([x, 2], [x, 5.32], 0.11, m.trim);
      for (let j = 0; j < 12; j++)
        line([x - 0.12, 2.2 + j * 0.25], [x + 0.12, 2.2 + j * 0.25], 0.028);
    }
  } else {
    ring(0, 4.3, 1.23, 0, Math.PI * 2, 0.11, m.trim);
    for (const side of [-1, 1])
      path(
        [
          [side * 4.9, 2.3],
          [side * 4.9, 5.25],
          [side * 1.62, 5.25],
          [side * 1.62, 5.56],
        ],
        0.09,
        m.trim,
      );
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      line(
        [Math.cos(a) * 1.25, 4.3 + Math.sin(a) * 1.25],
        [Math.cos(a) * 1.37, 4.3 + Math.sin(a) * 1.37],
        0.05,
      );
    }
  }

  const vessels = [];
  for (const [i, [x, y]] of plan.centers.entries()) {
    const width = 0.45 + (plan.capacity[i] / Math.max(...plan.capacity)) * 0.3;
    const shape =
      i === 1
        ? [
            [-width * 0.7, -0.85],
            [width * 0.7, -0.85],
            [width, -0.6],
            [width, 0.66],
            [width * 0.78, 0.86],
            [-width * 0.78, 0.86],
            [-width, 0.66],
            [-width, -0.6],
          ]
        : [
            [-width * 0.65, -0.85],
            [width * 0.65, -0.85],
            [width, -0.45],
            [width * 0.88, 0.5],
            [width * 0.55, 0.7],
            [width * 0.55, 0.88],
            [-width * 0.55, 0.88],
            [-width * 0.55, 0.7],
            [-width * 0.88, 0.5],
            [-width, -0.45],
          ];
    add(plaque(shape, 0.14), m.trim, x, y, -0.545);
    const inside = shape.map(([px, py]) => [px * 0.83, py * 0.83]);
    add(plaque(inside, 0.035), m.dark, x, y, -0.629);
    const targetY = -0.7 + (1.4 * plan.target[i]) / plan.capacity[i];
    add(plaque(below(inside, targetY), 0.036), m.inlay, x, y, -0.647);
    // Explicit target tick and one division per real unit, rather than an
    // arbitrary fill level. The Roman stems label the same I/II/III pumps.
    for (let unit = 0; unit <= plan.capacity[i]; unit++) {
      const ty = y - 0.7 + (unit / plan.capacity[i]) * 1.4;
      line(
        [x + width + 0.1, ty],
        [x + width + (unit === plan.target[i] ? 0.29 : 0.19), ty],
        0.025,
        unit === plan.target[i] ? m.inlay : m.metal,
      );
    }
    for (let stem = 0; stem <= i; stem++)
      line(
        [x + (stem - i / 2) * 0.13, y - 1.15],
        [x + (stem - i / 2) * 0.13, y - 0.97],
        0.045,
        m.trim,
      );
    vessels.push({
      center: [x, y],
      width,
      targetY,
      capacity: plan.capacity[i],
      target: plan.target[i],
    });
  }
  // One joined channel per pair. Arrowheads encode every allowed direction;
  // missing return valves therefore remain legible without a misleading pipe.
  const channels = [];
  for (const [pair, [a, b]] of [
    [0, 1],
    [1, 2],
    [0, 2],
  ].entries()) {
    const directions = plan.links.filter(
      ([from, to]) => (from === a && to === b) || (from === b && to === a),
    );
    if (!directions.length) continue;
    const p = plan.centers[a],
      q = plan.centers[b],
      y = 1.65 + pair * 0.18;
    const points = [
      [p[0] - 0.18 + pair * 0.1, p[1] - 0.8],
      [p[0] - 0.18 + pair * 0.1, y],
      [q[0] - 0.18 + pair * 0.1, y],
      [q[0] - 0.18 + pair * 0.1, q[1] - 0.8],
    ];
    path(points, 0.045, m.metal);
    for (const [from] of directions) {
      const sign = from === a ? 1 : -1,
        x = (p[0] + q[0]) / 2 + sign * 0.25;
      path(
        [
          [x - sign * 0.14, y - 0.095],
          [x, y],
          [x - sign * 0.14, y + 0.095],
        ],
        0.035,
        m.trim,
      );
    }
    channels.push({ pair: [a, b], directions, points });
  }
  return { ...plan, vessels, channels };
}
