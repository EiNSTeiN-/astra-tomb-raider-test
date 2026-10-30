import * as THREE from "three";
import { timberGeometry } from "./monastery-architecture.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { skyWindReliefGeometry } from "./sky-chamber-walls.js";
import { stationAssemblySolid } from "./field-station-solids.js";
import {
  fittedStoneCells,
  insetStonePolygon,
  fittedStoneGeometry,
} from "./sky-masonry.js";

// Levels in each profile are half-metre courses above a continuous bearing.
// The courts remain open to the sky; the rear and returns carry their own
// silhouette, rather than repeating the same front crown on a flat box.
const PROFILES = [
  {
    style: "first-breath",
    front: [1, 2, 3, 4, 4, 4, 3, 2, 1],
    rear: [0, 1, 2, 3, 3, 3, 2, 1, 0],
    left: [2, 2, 1, 1, 0, 0],
    right: [2, 2, 1, 1, 0, 0],
    emblem: 0,
  },
  {
    style: "return-towers",
    front: [4, 4, 2, 1, 1, 1, 2, 4, 4],
    rear: [4, 4, 1, 0, 0, 0, 1, 4, 4],
    left: [4, 3, 2, 1, 1, 0],
    right: [4, 2, 1, 0, 0, 0],
    emblem: 1,
  },
  {
    style: "garden-terraces",
    front: [1, 1, 2, 3, 3, 3, 2, 1, 1],
    rear: [1, 2, 3, 4, 5, 4, 3, 2, 1],
    left: [3, 3, 2, 2, 1, 1],
    right: [3, 2, 2, 1, 1, 0],
    emblem: 2,
  },
  {
    style: "weavers-screen",
    front: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    rear: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    left: [1, 1, 1, 0, 0, 0],
    right: [1, 1, 1, 0, 0, 0],
    timber: true,
    emblem: 1,
  },
  {
    style: "bearing-pylons",
    front: [4, 4, 0, 0, 1, 0, 0, 4, 4],
    rear: [0, 5, 5, 1, 1, 1, 5, 5, 0],
    left: [4, 4, 1, 1, 0, 0],
    right: [4, 4, 1, 1, 0, 0],
    emblem: 2,
  },
  {
    style: "reversed-stair",
    front: [1, 1, 2, 2, 3, 3, 4, 4, 5],
    rear: [1, 1, 2, 2, 3, 3, 4, 4, 5],
    left: [1, 1, 1, 0, 0, 0],
    right: [5, 4, 3, 2, 1, 0],
    emblem: 2,
  },
  {
    style: "high-receiver",
    front: [0, 1, 1, 3, 6, 3, 1, 1, 0],
    rear: [0, 0, 1, 2, 6, 2, 1, 0, 0],
    left: [2, 2, 1, 0, 0, 0],
    right: [2, 2, 1, 0, 0, 0],
    emblem: 0,
  },
  {
    style: "eagle-wings",
    front: [5, 4, 3, 2, 1, 2, 3, 4, 5],
    rear: [5, 4, 3, 1, 0, 1, 3, 4, 5],
    left: [5, 4, 2, 1, 1, 0],
    right: [5, 4, 2, 1, 1, 0],
    emblem: 0,
  },
  {
    style: "last-breath",
    front: [2, 2, 4, 4, 7, 4, 4, 2, 2],
    rear: [1, 4, 4, 2, 6, 2, 4, 4, 1],
    left: [4, 3, 3, 2, 1, 1],
    right: [4, 3, 3, 2, 1, 1],
    emblem: 0,
  },
];

export function windChamberPlan(stage) {
  const plan = PROFILES[stage];
  if (!plan) throw new RangeError(`Unknown wind chamber ${stage}`);
  return {
    ...plan,
    front: [...plan.front],
    rear: [...plan.rear],
    left: [...plan.left],
    right: [...plan.right],
  };
}

