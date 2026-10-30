import * as THREE from "three";
import { mergeArchitecture } from "./visuals.js";
import { stationMeshSolid } from "./field-station-solids.js";

const HALF = 6.5,
  START = -6.65,
  END = 6.25;
const PROFILES = [
  {
    name: "Cold-air barrel",
    section: "barrel",
    rise: 2.5,
    holes: [[-0.65, 0.65, -2.8, 2.8]],
  },
  {
    name: "Ignition ridge",
    section: "gable",
    rise: 3.7,
    ridge: -1.6,
    holes: [[2.2, 3.3, -4, 1.5]],
  },
  {
    name: "Relief monitor",
    section: "monitor",
    rise: 3.4,
    holes: [
      [-2.1, -0.7, -3.7, 1.7],
      [0.7, 2.1, -3.7, 1.7],
    ],
  },
  {
    name: "Gear-jacket crossing",
    section: "cross",
    rise: 3.9,
    holes: [[-0.7, 0.7, -0.7, 0.7]],
  },
  {
    name: "Smelting twin ridges",
    section: "twin",
    rise: 3.2,
    holes: [
      [-3.8, -2.7, -3, 2],
      [2.7, 3.8, -3, 2],
    ],
  },
  {
    name: "Pilot lantern",
    section: "monitor",
    rise: 2.8,
    holes: [[-1.4, 1.4, -2, 2]],
    lantern: 1.5,
  },
  {
    name: "Tempering canopy",
    section: "gable",
    rise: 3.1,
    ridge: 1.8,
    holes: [[-3.8, -2.5, -4.2, 2.5]],
  },
  {
    name: "Heart-engine crown",
    section: "barrel",
    rise: 4.5,
    holes: [[-1.3, 1.3, -2.1, 2.1]],
    lantern: 2.1,
  },
];

export function forgeVaultPlan(stage) {
  const p = PROFILES[stage];
  if (!p) throw new RangeError(`Unknown forge chamber ${stage}`);
  const plan = {
    ...p,
    stage,
    start: START,
    end: END,
    holes: p.holes.map((h) => [...h]),
  };
  plan.vents = (p.section === "twin" ? [-3.25, 3.25] : [p.ridge || 0]).map(
    (x) => {
      const half = p.section === "twin" ? 0.65 : 1.05;
      const bottom =
        Math.min(
          forgeRoofHeight(plan, x - half, END),
          forgeRoofHeight(plan, x + half, END),
        ) - 1.15;
      return { x0: x - half, x1: x + half, y0: bottom, y1: bottom + 0.7 };
    },
  );
  return plan;
}

export function forgeRoofHeight(plan, x, z) {
  const ridge = plan.ridge || 0;
  const u = Math.max(
    -1,
    Math.min(1, (x - ridge) / (x < ridge ? HALF + ridge : HALF - ridge)),
  );
  const v = Math.max(-1, Math.min(1, z / HALF));
  const tent = 1 - Math.abs(u);
  const section =
    plan.section === "barrel"
      ? Math.sqrt(Math.max(0, 1 - u * u))
      : plan.section === "monitor"
        ? Math.min(1, tent * 2.3)
        : plan.section === "twin"
          ? Math.max(0, 1 - Math.abs(Math.abs(u) - 0.5) * 2)
          : plan.section === "cross"
            ? Math.max(tent, 0.82 * (1 - Math.abs(v)))
            : tent;
  const t = Math.max(0, Math.min(1, (z - START) / (END - START)));
  return 7.205 + 1.57 * t * t + plan.rise * section;
}

const unique = (values) =>
  [...new Map(values.map((v) => [Math.round(v * 1e6), v])).values()].sort(
    (a, b) => a - b,
  );
export function forgeRoofGrid(plan) {
  const xs = unique([
    ...Array.from(
      { length: 25 },
      (_, i) => -HALF * Math.cos((i * Math.PI) / 24),
    ),
    plan.ridge || 0,
    -HALF / 2,
    HALF / 2,
    -HALF * (1 - 1 / 2.3),
    HALF * (1 - 1 / 2.3),
    ...plan.holes.flatMap((h) => h.slice(0, 2)),
    ...plan.vents.flatMap((v) => [v.x0, v.x1]),
  ]);
  const zs = unique([
    ...Array.from({ length: 9 }, (_, i) => START + ((END - START) * i) / 8),
    0,
    ...plan.holes.flatMap((h) => h.slice(2)),
  ]);
  const cells = [];
  for (let j = 0; j < zs.length - 1; j++)
    for (let i = 0; i < xs.length - 1; i++) {
      const x = (xs[i] + xs[i + 1]) / 2,
        z = (zs[j] + zs[j + 1]) / 2;
      if (plan.holes.some(([a, b, c, d]) => x > a && x < b && z > c && z < d))
        continue;
      cells.push({ x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1], i, j });
    }
  return { xs, zs, cells };
}

