import * as THREE from "three";
import { random } from "./campaign.js";
import { desertRouteDistance } from "./desert-geology.js";
import { scoriaDeposit } from "./volcanic-geology.js";
import { inThermalCourt } from "./thermal-rules.js";
import { natureRockAllowed, placeNatureRock } from "./nature-rocks.js";
import { stoneFootprint } from "./stone-grounding.js";
import { createLodPatch } from "./instance-lod.js";
import { volcanicBoulderMaterial } from "./volcanic-material.js";

export function scoriaGeometry(variant, slope = 0) {
  const geometry = new THREE.IcosahedronGeometry(1, 1),
    p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      grain = Math.sin(x * 9.3 + y * 13.7 + z * 11.1 + variant * 7.9),
      radius = 0.91 + grain * 0.09;
    p.setXYZ(
      i,
      x * radius,
      Math.max(-0.32, y * (0.55 + variant * 0.08)) * radius,
      z * (0.74 + variant * 0.08) * radius,
    );
  }
  // Bake the bank angle into each shared shape. Instance transforms remain
  // upright so their delivered triangles also serve the physical rock kernel.
  geometry.rotateZ(Math.atan(slope));
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox.min.y, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// Discontinuous deposits break up the ash banks. Reserve a whole footprint and
// a walking margin, rather than placing large fragments by their origins only.
export function volcanicMantleLayout(game) {
  if (game.level.biome !== "volcano") return [];
  const rng = random(game.level.seed + 78331),
    extent = game.map.size * 7,
    fragments = [];
  for (let z = 3; z < extent - 3; z += 1.6)
    for (let x = 3; x < extent - 3; x += 1.6) {
      const px = x + (rng() - 0.5) * 1.35,
        pz = z + (rng() - 0.5) * 1.35,
        pick = rng(),
        size = 0.32 + Math.pow(rng(), 2) * 1.15,
        heading = rng() * Math.PI * 2,
        form = Math.floor(rng() * 3),
        radius = size * 1.55,
        tint = 0.8 + rng() * 0.2;
      const density = scoriaDeposit(px, pz, game.level.seed);
      if (
        pick > density ||
        desertRouteDistance(game.map, px, pz) < radius + 2.8 ||
        game.terrainProfile.court(px, pz) > 0.18 ||
        inThermalCourt(game.map, px, pz) ||
        !natureRockAllowed(game, px, pz, radius)
      )
        continue;
      const slopeX =
          game.terrainProfile.height(px + 0.5, pz) -
          game.terrainProfile.height(px - 0.5, pz),
        slopeZ =
          game.terrainProfile.height(px, pz + 0.5) -
          game.terrainProfile.height(px, pz - 0.5),
        incline = Math.min(3, Math.round(Math.hypot(slopeX, slopeZ) / 0.35)),
        variant = form + incline * 3,
        yaw = incline ? Math.atan2(-slopeZ, slopeX) : heading;
      fragments.push({ x: px, z: pz, size, yaw, variant, radius, tint });
    }
  return fragments;
}

function clipGroundEdge(polygon, a, b) {
  const out = [],
    side = (p) => (b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]);
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i],
      q = polygon[(i + 1) % polygon.length],
      u = side(p),
      v = side(q);
    if (u <= 0) out.push(p);
    if ((u < 0 && v > 0) || (u > 0 && v < 0)) {
      const t = u / (u - v);
      out.push(p.map((value, axis) => value + (q[axis] - value) * t));
    }
  }
  return out;
}

