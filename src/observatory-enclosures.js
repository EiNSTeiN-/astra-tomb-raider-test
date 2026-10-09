import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { mergeArchitecture } from "./visuals.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { stationSolid } from "./field-station-solids.js";

// Bay 1 faces the control court. Its two neighboring bays remain open as
// generous entrance shoulders; the rear and side bays form distinct rooms.
const profiles = [
  { name: "open meridian", bays: [[5, 2.4, 0]] },
  {
    name: "earth cloister",
    bays: [
      [3, 7.4, 1],
      [4, 7.4, 1],
      [5, 7.4, 2],
      [6, 7.4, 1],
      [7, 7.4, 1],
    ],
  },
  {
    name: "lunar side chambers",
    bays: [
      [3, 7.4, 2],
      [7, 7.4, 2],
    ],
  },
  {
    name: "archive gallery",
    bays: [
      [4, 7.4, 2],
      [5, 7.4, 2],
      [6, 7.4, 2],
    ],
  },
  {
    name: "broken solar court",
    bays: [
      [3, 7.4, 1],
      [4, 3.8, 0],
      [5, 2.4, 0],
    ],
  },
  {
    name: "western passage",
    bays: [
      [3, 7.4, 1],
      [4, 7.4, 2],
      [6, 7.4, 2],
      [7, 7.4, 1],
    ],
  },
  {
    name: "astral chamber",
    bays: [
      [4, 7.4, 1],
      [5, 7.4, 1],
      [6, 7.4, 1],
    ],
  },
  {
    name: "broken circuit",
    bays: [
      [5, 7.4, 2],
      [6, 3.1, 0],
      [7, 1.8, 0],
    ],
  },
  {
    name: "open earth court",
    bays: [
      [3, 2.4, 0],
      [7, 3.1, 0],
    ],
  },
  {
    name: "final meridian wings",
    bays: [
      [4, 7.4, 2],
      [6, 7.4, 2],
    ],
  },
  {
    name: "atlas sanctuary",
    bays: [
      [3, 3.8, 0],
      [4, 7.4, 1],
      [5, 7.4, 2],
      [6, 7.4, 1],
      [7, 3.8, 0],
    ],
  },
];

export function observatoryEnclosurePlan(index) {
  const profile = profiles[index % profiles.length];
  return { name: profile.name, bays: profile.bays.map((bay) => [...bay]) };
}

function wallBacking(width, height, depth, offsetX, offsetY) {
  const geometry = new THREE.BoxGeometry(width, height, depth),
    p = geometry.attributes.position,
    n = geometry.attributes.normal,
    uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const axis =
      Math.abs(n.getX(i)) > 0.7 ? 0 : Math.abs(n.getY(i)) > 0.7 ? 1 : 2;
    uv.setXY(
      i,
      (axis === 0 ? p.getZ(i) : p.getX(i) + offsetX) / 2,
      (axis === 1 ? p.getZ(i) : p.getY(i) + offsetY) / 2,
    );
  }
  return geometry;
}

