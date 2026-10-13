import * as THREE from "three";
import { vaultStoneGeometry } from "./palace-geometry.js";
import { TriangleSolids } from "./triangle-solids.js";
import { stationMeshSolid } from "./field-station-solids.js";

// Arrival and the eight covenants have different roof volumes. Every profile
// bears within the unchanged central arcade, whose cap is just over 12 m wide.
const PROFILES = [
  {
    style: "lotus-porch",
    towers: [[0, [11.2, 9.2, 7.2], [0.45, 0.55, 0.65]]],
    plaque: { x: 0, width: 2.6, height: 1.2 },
  },
  {
    style: "sun-fan",
    towers: [[0, [11.3, 9, 6.7, 4.4, 2.1], [0.42, 0.42, 0.42, 0.42, 0.42]]],
    plaque: { x: 0, width: 1.8, height: 1.5 },
  },
  {
    style: "root-towers",
    towers: [
      [-4.2, [3.2, 2.5, 1.6], [1.2, 0.9, 0.6]],
      [0, [3.9], [1.5]],
      [4.2, [3.2, 2.5, 1.6], [1.2, 0.9, 0.6]],
    ],
    plaque: { x: 0, width: 2.7, height: 1.05 },
  },
  {
    style: "rain-vault",
    towers: [],
    arch: { inner: 4.4, outer: 5.3, scaleY: 0.68 },
    plaque: { x: 0, width: 2.5, height: 2.3 },
  },
  {
    style: "garden-terraces",
    towers: [
      [-4.35, [2.6, 2], [0.65, 0.65]],
      [1, [7.7, 5.5, 3.3], [0.65, 0.65, 0.65]],
    ],
    plaque: { x: 1, width: 2.6, height: 1.35 },
  },
  {
    style: "eastern-stelae",
    towers: [
      [-4.1, [3.1, 2.4], [0.7, 0.8]],
      [0, [3.7], [1.4]],
      [4.05, [3.1, 2.5, 1.9, 1.3], [1, 0.9, 0.9, 0.8]],
    ],
    plaque: { x: 0, width: 2.6, height: 1.05 },
  },
  {
    style: "moon-lantern",
    towers: [],
    lantern: true,
    plaque: { x: 0, width: 2.5, height: 1.95 },
  },
  {
    style: "oath-sanctuary",
    towers: [
      [
        0,
        [11.2, 9.6, 6, 5.2, 4.4, 3.6, 2.8],
        [0.55, 0.55, 0.65, 0.65, 0.65, 0.65, 0.65],
      ],
    ],
    plaque: { x: 0, width: 2.6, height: 2.75 },
  },
  {
    style: "heart-sanctuary",
    towers: [
      [-4.3, [2.8, 2.1, 1.4], [0.7, 0.7, 0.8]],
      [
        0,
        [5.6, 4.9, 4.2, 3.5, 2.8, 2.1, 1.4],
        [0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7],
      ],
      [4.3, [2.8, 2.1, 1.4], [0.7, 0.7, 0.8]],
    ],
    plaque: { x: 0, width: 2.7, height: 2.9 },
  },
];

export function templeCrownPlan(index) {
  const profile = PROFILES[index];
  if (!profile) throw new RangeError(`Unknown jungle temple crown ${index}`);
  return {
    style: profile.style,
    plaque: { ...profile.plaque },
    arch: profile.arch ? { ...profile.arch } : null,
    lantern: Boolean(profile.lantern),
    towers: profile.towers.map(([x, widths, heights]) => ({
      x,
      widths: [...widths],
      heights: [...heights],
    })),
  };
}

