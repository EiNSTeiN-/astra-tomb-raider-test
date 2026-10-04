import * as THREE from "three";
import {
  stoneBlockGeometry,
  carvedPanelGeometry,
} from "./temple-architecture.js";

// Each assembly stays within its declared footprint. Large visible pieces are
// marked individually: an open rack never acquires an invisible solid wall.
export function discoverySettingModule(biome, plan, m, bottom = -0.15) {
  const root = new THREE.Group();
  let seed = 1701 + plan.variant * 137;
  const add = (geometry, material, x, y, z, solid = false) => {
    const colors =
      geometry.attributes.color?.array ||
      new Float32Array(geometry.attributes.position.count * 3).fill(1);
    const tone =
      material === m.stone ? 0.87 + (Math.sin(++seed) + 1) * 0.065 : 1;
    for (let i = 0; i < colors.length; i++) colors[i] *= tone;
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.settingSolid = solid;
    root.add(mesh);
    return mesh;
  };
  const box = (w, h, d, material, x, y, z, solid = false) =>
    add(stoneBlockGeometry(w, h, d, ++seed, 0.025), material, x, y, z, solid);
  const cylinder = (r, h, material, x, y, z, solid = false, sides = 12) =>
    add(new THREE.CylinderGeometry(r, r, h, sides), material, x, y, z, solid);
  const ring = (r, tube, material, x, y, z) =>
    add(new THREE.TorusGeometry(r, tube, 6, 32), material, x, y, z);
  const timber = ["snow", "sky"].includes(biome),
    foundry = biome === "volcano",
    frame = timber ? m.wood : foundry ? m.metal : m.stone;
  const foot = (w, d, x = 0, z = 0, top = 0.12) =>
    box(w, top - bottom, d, m.dark, x, (top + bottom) / 2, z, true);
  const crate = (x, z, h = 0.7) => {
    box(
      0.96,
      h,
      0.86,
      timber || biome === "jungle" ? m.wood : frame,
      x,
      0.16 + h / 2,
      z,
      true,
    );
    for (const y of [0.25, h + 0.08]) box(1.01, 0.07, 0.91, m.metal, x, y, z);
    for (const dx of [-0.32, 0.32])
      box(0.045, h + 0.05, 0.93, m.metal, x + dx, 0.16 + h / 2, z);
    box(0.25, 0.2, 0.018, m.trim, x, 0.4, z + 0.441);
  };
  const jar = (x, z, y = 0.14, size = 1) => {
    const points = [
      [0.16, 0],
      [0.27, 0.08],
      [0.34, 0.3],
      [0.32, 0.52],
      [0.16, 0.67],
      [0.14, 0.78],
      [0.19, 0.8],
      [0.19, 0.84],
      [0.12, 0.84],
      [0.12, 0.78],
      [0.11, 0.73],
      [0.11, 0.7],
    ].map(([r, h]) => new THREE.Vector2(r * size, h * size));
    add(new THREE.LatheGeometry(points, 16), m.trim, x, y, z, true);
    // These are stored, covered jars. The lid closes the narrow mouth both
    // visually and physically; a body cannot fit into the hollow shell below.
    cylinder(
      0.196 * size,
      0.045 * size,
      m.trim,
      x,
      y + 0.85 * size,
      z,
      true,
      16,
    );
    ring(0.33 * size, 0.018, m.bronze, x, y + 0.37 * size, z).rotation.x =
      Math.PI / 2;
    for (const dx of [-0.23, 0.23])
      ring(
        0.11 * size,
        0.025,
        m.trim,
        x + dx * size,
        y + 0.58 * size,
        z,
      ).rotation.y = Math.PI / 2;
  };
  const roll = (x, y, z, length = 0.6) => {
    const mesh = cylinder(0.09, length, m.cloth, x, y, z, false, 12);
    mesh.rotation.z = Math.PI / 2;
    for (const dx of [-length * 0.3, length * 0.3])
      ring(0.095, 0.012, m.seam, x + dx, y, z).rotation.y = Math.PI / 2;
  };
  const plate = (x, y, z, variant) => {
    box(0.64, 0.75, 0.045, m.dark, x, y, z);
    if (biome === "jungle") {
      add(
        carvedPanelGeometry(0.59, 0.68, variant, [14, 22]),
        m.stone,
        x,
        y - 0.34,
        z + 0.03,
      );
    } else if (["desert", "eclipse"].includes(biome)) {
      ring(0.2, 0.014, m.bronze, x, y, z + 0.04);
      const count = biome === "desert" ? 12 : 7;
      for (let i = 0; i < count; i++) {
        const a = (i * Math.PI * 2) / count;
        const tick = box(
          0.012,
          0.065,
          0.016,
          m.bronze,
          x + Math.sin(a) * 0.26,
          y + Math.cos(a) * 0.26,
          z + 0.04,
        );
        tick.rotation.z = -a;
      }
    } else if (biome === "water") {
      for (let iz = 0; iz < 3; iz++)
        for (let ix = 0; ix < 4; ix++)
          box(
            0.105,
            0.115,
            0.027,
            (ix + iz) % 3 ? m.trim : m.stone,
            x - 0.2 + ix * 0.13,
            y - 0.17 + iz * 0.16,
            z + 0.04,
          );
    } else if (biome === "crystal") {
      const diamond = box(0.24, 0.24, 0.035, m.bronze, x, y, z + 0.04);
      diamond.rotation.z = Math.PI / 4;
      for (const dx of [-0.21, 0.21])
        box(0.018, 0.46, 0.025, m.trim, x + dx, y, z + 0.04);
    } else {
      for (const dx of [-0.25, 0.25])
        for (const dy of [-0.3, 0.3])
          add(
            new THREE.SphereGeometry(0.024, 6, 4),
            m.bronze,
            x + dx,
            y + dy,
            z + 0.04,
          );
      for (let i = 0; i < 4; i++)
        box(
          0.34 - i * 0.03,
          0.015,
          0.015,
          m.trim,
          x,
          y - 0.12 + i * 0.09,
          z + 0.04,
        );
    }
  };

  if (plan.kind === "wall") {
    foot(3.18, 1.05);
    const heights = plan.variant === 2 ? [1.8, 2.25, 1.25] : [2.35, 1.7, 1.2];
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 1.035,
        height = heights[i],
        courses = Math.ceil(height / 0.36);
      for (let row = 0; row < courses; row++)
        box(
          1.025,
          height / courses - 0.009,
          0.72,
          frame,
          x,
          0.12 + ((row + 0.5) * height) / courses,
          -0.1,
          true,
        );
      box(1.035, 0.07, 0.79, m.dark, x, height + 0.1, -0.1);
      plate(x, 0.84, 0.285, i + plan.variant);
      if (timber) {
        for (const dx of [-0.46, 0.46])
          box(0.065, height, 0.04, m.trim, x + dx, height / 2 + 0.12, 0.28);
      }
    }
  } else if (plan.kind === "rack") {
    for (const x of [-1.08, 1.08])
      for (const z of [-0.42, 0.42]) {
        foot(0.24, 0.24, x, z, 0.17);
        box(0.13, 1.87, 0.13, frame, x, 1.1, z, true);
      }
    for (const y of [0.46, 1.12, 1.79]) {
      box(2.42, 0.075, 1.02, frame, 0, y, 0, true);
      box(2.45, 0.12, 0.065, m.dark, 0, y + 0.04, -0.5);
    }
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.68;
      if (["snow", "sky", "desert"].includes(biome)) {
        for (const y of [0.61, 1.27]) roll(x, y, 0, 0.55);
        box(0.48, 0.23, 0.4, m.wood, x, 1.97, 0, true);
        box(0.49, 0.03, 0.42, m.cloth, x, 2.1, 0);
      } else if (biome === "water") {
        for (const y of [0.59, 1.25, 1.92])
          for (let n = 0; n < 3; n++)
            ring(
              0.19 - n * 0.047,
              0.018,
              m.seam,
              x,
              y + n * 0.007,
              0,
            ).rotation.x = Math.PI / 2;
      } else if (foundry) {
        for (const y of [0.66, 1.32, 1.99]) {
          box(0.47, 0.28, 0.44, m.metal, x, y, 0, true);
          cylinder(0.12, 0.035, m.dark, x, y + 0.15, 0);
        }
      } else if (biome === "jungle") {
        jar(x, 0, 0.5, 0.62);
        box(0.44, 0.17, 0.42, m.stone, x, 1.24, 0, true);
        plate(x, 1.47, 0.22, i);
      } else {
        for (const y of [0.62, 1.28, 1.95]) {
          box(0.43, 0.23, 0.44, m.stone, x, y, 0, true);
          for (const dx of [-0.12, 0.12])
            box(0.024, 0.02, 0.45, m.bronze, x + dx, y + 0.125, 0);
        }
      }
    }
  } else if (plan.kind === "column") {
    foot(1.24, 1.24, 0, 0, 0.15);
    cylinder(0.61, 0.13, m.stone, 0, 0.215, 0, true, 16);
    const h = 1.1 + plan.variant * 0.22;
    cylinder(
      0.43,
      h,
      frame,
      0,
      0.28 + h / 2,
      0,
      true,
      biome === "crystal" ? 6 : 12,
    );
    cylinder(0.5, 0.1, m.dark, 0, 0.31 + h, 0, true, 12);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      box(
        0.032,
        h * 0.72,
        0.032,
        m.trim,
        Math.sin(a) * 0.429,
        0.3 + h * 0.48,
        Math.cos(a) * 0.429,
      );
    }
    ring(0.445, 0.018, m.bronze, 0, 0.38, 0).rotation.x = Math.PI / 2;
  } else if (plan.kind === "bench") {
    for (const x of [-0.93, 0.93]) {
      foot(0.43, 0.88, x, 0, 0.44);
      box(0.46, 0.075, 0.93, m.stone, x, 0.47, 0, true);
    }
    for (const z of [-0.28, 0.02, 0.32])
      box(2.44, 0.13, 0.28, frame, 0, 0.59, z, true);
    for (const x of [-1.07, 1.07]) box(0.12, 0.12, 0.98, m.trim, x, 0.69, 0.02);
    box(0.72, 0.04, 0.76, timber ? m.cloth : m.trim, -0.43, 0.678, 0);
    if (timber) roll(0.59, 0.76, 0.08, 0.65);
    else box(0.42, 0.08, 0.37, m.dark, 0.66, 0.7, 0.12, true);
  } else if (plan.kind === "storage") {
    foot(2.55, 1.21);
    if (biome === "desert") {
      jar(-0.62, 0, 0.14, 1.12);
      jar(0.21, -0.12, 0.14, 0.8);
      jar(0.85, 0.08, 0.14, 0.68);
    } else {
      crate(-0.63, 0, 0.67);
      crate(0.58, 0, 1.02);
      if (biome === "water")
        for (let i = 0; i < 4; i++)
          ring(
            0.22 - i * 0.04,
            0.018,
            m.seam,
            -0.63,
            0.87 + i * 0.007,
            0,
          ).rotation.x = Math.PI / 2;
      else if (biome === "sky")
        for (const z of [-0.22, 0.12]) roll(0.58, 1.33, z, 0.66);
    }
  } else if (plan.kind === "basin") {
    foot(2.57, 1.25);
    // Dry stone sorting trough / iron mold bin. No decorative water or fire
    // suggests an emitter that does not exist in the positional soundscape.
    box(2.46, 0.1, 1.15, m.dark, 0, 0.2, 0, true);
    for (const x of [-1.16, 1.16])
      box(0.15, 0.49, 1.15, frame, x, 0.44, 0, true);
    for (const z of [-0.5, 0.5]) box(2.46, 0.49, 0.15, frame, 0, 0.44, z, true);
    for (let i = 0; i < 5; i++) {
      const mesh = box(
        0.24 + (i % 2) * 0.1,
        0.12,
        0.27,
        foundry ? m.metal : m.stone,
        -0.83 + i * 0.41,
        0.32,
        Math.sin(i * 7) * 0.14,
      );
      mesh.rotation.y = i * 0.5;
    }
    for (const x of [-0.86, 0, 0.86]) plate(x, 0.45, 0.586, plan.variant);
  }
  return root;
}
