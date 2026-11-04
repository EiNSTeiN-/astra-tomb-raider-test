import * as THREE from "three";
import { crownPrism } from "./desert-crowns.js";

const ellipse = (rx, ry, count = 48, angle = 0) =>
  Array.from({ length: count }, (_, i) => {
    const a = angle + (i * Math.PI * 2) / count;
    return [Math.cos(a) * rx, Math.sin(a) * ry];
  });
const scale = (points, n) => points.map(([x, y]) => [x * n, y * n]);

// The centre and two optical normals remain shared by all nine instruments.
// Their bronze cases record the local trial through their physical silhouette.
export function solarReflectorPlan(stage) {
  let name, glass;
  switch (stage) {
    case 0:
      name = "Balance collector";
      glass = [
        [-0.9, -0.7],
        [0.9, -0.7],
        [1.0, -0.5],
        [1.0, 0.5],
        [0.9, 0.7],
        [-0.9, 0.7],
        [-1.0, 0.5],
        [-1.0, -0.5],
      ];
      break;
    case 1:
      name = "Dawn disc";
      glass = ellipse(0.94, 0.94);
      break;
    case 2:
      name = "Aqueduct arch";
      glass = [
        [-0.9, -0.8],
        [0.9, -0.8],
        ...Array.from({ length: 25 }, (_, i) => [
          0.9 * Math.cos((i * Math.PI) / 24),
          0.82 * Math.sin((i * Math.PI) / 24),
        ]),
      ];
      // The half-circle runs right to left along the upper edge.
      break;
    case 3:
      name = "Noon filter";
      glass = ellipse(1.02, 1.02, 8, Math.PI / 8);
      break;
    case 4:
      name = "Ephemeris hexagon";
      glass = ellipse(1.04, 1.04, 6, Math.PI / 6);
      break;
    case 5:
      name = "Eastern wing";
      glass = [
        [-0.76, -0.78],
        [0.76, -0.78],
        [1.02, 0.58],
        [0.76, 0.85],
        [-0.76, 0.85],
        [-1.02, 0.58],
      ];
      break;
    case 6:
      name = "Light-well oculus";
      glass = ellipse(1.04, 0.8);
      break;
    case 7:
      name = "Relay prism";
      glass = [
        [-1.04, -0.4],
        [-0.62, -0.8],
        [0.62, -0.8],
        [1.04, -0.4],
        [1.04, 0.4],
        [0.62, 0.8],
        [-0.62, 0.8],
        [-1.04, 0.4],
      ];
      break;
    case 8:
      name = "Sepulchre crown";
      glass = [
        [-0.9, -0.8],
        [0.9, -0.8],
        [0.9, 0.55],
        [0.62, 0.55],
        [0.62, 0.78],
        [0.32, 0.78],
        [0.32, 0.98],
        [-0.32, 0.98],
        [-0.32, 0.78],
        [-0.62, 0.78],
        [-0.62, 0.55],
        [-0.9, 0.55],
      ];
      break;
    default:
      throw new RangeError("Unknown solar reflector");
  }
  return { stage, name, glass, outer: scale(glass, 1.13) };
}

function convexPlanes(points, depth, vertices) {
  // The stepped crown uses its convex hull for the camera; the reflective
  // centre is filled, and these tiny upper notches are outside a near plane.
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, c) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (p) => {
    const h = [];
    for (const v of p) {
      while (h.length > 1 && cross(h.at(-2), h.at(-1), v) <= 0) h.pop();
      h.push(v);
    }
    return h;
  };
  const hull = [
    ...half(sorted).slice(0, -1),
    ...half([...sorted].reverse()).slice(0, -1),
  ];
  const planes = [
    [0, 0, 1, depth / 2],
    [0, 0, -1, depth / 2],
  ];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i],
      b = hull[(i + 1) % hull.length],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy),
      nx = dy / length,
      ny = -dx / length;
    planes.push([
      nx,
      ny,
      0,
      Math.max(...vertices.map(([x, y]) => nx * x + ny * y)) + 0.001,
    ]);
  }
  return planes;
}

