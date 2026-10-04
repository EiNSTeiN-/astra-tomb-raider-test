import * as THREE from "three";
import { skyChamberWallPlan, skyGateWallGeometry } from "./sky-gate-art.js";
import { mergeArchitecture } from "./visuals.js";

// Solid, shallow carvings belong to the exterior stone face. They do not add
// another furnishing footprint to the instrument or door's working space.
export function skyWindReliefGeometry(variant, width = 1) {
  const shape = new THREE.Shape();
  const points =
    variant === 0
      ? [
          [-1, 0.1],
          [-0.75, 0.24],
          [-0.38, 0.16],
          [0, -0.12],
          [0.38, 0.16],
          [0.75, 0.24],
          [1, 0.1],
          [0.62, -0.16],
          [0.32, -0.19],
          [0, -0.34],
          [-0.32, -0.19],
          [-0.62, -0.16],
        ]
      : variant === 1
        ? [
            [-1, -0.18],
            [-1, -0.05],
            [-0.38, 0.25],
            [0, 0.05],
            [0.38, 0.25],
            [1, -0.05],
            [1, -0.18],
            [0.38, 0.1],
            [0, -0.12],
            [-0.38, 0.1],
          ]
        : [
            [-1, -0.13],
            [-0.78, -0.13],
            [-0.78, 0.06],
            [-0.46, 0.06],
            [-0.46, 0.25],
            [-0.16, 0.25],
            [-0.16, 0.1],
            [0.16, 0.1],
            [0.16, 0.25],
            [0.46, 0.25],
            [0.46, 0.06],
            [0.78, 0.06],
            [0.78, -0.13],
            [1, -0.13],
            [1, -0.29],
            [0.62, -0.29],
            [0.62, -0.1],
            [0.3, -0.1],
            [0.3, -0.02],
            [-0.3, -0.02],
            [-0.3, -0.1],
            [-0.62, -0.1],
            [-0.62, -0.29],
            [-1, -0.29],
          ];
  points.forEach(([x, y], i) =>
    shape[i ? "lineTo" : "moveTo"]((x * width) / 2, y),
  );
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelSize: 0.009,
    bevelThickness: 0.009,
    bevelSegments: 1,
    steps: 1,
  });
}

export function buildSkyChamberWall({
  gate,
  side,
  length,
  floor,
  m,
  add,
  block,
  seed,
}) {
  const group = new THREE.Group(),
    angle = side === 0 ? Math.PI : (side * Math.PI) / 2,
    position = [side * 6.5, 0, side === 0 ? -6.5 : 0],
    plan = skyChamberWallPlan(length, gate.stage, side);
  group.name = `Cloud chamber ${gate.stage + 1}: carved outer wall ${side}`;
  group.position.set(...position);
  group.rotation.y = angle;
  gate.root.add(group);
  add(skyGateWallGeometry(length, floor, seed, plan), m.wall, 0, 0, 0, group);
  const half = length / 2;
  // All outer bands stay within the reserved 0.85 m wall half-width.
  const band = (y, height, depth) => {
    const count = Math.ceil(length / 2.1),
      step = length / count;
    for (let i = 0; i < count; i++)
      block(
        step + 0.015,
        height,
        depth,
        m.trim,
        -half + (i + 0.5) * step,
        y,
        0.43,
        group,
      );
  };
  band(0.43, 0.25, 0.35);
  band(plan.top + 0.21, 0.26, 0.4);
  band(6.63, 0.26, 0.4);
  for (const niche of plan.niches) {
    const { x, bottom, top, radius, head } = niche;
    block(
      radius * 2 + 0.26,
      0.21,
      0.99,
      m.trim,
      x,
      bottom + 0.035,
      0.035,
      group,
    );
    block(head * 2 + 0.34, 0.3, 1.06, m.trim, x, top + 0.055, 0.035, group);
    // Recessed tablets attach to their backing and carry a carved emblem.
    const center = (bottom + top) / 2,
      width = head * 1.55,
      height = Math.min(1.72, top - bottom - 0.7),
      plaqueZ = niche.backing + 0.095;
    block(width, height, 0.1, m.trim, x, center, plaqueZ, group);
    add(
      skyWindReliefGeometry(plan.variant, width * 0.84),
      m.metal,
      x,
      center + 0.16,
      plaqueZ + 0.045,
      group,
    );
    for (const yy of [-0.42, -0.64])
      block(
        width * 0.64,
        0.045,
        0.045,
        m.trim,
        x,
        center + yy,
        plaqueZ + 0.066,
        group,
      );
  }
  // Bird, crosswind and terraced panels have different proportions from the
  // return path; their continuous backing is the existing fitted masonry.
  const friezeY = (plan.top + 0.55 + 6.35) / 2,
    friezeHeight = 6.35 - plan.top - 0.55;
  for (const niche of plan.niches) {
    const width = Math.min(length / plan.niches.length - 0.55, 3.6);
    block(width, friezeHeight, 0.16, m.trim, niche.x, friezeY, 0.425, group);
    add(
      skyWindReliefGeometry(plan.variant, width * 0.84),
      m.metal,
      niche.x,
      friezeY + 0.08,
      0.495,
      group,
    );
  }
  mergeArchitecture(group);
  // Feed the face batches into the gate's existing material merge. A carved
  // wall should not submit one draw call for each band or small inscription.
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
  gate.root.remove(group);
  return { side, position, angle, length, floor, plan };
}
