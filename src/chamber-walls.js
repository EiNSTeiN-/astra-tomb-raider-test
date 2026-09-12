import * as THREE from "three";
import { mergeArchitecture } from "./visuals.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { vaultStoneGeometry, shellReliefGeometry } from "./palace-geometry.js";

export const CHAMBER_WALL_BIOMES = new Set([
  "water",
  "volcano",
  "crystal",
  "eclipse",
]);

export function chamberWallPlan(biome, length, stage, side) {
  const variant = (((stage + side + 3) % 3) + 3) % 3;
  const count =
    biome === "eclipse"
      ? 2 + (variant === 1 ? 1 : 0)
      : 3 + (variant === 1 ? 1 : 0);
  const step = length / count;
  const radius =
    biome === "eclipse"
      ? Math.min(1.6, step * 0.29)
      : Math.min(1.22, step * 0.27);
  const bottom = biome === "eclipse" ? 3.7 - radius : 1.2;
  const top =
    biome === "water"
      ? 3.8 + radius
      : biome === "eclipse"
        ? 3.7 + radius
        : biome === "crystal"
          ? 5.7
          : 5.35;
  return {
    biome,
    length,
    variant,
    radius,
    bottom,
    top,
    bays: Array.from(
      { length: count },
      (_, i) => (i + 0.5) * step - length / 2,
    ),
  };
}

// Each aperture has one horizontal interval. Sample its silhouette once and
// use that same polygon for the masonry and inset; joints cannot expose sky.
function aperture(plan) {
  const { biome, radius: r, bottom, top } = plan;
  if (biome === "eclipse")
    return Array.from({ length: 49 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2;
      return [Math.cos(a) * r, 3.7 + Math.sin(a) * r];
    }).slice(0, -1);
  if (biome === "water")
    return [
      [-r, bottom],
      [r, bottom],
      ...Array.from({ length: 25 }, (_, i) => {
        const a = (i / 24) * Math.PI;
        return [Math.cos(a) * r, 3.8 + Math.sin(a) * r];
      }),
    ];
  if (biome === "crystal")
    return [
      [-r, bottom],
      [r, bottom],
      [r * 0.84, 4.55],
      [0, top],
      [-r * 0.84, 4.55],
    ];
  return [
    [-r, bottom],
    [r, bottom],
    [r, top - 0.38],
    [r - 0.38, top],
    [-r + 0.38, top],
    [-r, top - 0.38],
  ];
}

function clip(points, axis, value, keepGreater) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const da = (a[axis] - value) * (keepGreater ? 1 : -1);
    const db = (b[axis] - value) * (keepGreater ? 1 : -1);
    if (da >= 0) out.push(a);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      out.push(a.map((n, j) => n + (b[j] - n) * t));
    }
  }
  return out;
}

function prism(points, depth) {
  const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(...p)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
  return g;
}

