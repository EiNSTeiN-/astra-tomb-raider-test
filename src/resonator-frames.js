import * as THREE from "three";
import { vaultStoneGeometry } from "./palace-geometry.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { mergeArchitecture } from "./visuals.js";
import { stationMeshSolid, stationSolid } from "./field-station-solids.js";

export function resonanceHardwareSolid(game, site, mesh, support = false) {
  const solid = stationMeshSolid(game, site.feature, mesh, {
    bodyPadding: support ? 0.57 : 0.35,
    support,
    supportRadius: 0,
    layeredSupport: true,
  });
  solid.resonanceHardware = true;
  solid.crouchPadding = support ? 0.64 : 0.5;
  return solid;
}

export function resonanceCollarSolid(game, site, body) {
  // Twelve turning teeth retain a finite circular envelope throughout easing
  // and wraparound. The centre is already occupied by the crystal/pedestal.
  const solid = stationSolid(
    game,
    site.feature,
    body,
    [2.18, 0.2, 2.18],
    [0, 1.43, 0],
    { radius: 1.09, bodyPadding: 0.35, support: false },
  );
  solid.resonanceHardware = true;
  solid.crouchPadding = 0.5;
  return solid;
}

const circle = (count, phase = -Math.PI / 2) =>
  Array.from({ length: count }, (_, i) => phase + (i * Math.PI * 2) / count);

export const RESONATOR_FRAMES = [
  {
    name: "Guide-light tripod",
    angles: circle(3, Math.PI / 2),
    height: 2.72,
    sides: 24,
  },
  {
    name: "Descending hood",
    angles: circle(3, Math.PI / 2),
    height: 3.18,
    sides: 12,
    hood: true,
  },
  {
    name: "Mirrored forks",
    angles: [0, Math.PI],
    height: 3.04,
    sides: 8,
    arch: true,
  },
  {
    name: "Ascending staves",
    angles: circle(3, Math.PI / 2),
    height: 3.46,
    sides: 16,
    steps: true,
  },
  {
    name: "Crossed counterpoint",
    angles: circle(4, Math.PI / 4),
    height: 3.12,
    sides: 12,
    crossed: true,
  },
  {
    name: "Mended conversation",
    angles: circle(4, Math.PI / 4),
    height: 2.94,
    sides: 10,
    mended: true,
  },
  {
    name: "Paired heart",
    angles: circle(4, Math.PI / 4),
    height: 3.36,
    sides: 8,
    paired: true,
  },
  {
    name: "Prismatic crown",
    angles: circle(6, 0),
    height: 3.58,
    sides: 12,
    crown: true,
  },
];

// A closed casting with a curved shoulder, made from an extruded radial
// section. Its lower end enters the pedestal and it meets both fixed collars.
export function resonatorStaveGeometry(angle, height) {
  const shape = new THREE.Shape();
  const outline = [
    [0.77, 0.91],
    [0.81, 1.12],
    [1.13, 1.29],
    [1.13, 1.58],
    [0.8, 1.76],
    [0.8, 2.36],
    [0.71, height],
    [0.85, height],
    [0.94, 2.36],
    [0.94, 1.8],
    [1.27, 1.64],
    [1.27, 1.23],
    [0.95, 1.02],
    [0.92, 0.91],
  ];
  outline.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.13,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -0.065);
  geometry.rotateY(angle);
  return geometry;
}

