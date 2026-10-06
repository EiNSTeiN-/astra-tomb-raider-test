import * as THREE from "three";
import { random } from "./campaign.js";
import {
  stoneBlockGeometry,
  carvedPanelGeometry,
} from "./temple-architecture.js";
import { solarPanelGeometry } from "./desert-architecture.js";
import { shellReliefGeometry } from "./palace-geometry.js";
import { timberGeometry } from "./monastery-architecture.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { mergeArchitecture } from "./visuals.js";

export const COURT_COVER_STYLES = Object.freeze({
  jungle: {
    name: "Lotus parapet",
    course: 0.33,
    caps: 5,
    cap: 0.18,
    motif: "lotus",
    tint: 0.92,
    metal: 0xa99263,
  },
  desert: {
    name: "Solar enclosure",
    course: 0.4,
    caps: 3,
    cap: 0.21,
    motif: "sun",
    tint: 1,
    metal: 0xc0a470,
  },
  snow: {
    name: "Timber-tied mountain wall",
    course: 0.28,
    caps: 4,
    cap: 0.18,
    motif: "mountain",
    tint: 0.91,
    metal: 0x9d8d73,
  },
  water: {
    name: "Shell balustrade",
    course: 0.37,
    caps: 4,
    cap: 0.16,
    motif: "shell",
    tint: 0.97,
    metal: 0x93a99b,
  },
  volcano: {
    name: "Foundry barricade",
    course: 0.26,
    caps: 5,
    cap: 0.22,
    motif: "gear",
    tint: 0.83,
    metal: 0x99918a,
  },
  sky: {
    name: "Wind court parapet",
    course: 0.38,
    caps: 3,
    cap: 0.18,
    motif: "wing",
    tint: 1,
    metal: 0xaca57b,
  },
  crystal: {
    name: "Harmonic ashlar",
    course: 0.31,
    caps: 6,
    cap: 0.18,
    motif: "prism",
    tint: 0.94,
    metal: 0x9da6b9,
  },
  eclipse: {
    name: "Meridian parapet",
    course: 0.29,
    caps: 4,
    cap: 0.2,
    motif: "orbit",
    tint: 0.88,
    metal: 0xb9ac88,
  },
});

// Retain the collision size and local standing height. Volcanic walls sit four
// metres closer to the chamber, clear of the valve matrix and its front aisle.
// Cloud-city walls move two metres outward between the wider gate and gallery.
// The previous mesh used the room-centre height and was smaller than its
// standing surface.
export function courtCoverPlan(game, room) {
  const x = room.x * 7 + (game.level.biome === "sky" ? 14 : 12),
    z = room.z * 7 + (game.level.biome === "volcano" ? 3 : 7),
    base = game.groundHeight(x, z),
    width = 7.6,
    depth = 2,
    height = 1.3,
    bottom =
      footprintMinimum(
        (px, pz) => game.groundHeight(px, pz),
        x,
        z,
        width,
        depth,
        game.terrainProfile?.step,
      ) - 0.18;
  return { x, z, base, bottom, width, depth, height, top: base + height };
}

function materials(game, style) {
  if (game.courtCoverMaterials) return game.courtCoverMaterials;
  const stone = game.stoneMat.clone(),
    mortar = game.darkMat.clone(),
    metal = game.forgeMetal ? game.forgeMetal.clone() : patinatedBronze(),
    wood =
      game.level.biome === "snow"
        ? (game.monasteryMaterials?.wood || game.darkMat).clone()
        : null;
  stone.name = style.name + " ashlar";
  stone.color.multiplyScalar(style.tint);
  stone.normalScale.setScalar(0.32);
  mortar.name = style.name + " mortar";
  mortar.color.copy(stone.color).multiplyScalar(0.52);
  mortar.normalScale.setScalar(0.24);
  metal.name = style.name + " weathered fittings";
  metal.color.setHex(style.metal);
  metal.roughness = 0.57;
  if (wood) wood.name = style.name + " wood ties";
  for (const m of [stone, mortar, metal, wood].filter(Boolean))
    m.vertexColors = true;
  return (game.courtCoverMaterials = { stone, mortar, metal, wood });
}

