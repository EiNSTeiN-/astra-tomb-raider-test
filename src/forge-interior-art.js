import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { forgeGearGeometry } from "./forge-geometry.js";
import { workyardPipeGeometry } from "./forge-workyard-art.js";

// Local footprints leave the central instrument and the sinking front shutter
// alone. The different arrangements are service aisles, not extra objectives.
export function forgeInteriorPlan(stage) {
  const part = (kind, x, z, w, d) => ({ kind, x, z, w, d });
  const plans = [
    [part("duct", -3.8, -3.7, 1.7, 2.2), part("duct", 3.8, -3.7, 1.7, 2.2)],
    [part("baffle", -4.35, -0.9, 1.1, 5.4), part("baffle", 4.35, -2, 1.1, 3.2)],
    [-3.7, 0, 3.7].map((x) => part("vessel", x, -4.25, 1.6, 1.6)),
    [
      part("gear", -2.7, -4.25, 2.4, 1.3),
      part("gear", 2.7, -4.25, 2.4, 1.3),
      part("bench", 4.25, 0, 1.25, 3.4),
    ],
    [
      part("casting", -4, -2.4, 1.5, 2.8),
      part("casting", -4, 1.5, 1.5, 2.8),
      part("hopper", 3.9, -2.5, 1.7, 2.6),
    ],
    [-4, 4].flatMap((x) =>
      [-2.9, 2.9].map((z) => part("pilot", x, z, 1.3, 1.3)),
    ),
    [
      part("fins", -2.7, -4.35, 2.8, 1.2),
      part("fins", 2.7, -4.35, 2.8, 1.2),
      part("trough", -4.25, 0, 1.25, 3.8),
    ],
    [
      part("impeller", -4, -2.9, 1.35, 3),
      part("impeller", 4, -2.9, 1.35, 3),
      part("cradle", 0, -4.4, 2.2, 1.3),
    ],
  ];
  if (!plans[stage]) throw new RangeError(`Unknown forge interior ${stage}`);
  return plans[stage];
}