export function buildTempleCrownSupport(game, options) {
  const { room, root, material, blockGeometry, roof, panel, profile } = options;
  const bodyParts = [],
    archParts = [],
    tiers = [];
  let parts = 0,
    triangles = 0;
  const stone = (geometry, x, y, z, tint = 1) => {
    const p = geometry.attributes.position,
      colors = new Float32Array(p.count * 3);
    geometry.computeBoundingBox();
    const b = geometry.boundingBox,
      h = b.max.y - b.min.y;
    for (let i = 0; i < p.count; i++) {
      const weather = (0.86 + (0.14 * (p.getY(i) - b.min.y)) / h) * tint;
      colors.set([0.82 * weather, 0.805 * weather, 0.77 * weather], i * 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    bodyParts.push(mesh);
    parts++;
    triangles += (geometry.index?.count ?? p.count) / 3;
    return mesh;
  };
  const block = (w, h, d, x, y, z = -18, tint = 1) =>
    stone(
      blockGeometry(
        w,
        h,
        d,
        game.level.seed + 92001 + room.index * 2003 + parts,
        0.025,
      ),
      x,
      y,
      z,
      tint,
    );
  const band = (width, height, depth, x, bottom) => {
    // Continuous recessed stone seals the joints. Projecting cornices cover
    // vertical course joins; the dressed skins do not overlap on one plane.
    block(
      width - 0.1,
      height + 0.025,
      depth - 0.12,
      x,
      bottom + height / 2,
      -18,
      0.94,
    );
    const count = Math.ceil(width / 1.4),
      step = width / count;
    for (let i = 0; i < count; i++)
      block(
        step - 0.025,
        height - 0.025,
        depth,
        x + (i + 0.5) * step - width / 2,
        bottom + height / 2,
      );
    block(
      width + 0.14,
      0.14,
      depth + 0.12,
      x,
      bottom + height - 0.015,
      -18,
      0.88,
    );
    tiers.push({ x, width, bottom, top: bottom + height, depth });
  };
  const bottom = roof - root.position.y - 0.15;
  band(11.8, 0.5, 3.43, 0, bottom);
  const base = bottom + 0.48;
  for (const tower of profile.towers) {
    let y = base;
    tower.widths.forEach((width, index) => {
      const height = tower.heights[index];
      band(width, height, 3.2, tower.x, y);
      y += height;
    });
  }
  if (profile.arch) {
    const { inner, outer, scaleY } = profile.arch;
    for (let i = 0; i < 17; i++) {
      const geometry = vaultStoneGeometry(
        inner,
        outer,
        (i * Math.PI) / 17,
        ((i + 1) * Math.PI) / 17,
        3.2,
        4,
      );
      geometry.scale(1, scaleY, 1);
      archParts.push(stone(geometry, 0, base, -18));
    }
  }
  if (profile.lantern) {
    for (const x of [-3.75, 3.75])
      for (let row = 0; row < 3; row++) band(1.5, 1.1, 3, x, base + row * 1.1);
    band(9.2, 0.55, 3.24, 0, base + 3.2);
    let y = base + 3.72;
    for (const [width, height] of [
      [9.2, 0.3],
      [7.3, 0.35],
      [5.4, 0.4],
    ]) {
      band(width, height, 3.2, 0, y);
      y += height;
    }
  }

  const plaque = profile.plaque,
    plaqueBottom = base + 0.13;
  // A closed column and embedded plate carry the relief through its full
  // height, even when its profile steps back or the surrounding roof is open.
  block(
    plaque.width + 0.24,
    plaque.height + 0.21,
    3.04,
    plaque.x,
    base + (plaque.height + 0.21) / 2,
  );
  block(
    plaque.width + 0.2,
    plaque.height + 0.16,
    0.28,
    plaque.x,
    plaqueBottom + plaque.height / 2,
    -18 + 1.62,
    0.9,
  );
  panel.position.set(plaque.x, plaqueBottom, -18 + 1.855);

  const placements = bodyParts.map((mesh) => {
    mesh.updateWorldMatrix(true, false);
    game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
    return { geometry: mesh.geometry, matrices: [mesh.matrixWorld] };
  });
  const kernel = new TriangleSolids(placements, { layeredSupport: true });
  const bounds = new THREE.Box3();
  for (const shape of kernel.solids) bounds.union(shape.bounds);
  const center = bounds.getCenter(new THREE.Vector3());
  const feature = { id: `temple-crown-${room.index}` };
  const solid = {
    x: center.x,
    z: center.z,
    w: (bounds.max.x - bounds.min.x) / 2,
    d: (bounds.max.z - bounds.min.z) / 2,
    h: bounds.max.y - game.groundHeight(center.x, center.z),
    fieldStation: feature.id,
    templeCrown: true,
    bodyPadding: 0.4,
    supportRadius: 0,
    supportable: true,
    bodySupport: true,
    bounds,
    triangles: kernel,
  };
  if (archParts.length) {
    solid.groundingSlope = true;
    solid.groundingFace = {
      triangles: new TriangleSolids(
        archParts.map((mesh) => ({
          geometry: mesh.geometry,
          matrices: [mesh.matrixWorld],
        })),
        { layeredSupport: true },
      ),
    };
  }
  game.obstacles.push(solid);
  const contact = stationMeshSolid(game, feature, panel, {
    supportRadius: 0,
    bodySupport: false,
    layeredSupport: true,
  });
  contact.templeCrown = true;
  contact.node = panel.parent;
  return { style: profile.style, parts, triangles, roof, bounds, tiers, solid };
}