export function buildObservatoryEnclosure(game, patch, points, materials) {
  const plan = observatoryEnclosurePlan(patch.index),
    group = new THREE.Group(),
    walls = [],
    feature = { id: `observatory-envelope-${patch.index}`, stationSolids: [] };
  group.name = `Observatory ${plan.name}`;
  patch.root.add(group);
  let serial = patch.index * 10000;
  for (const [bay, top, slots] of plan.bays) {
    const p = points[bay],
      q = points[(bay + 1) % points.length],
      width = Math.hypot(q.x - p.x, q.z - p.z) - 1.45,
      yaw = Math.atan2(-(q.z - p.z), q.x - p.x),
      cx = (p.x + q.x) / 2,
      cz = (p.z + q.z) / 2,
      cos = Math.cos(yaw),
      sin = Math.sin(yaw),
      world = (px, pz = 0) => ({
        x: cx + px * cos + pz * sin,
        z: cz - px * sin + pz * cos,
      }),
      extentW = Math.abs(cos) * (width + 0.1) + Math.abs(sin) * 1.4,
      extentD = Math.abs(sin) * (width + 0.1) + Math.abs(cos) * 1.4,
      bottom =
        footprintMinimum(
          (x, z) => game.groundHeight(x, z),
          patch.root.position.x + cx,
          patch.root.position.z + cz,
          extentW,
          extentD,
        ) -
        patch.base -
        0.24,
      sill = 4.15,
      head = 6.45,
      slotWidth = slots === 2 ? 0.95 : 1.45,
      openings = slots
        ? Array.from({ length: slots }, (_, i) => ({
            left: (i - (slots - 1) / 2) * 2.05 - slotWidth / 2,
            right: (i - (slots - 1) / 2) * 2.05 + slotWidth / 2,
            bottom: sill,
            top: head,
          }))
        : [];
    const wall = { bay, width, top, bottom, yaw, cx, cz, openings, solids: [] };
    walls.push(wall);
    const add = (geometry, material, px, py, pz = 0, capture = false) => {
      const location = world(px, pz),
        mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(location.x, py, location.z);
      mesh.rotation.y = yaw;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      if (capture) game.cameraSurfaces?.capture(mesh);
      return mesh;
    };
    const solid = (w, h, d, px, py, pz = 0) => {
      const location = world(px, pz),
        record = stationSolid(
          game,
          feature,
          patch.root,
          [w, h, d],
          [location.x, py, location.z],
          // The delivered crouched knees and clothing reach about 0.63 m
          // ahead of the root. Keep soles and that pose clear of the facing.
          { angle: yaw, bodyPadding: 0.7 },
        );
      record.observatoryEnvelope = true;
      wall.solids.push(record);
    };
    // Continuous closed backing owns every mortar joint. The dressed outer
    // courses only recess into that backing, including both sides of a wall.
    const piece = (left, right, low, high) => {
      const w = right - left,
        h = high - low,
        px = (left + right) / 2,
        py = (low + high) / 2;
      if (w <= 0 || h <= 0) return;
      add(wallBacking(w, h, 1.0, px, py), materials.dark, px, py, 0, true);
      solid(w, h, 1.18, px, py);
      const rows = Math.ceil(h / 0.72),
        rowHeight = h / rows;
      for (let row = 0; row < rows; row++) {
        const count = Math.max(1, Math.ceil(w / (row % 2 ? 1.7 : 2.1))),
          stoneWidth = w / count;
        for (let i = 0; i < count; i++)
          for (const side of [-1, 1])
            add(
              stoneBlockGeometry(
                stoneWidth - 0.014,
                rowHeight - 0.012,
                0.2,
                ++serial,
                0.016,
              ),
              materials.stone,
              left + (i + 0.5) * stoneWidth,
              low + (row + 0.5) * rowHeight,
              side * 0.49,
            );
      }
    };
    if (!openings.length) piece(-width / 2, width / 2, bottom, top);
    else {
      piece(-width / 2, width / 2, bottom, sill);
      piece(-width / 2, width / 2, head, top);
      let left = -width / 2;
      for (const opening of openings) {
        piece(left, opening.left, sill, head);
        left = opening.right;
      }
      piece(left, width / 2, sill, head);
      for (const opening of openings) {
        const center = (opening.left + opening.right) / 2;
        for (const y of [sill - 0.09, head + 0.09]) {
          add(
            stoneBlockGeometry(slotWidth + 0.22, 0.18, 1.26, ++serial, 0.012),
            materials.dark,
            center,
            y,
          );
          solid(slotWidth + 0.22, 0.18, 1.26, center, y);
        }
      }
    }
    // Buried continuous bed, sill courses and caps have no unsupported gap.
    for (const [y, h, depth] of [
      [bottom + 0.18, 0.36, 1.34],
      [top + 0.1, 0.2, 1.3],
    ]) {
      add(
        stoneBlockGeometry(width + 0.08, h, depth, ++serial, 0.008),
        materials.dark,
        0,
        y,
        0,
        true,
      );
      solid(width + 0.08, h, depth, 0, y);
    }
  }
  mergeArchitecture(group);
  patch.enclosure = {
    name: plan.name,
    group,
    walls,
    solids: feature.stationSolids,
  };
  return patch.enclosure;
}