// Regional blind bays replace the generic outer face. The closed backing is
// at z=-.13 (.04 beside hinged leaves), the coursed face at .43, and the largest
// cornice at .74. All remain inside the existing .85 m movement half-width;
// the inner face stays at -.41.
export function buildChamberWall(game, gate, m, { length, side, floor }) {
  const plan = chamberWallPlan(game.level.biome, length, gate.stage, side);
  // Fully opened leaf backs reach .06 m inward of the wall centerline. Their
  // existing pocket needs a thicker core behind the exterior blind bays.
  const insetOffset = side !== 0 && gate.design.motion === "hinge" ? 0.17 : 0;
  const group = new THREE.Group();
  group.name = `${plan.biome} chamber wall ${side}`;
  group.position.set(side * 6.5, 0, side === 0 ? -6.5 : 0);
  group.rotation.y = side === 0 ? Math.PI : (side * Math.PI) / 2;
  gate.root.add(group);
  let seed = game.level.seed + gate.stage * 557 + (side + 1) * 103;
  const add = (g, mat, x = 0, y = 0, z = 0, capture = true) => {
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    if (capture)
      game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
    return mesh;
  };
  const block = (w, h, d, mat, x, y, z) =>
    add(stoneBlockGeometry(w, h, d, ++seed, 0.025), mat, x, y, z);
  const bar = (a, b, width, mat, z) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const mesh = block(
      width,
      Math.hypot(dx, dy) + width * 0.2,
      0.1,
      mat,
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      z,
    );
    mesh.rotation.z = -Math.atan2(dx, dy);
    return mesh;
  };
  const contour = aperture(plan);
  const halfWidth = (y) => {
    let width = 0;
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i],
        b = contour[(i + 1) % contour.length];
      if (Math.abs(a[1] - b[1]) < 1e-8) continue;
      if (y < Math.min(a[1], b[1]) - 1e-7 || y > Math.max(a[1], b[1]) + 1e-7)
        continue;
      width = Math.max(
        width,
        a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]),
      );
    }
    return width;
  };
  block(
    length,
    7.0,
    0.28 + insetOffset,
    m.wall,
    0,
    3.5,
    -0.27 + insetOffset / 2,
  );
  const breaks = [
    ...new Set([
      0,
      plan.bottom,
      plan.top,
      7,
      ...Array.from({ length: 8 }, (_, i) => (i + 1) * 0.8),
    ]),
  ].sort((a, b) => a - b);
  for (let row = 0; row < breaks.length - 1; row++) {
    const lo = breaks[row] + 0.009,
      hi = breaks[row + 1] - 0.009;
    if (hi <= lo) continue;
    const cut = lo > plan.bottom && hi < plan.top;
    const ys = [
      lo,
      ...contour.map((p) => p[1]).filter((y) => y > lo && y < hi),
      hi,
    ]
      .sort((a, b) => a - b)
      .filter((y, i, values) => !i || y - values[i - 1] > 1e-7);
    for (let bay = 0; bay < (cut ? plan.bays.length + 1 : 1); bay++) {
      const left = (y) =>
        !cut || bay === 0 ? -length / 2 : plan.bays[bay - 1] + halfWidth(y);
      const right = (y) =>
        !cut || bay === plan.bays.length
          ? length / 2
          : plan.bays[bay] - halfWidth(y);
      const polygon = [
        ...ys.map((y) => [left(y), y]),
        ...ys.toReversed().map((y) => [right(y), y]),
      ];
      for (let x = -length / 2 - (row % 2) * 1.1; x < length / 2; x += 2.2) {
        const cell = clip(
          clip(polygon, 0, x + 0.009, true),
          0,
          x + 2.2 - 0.009,
          false,
        );
        if (
          cell.length < 3 ||
          Math.abs(
            THREE.ShapeUtils.area(cell.map((p) => new THREE.Vector2(...p))),
          ) < 0.002
        )
          continue;
        add(prism(cell, 0.56), lo < 1 ? m.trim : m.wall, 0, 0, 0.15);
      }
    }
  }
  // A broad plinth and upper drip mould tie the bays together. Footings are
  // sampled separately across their complete 1.6 m width, including projections.
  for (let x = -length / 2; x < length / 2; x += 2.1) {
    const end = Math.min(length / 2, x + 2.1),
      cx = (x + end) / 2;
    block(end - x - 0.015, 0.22, 1.16, m.trim, cx, 0.14, 0.08);
    block(end - x - 0.015, 0.16, 0.34, m.trim, cx, 1.08, 0.43);
    block(end - x - 0.015, 0.2, 0.5, m.trim, cx, 6.48, 0.49);
    block(end - x - 0.015, 0.13, 0.38, m.trim, cx, 6.76, 0.48);
  }
  for (const [i, cx] of plan.bays.entries()) {
    const { radius: r, biome, bottom, top } = plan;
    // The inset is sealed against the wall core; all fittings sit within the
    // recess. No new smoke, fire or sound claims are implied by these cold bays.
    add(
      prism(contour, 0.045),
      m.chamberInset,
      cx,
      0,
      -0.106 + insetOffset,
      false,
    );
    if (biome === "water") {
      for (let j = 0; j < 13; j++)
        add(
          vaultStoneGeometry(
            r,
            r + 0.25,
            (j * Math.PI) / 13 + 0.004,
            ((j + 1) * Math.PI) / 13 - 0.004,
            0.22,
          ),
          m.trim,
          cx,
          3.8,
          0.46,
        );
      for (const sign of [-1, 1]) {
        block(0.25, 2.6, 0.22, m.trim, cx + sign * (r + 0.125), 2.5, 0.46);
        block(0.43, 0.17, 0.36, m.trim, cx + sign * (r + 0.125), 3.76, 0.46);
        for (let flute = -1; flute <= 1; flute++)
          block(
            0.022,
            2.27,
            0.035,
            m.dark,
            cx + sign * (r + 0.125) + flute * 0.057,
            2.47,
            0.57,
          );
      }
      add(
        shellReliefGeometry(r * 1.48),
        m.trim,
        cx,
        3.65,
        -0.12 + insetOffset,
        false,
      );
      block(r * 1.7, 0.12, 0.2, m.trim, cx, 1.5, insetOffset);
      for (let stripe = 0; stripe < 3; stripe++)
        block(
          r * 1.5,
          0.032,
          0.025,
          m.metal,
          cx,
          2.0 + stripe * 0.15,
          -0.074 + insetOffset,
        );
    } else if (biome === "volcano") {
      for (const sign of [-1, 1]) {
        block(0.27, 4.6, 0.3, m.trim, cx + sign * (r + 0.2), 3.45, 0.49);
        for (const y of [1.55, 3.25, 5.25])
          block(0.45, 0.2, 0.4, m.metal, cx + sign * (r + 0.2), y, 0.49);
      }
      for (let j = 0; j < contour.length; j++)
        bar(
          contour[j].map((n, k) => n + (k === 0 ? cx : 0)),
          contour[(j + 1) % contour.length].map(
            (n, k) => n + (k === 0 ? cx : 0),
          ),
          0.13,
          m.metal,
          0.3,
        );
      for (let dx = -r + 0.24; dx < r - 0.1; dx += 0.32)
        block(0.065, 3.48, 0.08, m.metal, cx + dx, 3.1, 0.01);
      for (const y of [1.65, 3.1, 4.55])
        block(r * 1.9, 0.13, 0.14, m.metal, cx, y, 0.07);
      for (const sign of [-1, 1])
        for (const y of [1.65, 3.1, 4.55])
          block(0.16, 0.17, 0.38, m.metal, cx + sign * (r - 0.04), y, 0.16);
    } else if (biome === "crystal") {
      for (let j = 0; j < contour.length; j++) {
        const a = contour[j],
          b = contour[(j + 1) % contour.length];
        bar([a[0] + cx, a[1]], [b[0] + cx, b[1]], 0.2, m.trim, 0.46);
      }
      for (const sign of [-1, 1]) {
        const points = [
          [cx + sign * r * 0.69, 1.58],
          [cx + sign * r * 0.28, 2.65],
          [cx + sign * r * 0.49, 3.78],
          [cx, 4.93],
        ];
        for (let j = 0; j < points.length - 1; j++)
          bar(points[j], points[j + 1], 0.055, m.inlay, -0.045);
      }
      const gem = new THREE.OctahedronGeometry(0.25, 0);
      gem.scale(0.7, 1.5 + ((gate.stage + i) % 3) * 0.2, 0.3);
      add(gem, m.inlay, cx, 3.13, -0.04, false);
    } else {
      for (let j = 0; j < 20; j++)
        add(
          vaultStoneGeometry(
            r,
            r + 0.24,
            (j * Math.PI) / 10 + 0.003,
            ((j + 1) * Math.PI) / 10 - 0.003,
            0.24,
          ),
          m.trim,
          cx,
          3.7,
          0.45,
        );
      add(
        new THREE.TorusGeometry(r * 0.72, 0.025, 5, 48),
        m.metal,
        cx,
        3.7,
        -0.075 + insetOffset,
        false,
      );
      for (let j = 0; j < 12; j++) {
        const a = (j / 12 + (gate.stage % 4) / 48) * Math.PI * 2;
        bar(
          [cx + Math.cos(a) * r * 0.77, 3.7 + Math.sin(a) * r * 0.77],
          [cx + Math.cos(a) * r * 0.9, 3.7 + Math.sin(a) * r * 0.9],
          0.035,
          m.metal,
          -0.055 + insetOffset,
        );
      }
      const axis = (gate.stage + i + side) * 0.27;
      for (const sign of [-1, 1])
        bar(
          [
            cx - Math.cos(axis + sign * 0.65) * r * 0.6,
            3.7 - Math.sin(axis + sign * 0.65) * r * 0.6,
          ],
          [
            cx + Math.cos(axis + sign * 0.65) * r * 0.6,
            3.7 + Math.sin(axis + sign * 0.65) * r * 0.6,
          ],
          0.045,
          m.metal,
          -0.035 + insetOffset,
        );
      add(
        new THREE.SphereGeometry(0.15, 10, 6),
        m.metal,
        cx,
        3.7,
        -0.01 + insetOffset,
        false,
      );
      block(r * 1.4, 0.15, 0.21, m.trim, cx, bottom - 0.34, 0.48);
    }
    // Relief on the inner rear face is shallow enough to preserve chamber
    // working space. Side walls are left clear of the inward-swinging leaves.
    if (side === 0) {
      const inner = contour.map(([x, y]) => [
        cx + x * 0.72,
        1.45 + (y - 1.2) * 0.76,
      ]);
      add(prism(inner, 0.055), m.chamberInset, 0, 0, -0.438);
      for (let j = 0; j < inner.length; j++)
        bar(inner[j], inner[(j + 1) % inner.length], 0.12, m.trim, -0.47);
      block(
        r * 1.5,
        0.13,
        0.2,
        m.trim,
        cx,
        1.41 + (bottom - 1.2) * 0.76,
        -0.47,
      );
      if (biome === "water") {
        const relief = add(
          shellReliefGeometry(r * 1.03),
          m.trim,
          cx,
          3.3,
          -0.435,
          false,
        );
        relief.rotation.y = Math.PI;
      }
    }
  }
  const measurement = {
    ...plan,
    side,
    floor,
    position: group.position.toArray(),
    angle: group.rotation.y,
  };
  mergeArchitecture(group);
  // Flatten the regional material batches into the gate so the existing
  // per-material merge still costs only a handful of calls for all three walls.
  group.updateMatrix();
  for (const mesh of [...group.children]) {
    mesh.updateMatrix();
    const geometry = mesh.geometry
      .clone()
      .applyMatrix4(mesh.matrix)
      .applyMatrix4(group.matrix);
    const batch = new THREE.Mesh(geometry, mesh.material);
    batch.castShadow = batch.receiveShadow = true;
    gate.root.add(batch);
    group.remove(mesh);
    mesh.geometry.dispose();
  }
  // Keep the empty transform parent until camera capture has consumed it.
  return measurement;
}