// Both surfaces are affine inside each clipped overlap. Its vertices therefore
// bound every lower-face clearance, including edges missed by footprint rays.
export function seatScoriaTriangles(profile, shape, placed) {
  const matrix = placed.matrix.clone(),
    flat = matrix.clone(),
    p = shape.geometry.attributes.position,
    index = shape.geometry.index,
    step = profile.step,
    point = new THREE.Vector3();
  flat.elements[13] = 0;
  let base = matrix.elements[13];
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const triangle = [0, 1, 2].map((j) =>
      point
        .fromBufferAttribute(p, index ? index.getX(i + j) : i + j)
        .applyMatrix4(flat)
        .toArray(),
    );
    const [a, b, c] = triangle;
    if ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) >= -1e-10)
      continue;
    const xs = triangle.map((p) => p[0]),
      zs = triangle.map((p) => p[2]);
    for (
      let z = Math.floor(Math.min(...zs) / step) * step;
      z <= Math.max(...zs);
      z += step
    )
      for (
        let x = Math.floor(Math.min(...xs) / step) * step;
        x <= Math.max(...xs);
        x += step
      ) {
        const tl = [x, 0, z],
          bl = [x, 0, z + step],
          br = [x + step, 0, z + step],
          tr = [x + step, 0, z];
        for (const ground of [
          [tl, bl, tr],
          [bl, br, tr],
        ]) {
          let polygon = triangle;
          for (let edge = 0; edge < 3 && polygon.length; edge++)
            polygon = clipGroundEdge(
              polygon,
              ground[edge],
              ground[(edge + 1) % 3],
            );
          for (const p of polygon)
            base = Math.min(
              base,
              profile.surfaceHeight(p[0], p[2]) - p[1] - 0.012,
            );
        }
      }
  }
  const size = Math.hypot(matrix.elements[0], matrix.elements[2]),
    exposed =
      base +
      shape.bounds.max.y * size -
      profile.height(matrix.elements[12], matrix.elements[14]);
  if (exposed < Math.min(0.12, shape.bounds.max.y * size * 0.22)) return null;
  matrix.elements[13] = base;
  return {
    ...placed,
    matrix,
    position: new THREE.Vector3().setFromMatrixPosition(matrix),
    exposed,
  };
}

export function buildVolcanicMantle(game) {
  game.volcanicMantle = null;
  if (game.level.biome !== "volcano") return;
  const shapes = Array.from({ length: 12 }, (_, v) =>
      stoneFootprint(scoriaGeometry(v % 3, Math.floor(v / 3) * 0.35), {
        edgeProbes: true,
      }),
    ),
    material = volcanicBoulderMaterial(game.darkMat),
    groups = shapes.map(() => ({ matrices: [], positions: [], colors: [] })),
    stats = { candidates: 0, placed: 0, unsupported: 0, reserved: 0 };
  material.name = "Scoria and weathered clinker";
  material.roughness = 0.98;
  for (const fragment of volcanicMantleLayout(game)) {
    stats.candidates++;
    const initial = placeNatureRock(game, shapes[fragment.variant], fragment);
    if (initial.reason) {
      stats[initial.reason]++;
      continue;
    }
    const placed = seatScoriaTriangles(
      game.terrainProfile,
      shapes[fragment.variant],
      initial,
    );
    if (!placed) {
      stats.unsupported++;
      continue;
    }
    const group = groups[fragment.variant];
    group.matrices.push(placed.matrix);
    group.positions.push(placed.position);
    group.colors.push(
      new THREE.Color(
        [0x78838e, 0xa77a56, 0xd0c5ac][fragment.variant % 3],
      ).multiplyScalar(fragment.tint),
    );
    stats.placed++;
  }
  const patches = [];
  for (const [i, group] of groups.entries()) {
    if (!group.matrices.length) continue;
    const patch = createLodPatch(
      game.world,
      [[{ geometry: shapes[i].geometry, material }]],
      group.matrices,
      group.positions,
      { colors: group.colors, castShadow: true, planar: true },
    );
    // These pieces retain physical rock surfaces and the existing rock ranges.
    patch.kind = "rock";
    patch.volcanicMantle = true;
    game.naturePatches.push(patch);
    patches.push(patch);
  }
  shapes.forEach((shape) => shape.geometry.dispose());
  if (!patches.length) material.dispose();
  game.volcanicMantle = { patches, stats };
}