function tinted(geometry, tone) {
  const count = geometry.attributes.position.count,
    existing = geometry.attributes.color,
    values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const shade = (existing ? existing.getX(i) : 1) * tone;
    values.set([shade, shade, shade], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(values, 3));
  return geometry;
}

// Keep each slab's top flat and inside the support footprint. Its lower bevel
// and chipped side edges remain. A recessed mortar bed fills narrow cap joints.
function capGeometry(width, height, depth, seed) {
  const geometry = stoneBlockGeometry(width, height, depth, seed, 0.026),
    p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setXYZ(
      i,
      THREE.MathUtils.clamp(p.getX(i), -width / 2, width / 2),
      p.getY(i) > 0 ? height / 2 : Math.max(-height / 2, p.getY(i)),
      THREE.MathUtils.clamp(p.getZ(i), -depth / 2, depth / 2),
    );
  geometry.computeVertexNormals();
  return geometry;
}

export function buildCourtCover(game, room) {
  const style = COURT_COVER_STYLES[game.level.biome],
    plan = courtCoverPlan(game, room),
    m = materials(game, style),
    root = new THREE.Group(),
    rng = random(game.level.seed + room.index * 193 + 851),
    bottom = plan.bottom - plan.base,
    bodyTop = plan.height - style.cap,
    rows = Math.ceil((bodyTop - bottom) / style.course),
    rowHeight = (bodyTop - bottom) / rows;
  root.name = style.name + " " + room.index;
  root.position.set(plan.x, plan.base, plan.z);
  game.world.add(root);
  let serial = game.level.seed + room.index * 197,
    triangles = 0,
    parts = 0;
  const add = (geometry, material, x = 0, y = 0, z = 0, turn = 0, tone = 1) => {
    tinted(geometry, tone);
    triangles +=
      (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    parts++;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = turn;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const block = (width, height, depth, material, x, y, z, tone = 1) =>
    add(
      stoneBlockGeometry(width, height, depth, ++serial, 0.026),
      material,
      x,
      y,
      z,
      0,
      tone,
    );
  add(
    new THREE.BoxGeometry(7.44, bodyTop - bottom, 1.8),
    m.mortar,
    0,
    (bodyTop + bottom) / 2,
  );
  for (let row = 0; row < rows; row++) {
    // Alternate end stones rather than lining all mortar joints vertically.
    const intervals =
      row % 2
        ? [-3.76, -2.85, -0.95, 0.95, 2.85, 3.76]
        : [-3.76, -1.88, 0, 1.88, 3.76];
    for (let i = 1; i < intervals.length; i++) {
      const left = intervals[i - 1],
        right = intervals[i];
      block(
        right - left - 0.012,
        rowHeight - 0.012,
        1.87,
        m.stone,
        (left + right) / 2,
        bottom + (row + 0.5) * rowHeight,
        0,
        0.88 + rng() * 0.12,
      );
    }
  }
  // The mortar bed is 5 mm beneath the caps, including their chipped corners.
  add(
    new THREE.BoxGeometry(plan.width, 0.04, plan.depth),
    m.mortar,
    0,
    plan.height - 0.025,
  );
  for (let i = 0; i < style.caps; i++) {
    const left = -plan.width / 2 + (i * plan.width) / style.caps,
      right = -plan.width / 2 + ((i + 1) * plan.width) / style.caps;
    add(
      capGeometry(right - left - 0.012, style.cap, plan.depth, ++serial),
      m.stone,
      (left + right) / 2,
      plan.height - style.cap / 2,
      0,
      0,
      0.92 + rng() * 0.08,
    );
  }
  for (const sign of [-1, 1]) {
    const turn = sign < 0 ? Math.PI : 0;
    // Relief plates and fittings remain below the flat roof and within its
    // sides. They cannot snag walking, protrude through the cap or add supports.
    for (const x of [-2.5, 0, 2.5]) {
      block(1.04, 0.69, 0.027, m.mortar, x, 0.66, sign * 0.953);
      const relief = (geometry, material = m.stone, y = 0.34) => {
        geometry.scale(1, 1, 0.14);
        geometry.translate(0, 0, 0.012);
        return add(geometry, material, x, y, sign * 0.967, turn);
      };
      if (style.motif === "lotus") {
        relief(
          carvedPanelGeometry(0.91, 0.62, room.index + Math.round(x), [24, 32]),
          m.metal,
        );
      } else if (style.motif === "sun") {
        relief(solarPanelGeometry(0.91, 0.62, room.index));
      } else if (style.motif === "shell") {
        // This fan has positive depth, so its backing does not need the offset.
        const shell = shellReliefGeometry(0.99);
        shell.scale(1, 1, 0.16);
        add(shell, m.stone, x, 0.36, sign * 0.967, turn);
      } else {
        const face = (geometry, material, px, py, rz = 0) => {
          const mesh = add(geometry, material, x + px, py, sign * 0.978, turn);
          mesh.rotateZ(rz);
          return mesh;
        };
        if (style.motif === "gear" || style.motif === "orbit") {
          face(new THREE.TorusGeometry(0.215, 0.022, 6, 32), m.metal, 0, 0.66);
          face(new THREE.TorusGeometry(0.09, 0.014, 6, 24), m.metal, 0, 0.66);
          const n = style.motif === "gear" ? 12 : 8;
          for (let i = 0; i < n; i++) {
            const angle = (i * Math.PI * 2) / n,
              r = 0.26;
            face(
              new THREE.BoxGeometry(0.033, 0.057, 0.018),
              m.metal,
              Math.sin(angle) * r,
              0.66 + Math.cos(angle) * r,
              -angle,
            );
          }
          if (style.motif === "orbit") {
            face(
              new THREE.BoxGeometry(0.64, 0.015, 0.018),
              m.metal,
              0,
              0.66,
              0.4,
            );
            face(
              new THREE.BoxGeometry(0.015, 0.59, 0.018),
              m.metal,
              0,
              0.66,
              0.4,
            );
          }
        } else if (style.motif === "prism") {
          for (const offset of [-0.2, 0, 0.2]) {
            face(
              new THREE.BoxGeometry(0.033, 0.34, 0.018),
              m.metal,
              offset - 0.07,
              0.66,
              -0.4,
            );
            face(
              new THREE.BoxGeometry(0.033, 0.34, 0.018),
              m.metal,
              offset + 0.07,
              0.66,
              0.4,
            );
          }
        } else {
          for (const side of [-1, 1])
            for (let feather = 0; feather < 3; feather++)
              face(
                new THREE.BoxGeometry(0.3 + feather * 0.055, 0.027, 0.018),
                m.metal,
                side * (0.14 + feather * 0.06),
                0.77 - feather * 0.09,
                side * (style.motif === "mountain" ? 0.67 : 0.28),
              );
          if (style.motif === "wing")
            face(new THREE.BoxGeometry(0.025, 0.42, 0.018), m.metal, 0, 0.67);
        }
      }
    }
    if (m.wood) {
      for (const y of [0.19, 1.025])
        add(
          timberGeometry(7.35, 0.1, 0.065, ++serial),
          m.wood,
          0,
          y,
          sign * 0.962,
        );
      for (const x of [-3.34, 3.34]) {
        add(
          timberGeometry(0.16, 0.87, 0.065, ++serial),
          m.wood,
          x,
          0.63,
          sign * 0.962,
        );
        for (const y of [0.28, 0.98])
          block(0.1, 0.06, 0.016, m.metal, x, y, sign * 0.987);
      }
    }
    if (style.motif === "gear")
      for (const x of [-3.32, -0.63, 0.63, 3.32]) {
        block(0.12, 1.15, 0.063, m.metal, x, 0.66, sign * 0.955);
        for (const y of [0.18, 0.51, 0.85, 1.17])
          block(0.055, 0.055, 0.02, m.metal, x, y, sign * 0.988);
      }
  }
  const obstacle = {
    x: plan.x,
    z: plan.z,
    w: 3.8,
    d: 1,
    h: 1.3,
    climbable: true,
  };
  game.obstacles.push(obstacle);
  // Capture individual solid parts before merging, preserving camera clearance
  // through this fitted footing without a box around the whole courtyard.
  for (const mesh of root.children) game.cameraSurfaces?.capture(mesh);
  mergeArchitecture(root);
  const record = {
    root,
    plan,
    style: style.name,
    motif: style.motif,
    obstacle,
    triangles,
    parts,
  };
  (game.courtCovers ||= []).push(record);
  return record;
}