// Each primitive is a closed volume. Tilt is baked by the builder before the
// same meshes become camera surfaces, physical solids and material batches.
export function forgeInteriorArt(spec, m, seed) {
  const root = new THREE.Group(),
    { kind, w, d } = spec;
  const add = (geometry, material, x, y, z) => {
    const shade = 0.91 + Math.sin(++seed * 9.3) * 0.06;
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        new Float32Array(geometry.attributes.position.count * 3).fill(shade),
        3,
      ),
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  const box = (w, h, d, mat, x = 0, y = h / 2, z = 0) =>
    add(stoneBlockGeometry(w, h, d, ++seed, 0.008), mat, x, y, z);
  const cylinder = (r, h, mat, x, y, z) =>
    add(new THREE.CylinderGeometry(r, r, h, 24), mat, x, y, z);
  const pipe = (r, h, x, y, z) =>
    add(workyardPipeGeometry(r, h), m.iron, x, y, z);
  const gear = (r, x, y, z, angle = 0) => {
    const rim = add(forgeGearGeometry(r, 16, 0.22), m.iron, x, y, z);
    rim.rotation.y = angle;
    // One closed six-arm web avoids overlapping diametric bars and their
    // coplanar faces at the hub. Its tips seat inside the thicker toothed rim.
    const outline = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      for (const side of [-1, 1]) {
        const px = Math.cos(a) * r * 0.84 - Math.sin(a) * side * 0.06,
          py = Math.sin(a) * r * 0.84 + Math.cos(a) * side * 0.06;
        if (!i && side === -1) outline.moveTo(px, py);
        else outline.lineTo(px, py);
      }
      outline.lineTo(
        Math.cos(a + Math.PI / 6) * 0.24,
        Math.sin(a + Math.PI / 6) * 0.24,
      );
    }
    outline.closePath();
    const web = new THREE.ExtrudeGeometry(outline, {
      depth: 0.18,
      bevelEnabled: false,
      steps: 1,
    });
    web.translate(0, 0, -0.09);
    add(web, m.iron, x, y, z).rotation.y = angle;
    const axle = cylinder(0.19, 0.65, m.iron, x, y, z);
    axle.rotation.set(Math.PI / 2, 0, angle);
  };
  box(w, 0.2, d, m.stone);
  if (kind === "duct") {
    box(w - 0.18, 0.7, d - 0.2, m.stone, 0, 0.55, 0);
    for (const z of [-0.55, 0.55]) {
      pipe(0.56, 1.8, 0, 1.8, z);
      for (const y of [1.05, 2.45]) cylinder(0.64, 0.13, m.iron, 0, y, z);
      box(0.85, 0.15, 0.1, m.iron, 0, 2.68, z);
    }
  } else if (kind === "baffle") {
    for (let z = -d / 2 + 0.55; z < d / 2; z += 1.1) {
      box(w - 0.12, 2.3, 0.42, m.stone, 0, 1.35, z);
      for (const y of [0.8, 1.5, 2.2])
        box(w - 0.04, 0.13, 0.5, m.iron, 0, y, z);
      box(w - 0.22, 0.18, 0.5, m.dark, 0, 2.57, z);
    }
  } else if (kind === "vessel") {
    cylinder(0.68, 0.35, m.stone, 0, 0.375, 0);
    add(
      new THREE.LatheGeometry(
        [
          [0, 0.5],
          [0.48, 0.5],
          [0.69, 0.85],
          [0.69, 2.55],
          [0.48, 2.95],
          [0.25, 3.05],
          [0.25, 3.35],
          [0, 3.35],
        ].map((p) => new THREE.Vector2(...p)),
        32,
      ),
      m.iron,
      0,
      0,
      0,
    );
    for (const y of [0.9, 2.5]) cylinder(0.75, 0.16, m.dark, 0, y, 0);
    box(0.42, 0.42, 0.16, m.stone, 0, 1.8, 0.71);
    const dial = cylinder(0.15, 0.06, m.iron, 0, 1.8, 0.82);
    dial.rotation.x = Math.PI / 2;
  } else if (kind === "gear" || kind === "impeller") {
    const large = kind === "impeller",
      angle = large ? Math.PI / 2 : 0,
      radius = large ? 1.22 : 0.95;
    for (const side of [-1, 1])
      box(
        large ? 1.15 : 0.35,
        large ? 1.7 : 1.2,
        large ? 0.35 : 1.1,
        m.stone,
        large ? 0 : side * 0.86,
        large ? 1.05 : 0.8,
        large ? side * 1.12 : 0,
      );
    gear(radius, 0, large ? 2.4 : 1.85, 0, angle);
    box(
      large ? 0.65 : 2.1,
      0.25,
      large ? 2.5 : 0.7,
      m.iron,
      0,
      large ? 1.75 : 1.35,
      0,
    );
  } else if (kind === "pilot") {
    cylinder(0.53, 1.4, m.stone, 0, 0.9, 0);
    cylinder(0.6, 0.2, m.iron, 0, 1.7, 0);
    pipe(0.39, 0.85, 0, 2.21, 0);
    for (const y of [1.91, 2.52]) cylinder(0.46, 0.1, m.iron, 0, y, 0);
  } else if (kind === "hopper") {
    for (const x of [-0.61, 0.61])
      for (const z of [-0.95, 0.95]) box(0.22, 2.3, 0.22, m.iron, x, 1.35, z);
    box(1.4, 0.25, 2.3, m.stone, 0, 0.6, 0);
    box(0.6, 1.3, 0.9, m.dark, 0, 1.3, 0);
    const bin = add(
      new THREE.CylinderGeometry(1, 0.45, 1.3, 4, 1, false, Math.PI / 4),
      m.stone,
      0,
      2.5,
      0,
    );
    bin.scale.set(1.05, 1, 1.65);
    box(1.56, 0.18, 2.46, m.iron, 0, 3.2, 0);
  } else if (kind === "fins") {
    box(w - 0.2, 0.4, d - 0.1, m.stone, 0, 0.4, 0);
    for (let x = -1.1; x < 1.2; x += 0.275)
      box(0.12, 1.8, 0.85, m.iron, x, 1.5, 0);
    for (const y of [0.75, 2.15]) box(w - 0.1, 0.15, 0.22, m.dark, 0, y, 0.42);
  } else if (kind === "casting" || kind === "trough") {
    box(w - 0.12, 0.5, d - 0.12, m.dark, 0, 0.45, 0);
    for (const x of [-1, 1])
      box(0.17, 0.3, d - 0.1, m.stone, x * (w / 2 - 0.15), 0.85, 0);
    for (const z of [-1, 1])
      box(w - 0.2, 0.3, 0.17, m.stone, 0, 0.85, z * (d / 2 - 0.15));
    if (kind === "casting")
      for (const z of [-0.7, 0, 0.7])
        box(w - 0.45, 0.13, 0.12, m.iron, 0, 0.76, z);
  } else if (kind === "bench" || kind === "cradle") {
    for (const z of [-d * 0.3, d * 0.3])
      box(w - 0.2, 0.65, 0.28, m.stone, 0, 0.525, z);
    box(w - 0.05, 0.2, d - 0.08, m.iron, 0, 0.95, 0);
    if (kind === "cradle") {
      const axle = cylinder(0.36, 1.75, m.iron, 0, 1.42, 0);
      axle.rotation.z = Math.PI / 2;
      for (const x of [-0.7, 0.7]) box(0.22, 0.35, 0.9, m.stone, x, 1.2, 0);
    } else for (const z of [-1, 0, 1]) box(0.7, 0.12, 0.4, m.stone, 0, 1.11, z);
  } else throw new RangeError(`Unknown forge furnishing ${kind}`);
  return root;
}
