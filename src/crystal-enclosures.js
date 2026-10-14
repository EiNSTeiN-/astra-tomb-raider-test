import * as THREE from "three";
import { buildChamberWall } from "./chamber-walls.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { quartzGeometry } from "./cavern-geometry.js";
import { mergeArchitecture } from "./visuals.js";
import { stationMeshSolid } from "./field-station-solids.js";
import { crystalVaultPlan } from "./crystal-vaults.js";

import {
  crystalEnclosurePlan,
  crystalEnclosureSegments,
} from "./crystal-enclosure-plan.js";
export {
  crystalEnclosurePlan,
  crystalEnclosureSegments,
} from "./crystal-enclosure-plan.js";

function wallBays(segment, piers) {
  const c = Math.cos(segment.angle),
    s = Math.sin(segment.angle);
  let spaces = [[-segment.length / 2 + 0.35, segment.length / 2 - 0.35]];
  for (const p of piers) {
    const corners = [
      [p.minX, p.minZ],
      [p.minX, p.maxZ],
      [p.maxX, p.minZ],
      [p.maxX, p.maxZ],
    ];
    const tangent = corners.map(
      ([x, z]) => (x - segment.x) * c - (z - segment.z) * s,
    );
    const normal = corners.map(
      ([x, z]) => (x - segment.x) * s + (z - segment.z) * c,
    );
    if (Math.min(...normal) > 0.8 || Math.max(...normal) < -0.5) continue;
    const lo = Math.min(...tangent) - 0.14,
      hi = Math.max(...tangent) + 0.14;
    spaces = spaces.flatMap(([a, b]) =>
      hi <= a || lo >= b
        ? [[a, b]]
        : [
            [a, Math.min(b, lo)],
            [Math.max(a, hi), b],
          ].filter(([x, y]) => y > x),
    );
  }
  const bays = [];
  let spacing = Infinity;
  for (const [a, b] of spaces) {
    const length = b - a;
    if (length < 1.25) continue;
    const count = Math.max(1, Math.floor(length / 2.8)),
      step = length / count;
    spacing = Math.min(spacing, step);
    for (let i = 0; i < count; i++) bays.push(a + (i + 0.5) * step);
  }
  return { bays, radius: bays.length ? Math.min(0.95, spacing * 0.3) : 0.5 };
}

