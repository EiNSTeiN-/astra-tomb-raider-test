import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { shellReliefGeometry } from "./palace-geometry.js";

// A closed ceramic cross-section, including its inner wall and solid floor.
// Remove only pole-degenerate triangles; keep every visible interior surface.
export function palaceVesselGeometry(basin = false) {
  const profile = basin
    ? [
        [0, 0],
        [0.48, 0],
        [0.55, 0.08],
        [0.72, 0.43],
        [0.74, 0.51],
        [0.65, 0.51],
        [0.62, 0.43],
        [0.43, 0.14],
        [0, 0.14],
      ]
    : [
        [0, 0],
        [0.24, 0],
        [0.29, 0.08],
        [0.46, 0.32],
        [0.5, 0.63],
        [0.44, 0.91],
        [0.27, 1.1],
        [0.23, 1.25],
        [0.28, 1.28],
        [0.28, 1.36],
        [0.19, 1.36],
        [0.19, 1.26],
        [0.21, 1.15],
        [0.36, 0.91],
        [0.42, 0.63],
        [0.38, 0.35],
        [0.21, 0.15],
        [0, 0.15],
      ];
  const lathe = new THREE.LatheGeometry(
      profile.map((p) => new THREE.Vector2(...p)),
      24,
    ),
    source = lathe.toNonIndexed();
  lathe.dispose();
  const p = source.attributes.position,
    positions = [],
    normals = [],
    uv = [];
  for (let i = 0; i < p.count; i += 3) {
    const [a, b, c] = [i, i + 1, i + 2].map((j) =>
      new THREE.Vector3().fromBufferAttribute(p, j),
    );
    if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() < 1e-14) continue;
    for (let j = i; j < i + 3; j++) {
      positions.push(p.getX(j), p.getY(j), p.getZ(j));
      normals.push(
        source.attributes.normal.getX(j),
        source.attributes.normal.getY(j),
        source.attributes.normal.getZ(j),
      );
      uv.push(source.attributes.uv.getX(j), source.attributes.uv.getY(j));
    }
  }
  source.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

const THEMES = [
  ["Quay cargo", "cargo", "bench"],
  ["Exchange weights", "balance", "chest"],
  ["Counting records", "desk", "archive"],
  ["Pump workshop", "pipework", "tools"],
  ["Tidekeeper memorial", "bench", "stele"],
  ["Intake stores", "filter", "measures"],
  ["Counterflow fittings", "pipework", "paired"],
  ["Queen's audience", "throne", "basin"],
  ["Reserve measures", "measures", "archive"],
  ["Abyssal offerings", "altar", "basin"],
];
export function palaceFurnishingPlan(room) {
  const [name, left, right] = THEMES[room];
  return {
    name,
    room,
    settings: [left, right].map((kind, i) => ({
      id: `palace-furnishing-${room}-${i}`,
      kind,
      x: i ? 16.05 : -16.05,
      z: -21.25,
      angle: i ? -0.15 : 0.15,
      width: 2.6,
      depth: 2.0,
    })),
  };
}

