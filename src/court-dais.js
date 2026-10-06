import * as THREE from "three";
import { random } from "./campaign.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { mergeArchitecture } from "./visuals.js";

export const COURT_DAIS_STYLES = Object.freeze({
  jungle: {
    name: "Lotus paving",
    tile: 1.35,
    rows: 5,
    columns: 5,
    motif: "lotus",
    tint: 1.03,
    accent: 0x9caa87,
    metal: 0x9e9877,
  },
  desert: {
    name: "Solar limestone",
    tile: 1.9,
    rows: 4,
    columns: 6,
    motif: "sun",
    tint: 1,
    accent: 0xd4bc8f,
    metal: 0x9b8159,
  },
  snow: {
    name: "Mountain slate",
    tile: 1.1,
    rows: 6,
    columns: 4,
    motif: "mountain",
    tint: 1.04,
    accent: 0x8e989d,
    metal: 0x9e9683,
  },
  water: {
    name: "Shell mosaic",
    tile: 0.9,
    rows: 7,
    columns: 7,
    motif: "shell",
    tint: 1,
    accent: 0x9bb4a8,
    metal: 0x87a295,
  },
  volcano: {
    name: "Foundry flags",
    tile: 1.55,
    rows: 4,
    columns: 4,
    motif: "forge",
    tint: 1.16,
    accent: 0x8f8272,
    metal: 0xa0927e,
  },
  sky: {
    name: "Feather tessellation",
    tile: 1.6,
    rows: 5,
    columns: 7,
    motif: "wing",
    tint: 1.02,
    accent: 0xb3bdab,
    metal: 0xa7a17b,
  },
  crystal: {
    name: "Prismatic schist",
    tile: 1.15,
    rows: 6,
    columns: 6,
    motif: "prism",
    tint: 1.1,
    accent: 0x899cac,
    metal: 0x99a8ad,
  },
  eclipse: {
    name: "Meridian pavement",
    tile: 1.8,
    rows: 5,
    columns: 4,
    motif: "orbit",
    tint: 1.05,
    accent: 0xa49c86,
    metal: 0xb0a184,
  },
});

function materials(game, style) {
  if (game.courtDaisMaterials) return game.courtDaisMaterials;
  const stone = game.stoneMat.clone(),
    accent = game.stoneMat.clone(),
    mortar = game.darkMat.clone(),
    metal = patinatedBronze();
  stone.name = style.name + " tread stone";
  stone.color.multiplyScalar(style.tint);
  stone.normalScale.setScalar(0.3);
  accent.name = style.name + " border stone";
  accent.color.setHex(style.accent);
  accent.normalScale.setScalar(0.24);
  mortar.name = style.name + " recessed joints";
  mortar.color.copy(stone.color).multiplyScalar(0.54);
  mortar.normalScale.setScalar(0.15);
  metal.name = style.name + " worn inlay";
  metal.color.setHex(style.metal);
  metal.roughness = 0.76;
  for (const m of [stone, accent, mortar, metal]) m.vertexColors = true;
  return (game.courtDaisMaterials = { stone, accent, mortar, metal });
}

// A flat cap retains chipped lower edges without creating a raised corner or
// extending beyond the movement footprint. The joint bed is 5 mm below it.
function slab(width, height, depth, seed, tone) {
  const g = stoneBlockGeometry(width, height, depth, seed, 0.012),
    p = g.attributes.position,
    colors = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(
      i,
      THREE.MathUtils.clamp(p.getX(i), -width / 2, width / 2),
      p.getY(i) > 0 ? height / 2 : Math.max(-height / 2, p.getY(i)),
      THREE.MathUtils.clamp(p.getZ(i), -depth / 2, depth / 2),
    );
    if (colors)
      colors.setXYZ(
        i,
        colors.getX(i) * tone,
        colors.getY(i) * tone,
        colors.getZ(i) * tone,
      );
  }
  g.computeVertexNormals();
  return g;
}

function colorGeometry(g, tone = 1) {
  if (!g.attributes.color) {
    const c = new Float32Array(g.attributes.position.count * 3);
    c.fill(tone);
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  }
  return g;
}

