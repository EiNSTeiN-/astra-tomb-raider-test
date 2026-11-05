import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";

// Rear bays only: the crossing axes, forward optics and central processional
// doorway remain open. Heights, surviving bays and windows give the courts
// different masses instead of repeating a continuous open arcade.
const COURTS = [
  [
    [0, 4.8, 1],
    [4, 3.4, 0],
  ],
  [
    [0, 5.4, 2],
    [1, 2.6, 0],
  ],
  [
    [3, 5.2, 1],
    [4, 2.1, 0],
  ],
  [
    [1, 4.6, 1],
    [4, 3.4, 0],
  ],
  [
    [0, 1.7, 0],
    [3, 4.9, 1],
    [4, 5.2, 2],
  ],
  [
    [0, 3.3, 0],
    [1, 5.1, 1],
  ],
  [
    [0, 5.4, 1],
    [4, 1.6, 0],
  ],
  [
    [1, 4.2, 1],
    [3, 4.2, 1],
  ],
  [
    [0, 2.7, 0],
    [1, 4.8, 1],
    [4, 3.2, 0],
  ],
  [
    [0, 5.7, 2],
    [1, 3.9, 1],
    [3, 3.9, 1],
    [4, 5.7, 2],
  ],
];
const CRESTS = [
  [1, 1, 0.88, 0.88, 0.76, 0.88],
  [0.78, 0.9, 1, 1, 0.9, 0.78],
  [0.92, 0.8, 0.92, 1, 1, 0.88],
];
const BROKEN = [1, 0.76, 0.42, 0.27, 0.42, 0.62];

export function desertCourtWallPlan(room, arcade) {
  return COURTS[room.index % COURTS.length].map(
    ([span, height, windows], i) => {
      const { a, b } = arcade.spans[span],
        width = b.x - a.x - 2.25,
        crest = windows ? CRESTS[(room.index + i) % CRESTS.length] : BROKEN;
      return {
        span,
        x: (a.x + b.x) / 2,
        z: a.z - 0.35,
        width,
        depth: 1.05,
        height,
        crest: [...(room.index % 2 ? [...crest].reverse() : crest)],
        windows:
          windows === 2
            ? [-width * 0.22, width * 0.22].map((x) => ({ x, width: 0.85 }))
            : windows
              ? [{ x: 0, width: Math.min(1.5, width / 3) }]
              : [],
      };
    },
  );
}

// Partition a stepped wall around its real apertures. Each returned rectangle
// is a closed solid with its own camera bound; there is no box over a window.
export function desertWallRectangles(plan, bottom, ground) {
  const openings = plan.windows.map((w) => ({
      left: w.x - w.width / 2,
      right: w.x + w.width / 2,
      bottom: ground + 1.45,
      top: ground + Math.min(3.05, plan.height - 0.65),
    })),
    cuts = [
      ...new Set([
        ...plan.crest.map(
          (_, i) => -plan.width / 2 + (i * plan.width) / plan.crest.length,
        ),
        plan.width / 2,
        ...openings.flatMap((w) => [w.left, w.right]),
      ]),
    ].sort((a, b) => a - b),
    rectangles = [];
  for (let i = 1; i < cuts.length; i++) {
    const left = cuts[i - 1],
      right = cuts[i],
      x = (left + right) / 2,
      column = Math.min(
        plan.crest.length - 1,
        Math.floor(((x + plan.width / 2) / plan.width) * plan.crest.length),
      ),
      top =
        ground +
        Math.max(
          plan.height * plan.crest[column],
          openings.length ? openings[0].top - ground + 0.45 : 0,
        ),
      opening = openings.find((w) => x > w.left && x < w.right);
    for (const [low, high] of opening
      ? [
          [bottom, opening.bottom],
          [opening.top, top],
        ]
      : [[bottom, top]])
      if (high > low + 0.001)
        rectangles.push({ left, right, bottom: low, top: high });
  }
  return { rectangles, openings };
}

export function buildDesertCourtWalls(game, { room, plan, ground, add }) {
  let seed = game.level.seed + room.index * 151 + 91217;
  return desertCourtWallPlan(room, plan).map((wall) => {
    let low = Infinity,
      high = -Infinity;
    // Bury the entire lower rim, including the terrain between grid vertices.
    for (
      let x = -wall.width / 2;
      x < wall.width / 2 + 0.001;
      x += wall.width / Math.ceil(wall.width / 0.5)
    )
      for (const z of [-wall.depth / 2, 0, wall.depth / 2]) {
        const y = ground(wall.x + x, wall.z + z);
        low = Math.min(low, y);
        high = Math.max(high, y);
      }
    const bottom = low - 0.24,
      shape = desertWallRectangles(wall, bottom, high);
    let parts = 0,
      triangles = 0;
    const place = (geometry, x, y, z, tint, camera) => {
      triangles +=
        (geometry.index?.count ?? geometry.attributes.position.count) / 3;
      parts++;
      const mesh = add(geometry, wall.x + x, y, wall.z + z, 0, tint, false);
      mesh.userData.arcadeRole = { kind: "rear wall", span: wall.span };
      if (camera)
        game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
    };
    for (const r of shape.rectangles) {
      const width = r.right - r.left,
        height = r.top - r.bottom;
      place(
        new THREE.BoxGeometry(width, height, wall.depth - 0.12),
        (r.left + r.right) / 2,
        (r.bottom + r.top) / 2,
        0,
        0.79,
        true,
      );
      const rows = Math.ceil(height / 0.57),
        rise = height / rows;
      for (let row = 0; row < rows; row++) {
        const columns = Math.ceil(width / 1.15),
          step = width / columns,
          joints = [r.left];
        // Alternate the bond while keeping all ends on their complete backing.
        for (let i = 1; i <= columns; i++) {
          const x = r.left + (i - (row % 2 ? 0.5 : 0)) * step;
          if (x < r.right - 0.1) joints.push(x);
        }
        joints.push(r.right);
        for (let i = 1; i < joints.length; i++) {
          const left = joints[i - 1],
            right = joints[i];
          for (const sign of [-1, 1])
            place(
              stoneBlockGeometry(
                right - left - 0.014,
                rise - 0.014,
                0.18,
                ++seed,
                0.022,
              ),
              (left + right) / 2,
              r.bottom + (row + 0.5) * rise,
              sign * (wall.depth / 2 - 0.08),
              0.94,
              false,
            );
        }
      }
    }
    return { ...wall, ...shape, bottom, ground: high, parts, triangles };
  });
}
