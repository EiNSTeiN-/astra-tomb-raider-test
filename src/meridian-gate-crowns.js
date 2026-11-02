import * as THREE from "three";
import {
  fittedStoneCells,
  insetStonePolygon,
  fittedStoneGeometry,
} from "./sky-masonry.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { projectStoneUVs } from "./stone-uv.js";
import { stationAssemblySolid } from "./field-station-solids.js";
import { mergeArchitecture } from "./visuals.js";

const rectangle = (x, y, w, h) => [
  [x - w / 2, y],
  [x + w / 2, y],
  [x + w / 2, y + h],
  [x - w / 2, y + h],
];
const gable = (x, w, h) => [
  [x - w / 2, 0.34],
  [x + w / 2, 0.34],
  [x + w / 2, 0.64],
  [x, h],
  [x - w / 2, 0.64],
];
const oval = (x, y, rx, ry = rx) =>
  Array.from({ length: 40 }, (_, i) => {
    const a = (i * Math.PI) / 20;
    return [x + Math.cos(a) * rx, y + Math.sin(a) * ry];
  });
const star = (x, y, rx, ry = rx, points = 8) =>
  Array.from({ length: points * 2 }, (_, i) => {
    const a = (i * Math.PI) / points,
      r = i % 2 ? 0.38 : 1;
    return [x + Math.sin(a) * rx * r, y + Math.cos(a) * ry * r];
  });
const crescent = (x, y, side) => {
  const p = [];
  for (let i = 0; i <= 20; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 20;
    p.push([x + side * Math.cos(a) * 0.42, y + Math.sin(a) * 0.52]);
  }
  for (let i = 19; i > 0; i--) {
    const a = -Math.PI / 2 + (i * Math.PI) / 20;
    p.push([x + side * Math.cos(a) * 0.14, y + Math.sin(a) * 0.52]);
  }
  return p;
};

// Every profile bears on the same two jamb caps. Convex stone fields can be
// dressed independently; marks are architectural records, never puzzle clues.
export function meridianGateCrownPlan(stage) {
  const fields = [],
    marks = [];
  let name;
  const bar = (x, y, w, h) => marks.push(rectangle(x, y, w, h));
  switch (stage) {
    case 0:
      name = "First meridian pediment";
      fields.push(gable(0, 14, 2.35));
      for (const x of [-0.65, 0, 0.65]) bar(x, 0.6, 0.1, x === 0 ? 1.1 : 0.75);
      break;
    case 1:
      name = "Earth-axis pylons";
      fields.push(
        rectangle(-5.7, 0.34, 2.6, 1.95),
        rectangle(0, 0.34, 8.8, 0.58),
        rectangle(5.7, 0.34, 2.6, 1.95),
      );
      for (const x of [-5.7, 5.7])
        for (const y of [0.75, 1.2, 1.65]) bar(x, y, 1.55, 0.09);
      break;
    case 2:
      name = "Lunar horns";
      fields.push(
        [
          [-7, 0.34],
          [-0.8, 0.34],
          [-0.8, 0.62],
          [-7, 2.3],
        ],
        [
          [0.8, 0.34],
          [7, 0.34],
          [7, 2.3],
          [0.8, 0.62],
        ],
      );
      marks.push(crescent(-5.8, 1.27, -1), crescent(5.8, 1.27, 1));
      break;
    case 3:
      name = "Seven archive stelae";
      for (let i = 0; i < 7; i++) {
        const x = (i - 3) * 1.75,
          h = 2.35 - Math.abs(i - 3) * 0.36;
        fields.push(rectangle(x, 0.34, 1.25, h));
        bar(x, 0.65, 0.085, h - 0.65);
      }
      break;
    case 4: {
      name = "Solar tympanum";
      const p = [
        [-7, 0.34],
        [7, 0.34],
      ];
      for (let i = 1; i < 24; i++) {
        const a = (i * Math.PI) / 24;
        p.push([Math.cos(a) * 7, 0.34 + Math.sin(a) * 2.1]);
      }
      fields.push(p);
      marks.push(star(0, 1.35, 0.95, 0.9, 12), oval(0, 1.35, 0.38));
      break;
    }
    case 5:
      name = "Western horizon terraces";
      for (let i = 0; i < 5; i++) {
        const x = -5.6 + i * 2.8,
          h = [0.55, 0.85, 1.2, 1.7, 2.3][i];
        fields.push(rectangle(x, 0.34, 2.8, h));
        bar(x, 0.57, 1.8, 0.08);
        if (i > 1) bar(x, 0.9, 1.8, 0.08);
      }
      break;
    case 6:
      name = "Astral compass pediment";
      fields.push(
        rectangle(-5.5, 0.34, 3, 0.75),
        gable(0, 8, 2.4),
        rectangle(5.5, 0.34, 3, 0.75),
      );
      marks.push(star(0, 1.35, 0.95, 0.85));
      break;
    case 7:
      name = "Circuit bridge";
      fields.push(
        rectangle(-5.6, 0.34, 2.8, 2.1),
        rectangle(0, 0.34, 8.4, 1.15),
        rectangle(5.6, 0.34, 2.8, 2.1),
      );
      bar(0, 0.65, 5.7, 0.09);
      for (const x of [-2.8, 2.8]) bar(x, 0.65, 0.09, 0.55);
      bar(0, 1.11, 5.7, 0.09);
      break;
    case 8:
      name = "Three strata gables";
      fields.push(
        gable(-4.6, 4.8, 1.4),
        gable(0, 5.6, 2.3),
        gable(4.6, 4.8, 1.4),
      );
      for (const radius of [1.25, 0.82, 0.39]) {
        const p = [];
        for (let i = 0; i <= 24; i++) {
          const a = (i * Math.PI) / 24;
          p.push([Math.cos(a) * radius, 0.62 + Math.sin(a) * radius * 0.83]);
        }
        for (let i = 24; i >= 0; i--) {
          const a = (i * Math.PI) / 24;
          p.push([
            Math.cos(a) * (radius - 0.065),
            0.62 + Math.sin(a) * (radius - 0.065) * 0.83,
          ]);
        }
        marks.push(p);
      }
      break;
    case 9:
      name = "Atlas trapezoid";
      fields.push(
        rectangle(-5.5, 0.34, 3, 0.85),
        [
          [-4, 0.34],
          [4, 0.34],
          [2.3, 2.35],
          [-2.3, 2.35],
        ],
        rectangle(5.5, 0.34, 3, 0.85),
      );
      marks.push(star(0, 1.38, 1.35, 0.78, 4));
      break;
    default:
      throw new RangeError(`Unknown Meridian gate crown ${stage}`);
  }
  return { stage, name, fields, marks };
}

