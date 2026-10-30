import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { forgeGearGeometry } from "./forge-geometry.js";

const designs = [
  ["Cold-air intake", "intake", 3, 1.42, 1.25, 5.45],
  ["Ignition baffles", "ignition", 3, 1.42, 1.2, 5.65],
  ["Pressure diaphragms", "relief", 3, 1.42, 1.25, 5.65],
  ["Gear inspection cases", "gears", 2, 1.95, 1.25, 5.55],
  ["Smelting feed moulds", "feeds", 3, 1.42, 1.2, 5.7],
  ["Pilot burner registers", "pilots", 3, 1.42, 1.25, 5.5],
  ["Tempering heat exchangers", "fins", 2, 1.95, 1.25, 5.5],
  ["Heart-engine impellers", "heart", 2, 1.95, 1.15, 5.75],
];

export function forgeWallPlan(length, stage) {
  const design = designs[stage];
  if (!design) throw new RangeError(`Unknown forge wall ${stage}`);
  const [name, kind, count, radius, bottom, top] = design;
  return {
    stage,
    name,
    kind,
    radius: Math.min(radius, (length / count) * 0.34),
    bottom,
    top,
    bays: Array.from(
      { length: count },
      (_, i) => ((i + 0.5) * length) / count - length / 2,
    ),
  };
}

export function forgeBayContour({ kind, radius: r, bottom: b, top: t }) {
  if (kind === "relief")
    return Array.from({ length: 32 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 16;
      return [Math.cos(a) * r, (b + t) / 2 + (Math.sin(a) * (t - b)) / 2];
    });
  if (kind === "ignition" || kind === "feeds") {
    const shoulder = kind === "ignition" ? 0.65 : 1.25;
    return [
      [-r, b],
      [r, b],
      [r, t - shoulder],
      [r * 0.48, t],
      [-r * 0.48, t],
      [-r, t - shoulder],
    ];
  }
  const cut =
    kind === "heart"
      ? 0.78
      : kind === "gears"
        ? 0.58
        : kind === "pilots"
          ? 0.42
          : 0.22;
  return [
    [-r + cut, b],
    [r - cut, b],
    [r, b + cut],
    [r, t - cut],
    [r - cut, t],
    [-r + cut, t],
    [-r, t - cut],
    [-r, b + cut],
  ];
}