// Accessories seat on the actual two-triangle cell, including the crossing
// ridge. Sampling the curved design function between vertices would leave gaps.
export function forgeRoofSample(plan, grid, x, z) {
  const interval = (axis, value) => {
    const i = axis.findIndex((a) => a > value);
    return Math.max(0, i < 0 ? axis.length - 2 : i - 1);
  };
  const i = interval(grid.xs, x),
    j = interval(grid.zs, z);
  const x0 = grid.xs[i],
    x1 = grid.xs[i + 1];
  const z0 = grid.zs[j],
    z1 = grid.zs[j + 1];
  const u = (x - x0) / (x1 - x0),
    v = (z - z0) / (z1 - z0);
  const a = forgeRoofHeight(plan, x0, z0),
    c = forgeRoofHeight(plan, x1, z1);
  return v >= u
    ? a * (1 - v) + forgeRoofHeight(plan, x0, z1) * (v - u) + c * u
    : a * (1 - u) + forgeRoofHeight(plan, x1, z0) * (u - v) + c * v;
}

export function forgePrism(x0, x1, z0, z1, bottom, top) {
  const corners = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  const low = corners.map(([x, z]) => [x, bottom(x, z), z]),
    high = corners.map(([x, z]) => [x, top(x, z), z]);
  const positions = [],
    uv = [];
  const face = (a, b, c, d) => {
    const normal = new THREE.Vector3()
      .subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a))
      .cross(
        new THREE.Vector3().subVectors(
          new THREE.Vector3(...c),
          new THREE.Vector3(...a),
        ),
      );
    const axes =
      Math.abs(normal.y) >= Math.max(Math.abs(normal.x), Math.abs(normal.z))
        ? [0, 2]
        : Math.abs(normal.x) > Math.abs(normal.z)
          ? [2, 1]
          : [0, 1];
    for (const p of [a, b, c, a, c, d]) {
      positions.push(...p);
      uv.push(p[axes[0]] / 2, p[axes[1]] / 2);
    }
  };
  face(high[0], high[3], high[2], high[1]);
  face(low[0], low[1], low[2], low[3]);
  for (let i = 0; i < 4; i++)
    face(low[i], high[i], high[(i + 1) % 4], low[(i + 1) % 4]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function buildForgeVault(game, gate, materials) {
  const plan = forgeVaultPlan(gate.stage),
    root = new THREE.Group(),
    grid = forgeRoofGrid(plan);
  root.name = plan.name;
  gate.root.add(root);
  const add = (geometry, material) => {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    game.cameraSurfaces?.capture(m, { small: true, thin: true });
    return m;
  };
  const prism = (x0, x1, z0, z1, bottom, top, mat = materials.metal) =>
    add(forgePrism(x0, x1, z0, z1, bottom, top), mat);
  const height = (x, z) => forgeRoofSample(plan, grid, x, z);
  for (const { x0, x1, z0, z1 } of grid.cells)
    prism(
      x0,
      x1,
      z0,
      z1,
      (x, z) => height(x, z) - 0.12,
      (x, z) => height(x, z) + 0.16,
    );
  // Side risers and end gables carry the roof on the existing dressed walls.
  // The front gable stays behind the retained turning gears and lintel.
  const bearings = [];
  for (const side of [-1, 1])
    for (let j = 0; j < grid.zs.length - 1; j++) {
      const a = grid.zs[j],
        b = grid.zs[j + 1],
        x = side * HALF;
      prism(
        x - 0.4,
        x + 0.4,
        a,
        b,
        () => 6.92,
        (_, z) => height(x, z) + 0.02,
        materials.wall,
      );
      bearings.push({ x, z: (a + b) / 2, bottom: 6.92 });
    }
  for (const [z, bottom] of [
    [START, 6.92],
    [END, 8.72],
  ])
    for (let i = 0; i < grid.xs.length - 1; i++) {
      const a = grid.xs[i],
        b = grid.xs[i + 1];
      const vent =
        z === END &&
        plan.vents.find((v) => (a + b) / 2 > v.x0 && (a + b) / 2 < v.x1);
      const fill = (low, high) =>
        prism(a, b, z - 0.18, z + 0.18, low, high, materials.wall);
      if (vent) {
        fill(
          () => bottom,
          () => vent.y0,
        );
        fill(
          () => vent.y1,
          (x) => height(x, z) + 0.05,
        );
      } else
        fill(
          () => bottom,
          (x) => height(x, z) + 0.05,
        );
    }
  // Open ventilation slots and seated metal joints break up the large gables.
  // Their four grille bars leave a clear opening at the centre of each slot.
  for (const v of plan.vents) {
    for (const x of [v.x0, v.x1])
      prism(
        x - 0.08,
        x + 0.08,
        END - 0.21,
        END + 0.27,
        () => v.y0 - 0.09,
        () => v.y1 + 0.09,
        materials.metal,
      );
    for (const y of [v.y0, v.y1])
      prism(
        v.x0,
        v.x1,
        END - 0.21,
        END + 0.27,
        () => y - 0.08,
        () => y + 0.08,
        materials.metal,
      );
    for (let i = 1; i <= 4; i++) {
      const x = v.x0 + ((v.x1 - v.x0) * i) / 5;
      prism(
        x - 0.025,
        x + 0.025,
        END + 0.12,
        END + 0.24,
        () => v.y0,
        () => v.y1,
        materials.metal,
      );
    }
  }
  for (const x of [-4.8, -3.2, -1.6, 0, 1.6, 3.2, 4.8]) {
    const top = height(x, END) - 0.2,
      vent = plan.vents.find((v) => x > v.x0 && x < v.x1);
    const spans = vent
      ? [
          [8.82, vent.y0 - 0.06],
          [vent.y1 + 0.06, top],
        ]
      : [[8.82, top]];
    for (const [a, b] of spans)
      if (b > a)
        prism(
          x - 0.025,
          x + 0.025,
          END + 0.16,
          END + 0.25,
          () => a,
          () => b,
          materials.metal,
        );
  }
  // Narrow raised seams follow the same piecewise planar roof faces. Their
  // ends meet the gable trims; no independent floating line cards are used.
  for (const z of [START, -3.4, 0, 3.4, END])
    for (let i = 0; i < grid.xs.length - 1; i++) {
      const a = grid.xs[i],
        b = grid.xs[i + 1];
      if (
        plan.holes.some(
          ([x0, x1, z0, z1]) =>
            (a + b) / 2 > x0 && (a + b) / 2 < x1 && z > z0 && z < z1,
        )
      )
        continue;
      prism(
        a,
        b,
        z - 0.055,
        z + 0.055,
        (x, zz) => height(x, zz) + 0.12,
        (x, zz) => height(x, zz) + 0.23,
        materials.trim,
      );
    }
  const openings = [];
  for (const [x0, x1, z0, z1] of plan.holes) {
    const rim = (a, b, c, d) => {
      const xs = unique([a, b, ...grid.xs.filter((x) => x > a && x < b)]),
        zs = unique([c, d, ...grid.zs.filter((z) => z > c && z < d)]);
      for (let j = 0; j < zs.length - 1; j++)
        for (let i = 0; i < xs.length - 1; i++)
          prism(
            xs[i],
            xs[i + 1],
            zs[j],
            zs[j + 1],
            (x, z) => height(x, z) - 0.04,
            (x, z) => height(x, z) + 0.35,
            materials.trim,
          );
    };
    rim(x0 - 0.12, x0 + 0.12, z0 - 0.12, z1 + 0.12);
    rim(x1 - 0.12, x1 + 0.12, z0 - 0.12, z1 + 0.12);
    rim(x0, x1, z0 - 0.12, z0 + 0.12);
    rim(x0, x1, z1 - 0.12, z1 + 0.12);
    if (plan.lantern) {
      const top =
        Math.max(
          ...[x0, x1].flatMap((x) => [z0, z1].map((z) => height(x, z))),
        ) + plan.lantern;
      // Four posts and an elevated sloping cap leave open ventilation slots.
      for (const x of [x0, x1])
        for (const z of [z0, z1])
          prism(
            x - 0.12,
            x + 0.12,
            z - 0.12,
            z + 0.12,
            (xx, zz) => height(xx, zz) + 0.2,
            () => top,
            materials.metal,
          );
      const middle = (x0 + x1) / 2;
      for (const [a, b] of [
        [x0 - 0.3, middle],
        [middle, x1 + 0.3],
      ])
        prism(
          a,
          b,
          z0 - 0.3,
          z1 + 0.3,
          () => top - 0.02,
          (x) =>
            top +
            0.28 +
            0.4 * (1 - Math.abs((x - middle) / ((x1 - x0) / 2 + 0.3))),
          materials.metal,
        );
    }
    openings.push({ x0, x1, z0, z1, covered: !!plan.lantern });
  }
  root.updateWorldMatrix(true, true);
  const triangles = root.children.reduce(
    (n, m) => n + m.geometry.attributes.position.count / 3,
    0,
  );
  mergeArchitecture(root);
  const feature = { id: `forge-vault-${gate.stage}` };
  const solids = root.children
    .filter((m) => m.isMesh)
    .map((m) => stationMeshSolid(game, feature, m, { bodyPadding: 0.65 }));
  return (gate.forgeVault = {
    root,
    plan,
    grid,
    bearings,
    openings,
    solids,
    triangles,
  });
}