// Finite camera boxes follow the silhouette in sections. Subdividing by both
// edge axes bounds diagonal overreach to 18 cm, rather than filling a gable's
// empty upper corners with the box around the complete stone field.
function captureProfile(game, root, material, polygon) {
  if (!game.cameraSurfaces) return 0;
  const cuts = new Set();
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      n = Math.max(
        1,
        Math.ceil(
          Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 0.18,
        ),
      );
    for (let j = 0; j <= n; j++) cuts.add(a[0] + ((b[0] - a[0]) * j) / n);
  }
  const xs = [...cuts].sort((a, b) => a - b),
    range = (x) => {
      const values = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length];
        if (Math.abs(b[0] - a[0]) < 1e-8) {
          if (Math.abs(x - a[0]) < 1e-7) values.push(a[1], b[1]);
        } else {
          const t = (x - a[0]) / (b[0] - a[0]);
          if (t >= -1e-7 && t <= 1 + 1e-7)
            values.push(a[1] + (b[1] - a[1]) * t);
        }
      }
      return [Math.min(...values), Math.max(...values)];
    };
  let count = 0;
  for (let i = 1; i < xs.length; i++) {
    const left = xs[i - 1],
      right = xs[i];
    if (right - left < 1e-6) continue;
    const a = range(left),
      b = range(right),
      bottom = Math.min(a[0], b[0]),
      top = Math.max(a[1], b[1]);
    if (top - bottom < 1e-6) continue;
    const g = new THREE.BoxGeometry(right - left, top - bottom, 1.9),
      proxy = new THREE.Mesh(g, material);
    proxy.position.set((left + right) / 2, 8.35 + (top + bottom) / 2, 6.5);
    root.add(proxy);
    game.cameraSurfaces.capture(proxy, { small: true, thin: true });
    root.remove(proxy);
    g.dispose();
    count++;
  }
  return count;
}

export function buildMeridianGateCrown(game, gate, m) {
  const plan = meridianGateCrownPlan(gate.stage),
    root = new THREE.Group(),
    parts = [],
    cores = [],
    facings = [],
    marks = [];
  root.name = `Meridian gate crown: ${plan.name}`;
  gate.root.add(root);
  let seed = game.level.seed + 192503 + gate.stage * 1123,
    cameraSections = 0;
  const add = (g, mat, x = 0, y = 8.35, z = 6.5) => {
    if (g.attributes.color && !mat.vertexColors) g.deleteAttribute("color");
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    parts.push(mesh);
    return mesh;
  };
  const bearing = add(
    stoneBlockGeometry(14.2, 0.42, 1.9, ++seed, 0.025),
    m.trim,
    0,
    8.56,
  );
  game.cameraSurfaces?.capture(bearing, { small: true, thin: true });
  for (const field of plan.fields) {
    cores.push(add(fittedStoneGeometry(field, 1.32, ++seed), m.wall));
    for (const cell of fittedStoneCells(field, ++seed, 1.1)) {
      const polygon = insetStonePolygon(cell, 0.012);
      if (polygon.length < 3) continue;
      for (const side of [-1, 1])
        facings.push(
          add(
            fittedStoneGeometry(polygon, 0.2, ++seed),
            m.trim,
            0,
            8.35,
            6.5 + side * 0.74,
          ),
        );
    }
    cameraSections += captureProfile(game, root, m.trim, field);
  }
  for (const polygon of plan.marks)
    for (const side of [-1, 1]) {
      const shape = new THREE.Shape(
          polygon.map((p) => new THREE.Vector2(...p)),
        ),
        g = new THREE.ExtrudeGeometry(shape, {
          depth: 0.055,
          bevelEnabled: false,
          steps: 1,
          curveSegments: 1,
        });
      g.translate(0, 0, -0.0275);
      projectStoneUVs(g);
      marks.push(add(g, m.metal, 0, 8.35, 6.5 + side * 0.85));
    }
  // Keep the overlapping closed cores and dressed faces as separate physical
  // placements. Their union survives render batching without parity holes.
  const solid = stationAssemblySolid(
    game,
    { id: `meridian-gate-crown-${gate.stage}` },
    parts,
    { bodyPadding: 0.4, layeredSupport: true },
  );
  solid.meridianGateCrown = true;
  const info = {
    root,
    plan,
    solid,
    cameraSections,
    parts: parts.length,
    cores: cores.length,
    facings: facings.length,
    marks: marks.length,
    triangles: parts.reduce(
      (n, o) =>
        n +
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3,
      0,
    ),
  };
  mergeArchitecture(root, 2);
  return info;
}