export function buildSolarReflector(game, pivot, bronze, stage, glassMaterial) {
  const plan = solarReflectorPlan(stage),
    meshes = [];
  const add = (geometry, material, z, name) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = z;
    mesh.name = `${plan.name}: ${name}`;
    mesh.castShadow = mesh.receiveShadow = true;
    pivot.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  const face = glassMaterial
    ? add(
        new THREE.ShapeGeometry(
          new THREE.Shape(plan.glass.map((p) => new THREE.Vector2(...p))),
        ),
        glassMaterial,
        0,
        "silvered aperture",
      )
    : null;
  if (face) face.receiveShadow = false;
  add(
    crownPrism(plan.outer, 0.16, [scale(plan.glass, 0.985)], 0.012),
    bronze,
    0,
    "closed bezel",
  );
  const back = add(
    crownPrism(scale(plan.outer, 0.98), 0.08, [], 0.01),
    bronze,
    -0.08,
    "rear casting",
  );
  const neck = add(
    new THREE.BoxGeometry(0.3, 0.6, 0.06),
    bronze,
    -0.1,
    "spindle saddle",
  );
  neck.position.y = -0.96;
  game.cameraSurfaces?.capture(neck, { small: true, thin: true });
  const line = (ax, ay, bx, by, width = 0.06) => {
    const dx = bx - ax,
      dy = by - ay,
      n = Math.hypot(dx, dy),
      x = ((-dy / n) * width) / 2,
      y = ((dx / n) * width) / 2;
    add(
      crownPrism(
        [
          [ax + x, ay + y],
          [ax - x, ay - y],
          [bx - x, by - y],
          [bx + x, by + y],
        ],
        0.025,
        [],
        0.005,
      ),
      bronze,
      -0.14,
      "rear rib",
    );
  };
  if ([1, 3, 6].includes(stage)) {
    for (const r of [stage === 6 ? 0.48 : 0.42, 0.25])
      add(new THREE.TorusGeometry(r, 0.018, 6, 40), bronze, -0.14, "rear dial");
    const rays = stage === 3 ? 8 : stage === 6 ? 4 : 12;
    for (let i = 0; i < rays; i++) {
      const a = (i * Math.PI * 2) / rays;
      line(
        Math.cos(a) * 0.46,
        Math.sin(a) * 0.46,
        Math.cos(a) * 0.59,
        Math.sin(a) * 0.59,
        0.04,
      );
    }
  } else if (stage === 2) {
    for (const x of [-0.42, 0, 0.42]) line(x, -0.56, x, 0.5);
    line(-0.55, -0.35, 0.55, -0.35);
  } else if (stage === 4) {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3,
        b = a + Math.PI / 3;
      line(
        Math.cos(a) * 0.55,
        Math.sin(a) * 0.55,
        Math.cos(b) * 0.55,
        Math.sin(b) * 0.55,
      );
    }
    line(0, -0.5, 0, 0.5);
  } else if (stage === 7) {
    for (const y of [-0.4, 0, 0.4]) line(-0.55, y, 0.55, y);
    line(-0.35, -0.55, -0.35, 0.55);
    line(0.35, -0.55, 0.35, 0.55);
  } else if (stage === 8) {
    for (const [y, w] of [
      [-0.5, 1.1],
      [-0.16, 0.85],
      [0.18, 0.6],
      [0.5, 0.32],
    ])
      line(-w / 2, y, w / 2, y, 0.09);
  } else {
    line(-0.58, -0.5, 0.58, 0.5, 0.085);
    line(-0.58, 0.5, 0.58, -0.5, 0.085);
    if (stage === 0) line(-0.6, 0, 0.6, 0, 0.075);
  }
  // One filled, finite case envelope follows the actual turn. Convex planes
  // preserve round/angled corners instead of treating every case as a box.
  const proxy = new THREE.Mesh(crownPrism(plan.outer, 0.36, [], 0.012), bronze);
  pivot.add(proxy);
  const caseVertices = meshes
    .filter((mesh) => mesh !== neck)
    .flatMap((mesh) => {
      const p = mesh.geometry.attributes.position;
      return Array.from({ length: p.count }, (_, i) => [
        p.getX(i) + mesh.position.x,
        p.getY(i) + mesh.position.y,
      ]);
    });
  game.cameraSurfaces?.capture(proxy, {
    small: true,
    // Mitred step corners extend diagonally beyond a uniform edge offset.
    planes: convexPlanes(plan.outer, 0.36, caseVertices),
  });
  pivot.remove(proxy);
  proxy.geometry.dispose();
  pivot.userData.solarReflector = {
    stage,
    name: plan.name,
    glass: plan.glass,
    outer: plan.outer,
  };
  // Read the delivered bevel, including mitred tips, rather than estimating
  // its vertical extent from the un-bevelled outline.
  const top = Math.max(
    ...meshes.map((mesh) => {
      mesh.geometry.computeBoundingBox();
      return mesh.position.y + mesh.geometry.boundingBox.max.y;
    }),
  );
  return { face, meshes, back, plan, top };
}
