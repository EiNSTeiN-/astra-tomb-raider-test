import * as THREE from "three";
import { forgeBayContour } from "./forge-wall-art.js";

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

// Cold service covers on the inner backs of the forge's blind wall bays.
// The inward face points along the wall's negative Z.
// Cover backs enter the existing panel; all fittings stay inside its old sill.
export function buildForgeServiceBay(plan, cx, bay, m, place) {
  const r = plan.radius * 0.72,
    bottom = 1.45 + (plan.bottom - 1.2) * 0.76,
    top = 1.45 + (plan.top - 1.2) * 0.76,
    cy = (bottom + top) / 2,
    h = top - bottom;
  const add = (g, material, x, y, z, name) => {
    if (name === "cast cover") {
      // Keep the metal's physical scale and grain direction, but avoid the
      // same conspicuous paint loss on every neighbouring access plate.
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(
          i,
          uv.getX(i) + bay * 0.37 + plan.stage * 0.19,
          uv.getY(i) + bay * 0.23 + plan.stage * 0.41,
        );
    }
    const mesh = place(g, material, cx + x, y, z);
    mesh.name = `Forge inner ${plan.kind}: ${name}`;
    return mesh;
  };
  const box = (w, height, depth, mat, x, y, z, name) =>
    add(new THREE.BoxGeometry(w, height, depth), mat, x, y, z, name);
  const disc = (x, y, radius, depth, z, mat, name, segments = 24) => {
    const mesh = add(
      new THREE.CylinderGeometry(radius, radius, depth, segments),
      mat,
      x,
      y,
      z,
      name,
    );
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  const beam = (a, b, width, depth, mat, z, name) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const mesh = box(
      width,
      Math.hypot(dx, dy) + width * 0.1,
      depth,
      mat,
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      z,
      name,
    );
    mesh.rotation.z = -Math.atan2(dx, dy);
    return mesh;
  };
  const bolt = (x, y, z = -0.496) =>
    disc(x, y, 0.043, 0.04, z, m.metal, "cover bolt", 6);
  const contour = forgeBayContour(plan).map(([x, y]) => [
    x * 0.72 * 0.88,
    cy + (1.45 + (y - 1.2) * 0.76 - cy) * 0.9,
  ]);
  add(plate(contour, 0.032), m.metal, 0, 0, -0.47, "cast cover");
  for (let j = 0; j < contour.length; j++)
    beam(
      contour[j],
      contour[(j + 1) % contour.length],
      0.035,
      0.035,
      m.metal,
      -0.484,
      "cast edge bead",
    );
  for (const x of [-0.68, 0.68])
    for (const y of [-0.23, 0.23]) {
      box(0.13, 0.23, 0.055, m.metal, x * r, cy + y * h, -0.485, "hinge lug");
      bolt(x * r, cy + y * h);
    }
  // Short cast marks distinguish access leaves without adding puzzle labels.
  for (let j = 0; j <= bay; j++)
    box(
      0.035,
      0.1,
      0.018,
      m.dark,
      (j - bay / 2) * 0.085,
      bottom + h * 0.14,
      -0.492,
      "access mark",
    );

  if (plan.kind === "intake") {
    for (const x of [-0.62, 0.62])
      box(0.075, h * 0.58, 0.05, m.metal, x * r, cy, -0.495, "louver rail");
    for (let j = 0; j < 7; j++) {
      const blade = box(
        r * 1.28,
        0.11,
        0.06,
        m.metal,
        0,
        cy + (j - 3) * h * 0.075,
        -0.497,
        "intake louver",
      );
      blade.rotation.x = 0.32;
    }
  } else if (plan.kind === "ignition") {
    for (let j = 0; j < 5; j++)
      box(
        r * (1.25 - j * 0.07),
        0.26,
        0.065,
        m.trim,
        0,
        cy + (j - 2) * h * 0.115,
        -0.487,
        "refractory baffle",
      );
    for (const sign of [-1, 1])
      beam(
        [sign * r * 0.6, cy - h * 0.26],
        [sign * r * 0.27, cy + h * 0.26],
        0.065,
        0.045,
        m.metal,
        -0.52,
        "baffle keeper",
      );
  } else if (plan.kind === "relief") {
    disc(0, cy, r * 0.64, 0.045, -0.484, m.trim, "pressure casing");
    add(
      new THREE.TorusGeometry(r * 0.52, 0.025, 6, 40),
      m.metal,
      0,
      cy,
      -0.508,
      "pressure bead",
    );
    disc(0, cy, r * 0.4, 0.045, -0.513, m.metal, "diaphragm cover");
    for (let j = 0; j < 8; j++) {
      const a = (j * Math.PI) / 4;
      disc(
        Math.cos(a) * r * 0.53,
        cy + Math.sin(a) * r * 0.53,
        0.035,
        0.032,
        -0.506,
        m.metal,
        "pressure flange bolt",
        6,
      );
    }
    box(
      0.15,
      h * 0.25,
      0.05,
      m.metal,
      0,
      cy - h * 0.24,
      -0.493,
      "lower pressure boss",
    );
  } else if (plan.kind === "gears") {
    disc(0, cy, r * 0.65, 0.05, -0.485, m.trim, "gear inspection casting", 12);
    for (let j = 0; j < 8; j++) {
      const a = (j * Math.PI) / 4,
        point = (n) => [Math.cos(a) * r * n, cy + Math.sin(a) * r * n];
      beam(
        point(0.17),
        point(0.58),
        0.075,
        0.04,
        m.metal,
        -0.515,
        "radial casting rib",
      );
    }
    disc(0, cy, r * 0.23, 0.045, -0.518, m.metal, "axle access cap", 12);
    for (const x of [-0.14, 0.14]) bolt(x * r, cy, -0.545);
  } else if (plan.kind === "feeds") {
    for (const sign of [-1, 1]) {
      box(
        r * 0.48,
        h * 0.53,
        0.055,
        m.trim,
        sign * r * 0.3,
        cy,
        -0.482,
        "feed mould leaf",
      );
      box(
        0.075,
        h * 0.61,
        0.06,
        m.metal,
        sign * r * 0.62,
        cy,
        -0.49,
        "mould rail",
      );
    }
    for (const dy of [-0.2, 0, 0.2])
      box(r * 1.3, 0.095, 0.055, m.metal, 0, cy + dy * h, -0.514, "feed clamp");
  } else if (plan.kind === "pilots") {
    for (const x of [-0.48, 0, 0.48]) {
      add(
        new THREE.CylinderGeometry(0.055, 0.055, h * 0.53, 12),
        m.metal,
        x * r,
        cy,
        -0.488,
        "pilot service line",
      );
      for (const dy of [-0.24, 0.24])
        add(
          new THREE.CylinderGeometry(0.075, 0.075, 0.09, 12),
          m.metal,
          x * r,
          cy + dy * h,
          -0.488,
          "line collar",
        );
    }
    const feed = add(
      new THREE.CylinderGeometry(0.053, 0.053, r * 1.12, 12),
      m.metal,
      0,
      cy - h * 0.17,
      -0.489,
      "pilot header",
    );
    feed.rotation.z = Math.PI / 2;
  } else if (plan.kind === "fins") {
    for (let j = -4; j <= 4; j++)
      box(
        0.065,
        h * (0.59 - Math.abs(j) * 0.025),
        0.075,
        m.metal,
        j * r * 0.14,
        cy,
        -0.493,
        "cooling rib",
      );
    for (const dy of [-0.2, 0.2])
      box(r * 1.3, 0.1, 0.045, m.metal, 0, cy + dy * h, -0.533, "fin strap");
    for (const x of [-0.48, 0.48])
      disc(x * r, cy, 0.18, 0.04, -0.53, m.trim, "coolant access cap", 12);
  } else if (plan.kind === "heart") {
    disc(0, cy, r * 0.65, 0.05, -0.486, m.trim, "rotor service casting", 8);
    for (let j = 0; j < 6; j++) {
      const a = (j * Math.PI) / 3,
        at = (radius, angle) => [
          Math.cos(angle) * r * radius,
          cy + Math.sin(angle) * r * radius,
        ];
      add(
        plate(
          [
            at(0.16, a),
            at(0.56, a + 0.28),
            at(0.56, a + 0.48),
            at(0.16, a + 0.4),
          ],
          0.035,
        ),
        m.metal,
        0,
        0,
        -0.52,
        "swept cover rib",
      );
    }
    disc(0, cy, r * 0.22, 0.045, -0.518, m.metal, "rotor access cap", 12);
  }
  return { kind: plan.kind, bay, radius: r, bottom, top };
}
