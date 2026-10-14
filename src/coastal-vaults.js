import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { mergeArchitecture } from "./visuals.js";
import { stationMeshSolid } from "./field-station-solids.js";

const HALF = 6.5;
const SPRING = 7.205;
const PROFILES = [
  {
    name: "Counterweight portico",
    section: "round",
    rise: 2.0,
    start: 4.5,
    holes: [],
    towers: [],
  },
  {
    name: "Harbor balance hall",
    section: "round",
    rise: 2.65,
    holes: [[-0.8, 0.8, -1.2, 1.2]],
    towers: [],
  },
  {
    name: "Coral lantern gallery",
    section: "gable",
    rise: 3.45,
    holes: [[-0.7, 0.7, -3.8, 3.8]],
    towers: [
      [-4.3, 1.05, 1.4],
      [4.3, 1.05, 1.4],
    ],
  },
  {
    name: "Tidekeeper wave vault",
    section: "round",
    rise: 2.85,
    skew: 0.48,
    holes: [[-3.5, -1.3, -4.8, 1.2]],
    towers: [[4.2, 1.15, 2.1]],
  },
  {
    name: "Isolated intake pediment",
    section: "gable",
    rise: 3.9,
    holes: [[-4.5, -3.4, -3.5, 3.5]],
    towers: [],
  },
  {
    name: "Arcade counterflow nave",
    section: "round",
    rise: 3.35,
    holes: [[-2.4, 2.4, -1.8, 3.3]],
    towers: [
      [-3.6, 0.85, 0.9],
      [3.6, 0.85, 0.9],
    ],
  },
  {
    name: "Queen's crossing",
    section: "broad",
    rise: 3.6,
    holes: [[-1.6, 1.6, -1.5, 1.5]],
    towers: [[0, 1.3, 1.8]],
  },
  {
    name: "Pressure reserve",
    section: "flat",
    rise: 4.1,
    holes: [
      [-4, -2.8, -4.5, 3.5],
      [2.8, 4, -4.5, 3.5],
    ],
    towers: [
      [-4.1, 0.95, 1.5],
      [4.1, 0.95, 1.5],
    ],
  },
  {
    name: "Abyssal lock",
    section: "round",
    rise: 4.6,
    skew: -0.35,
    holes: [[-2.2, 2.2, -5.6, -2]],
    towers: [[-3.9, 1.2, 2.0]],
  },
];

export function coastalVaultPlan(stage) {
  const p = PROFILES[stage];
  if (!p) throw new RangeError(`Unknown coastal vault ${stage}`);
  return {
    ...p,
    stage,
    start: p.start ?? -6.7,
    end: 6.9,
    holes: p.holes.map((h) => [...h]),
    towers: p.towers.map((t) => [...t]),
  };
}

export function coastalRoofHeight(plan, x, z) {
  const u = Math.max(-1, Math.min(1, x / HALF));
  const q = Math.max(0, 1 - u * u);
  const section =
    plan.section === "gable"
      ? 1 - Math.abs(u)
      : plan.section === "broad"
        ? Math.pow(q, 0.55)
        : plan.section === "flat"
          ? Math.min(0.78, q)
          : Math.sqrt(q);
  const t = Math.max(0, Math.min(1, (z + 6.5) / 13));
  return (
    SPRING + 1.17 * t * t + plan.rise * section * (1 + (plan.skew ?? 0) * u)
  );
}