export function buildWindChamberCrown(game, gate, materials, add) {
  const { root, halfWidth } = gate,
    m = materials,
    plan = windChamberPlan(gate.stage),
    inherited = root.children.filter((mesh) => {
      if (!mesh.isMesh) return false;
      mesh.updateMatrix();
      mesh.geometry.computeBoundingBox();
      return (
        mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix).max.y >= 7.3
      );
    }),
    // New coping makes the neighbouring old jamb heads reachable. Include
    // those delivered members so footing cannot stop inside their visible caps.
    parts = [...inherited],
    courses = [],
    bearings = [],
    ornaments = [];
  let serial = game.level.seed + 92837 + gate.stage * 1319;
  const structural = (geometry, material, x, y, z, angle = 0, tilt = 0) => {
    const mesh = add(geometry, material, x, y, z, root);
    mesh.rotation.set(tilt, angle, 0);
    game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
    parts.push(mesh);
    return mesh;
  };
  const wood = (w, h, d, x, y, z, tilt = 0) =>
    structural(timberGeometry(w, h, d, ++serial), m.wood, x, y, z, 0, tilt);
  const stone = (w, h, d, x, y, z, angle = 0, material = m.trim) =>
    structural(
      stoneBlockGeometry(w, h, d, ++serial, 0.025),
      material,
      x,
      y,
      z,
      angle,
    );
  const frame = (side, along, height, normal = 0.16) =>
    side === "front"
      ? { x: along, y: height, z: 6.5, angle: 0 }
      : side === 0
        ? { x: along, y: height, z: -6.5 - normal, angle: 0 }
        : {
            x: side * (halfWidth + normal),
            y: height,
            z: along,
            angle: Math.PI / 2,
          };
  const placeStone = (side, center, y, width, height, depth, normal = 0.16) => {
    const f = frame(side, center, y, normal);
    return stone(width, height, depth, f.x, f.y, f.z, f.angle);
  };
  const band = (
    side,
    center,
    bottom,
    width,
    height,
    depth,
    normal = 0.16,
    granite = false,
  ) => {
    const f = frame(side, center, bottom + height / 2, normal);
    // Closed recessed cores back narrow joints and carry the next course.
    if (granite) {
      const boundary = [
          [-width / 2, -height / 2],
          [width / 2, -height / 2],
          [width / 2, height / 2],
          [-width / 2, height / 2],
        ],
        core = fittedStoneGeometry(
          [
            [-width / 2 + 0.03, -height / 2 + 0.0125],
            [width / 2 - 0.03, -height / 2 + 0.0125],
            [width / 2 - 0.03, height / 2 - 0.0125],
            [-width / 2 + 0.03, height / 2 - 0.0125],
          ],
          depth - 0.14,
          ++serial,
        );
      const color = core.attributes.color;
      for (let i = 0; i < color.count; i++) color.setXYZ(i, 0.36, 0.37, 0.35);
      structural(core, m.wall, f.x, f.y, f.z, f.angle);
      for (const cell of fittedStoneCells(boundary, ++serial, 1.25)) {
        const polygon = insetStonePolygon(cell, 0.012);
        if (polygon.length >= 3)
          structural(
            fittedStoneGeometry(polygon, depth, ++serial),
            m.wall,
            f.x,
            f.y,
            f.z,
            f.angle,
          );
      }
    } else {
      structural(
        new THREE.BoxGeometry(width - 0.06, height - 0.025, depth - 0.14),
        m.trim,
        f.x,
        f.y,
        f.z,
        f.angle,
      );
      const count = Math.ceil(width / 1.8),
        step = width / count,
        shift = ((Math.round(bottom * 2) % 2) * step) / 2;
      for (let start = -width / 2 - shift; start < width / 2; start += step) {
        const lo = Math.max(-width / 2, start),
          hi = Math.min(width / 2, start + step);
        if (hi - lo < 0.04) continue;
        placeStone(
          side,
          center + (lo + hi) / 2,
          bottom + height / 2,
          hi - lo - 0.016,
          height,
          depth,
          normal,
        );
      }
    }
    courses.push({
      side,
      center,
      bottom,
      top: bottom + height,
      width,
      depth,
      normal,
    });
  };
  const raised = (side, span, bottom, profile) => {
    const step = span / profile.length;
    for (let level = 1; level <= Math.max(...profile); level++) {
      let first = -1;
      for (let i = 0; i <= profile.length; i++) {
        if (i < profile.length && profile[i] >= level) {
          if (first < 0) first = i;
        } else if (first >= 0) {
          band(
            side,
            -span / 2 + ((first + i) * step) / 2,
            bottom + (level - 1) * 0.5,
            (i - first) * step,
            0.54,
            1.08,
            0.16,
            true,
          );
          first = -1;
        }
      }
    }
  };
  const coping = (side, span, bottom, profile) => {
    const step = span / profile.length;
    for (let first = 0; first < profile.length;) {
      let end = first + 1;
      while (end < profile.length && profile[end] === profile[first]) end++;
      if (profile[first] > 0)
        band(
          side,
          -span / 2 + ((first + end) * step) / 2,
          bottom + (profile[first] - 1) * 0.5 + 0.49,
          (end - first) * step + 0.08,
          0.14,
          1.28,
          side === "front" ? 0 : 0.16,
        );
      first = end;
    }
  };
  for (const side of [-1, 0, 1]) {
    const span = side === 0 ? halfWidth * 2 : 13.8;
    // A thin outer riser reaches the existing wall through its coping joints.
    // Its inner face stays outside the fully folded door. The wider cap starts
    // above every leaf, including the wider first-court panel.
    band(side, 0, 6.97, span, 0.46, 0.4, 0.28);
    band(side, 0, 7.39, span + 0.08, 0.28, 1.25);
    bearings.push({ side, span, bottom: 6.97, normal: 0.28, depth: 0.4 });
    raised(
      side,
      span,
      7.63,
      side === 0 ? plan.rear : side < 0 ? plan.left : plan.right,
    );
    coping(
      side,
      span,
      7.63,
      side === 0 ? plan.rear : side < 0 ? plan.left : plan.right,
    );
  }

  // Keep the existing timber lintel and restoration-seal height. All upper
  // front courses bear on that lintel and the two existing jamb caps.
  wood(2 * halfWidth + 0.45, 0.5, 1.45, 0, 8.05, 6.5);
  const frontBand = (center, bottom, width, height, depth) =>
    band("front", center, bottom, width, height, depth, 0, bottom > 8.5);
  frontBand(0, 8.265, halfWidth * 2 + 0.16, 0.34, 1.3);
  const step = (halfWidth * 2) / plan.front.length;
  for (let level = 1; level <= Math.max(...plan.front); level++) {
    let first = -1;
    for (let i = 0; i <= plan.front.length; i++) {
      if (i < plan.front.length && plan.front[i] >= level) {
        if (first < 0) first = i;
      } else if (first >= 0) {
        frontBand(
          -halfWidth + ((first + i) * step) / 2,
          8.565 + (level - 1) * 0.5,
          (i - first) * step,
          0.54,
          1.08,
        );
        first = -1;
      }
    }
  }
  coping("front", halfWidth * 2, 8.565, plan.front);

  const screen = (front) => {
    const z = front ? 6.5 : -6.66,
      bottom = front ? 8.56 : 7.64,
      top = bottom + 2.65,
      width = front ? halfWidth * 2 : halfWidth * 2 - 1.2;
    for (const x of [-width / 2, 0, width / 2]) {
      wood(0.34, top - bottom + 0.1, 0.44, x, (bottom + top) / 2, z);
    }
    for (const y of [bottom + 0.18, top - 0.05]) {
      wood(width + 0.45, 0.28, 0.48, 0, y, z);
    }
    // Pitched laths occupy two framed bays, with ends embedded in their posts.
    for (const side of [-1, 1])
      for (let i = 0; i < 5; i++) {
        wood(
          width / 2 - 0.12,
          0.19,
          0.17,
          (side * width) / 4,
          bottom + 0.5 + i * 0.42,
          z,
          0.24,
        );
      }
  };
  if (plan.timber) {
    screen(true);
    screen(false);
  }

  // Raised bronze birds, return winds and terraces attach to closed plaques.
  // They are kept in the fixed assembly, so their backing and contact remain
  // present when distant gate hardware detail retires.
  for (const front of [true, false]) {
    const side = front ? "front" : 0,
      profile = front ? plan.front : plan.rear,
      bottom = front ? 8.62 : 7.7,
      indices = profile[4] >= 2 ? [4] : [0, 8].filter((i) => profile[i] >= 2);
    if (plan.timber) continue;
    for (const index of indices) {
      const available = profile[index] * 0.5,
        x = ((index + 0.5) / profile.length - 0.5) * halfWidth * 2;
      const width = Math.min(1.75, (halfWidth * 2) / profile.length - 0.22),
        height = Math.min(1.1, available - 0.15),
        z = front ? 7.08 : -7.24,
        backing = stone(
          width + 0.18,
          height + 0.12,
          0.16,
          x,
          bottom + height / 2,
          z,
        );
      structural(
        skyWindReliefGeometry(plan.emblem, width),
        m.metal,
        x,
        bottom + height * 0.55,
        z + (front ? 0.075 : -0.075),
        front ? 0 : Math.PI,
      );
      ornaments.push({
        side,
        width,
        height,
        bottom,
        center: [backing.position.x, backing.position.y, backing.position.z],
      });
    }
  }
  const solid = stationAssemblySolid(
    game,
    { id: `wind-chamber-crown-${gate.stage}` },
    parts,
    { bodyPadding: 0.65, supportRadius: 0, layeredSupport: true },
  );
  solid.windChamberCrown = true;
  return {
    style: plan.style,
    plan,
    solid,
    courses,
    bearings,
    ornaments,
    parts: parts.length,
    inheritedParts: inherited.length,
  };
}