export function palaceFurnishingArt(kind, m, seed = 0) {
  const root = new THREE.Group();
  root.name = kind;
  let serial = seed;
  const add = (g, material, x = 0, y = 0, z = 0) => {
    const p = g.attributes.position,
      colors = new Float32Array(p.count * 3),
      shade = 0.88 + 0.08 * Math.sin(++serial * 7.1);
    for (let i = 0; i < p.count; i++) {
      const c = shade * (0.96 + 0.04 * Math.sin(p.getX(i) * 3 + p.getY(i) * 2));
      colors.set([c, c * 0.992, c * 0.98], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.furnishingSolid = true;
    root.add(mesh);
    return mesh;
  };
  const box = (w, h, d, mat, x, y, z) =>
    add(stoneBlockGeometry(w, h, d, ++serial, 0.008), mat, x, y, z);
  const cylinder = (r, h, mat, x, y, z, r2 = r) =>
    add(new THREE.CylinderGeometry(r2, r, h, 16), mat, x, y, z);
  const ring = (r, t, mat, x, y, z) =>
    add(new THREE.TorusGeometry(r, t, 5, 24), mat, x, y, z);
  const pipe = (a, b, r = 0.08) => {
    const p = new THREE.Vector3(...a),
      q = new THREE.Vector3(...b),
      d = q.clone().sub(p),
      mesh = add(
        new THREE.CylinderGeometry(r, r, d.length(), 16),
        m.metal,
        ...p.clone().add(q).multiplyScalar(0.5).toArray(),
      );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      d.normalize(),
    );
    return mesh;
  };
  const jar = (x, z, size = 1, y = 0) => {
    const body = add(palaceVesselGeometry(), m.ceramic, x, y, z);
    body.scale.setScalar(size);
    for (const h of [0.2, 0.84])
      ring(
        (h < 0.5 ? 0.39 : 0.47) * size,
        0.018 * size,
        m.blue,
        x,
        y + h * size,
        z,
      ).rotation.x = Math.PI / 2;
    for (const dx of [-0.33, 0.33]) {
      const handle = ring(
        0.15 * size,
        0.035 * size,
        m.ceramic,
        x + dx * size,
        y + 0.99 * size,
        z,
      );
      handle.scale.y = 1.35;
    }
    return body;
  };
  const bench = (back = false) => {
    box(2.15, 0.2, 0.86, m.stone, 0, 0.88, 0);
    for (const x of [-0.73, 0.73]) {
      box(0.33, 0.8, 0.73, m.stone, x, 0.4, 0);
      box(0.47, 0.12, 0.83, m.dark, x, 0.06, 0);
    }
    box(1.8, 0.08, 0.05, m.blue, 0, 0.88, 0.43);
    if (back) {
      box(2.05, 1.35, 0.18, m.stone, 0, 1.65, -0.34);
      box(2.15, 0.13, 0.27, m.dark, 0, 2.35, -0.34);
    }
  };
  const table = (top = 1.18) => {
    box(2.16, 0.17, 1.15, m.stone, 0, top - 0.085, 0);
    for (const x of [-0.79, 0.79]) {
      box(0.3, top - 0.15, 0.86, m.stone, x, (top - 0.15) / 2, 0);
      box(0.46, 0.1, 1.0, m.dark, x, 0.05, 0);
    }
    box(1.82, 0.08, 0.055, m.blue, 0, top - 0.09, 0.58);
  };
  const tablet = (x, y, z, angle = 0) => {
    const slab = box(0.76, 0.065, 0.52, m.blue, x, y, z);
    slab.rotation.x = angle;
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 3; col++)
        box(
          0.06 + 0.025 * ((row + col) % 2),
          0.012,
          0.024,
          m.stone,
          x + (col - 1) * 0.18,
          y + 0.035,
          z + (row - 1.5) * 0.09,
        );
  };
  const basin = (x = 0, y = 0.95, z = 0) => {
    cylinder(0.46, y, m.stone, x, y / 2, z, 0.24);
    cylinder(0.55, 0.13, m.dark, x, y - 0.02, z);
    add(palaceVesselGeometry(true), m.stone, x, y + 0.02, z);
    ring(0.72, 0.025, m.blue, x, y + 0.5, z).rotation.x = Math.PI / 2;
  };
  if (kind === "cargo") {
    jar(-0.56, 0.1, 0.85);
    jar(0.48, -0.28, 1.05);
    jar(0.54, 0.55, 0.6);
    for (let i = 0; i < 4; i++)
      ring(
        0.25 - i * 0.04,
        0.022,
        m.rope,
        -0.64,
        0.02 + i * 0.015,
        -0.58,
      ).rotation.x = Math.PI / 2;
  } else if (kind === "bench" || kind === "throne") {
    bench(kind === "throne");
    if (kind === "throne") {
      for (const x of [-0.94, 0.94]) {
        box(0.16, 0.45, 0.85, m.stone, x, 1.13, 0);
        cylinder(0.09, 0.75, m.metal, x, 1.65, -0.33);
      }
      add(
        shellReliefGeometry(0.48),
        m.stone,
        0,
        1.65,
        -0.29,
      ).userData.furnishingSolid = false;
    } else
      for (const x of [-0.72, 0.72])
        add(
          shellReliefGeometry(0.19),
          m.stone,
          x,
          0.54,
          0.318,
        ).userData.furnishingSolid = false;
  } else if (kind === "balance") {
    table();
    cylinder(0.12, 1.2, m.metal, 0, 1.78, 0);
    box(2.0, 0.065, 0.08, m.metal, 0, 2.3, 0);
    for (const x of [-0.68, 0.68]) {
      for (const d of [-0.2, 0.2]) pipe([x + d, 2.3, 0], [x, 1.7, d], 0.014);
      cylinder(0.28, 0.045, m.metal, x, 1.68, 0);
    }
    for (const [i, r] of [0.09, 0.12, 0.16].entries())
      cylinder(
        r,
        0.13 + i * 0.05,
        m.dark,
        (i - 1) * 0.24,
        1.24 + i * 0.025,
        0.35,
      );
  } else if (kind === "chest") {
    box(1.9, 0.8, 1.05, m.wood, 0, 0.46, 0);
    box(2.02, 0.15, 1.15, m.wood, 0, 0.93, 0);
    for (const x of [-0.72, 0.72]) box(0.075, 0.99, 1.18, m.metal, x, 0.53, 0);
    box(0.29, 0.24, 0.04, m.metal, 0, 0.74, 0.55);
    box(0.08, 0.2, 0.07, m.dark, 0, 0.72, 0.58);
    for (const x of [-0.65, 0.65])
      for (const z of [-0.35, 0.35]) box(0.2, 0.16, 0.25, m.dark, x, 0.08, z);
  } else if (kind === "desk" || kind === "archive") {
    table();
    if (kind === "desk") tablet(-0.35, 1.22, 0.02);
    for (let i = 0; i < 4; i++) {
      const scroll = cylinder(
        0.095,
        0.75,
        m.paper,
        0.53,
        1.273 + i * 0.12,
        -0.24 + i * 0.12,
      );
      scroll.rotation.z = Math.PI / 2;
      for (const dx of [-0.22, 0.22])
        ring(
          0.1,
          0.012,
          m.rope,
          0.53 + dx,
          1.273 + i * 0.12,
          -0.24 + i * 0.12,
        ).rotation.y = Math.PI / 2;
    }
    if (kind === "archive") {
      jar(-0.72, -0.24, 0.65, 1.18);
    } else pipe([-0.72, 1.23, 0.35], [-0.17, 1.23, 0.24], 0.018);
  } else if (kind === "pipework" || kind === "paired") {
    if (kind === "paired") {
      jar(-0.57, 0, 0.95);
      jar(0.57, 0, 0.95);
      pipe([-0.57, 1.03, 0], [0.57, 1.03, 0], 0.1);
    } else {
      table();
      pipe([-0.8, 1.45, 0], [0.7, 1.45, 0], 0.16);
      for (const x of [-0.65, 0.65]) {
        box(0.22, 0.19, 0.46, m.dark, x, 1.27, 0);
        const flange = cylinder(0.26, 0.07, m.metal, x, 1.45, 0);
        flange.rotation.z = Math.PI / 2;
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          const bolt = cylinder(
            0.025,
            0.1,
            m.dark,
            x,
            1.45 + Math.sin(a) * 0.22,
            Math.cos(a) * 0.22,
          );
          bolt.rotation.z = Math.PI / 2;
        }
      }
      pipe([0.1, 1.45, 0], [0.1, 1.93, 0], 0.09);
      cylinder(0.15, 0.07, m.metal, 0.1, 1.94, 0);
      box(0.68, 0.07, 0.12, m.metal, 0.1, 2.02, 0);
    }
  } else if (kind === "tools") {
    bench();
    for (const x of [-0.78, 0.78]) box(0.11, 1.8, 0.13, m.wood, x, 0.9, -0.36);
    for (const y of [0.5, 1.5, 1.8]) box(1.7, 0.12, 0.14, m.wood, 0, y, -0.36);
    for (const x of [-0.52, 0, 0.52]) {
      pipe([x, 0.85, -0.275], [x, 1.63, -0.275], 0.028);
      box(0.24, 0.1, 0.075, m.metal, x, 1.61, -0.275);
    }
  } else if (kind === "stele" || kind === "altar") {
    box(1.9, 0.18, 1.2, m.dark, 0, 0.09, 0);
    box(1.7, 0.16, 1.0, m.stone, 0, 0.25, 0);
    box(1.36, 1.9, 0.55, m.stone, 0, 1.27, -0.18);
    box(1.56, 0.18, 0.73, m.dark, 0, 2.3, -0.18);
    box(1.1, 1.38, 0.055, m.blue, 0, 1.3, 0.12);
    add(
      shellReliefGeometry(0.4),
      m.stone,
      0,
      1.38,
      0.1,
    ).userData.furnishingSolid = false;
    if (kind === "altar") {
      box(2.0, 0.18, 1.13, m.stone, 0, 0.87, 0.06);
      cylinder(0.28, 0.055, m.metal, 0, 0.99, 0.37);
    }
  } else if (kind === "filter") {
    bench();
    const basket = cylinder(0.65, 0.77, m.metal, 0, 1.35, 0, 0.56);
    for (let i = 0; i < 14; i++) {
      const a = (i * Math.PI) / 7;
      pipe(
        [Math.cos(a) * 0.66, 0.98, Math.sin(a) * 0.66],
        [Math.cos(a) * 0.57, 1.73, Math.sin(a) * 0.57],
        0.024,
      );
    }
    for (const y of [1.01, 1.37, 1.72])
      ring(y > 1.5 ? 0.57 : 0.65, 0.04, m.dark, 0, y, 0).rotation.x =
        Math.PI / 2;
    // Ribs seat in a complete dark drum and retain real bearing at both rims.
    basket.material = m.dark;
  } else if (kind === "measures") {
    for (const [i, size] of [0.7, 1.1, 0.85].entries()) {
      const x = (i - 1) * 0.72,
        z = i % 2 ? 0.25 : -0.25;
      jar(x, z, size);
      cylinder(0.3 * size, 0.06, m.stone, x, 1.38 * size, z);
      cylinder(0.07 * size, 0.07, m.metal, x, 1.43 * size, z);
    }
  } else if (kind === "basin") basin();
  else throw Error("Unknown palace furnishing " + kind);
  return root;
}
