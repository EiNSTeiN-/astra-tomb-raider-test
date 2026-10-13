import * as THREE from "three";
import {
  stoneBlockGeometry,
  carvedPanelGeometry,
} from "./temple-architecture.js";
import { vaultStoneGeometry } from "./palace-geometry.js";
import { stationMeshSolid } from "./field-station-solids.js";
import { TriangleSolids } from "./triangle-solids.js";

// Eight silhouettes belong to the eight covenants. Every tower starts on the
// same supported lintel; upper variation never changes a shutter or jamb.
const CROWNS = [
  { style: "sun-lintel", towers: [[0, [12.2, 9.1, 5.8], [0.4, 0.45, 0.55]]] },
  {
    style: "root-twins",
    towers: [
      [-4.4, [3.8, 2.8, 1.5], [0.6, 0.6, 0.65]],
      [4.4, [3.8, 2.8, 1.5], [0.75, 0.75, 0.75]],
    ],
  },
  {
    style: "rain-pediment",
    towers: [[0, [13.3, 10.6, 7.9, 5.2, 2.5], [0.38, 0.38, 0.38, 0.38, 0.38]]],
  },
  {
    style: "garden-shoulders",
    towers: [
      [-5, [3.3, 2.6, 1.8], [0.55, 0.55, 0.5]],
      [0, [6.4, 5.5], [0.45, 0.45]],
      [5, [3.3, 2.6, 1.8], [0.55, 0.55, 0.5]],
    ],
  },
  {
    style: "eastern-witness",
    towers: [
      [-3.8, [5.4, 4.4], [0.55, 0.55]],
      [4.5, [4.2, 3.5, 2.8, 2, 1.2], [0.7, 0.6, 0.65, 0.6, 0.55]],
    ],
  },
  { style: "moon-arch", towers: [] },
  {
    style: "oath-gable",
    towers: [[0, [13.3, 10.1, 6.9, 3.7], [0.65, 0.65, 0.65, 0.65]]],
  },
  {
    style: "heart-temple",
    towers: [
      [-5.5, [3.2, 2.2, 1.2], [0.65, 0.6, 0.55]],
      [0, [7.6, 6.1, 4.6, 3.1, 1.6], [0.65, 0.6, 0.55, 0.5, 0.5]],
      [5.5, [3.2, 2.2, 1.2], [0.65, 0.6, 0.55]],
    ],
  },
];

export function jungleGateCrownPlan(stage) {
  const plan = CROWNS[stage];
  if (!plan) throw new RangeError(`Unknown jungle gate crown ${stage}`);
  return {
    style: plan.style,
    towers: plan.towers.map(([x, widths, heights]) => ({
      x,
      widths: [...widths],
      heights: [...heights],
    })),
  };
}