// Narrow ribbons lie 1 mm above the pavement. They reuse the bronze material,
// have no emissive light, and do not create an additional walking obstacle.
function ribbon(points, width) {
  const values = [],
    uv = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1],
      [bx, bz] = points[i],
      length = Math.hypot(bx - ax, bz - az);
    if (length < 1e-8) continue;
    const dx = ((bz - az) * width) / (length * 2),
      dz = ((ax - bx) * width) / (length * 2);
    for (const [x, z] of [
      [ax + dx, az + dz],
      [bx + dx, bz + dz],
      [ax - dx, az - dz],
      [ax - dx, az - dz],
      [bx + dx, bz + dz],
      [bx - dx, bz - dz],
    ]) {
      values.push(x, 0, z);
      uv.push(x, z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(values, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  // The ribbon winding faces down; reversing each triangle makes its top visible.
  for (let i = 0; i < values.length / 9; i++) {
    const p = g.attributes.position,
      a = i * 3 + 1,
      b = i * 3 + 2,
      x = p.getX(a),
      z = p.getZ(a);
    p.setXYZ(a, p.getX(b), 0, p.getZ(b));
    p.setXYZ(b, x, 0, z);
  }
  g.computeVertexNormals();
  return colorGeometry(g, 0.83);
}

function motifPaths(motif, radius) {
  const paths = [],
    circle = (r, start = 0, end = Math.PI * 2) =>
      Array.from({ length: 49 }, (_, i) => {
        const a = start + ((end - start) * i) / 48;
        return [Math.sin(a) * r, Math.cos(a) * r];
      });
  if (motif === "sun" || motif === "orbit") {
    paths.push(circle(radius * 0.65), circle(radius * 0.87));
    for (let i = 0; i < (motif === "sun" ? 12 : 4); i++) {
      const a = (i * Math.PI * 2) / (motif === "sun" ? 12 : 4);
      paths.push([
        [Math.sin(a) * radius * 0.45, Math.cos(a) * radius * 0.45],
        [Math.sin(a) * radius, Math.cos(a) * radius],
      ]);
    }
    if (motif === "orbit")
      paths.push([
        [-radius, -radius * 0.35],
        [radius, radius * 0.35],
      ]);
  } else if (motif === "lotus") {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      paths.push(
        Array.from({ length: 17 }, (_, j) => {
          const t = (j * Math.PI) / 8,
            r = Math.sin(t / 2) * radius,
            angle = a + Math.sin(t) * 0.21;
          return [Math.sin(angle) * r, Math.cos(angle) * r];
        }),
      );
    }
  } else if (motif === "mountain" || motif === "wing") {
    for (let i = 0; i < 3; i++) {
      const r = radius * (1 - i * 0.22);
      paths.push([
        [-r, r * 0.45],
        [0, -r * (motif === "mountain" ? 0.7 : 0.15)],
        [r, r * 0.45],
      ]);
    }
    if (motif === "wing")
      paths.push([
        [0, -radius],
        [0, radius * 0.55],
      ]);
  } else if (motif === "shell") {
    paths.push(circle(radius, -Math.PI / 2, Math.PI / 2));
    for (let i = 0; i <= 8; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 8;
      paths.push([
        [0, -radius * 0.3],
        [Math.sin(a) * radius, Math.cos(a) * radius],
      ]);
    }
  } else {
    for (const scale of [0.5, 0.85]) {
      const r = radius * scale;
      paths.push(
        motif === "prism"
          ? [
              [0, -r],
              [r * 0.65, 0],
              [0, r],
              [-r * 0.65, 0],
              [0, -r],
            ]
          : [
              [-r, -r],
              [r, -r],
              [r, r],
              [-r, r],
              [-r, -r],
            ],
      );
    }
    if (motif === "forge")
      for (const sign of [-1, 1])
        paths.push([
          [-radius, sign * radius * 0.3],
          [radius, sign * radius * 0.3],
        ]);
  }
  return paths;
}

export function buildCourtDais(game, room) {
  const style = COURT_DAIS_STYLES[game.level.biome],
    m = materials(game, style),
    x = room.x * 7,
    z = room.z * 7,
    base = game.groundHeight(x, z),
    bottom =
      footprintMinimum(
        (px, pz) => game.groundHeight(px, pz),
        x,
        z,
        9,
        9,
        game.terrainProfile?.step,
      ) - 0.18,
    root = new THREE.Group(),
    steps = [],
    rng = random(game.level.seed + room.index * 137 + 921);
  root.name = style.name + " " + room.index;
  root.position.set(x, base, z);
  game.world.add(root);
  let seed = game.level.seed + room.index * 251,
    triangles = 0,
    parts = 0;
  const add = (g, material, px, py, pz, turn = 0) => {
    colorGeometry(g);
    triangles += (g.index?.count ?? g.attributes.position.count) / 3;
    parts++;
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(px, py, pz);
    mesh.rotation.y = turn;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  };
  for (let tier = 0; tier < 3; tier++) {
    const width = 9 - tier * 1.4,
      half = width / 2,
      top = 0.115 + tier * 0.2,
      low = tier ? top - 0.205 : bottom - base,
      step = {
        x,
        z,
        w: half,
        d: half,
        h: top,
        top: base + top,
        bottom: base + low,
        stepSupport: true,
        climbable: false,
      };
    steps.push(step);
    game.obstacles.push(step);
    add(
      new THREE.BoxGeometry(width, top - 0.005 - low, width),
      m.mortar,
      0,
      (top - 0.005 + low) / 2,
      0,
    );
    const tile = (left, right, near, far, border = false) => {
      const gap = 0.012,
        height = tier ? 0.194 : 0.105;
      add(
        slab(
          right - left - gap,
          height,
          far - near - gap,
          ++seed,
          0.89 + rng() * 0.11,
        ),
        border ? m.accent : m.stone,
        (left + right) / 2,
        top - height / 2,
        (near + far) / 2,
      );
    };
    if (tier < 2) {
      const inner = half - 0.7,
        count = Math.ceil(width / style.tile);
      for (let i = 0; i < count; i++) {
        const left = -half + (i * width) / count,
          right = -half + ((i + 1) * width) / count;
        tile(left, right, -half, -inner, (i + room.index + tier) % 3 === 0);
        tile(left, right, inner, half, (i + room.index + tier) % 3 === 0);
      }
      const n = Math.ceil((inner * 2) / style.tile);
      for (let i = 0; i < n; i++) {
        const near = -inner + (i * inner * 2) / n,
          far = -inner + ((i + 1) * inner * 2) / n;
        tile(-half, -inner, near, far, (i + room.index) % 3 === 0);
        tile(inner, half, near, far, (i + room.index) % 3 === 0);
      }
    } else {
      const rows = style.rows + (room.index % 2),
        columns = style.columns;
      for (let row = 0; row < rows; row++)
        for (let column = 0; column < columns; column++)
          tile(
            -half + (column * width) / columns,
            -half + ((column + 1) * width) / columns,
            -half + (row * width) / rows,
            -half + ((row + 1) * width) / rows,
            (row === 0 ||
              row === rows - 1 ||
              column === 0 ||
              column === columns - 1) &&
              (row + column + room.index) % 2 === 0,
          );
    }
    const inset = half - 0.13;
    add(
      ribbon(
        [
          [-inset, -inset],
          [inset, -inset],
          [inset, inset],
          [-inset, inset],
          [-inset, -inset],
        ],
        0.024,
      ),
      m.metal,
      0,
      top + 0.001,
      0,
    );
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        for (const path of motifPaths(style.motif, 0.19))
          add(
            ribbon(path, 0.018),
            m.metal,
            sx * (half - 0.38),
            top + 0.001,
            sz * (half - 0.38),
            ((room.index % 4) * Math.PI) / 2,
          );
    if (tier === 2)
      for (const path of motifPaths(style.motif, 0.96))
        add(
          ribbon(path, 0.025),
          m.metal,
          0,
          top + 0.001,
          0,
          ((room.index % 4) * Math.PI) / 2,
        );
  }
  // Thin pavement does not need to obstruct the camera above it; captured beds
  // still prevent an observer descending through the fitted foundation.
  for (const mesh of root.children) game.cameraSurfaces?.capture(mesh);
  mergeArchitecture(root);
  const record = {
    root,
    x,
    z,
    base,
    bottom,
    steps,
    style: style.name,
    motif: style.motif,
    triangles,
    parts,
  };
  (game.courtDaises ||= []).push(record);
  return record;
}