export function buildCrystalEnclosure(game, gate, materials) {
  if (game.level.biome !== "crystal" || gate.stage === 0) return false;
  const plan = crystalEnclosurePlan(gate.stage),
    root = new THREE.Group();
  root.name = plan.name;
  gate.root.add(root);
  const host = { ...gate, root },
    walls = [],
    feature = { id: `crystal-envelope-${gate.stage}`, stationSolids: [] };
  let serial = game.level.seed + gate.stage * 419;
  let assembly = root;
  const add = (geometry, material, x, y, z, angle = 0, capture = true) => {
    // The shared wall inlay is a standard material; its batches do not use
    // the custom mineral attributes needed by the animated tuning stones.
    geometry.deleteAttribute("mineralCoord");
    geometry.deleteAttribute("mineralShape");
    if (geometry.attributes.color && !material.vertexColors)
      geometry.deleteAttribute("color");
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = angle;
    mesh.castShadow = mesh.receiveShadow = true;
    assembly.add(mesh);
    if (capture)
      game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
    return mesh;
  };
  const block = (w, h, d, mat, x, y, z, angle = 0) =>
    add(stoneBlockGeometry(w, h, d, ++serial, 0.018), mat, x, y, z, angle);
  const floor = (x, z) =>
    game.groundHeight(gate.root.position.x + x, gate.root.position.z + z) -
    gate.root.position.y;
  const minimum = (x, z, w, d) =>
    footprintMinimum(
      (px, pz) => floor(px, pz),
      x,
      z,
      w,
      d,
      game.terrainProfile?.step || 1.75,
    );
  // The unchanged vault ribs still bear at their original six springing
  // positions. Closed dressed piers carry the rear and middle ends where a
  // new reading wing moves the wall away from the original side line.
  const vault = crystalVaultPlan(gate.stage);
  const joints = [
    ...plan.points.slice(1, -1),
    ...[-1, 1].flatMap((side) => [
      [side * 6.5, 0],
      [side * 6.5, -6.5],
    ]),
  ].map(([x, z]) => [x, Math.abs(x) === 6.5 && z === 0 ? -0.8 : z]);
  if (vault.screen)
    for (const x of [-5.9, -1.95, 1.95, 5.9]) joints.push([x, -6.5]);
  // A transverse rear portal carries a longitudinal rib when the new apse
  // moves its enclosing wall farther back. Its two piers leave a real aisle.
  if (vault.spine && [6, 7].includes(gate.stage)) {
    for (const x of [-1.95, 1.95]) joints.push([x, -6.47]);
    block(5.3, 0.38, 1.1, materials.trim, 0, 7.02, -6.47);
  }
  const unique = new Map(joints.map((p) => [p.join(","), p]));
  const piers = [];
  for (const [x, z] of unique.values()) {
    let p = { minX: x - 0.7, maxX: x + 0.7, minZ: z - 0.7, maxZ: z + 0.7 };
    let joined;
    do {
      joined = false;
      for (let i = 0; i < piers.length; i++) {
        const q = piers[i];
        if (
          p.minX > q.maxX + 0.18 ||
          q.minX > p.maxX + 0.18 ||
          p.minZ > q.maxZ + 0.18 ||
          q.minZ > p.maxZ + 0.18
        )
          continue;
        p = {
          minX: Math.min(p.minX, q.minX),
          maxX: Math.max(p.maxX, q.maxX),
          minZ: Math.min(p.minZ, q.minZ),
          maxZ: Math.max(p.maxZ, q.maxZ),
        };
        piers.splice(i, 1);
        joined = true;
        break;
      }
    } while (joined);
    piers.push(p);
  }
  for (const [index, segment] of crystalEnclosureSegments(
    gate.stage,
  ).entries()) {
    const c = Math.abs(Math.cos(segment.angle)),
      s = Math.abs(Math.sin(segment.angle));
    const bottom = Math.min(
      0,
      minimum(
        segment.x,
        segment.z,
        c * segment.length + s * 1.6,
        s * segment.length + c * 1.6,
      ) - 0.18,
    );
    block(
      segment.length + 0.03,
      0.13 - bottom,
      1.6,
      materials.trim,
      segment.x,
      (bottom + 0.13) / 2,
      segment.z,
      segment.angle,
    );
    walls.push(
      buildChamberWall(game, host, materials, {
        length: segment.length + 0.03,
        side: index === 0 ? 1 : index === plan.points.length - 2 ? -1 : 0,
        floor: bottom,
        transform: segment,
        bayLayout: wallBays(segment, piers),
      }),
    );
    block(
      segment.length + 0.03,
      0.25,
      1.0,
      materials.trim,
      segment.x,
      7.13,
      segment.z,
      segment.angle,
    );
  }
  for (const p of piers) {
    const x = (p.minX + p.maxX) / 2,
      z = (p.minZ + p.maxZ) / 2,
      w = p.maxX - p.minX,
      d = p.maxZ - p.minZ;
    const bottom = minimum(x, z, w + 0.18, d + 0.18) - 0.18;
    // A continuous recessed bed seals the joints. Separate dressed courses
    // keep the tall load-bearing piers from reading as stretched slabs.
    block(
      w - 0.04,
      7.18 - bottom,
      d - 0.04,
      materials.dark,
      x,
      (7.18 + bottom) / 2,
      z,
    );
    const count = Math.ceil((7.18 - bottom) / 0.82),
      course = (7.18 - bottom) / count;
    for (let row = 0; row < count; row++) {
      const lo = bottom + row * course,
        hi = bottom + (row + 1) * course;
      add(
        stoneBlockGeometry(w, hi - lo - 0.016, d, ++serial, 0.018),
        materials.wall,
        x,
        (lo + hi) / 2,
        z,
        0,
        false,
      );
    }
    block(w + 0.18, 0.32, d + 0.18, materials.trim, x, 7.0, z);
    block(w + 0.18, 0.24, d + 0.18, materials.trim, x, bottom + 0.12, z);
  }
  const register = (group, bodyPadding) => {
    group.updateWorldMatrix(true, true);
    return group.children.filter((mesh) => mesh.isMesh).map((mesh) =>
      stationMeshSolid(game, feature, mesh, {
        support: false,
        bodyPadding,
      }),
    );
  };
  // Copy the wall kernels before adding the cases. Their aisle margin stays
  // separate from the larger radius needed by knees during a crouch transition.
  mergeArchitecture(root, 1);
  const wallSolids = register(root, 0.4);
  const displays = new THREE.Group();
  root.add(displays);
  assembly = displays;
  for (const [caseIndex, [x, z, angle, width]] of plan.cases.entries()) {
    const c = Math.abs(Math.cos(angle)),
      s = Math.abs(Math.sin(angle));
    const bottom =
      minimum(x, z, c * width + s * 1.0, s * width + c * 1.0) - 0.12;
    let high = -Infinity;
    for (const dx of [-width / 2, 0, width / 2])
      for (const dz of [-0.5, 0.5])
        high = Math.max(
          high,
          floor(
            x + dx * Math.cos(angle) + dz * Math.sin(angle),
            z - dx * Math.sin(angle) + dz * Math.cos(angle),
          ),
        );
    const level = high + 0.32;
    block(
      width,
      level - bottom,
      0.9,
      materials.wall,
      x,
      (level + bottom) / 2,
      z,
      angle,
    );
    const point = (px, pz = 0) => [
      x + px * Math.cos(angle) + pz * Math.sin(angle),
      z - px * Math.sin(angle) + pz * Math.cos(angle),
    ];
    for (const height of [0.05, 0.78, 1.52]) {
      const slab = stoneBlockGeometry(
          width + 0.05,
          0.12,
          0.94,
          ++serial,
          0.012,
        ),
        positions = slab.attributes.position;
      for (let i = 0; i < positions.count; i++)
        if (positions.getY(i) > 0) positions.setY(i, 0.06);
      slab.computeVertexNormals();
      add(
        slab,
        height === 0.78 ? materials.metal : materials.trim,
        x,
        level + height,
        z,
        angle,
      );
    }
    for (const side of [-1, 1]) {
      const p = point(side * (width / 2 - 0.1));
      block(0.16, 1.48, 0.92, materials.trim, p[0], level + 0.79, p[1], angle);
    }
    for (let i = 0; i < Math.max(2, Math.floor(width / 0.65)); i++) {
      const count = Math.max(2, Math.floor(width / 0.65)),
        p = point(((i + 0.5) * (width - 0.35)) / count - (width - 0.35) / 2);
      for (let row = 0; row < 2; row++)
        add(
          quartzGeometry(
            0.14,
            0.4 + ((i + row + caseIndex) % 3) * 0.08,
            gate.stage + i * 0.2,
          ),
          materials.inlay,
          p[0],
          level + 0.11 + row * 0.73,
          p[1],
          angle,
        );
    }
  }
  mergeArchitecture(displays, 1);
  const displaySolids = register(displays, 0.65);
  // Kernels own their copied triangles. Rendering can still combine both
  // constructions by material without filling the room with broad bounds.
  for (const mesh of [...displays.children]) root.add(mesh);
  // Retain the empty parent until the primitive camera captures are consumed.
  mergeArchitecture(root, 2);
  gate.walls = walls;
  gate.enclosure = {
    root,
    plan,
    feature,
    wallSolids,
    displaySolids,
    segments: crystalEnclosureSegments(gate.stage),
  };
  return true;
}