export function resonatorFootingGeometry(style, bottom) {
  // The continuous lower rim is buried below every covering terrain cell.
  // The upper dressed shoulder enters the existing bronze pedestal.
  const points = [
    [0, bottom],
    [1.1, bottom],
    [1.1, 0.015],
    [1.075, 0.07],
    [1.075, 0.105],
    [1.055, 0.105],
    [1.02, 0.315],
    [0, 0.315],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geometry = new THREE.LatheGeometry(points, style.sides);
  geometry.rotateY(Math.PI / style.sides);
  return geometry;
}

export function buildResonatorFrame(game, site, body, index, bronze, stone) {
  const style = RESONATOR_FRAMES[site.stage],
    root = new THREE.Group();
  root.name = style.name;
  body.add(root);
  const add = (geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const box = (w, h, d, x, y, z) =>
    add(new THREE.BoxGeometry(w, h, d), bronze, x, y, z);
  const ring = (radius, y, thickness = 0.045) => {
    const mesh = add(
      new THREE.TorusGeometry(radius, thickness, 6, 40),
      bronze,
      0,
      y,
      0,
    );
    mesh.rotation.x = Math.PI / 2;
  };
  const centre = body.getWorldPosition(new THREE.Vector3());
  const bottom =
    footprintMinimum(
      (x, z) => game.groundHeight(x, z),
      centre.x,
      centre.z,
      2.7,
      2.7,
      game.terrainProfile?.step,
    ) -
    centre.y -
    0.18;
  const footing = add(resonatorFootingGeometry(style, bottom), stone);
  // Keep the foundation with the permanent pedestal. Fine cage fittings use
  // the existing detail range, but their base must not disappear beneath it.
  root.remove(footing);
  site.root.add(footing);
  footing.position.copy(body.position);
  resonanceHardwareSolid(game, site, footing, true);
  game.cameraSurfaces?.capture(footing, {
    small: true,
    thin: true,
    cylinderAxis: "y",
  });
  for (const [stave, angle] of style.angles.entries()) {
    const top = style.steps
      ? style.height - ((index + stave) % 3) * 0.12
      : style.height;
    add(resonatorStaveGeometry(angle, top), bronze);
  }
  // The shaft enters a bearing seated on the pedestal. It reaches the existing
  // wheel plane without moving the operator position or its two hand targets.
  box(0.34, 0.3, 0.4, 0, 0.96, 0.8);
  const axle = add(
    new THREE.CylinderGeometry(0.105, 0.105, 0.44, 12),
    bronze,
    0,
    1.07,
    0.96,
  );
  axle.rotation.x = Math.PI / 2;
  add(new THREE.TorusGeometry(0.16, 0.045, 6, 24), bronze, 0, 1.07, 1.02);
  // Inscription brackets have finite overlap with both the pedestal/cage and
  // the existing backing plates. Their text remains at its original position.
  for (const x of [-0.5, 0.5]) {
    box(0.075, 0.1, 0.63, x, 0.65, 0.94);
    // The reading plate hangs from the fixed upper ring. A pedestal-mounted
    // upright here would cross the turning collar and its twelve ticks.
    box(0.075, 0.53, 0.075, x, 2.105, 0.7);
    box(0.075, 0.1, 0.4, x, 1.86, 0.83);
  }
  const arch = (offset, side = false, rise = 1) => {
    const geometry = vaultStoneGeometry(0.77, 0.88, 0, Math.PI, 0.14, 20);
    geometry.scale(1, rise, 1);
    if (side) geometry.rotateY(Math.PI / 2);
    geometry.translate(side ? offset : 0, 2.31, side ? 0 : offset);
    add(geometry, bronze);
    for (const sign of [-1, 1])
      add(
        new THREE.CylinderGeometry(0.055, 0.055, 2.31 - bottom, 8),
        bronze,
        side ? offset : sign * 0.825,
        (2.31 + bottom) / 2,
        side ? sign * 0.825 : offset,
      );
  };
  if (style.hood) arch(-0.84, false, 1.08);
  if (style.arch) {
    arch(-0.84);
    arch(0.84);
  }
  if (style.crossed) {
    arch(-0.84, true, 1.12);
    arch(0.84, true, 1.12);
  }
  if (style.paired) {
    ring(0.77, 2.7, 0.06);
    ring(0.76, 3.08, 0.055);
  }
  if (style.mended) {
    // Seated splice straps express the repaired conversation, without detached
    // metal fragments above the player or unsupported broken staves.
    for (const angle of style.angles) {
      const strap = box(
        0.25,
        0.34,
        0.16,
        Math.cos(angle) * 0.88,
        2.14,
        -Math.sin(angle) * 0.88,
      );
      strap.rotation.y = angle + Math.PI / 2;
    }
  }
  if (style.crown) ring(0.76, 3.54, 0.05);
  // Preserve individual casting bounds before material batching. The collar
  // bypass protrudes beyond the earlier central crystal proxy.
  for (const mesh of root.children)
    game.cameraSurfaces?.capture(mesh, {
      small: true,
      thin: true,
      cylinderAxis: mesh.geometry.type === "CylinderGeometry" ? "y" : null,
    });
  mergeArchitecture(root);
  for (const mesh of root.children) resonanceHardwareSolid(game, site, mesh);
  return { root, style, bottom };
}