function plate(points, depth) {
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

// Closed, stationary fittings in sealed blind bays. Their backing joins the
// wall core and their outermost edges stay behind the existing cornice.
export function buildForgeWallBay(plan, cx, bay, m, place) {
  const { radius: r, bottom, top, kind } = plan,
    cy = (bottom + top) / 2,
    height = top - bottom,
    contour = forgeBayContour(plan);
  let seed = 1289 + plan.stage * 281 + bay * 67;
  const add = (g, material, x, y, z, name) => {
    const mesh = place(g, material, x + cx, y, z);
    mesh.name = `Forge ${kind}: ${name}`;
    return mesh;
  };
  const block = (w, h, d, material, x, y, z, name) =>
    add(stoneBlockGeometry(w, h, d, ++seed, 0.009), material, x, y, z, name);
  const beam = (a, b, width, depth, material, z, name) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const mesh = block(
      width,
      Math.hypot(dx, dy) + width * 0.16,
      depth,
      material,
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      z,
      name,
    );
    mesh.rotation.z = -Math.atan2(dx, dy);
    return mesh;
  };
  const disc = (x, y, radius, depth, z, material, name, segments = 20) => {
    const mesh = add(
      new THREE.CylinderGeometry(radius, radius, depth, segments),
      material,
      x,
      y,
      z,
      name,
    );
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  const ring = (x, y, radius, z, name) =>
    add(new THREE.TorusGeometry(radius, 0.075, 6, 32), m.metal, x, y, z, name);
  // A second plate bridges the recessed core to every mechanical assembly.
  // Its smaller contour leaves the original dark inset visible at the edges.
  add(
    plate(
      contour.map(([x, y]) => [x * 0.9, cy + (y - cy) * 0.92]),
      0.15,
    ),
    m.chamberInset,
    0,
    0,
    -0.045,
    "backplate",
  );
  for (let j = 0; j < contour.length; j++) {
    const a = contour[j],
      b = contour[(j + 1) % contour.length];
    beam(a, b, 0.18, 0.3, m.trim, 0.29, "dressed surround");
    // Elliptical surrounds use fewer fasteners than their tessellation points.
    if (kind !== "relief" || j % 4 === 0)
      disc(a[0], a[1], 0.065, 0.09, 0.45, m.metal, "surround bolt", 6);
  }
  block(r * 2 + 0.32, 0.17, 0.56, m.trim, 0, bottom - 0.04, 0.34, "sill");

  if (kind === "intake" || kind === "fins") {
    for (const sign of [-1, 1])
      block(
        0.14,
        height - 0.45,
        0.3,
        m.metal,
        sign * r * 0.7,
        cy,
        0.04,
        "louver rail",
      );
    const count = kind === "intake" ? 9 : 7;
    for (let j = 0; j < count; j++) {
      const y = bottom + 0.45 + ((height - 0.9) * j) / (count - 1);
      const blade = block(
        r * 1.7,
        0.16,
        0.3,
        m.metal,
        0,
        y,
        0.035,
        "louver blade",
      );
      blade.rotation.x = kind === "intake" ? 0.48 : -0.26;
    }
    if (kind === "fins") {
      for (const sign of [-1, 1]) {
        disc(sign * r * 0.56, cy, 0.29, 0.35, 0.11, m.trim, "coolant coupling");
        disc(sign * r * 0.56, cy, 0.14, 0.08, 0.31, m.metal, "coupling cap", 8);
      }
      beam(
        [-r * 0.56, cy],
        [r * 0.56, cy],
        0.13,
        0.18,
        m.metal,
        0.22,
        "coolant bridge",
      );
    }
  } else if (kind === "ignition") {
    for (let j = 0; j < 6; j++) {
      const y = bottom + 0.55 + j * 0.54;
      block(
        r * (1.7 - j * 0.08),
        0.37,
        0.25,
        j % 2 ? m.metal : m.trim,
        0,
        y,
        0.045,
        "heat baffle",
      );
    }
    for (const sign of [-1, 1])
      beam(
        [sign * r * 0.65, bottom + 0.35],
        [sign * r * 0.2, top - 0.4],
        0.1,
        0.32,
        m.metal,
        0.1,
        "baffle stay",
      );
  } else if (kind === "relief") {
    disc(0, cy, r * 0.78, 0.25, 0.035, m.trim, "pressure bed");
    ring(0, cy, r * 0.69, 0.17, "pressure rim");
    disc(0, cy, r * 0.42, 0.27, 0.11, m.metal, "diaphragm", 24);
    for (const sign of [-1, 1]) {
      beam(
        [0, cy + sign * 0.6],
        [0, cy + sign * 1.55],
        0.18,
        0.25,
        m.metal,
        0.065,
        "pressure stem",
      );
      beam(
        [-r * 0.6, cy + sign * 0.95],
        [r * 0.6, cy - sign * 0.95],
        0.12,
        0.22,
        m.metal,
        0.09,
        "diagonal relief stay",
      );
      block(
        r * 0.72,
        0.16,
        0.25,
        m.trim,
        0,
        cy + sign * 1.55,
        0.04,
        "relief seat",
      );
    }
    disc(0, cy, 0.16, 0.2, 0.3, m.trim, "retaining boss", 8);
  } else if (kind === "gears") {
    const radius = Math.min(r * 0.73, height * 0.34),
      geometry = forgeGearGeometry(1.74, 20, 0.38);
    geometry.scale(radius / 1.74, radius / 1.74, 0.65);
    add(geometry, m.metal, 0, cy, 0.08, "inspection gear");
    for (let spoke = 0; spoke < 6; spoke++) {
      const a = (spoke * Math.PI) / 3;
      beam(
        [0, cy],
        [Math.cos(a) * radius * 0.91, cy + Math.sin(a) * radius * 0.91],
        0.15,
        0.25,
        m.metal,
        0.06,
        "gear spoke",
      );
    }
    disc(0, cy, 0.28, 0.4, 0.1, m.trim, "axle bearing");
    for (const sign of [-1, 1])
      block(
        r * 1.35,
        0.18,
        0.23,
        m.trim,
        0,
        cy + sign * (height / 2 - 0.45),
        0.025,
        "case rail",
      );
  } else if (kind === "feeds") {
    for (const sign of [-1, 1]) {
      const x = sign * r * 0.48;
      add(
        plate(
          [
            [x - r * 0.27, bottom + 0.4],
            [x + r * 0.27, bottom + 0.4],
            [x + r * 0.12, top - 0.8],
            [x - r * 0.12, top - 0.8],
          ],
          0.24,
        ),
        m.trim,
        0,
        0,
        0.04,
        "tapered feed mould",
      );
      block(0.13, height - 1.4, 0.3, m.metal, x, cy - 0.1, 0.09, "feed seam");
    }
    for (const y of [bottom + 0.65, cy, top - 1])
      block(r * 1.7, 0.13, 0.25, m.metal, 0, y, 0.13, "mould clamp");
    block(r * 0.95, 0.2, 0.3, m.trim, 0, top - 0.4, 0.04, "pouring neck");
  } else if (kind === "pilots") {
    for (const sign of [-1, 1]) {
      block(
        0.14,
        height - 0.6,
        0.24,
        m.metal,
        sign * r * 0.48,
        cy,
        0.035,
        "pilot feed",
      );
      for (const y of [cy - 0.73, cy + 0.73]) {
        disc(
          sign * r * 0.48,
          y,
          r * 0.31,
          0.32,
          0.08,
          m.trim,
          "refractory burner seat",
        );
        ring(sign * r * 0.48, y, r * 0.21, 0.25, "burner rim");
        disc(
          sign * r * 0.48,
          y,
          r * 0.12,
          0.14,
          0.22,
          m.metal,
          "closed pilot cap",
          8,
        );
      }
    }
    block(
      r * 1.45,
      0.18,
      0.3,
      m.metal,
      0,
      bottom + 0.5,
      0.055,
      "pilot manifold",
    );
  } else {
    const radius = Math.min(r * 0.76, height * 0.35);
    disc(0, cy, radius + 0.12, 0.2, 0.015, m.trim, "impeller bed", 32);
    ring(0, cy, radius, 0.15, "impeller rim");
    for (let j = 0; j < 12; j++) {
      const a = (j * Math.PI) / 6;
      const points = [
        [0.32, a],
        [radius * 0.92, a + 0.17],
        [radius * 0.88, a + 0.31],
        [0.32, a + 0.24],
      ].map(([rad, angle]) => [
        Math.cos(angle) * rad,
        cy + Math.sin(angle) * rad,
      ]);
      add(plate(points, 0.2), m.metal, 0, 0, 0.17, "swept impeller blade");
    }
    disc(0, cy, 0.35, 0.38, 0.1, m.metal, "impeller boss", 12);
    disc(0, cy, 0.16, 0.1, 0.31, m.trim, "boss cap", 8);
  }
}