export function buildJungleGateCrown(game, gate, materials, add) {
  const plan = jungleGateCrownPlan(gate.stage),
    { root, detail } = gate;
  const { wall, trim } = materials;
  const bounds = new THREE.Box3(),
    tiers = [],
    foundations = [],
    bodyParts = [],
    carvings = [],
    archParts = [];
  let serial = game.level.seed + 73001 + gate.stage * 1999,
    parts = 0,
    triangles = 0;
  const mesh = (geometry, material, x, y, z, structural = true) => {
    const result = add(geometry, material, x, y, z, structural ? root : detail);
    geometry.computeBoundingBox();
    bounds.union(geometry.boundingBox.clone().translate(result.position));
    parts++;
    triangles +=
      (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    if (structural) {
      bodyParts.push(result);
      game.cameraSurfaces?.capture(result, { small: true, thin: true });
    } else carvings.push(result);
    return result;
  };
  const block = (w, h, d, x, y, material = trim) =>
    mesh(stoneBlockGeometry(w, h, d, ++serial, 0.025), material, x, y, 6.5);
  const band = (width, height, depth, x, bottom) => {
    // A recessed continuous core seals the dressed joints and carries each
    // next course. Both skins and core overlap vertically through their bevels.
    block(width - 0.12, height, depth - 0.18, x, bottom + height / 2, wall);
    const count = Math.ceil(width / 1.4),
      step = width / count;
    for (let i = 0; i < count; i++)
      block(
        step - 0.018,
        height,
        depth,
        x + (i + 0.5) * step - width / 2,
        bottom + height / 2,
      );
    tiers.push({ x, width, bottom, top: bottom + height, depth });
  };

  // Seat the lintel into both existing 8.5 m jamb caps. The centre keystone
  // backs the original restoration-seal bar without hiding its bronze face.
  band(14.1, 0.5, 1.85, 0, 8.375);
  foundations.push({
    x: 0,
    width: 14.1,
    bottom: 8.375,
    top: 8.875,
    depth: 1.85,
  });
  block(3.05, 0.72, 1.32, 0, 8.08, wall);
  const base = 8.845;
  const relief = (x, bottom, width, height, depth, variant) => {
    // Embed a closed plaque in the continuous core so course joints and
    // projecting cornices cannot leave part of the carving suspended.
    mesh(
      stoneBlockGeometry(width + 0.18, height + 0.12, 0.21, ++serial, 0.02),
      trim,
      x,
      bottom + height / 2,
      6.5 + depth / 2 + 0.005,
    );
    const geometry = carvedPanelGeometry(width, height, variant, [24, 36]);
    // The deepest recess stays just outside its solid backing; the frame and
    // carving remain attached if distant detail is culled.
    mesh(geometry, wall, x, bottom, 6.5 + depth / 2 + 0.2, false);
  };
  for (const [index, tower] of plan.towers.entries()) {
    let bottom = base;
    tower.widths.forEach((width, i) => {
      const height = tower.heights[i],
        depth = 1.72;
      band(width, height + 0.04, depth, tower.x, bottom);
      block(width + 0.14, 0.14, depth + 0.12, tower.x, bottom + height - 0.025);
      bottom += height;
    });
    // Small paired tablets keep narrow towers legible; wide pediments carry
    // one botanical face on their closed lower courses.
    const height = Math.min(1.2, bottom - base - 0.2);
    const width = Math.min(1.55, tower.widths.at(-1) - 0.15);
    if (height > 0.5 && width > 0.7)
      relief(tower.x, base + 0.08, width, height, 1.72, gate.stage + index);
  }
  if (plan.style === "moon-arch") {
    for (let i = 0; i < 17; i++) {
      const geometry = vaultStoneGeometry(
        5.9,
        6.7,
        (i * Math.PI) / 17 - 0.002,
        ((i + 1) * Math.PI) / 17 + 0.002,
        1.72,
        4,
      );
      geometry.scale(1, 0.34, 1);
      archParts.push(mesh(geometry, trim, 0, base, 6.5));
    }
    band(2.6, 1.85, 1.48, 0, base);
    relief(0, base + 0.12, 1.55, 1.45, 1.48, gate.stage);
  }
  // One body query owns the union of the closed pieces. Retaining separate
  // placements avoids cancelling inside tests where core and facing overlap.
  // The CPU kernel copies triangles before batching disposes render originals.
  const body = new TriangleSolids(
    bodyParts.map((part) => {
      part.updateWorldMatrix(true, false);
      return { geometry: part.geometry, matrices: [part.matrixWorld] };
    }),
    { layeredSupport: true },
  );
  const physicalBounds = new THREE.Box3();
  for (const part of body.solids) physicalBounds.union(part.bounds);
  const center = physicalBounds.getCenter(new THREE.Vector3());
  const feature = { id: `jungle-gate-crown-${gate.stage}` };
  const solid = {
    x: center.x,
    z: center.z,
    w: (physicalBounds.max.x - physicalBounds.min.x) / 2,
    d: (physicalBounds.max.z - physicalBounds.min.z) / 2,
    h: physicalBounds.max.y - game.groundHeight(center.x, center.z),
    fieldStation: feature.id,
    jungleGateCrown: true,
    bodyPadding: 0.4,
    supportRadius: 0,
    supportable: true,
    bodySupport: true,
    bounds: physicalBounds,
    triangles: body,
  };
  game.obstacles.push(solid);
  if (archParts.length) {
    // Only the authored curved roof supplies slope clearance. Its lower beam
    // must never suppress a real overhead or neighbouring arch collision.
    solid.groundingSlope = true;
    solid.groundingFace = {
      triangles: new TriangleSolids(
        archParts.map((part) => ({
          geometry: part.geometry,
          matrices: [part.matrixWorld],
        })),
        { layeredSupport: true },
      ),
    };
  }
  // Raised lips still meet boot/contact probes, but a tiny vertical carving
  // must not become a body landing. Detail retirement follows its own layer.
  for (const carving of carvings) {
    const contact = stationMeshSolid(game, feature, carving, {
      supportRadius: 0,
      bodySupport: false,
      layeredSupport: true,
    });
    contact.jungleGateCrown = true;
    contact.node = detail;
  }
  return {
    style: plan.style,
    bounds,
    parts,
    triangles,
    tiers,
    foundations,
    solid,
  };
}
