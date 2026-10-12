import * as THREE from "three";
import { vaultStoneGeometry } from "./palace-geometry.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { mergeArchitecture } from "./visuals.js";

const SPRING = 7.16;
const rib = (z, rise, options = {}) => ({ z, x: 0, yaw: 0, rise, ...options });

// The ends bear on the existing chamber walls, jambs and front lintel. Each
// room has a deliberate silhouette rather than a random ornament selection.
export function crystalVaultPlan(stage) {
  const plans = [
    { name: "Guide-light porch", ribs: [rib(-6.5, 0.42), rib(6.5, 0.55)] },
    {
      name: "Descending apsis",
      ribs: [rib(-6.5, 0.78), rib(6.5, 0.48)],
      screen: true,
    },
    {
      name: "Mirrored nave",
      ribs: [-6.5, 0, 6.5].map((z) => rib(z, 0.68)),
      spine: 0.68,
    },
    {
      name: "Ascending vault",
      ribs: [rib(-6.5, 0.45), rib(0, 0.65), rib(6.5, 0.85)],
    },
    {
      name: "Violet fan",
      ribs: [
        rib(0, 0.53, { yaw: Math.PI / 4, radius: 8.72 }),
        rib(0, 0.53, { yaw: -Math.PI / 4, radius: 8.72 }),
        rib(6.5, 0.59),
      ],
    },
    {
      name: "Broken archive",
      ribs: [rib(-6.5, 0.73, { broken: true }), rib(0, 0.59), rib(6.5, 0.59)],
      spine: 0.59,
    },
    {
      name: "Heart crossing",
      ribs: [rib(-6.5, 0.6), rib(0, 0.83), rib(6.5, 0.6)],
      spine: 0.83,
      boss: true,
    },
    {
      name: "Prism lantern",
      ribs: [-6.5, 0, 6.5].map((z) => rib(z, 0.92)),
      spine: 0.92,
      lantern: true,
    },
  ];
  const plan = plans[stage];
  if (!plan) throw new RangeError("Unknown crystal chamber");
  return { ...plan, stage, spring: SPRING };
}

export function crystalRibGeometry(rib, segment) {
  const count = 20,
    radius = rib.radius ?? 6.16,
    geometry = vaultStoneGeometry(
      radius,
      radius + 0.62,
      (segment * Math.PI) / count,
      ((segment + 1) * Math.PI) / count,
      0.72,
      3,
    );
  geometry.scale(1, rib.rise, 1);
  geometry.rotateY(rib.yaw);
  geometry.translate(rib.x, SPRING, rib.z);
  return geometry;
}

export function buildCrystalVault(game, gate, materials) {
  const plan = crystalVaultPlan(gate.stage),
    root = new THREE.Group();
  root.name = plan.name;
  gate.root.add(root);
  const add = (geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const ribs = [...plan.ribs];
  if (plan.spine) ribs.push(rib(0, plan.spine, { yaw: Math.PI / 2 }));
  if (plan.screen)
    for (const x of [-3.9, 0, 3.9])
      ribs.push(rib(-6.5, 0.94, { x, radius: 1.45 }));
  let stones = 0;
  for (const r of ribs)
    for (let j = 0; j < 20; j++) {
      if (r.broken && j >= 7 && j <= 12) continue;
      add(crystalRibGeometry(r, j), materials.trim);
      stones++;
    }
  // Dressed springing blocks are embedded in the existing cornice. They make
  // the load path legible without adding piers in the player's working aisle.
  for (const r of ribs) {
    const radius = (r.radius ?? 6.16) + 0.31;
    for (const side of [-1, 1]) {
      const x = r.x + Math.cos(r.yaw) * radius * side,
        z = r.z - Math.sin(r.yaw) * radius * side;
      add(
        stoneBlockGeometry(0.8, 0.32, 1.02, 7731 + gate.stage * 43 + stones++),
        materials.wall,
        x,
        SPRING + 0.07,
        z,
      ).rotation.y = r.yaw;
    }
  }
  // Small keyed inlays sit against the front arch, rather than floating above
  // its crown. Their colour belongs to the same archive masonry material.
  const front = plan.ribs.find((r) => r.z === 6.5),
    top = SPRING + 6.78 * front.rise;
  add(
    stoneBlockGeometry(0.76, 0.68, 0.94, 100 + gate.stage),
    materials.wall,
    0,
    top - 0.2,
    6.5,
  );
  add(
    new THREE.OctahedronGeometry(0.28),
    materials.inlay,
    0,
    top - 0.23,
    7.02,
  ).scale.set(0.85, 1.25, 0.3);
  if (plan.boss || plan.lantern) {
    const height = SPRING + 6.16 * plan.spine;
    const collar = add(
      new THREE.TorusGeometry(0.66, 0.085, 8, 48),
      materials.metal,
      0,
      height - 0.025,
      0,
    );
    collar.rotation.x = Math.PI / 2;
    add(
      new THREE.CylinderGeometry(0.42, 0.53, 0.23, 8),
      materials.trim,
      0,
      SPRING + 6.78 * plan.spine - 0.08,
      0,
    );
  }
  if (plan.lantern) {
    const base = SPRING + 6.78 * plan.spine;
    add(
      new THREE.CylinderGeometry(0.8, 0.64, 0.2, 8),
      materials.trim,
      0,
      base + 0.11,
      0,
    );
    for (let j = 0; j < 8; j++) {
      const a = (j * Math.PI) / 4,
        x = Math.cos(a) * 0.64,
        z = Math.sin(a) * 0.64;
      add(
        stoneBlockGeometry(0.13, 1.3, 0.13, 300 + j),
        materials.metal,
        x,
        base + 0.77,
        z,
      );
      const pane = add(
        stoneBlockGeometry(0.42, 0.9, 0.065, 400 + j),
        materials.inlay,
        Math.cos(a + Math.PI / 8) * 0.59,
        base + 0.75,
        Math.sin(a + Math.PI / 8) * 0.59,
      );
      pane.rotation.y = Math.PI / 2 - a - Math.PI / 8;
    }
    add(
      new THREE.CylinderGeometry(0.82, 0.75, 0.18, 8),
      materials.metal,
      0,
      base + 1.44,
      0,
    );
    add(
      new THREE.ConeGeometry(0.82, 0.66, 8),
      materials.trim,
      0,
      base + 1.84,
      0,
    );
  }
  mergeArchitecture(root);
  for (const mesh of root.children) game.cameraSurfaces?.capture(mesh);
  gate.vault = { root, plan, ribs, stones };
  return gate.vault;
}