function heightPrism(x0, x1, z0, z1, bottom, top) {
  const corners = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  const low = corners.map(([x, z]) => [x, bottom(x, z), z]);
  const high = corners.map(([x, z]) => [x, top(x, z), z]);
  const positions = [],
    uv = [];
  const quad = (a, b, c, d) => {
    const normal = new THREE.Vector3()
      .subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a))
      .cross(
        new THREE.Vector3().subVectors(
          new THREE.Vector3(...c),
          new THREE.Vector3(...a),
        ),
      );
    const axis =
      Math.abs(normal.y) >= Math.max(Math.abs(normal.x), Math.abs(normal.z))
        ? [0, 2]
        : Math.abs(normal.x) > Math.abs(normal.z)
          ? [2, 1]
          : [0, 1];
    for (const p of [a, b, c, a, c, d]) {
      positions.push(...p);
      uv.push(p[axis[0]] / 2, p[axis[1]] / 2);
    }
  };
  quad(high[0], high[3], high[2], high[1]);
  quad(low[0], low[1], low[2], low[3]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(low[i], high[i], high[j], low[j]);
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

// Keep aperture coordinates in the mesh grid. A cut is a real hole through
// both skins, with four finite exposed edges rather than a black painted tile.
function uniqueCoordinates(values) {
  // Authored cuts override arithmetic copies of the same seam. Keep their
  // original coordinates; Float32 must not receive zero-width cells.
  const seams = new Map(values.map((v) => [Math.round(v * 1e6), v]));
  return [...seams.values()].sort((a, b) => a - b);
}

export function coastalRoofCells(plan) {
  const axis = (lo, hi, count, extra) =>
    uniqueCoordinates([
      ...Array.from(
        { length: count + 1 },
        (_, i) => lo + ((hi - lo) * i) / count,
      ),
      ...extra.filter((v) => v > lo && v < hi),
    ]);
  const angular = Array.from(
    { length: 33 },
    (_, i) => -HALF * Math.cos((Math.PI * i) / 32),
  );
  const xs =
    plan.section === "gable" || plan.section === "flat"
      ? axis(
          -HALF,
          HALF,
          24,
          plan.holes.flatMap((h) => h.slice(0, 2)),
        )
      : uniqueCoordinates([
          ...angular,
          ...plan.holes.flatMap((h) => h.slice(0, 2)),
        ]);
  const zs = axis(
    plan.start,
    plan.end,
    plan.stage === 0 ? 2 : 8,
    plan.holes.flatMap((h) => h.slice(2)),
  );
  const cells = [];
  for (let row = 0; row < zs.length - 1; row++)
    for (let column = 0; column < xs.length - 1; column++) {
      const x0 = xs[column],
        x1 = xs[column + 1],
        z0 = zs[row],
        z1 = zs[row + 1];
      const x = (x0 + x1) / 2,
        z = (z0 + z1) / 2;
      if (plan.holes.some(([a, b, c, d]) => x > a && x < b && z > c && z < d))
        continue;
      cells.push({ column, row, x0, x1, z0, z1 });
    }
  return cells;
}

export function coastalRoofCellGeometry(plan, cell, skin = false) {
  const inset = skin
    ? Math.min(0.007, (cell.x1 - cell.x0) * 0.12, (cell.z1 - cell.z0) * 0.12)
    : 0;
  return heightPrism(
    cell.x0 + inset,
    cell.x1 - inset,
    cell.z0 + inset,
    cell.z1 - inset,
    (x, z) => coastalRoofHeight(plan, x, z) + (skin ? 0.1 : -0.12),
    (x, z) => coastalRoofHeight(plan, x, z) + (skin ? 0.3 : 0.14),
  );
}

function frontTop(plan, x) {
  let top = coastalRoofHeight(plan, x, 6.5) + 0.32;
  for (const [c, width, height] of plan.towers) {
    const t = Math.max(0, Math.min(1, (width - Math.abs(x - c)) / 0.22));
    top += height * t;
  }
  return top;
}

function frontGeometry(plan, x0, x1, z0, z1, bottom) {
  return heightPrism(
    x0,
    x1,
    z0,
    z1,
    () => bottom,
    (x) => frontTop(plan, x),
  );
}

export function buildCoastalVault(game, gate, materials) {
  const plan = coastalVaultPlan(gate.stage),
    root = new THREE.Group();
  root.name = plan.name;
  gate.root.add(root);
  let seed = game.level.seed + 101003 + gate.stage * 997;
  const parts = [],
    bearings = [];
  const add = (geometry, material) => {
    if (geometry.attributes.color && !material.vertexColors)
      geometry.deleteAttribute("color");
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    parts.push(mesh);
    game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
    return mesh;
  };
  const block = (w, h, d, material, x, y, z) => {
    const geometry = stoneBlockGeometry(w, h, d, ++seed, 0.018);
    geometry.translate(x, y, z);
    return add(geometry, material);
  };
  const cells = coastalRoofCells(plan);
  for (const cell of cells) {
    add(coastalRoofCellGeometry(plan, cell), materials.chamberInset);
    add(
      coastalRoofCellGeometry(plan, cell, true),
      (cell.row + cell.column) % 7 === 0 ? materials.wall : materials.trim,
    );
  }
  // Dressed side risers fill the grade from the old cornice to the front
  // jamb caps. They follow the same spring as the roof's wall-edge vertices.
  const zs = [...new Set(cells.flatMap((c) => [c.z0, c.z1]))].sort(
    (a, b) => a - b,
  );
  for (const side of [-1, 1])
    for (let i = 0; i < zs.length - 1; i++) {
      const a = zs[i],
        b = zs[i + 1],
        x = side * HALF;
      add(
        heightPrism(
          x - 0.48,
          x + 0.48,
          a,
          b,
          () => 7.18,
          (_, z) => coastalRoofHeight(plan, side * HALF, z) + 0.1,
        ),
        materials.wall,
      );
      bearings.push({
        x,
        z: (a + b) / 2,
        bottom: 7.18,
        top: coastalRoofHeight(plan, x, (a + b) / 2) + 0.1,
      });
    }
  // Full transverse bands on both ends bear on the rear wall and jambs.
  // The continuous springing courses also carry the edges beside roof lights.
  for (const z of [plan.start + 0.14, plan.end - 0.14]) {
    const edges = [...new Set(cells.flatMap((c) => [c.x0, c.x1]))].sort(
      (a, b) => a - b,
    );
    for (let i = 0; i < edges.length - 1; i++)
      add(
        heightPrism(
          edges[i],
          edges[i + 1],
          z - 0.14,
          z + 0.14,
          (x, zz) => coastalRoofHeight(plan, x, zz) - 0.16,
          (x, zz) => coastalRoofHeight(plan, x, zz) + 0.34,
        ),
        materials.trim,
      );
  }
  for (const [x0, x1, z0, z1] of plan.holes) {
    for (const [a, b, c, d] of [
      [x0 - 0.13, x0 + 0.13, z0 - 0.13, z1 + 0.13],
      [x1 - 0.13, x1 + 0.13, z0 - 0.13, z1 + 0.13],
      [x0, x1, z0 - 0.13, z0 + 0.13],
      [x0, x1, z1 - 0.13, z1 + 0.13],
    ]) {
      const xx = uniqueCoordinates([
        a,
        b,
        ...cells
          .flatMap((cell) => [cell.x0, cell.x1])
          .filter((x) => x > a && x < b),
      ]);
      const zz = uniqueCoordinates([c, d, ...zs.filter((z) => z > c && z < d)]);
      for (let row = 0; row < zz.length - 1; row++)
        for (let column = 0; column < xx.length - 1; column++)
          add(
            heightPrism(
              xx[column],
              xx[column + 1],
              zz[row],
              zz[row + 1],
              (x, z) => coastalRoofHeight(plan, x, z) + 0.08,
              (x, z) => coastalRoofHeight(plan, x, z) + 0.4,
            ),
            materials.metal,
          );
    }
  }
  // Seat the front bed into the old lintel and caps. Its shallow depth leaves
  // the existing restoration bar and its three lights exposed at Z=7.3.
  block(13.3, 0.64, 1.24, materials.trim, 0, 8.105, 6.5);
  for (const x of [-0.7, 0, 0.7])
    block(0.08, 0.08, 0.07, materials.metal, x, 7.95, 7.24);
  const edge = uniqueCoordinates([
    ...Array.from({ length: 25 }, (_, i) => -HALF + (13 * i) / 24),
    ...plan.towers.flatMap(([c, w]) => [
      c - w,
      c - w + 0.22,
      c,
      c + w - 0.22,
      c + w,
    ]),
  ]);
  for (let i = 0; i < edge.length - 1; i++) {
    const a = edge[i],
      b = edge[i + 1];
    const inset = Math.min(0.005, (b - a) * 0.12);
    add(frontGeometry(plan, a, b, 5.76, 7.24, 8.375), materials.wall);
    add(
      frontGeometry(plan, a + inset, b - inset, 7.2, 7.3, 8.39),
      materials.trim,
    );
  }
  // A seated maritime register stays above the existing restoration lights.
  // Closed rings and stone backing replace the old open shell surface.
  block(2.3, 1.2, 0.16, materials.chamberInset, 0, 9.05, 7.3);
  for (let i = 0; i < 3; i++) {
    const geometry = new THREE.TorusGeometry(0.22 + i * 0.12, 0.025, 6, 32);
    geometry.scale(1, 0.72, 1);
    geometry.translate(0, 9.05, 7.4);
    add(geometry, materials.metal);
  }
  root.updateWorldMatrix(true, true);
  const triangles = parts.reduce(
    (n, p) =>
      n + (p.geometry.index?.count ?? p.geometry.attributes.position.count) / 3,
    0,
  );
  mergeArchitecture(root);
  // Capture before batching, then copy the delivered batches for movement
  // and roof support. The shared materials remain owned by the gate system.
  const feature = { id: `coastal-vault-${gate.stage}` };
  const solids = root.children
    .filter((p) => p.isMesh)
    .map((mesh) =>
      stationMeshSolid(game, feature, mesh, { bodyPadding: 0.65 }),
    );
  const vault = { root, plan, cells, bearings, solids, triangles };
  gate.coastalVault = vault;
  return vault;
}
