import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { forgeGearGeometry } from "./forge-geometry.js";
import { palaceVesselGeometry } from "./palace-furnishing-art.js";

export const FORGE_WORKYARDS = [
  { name: "Expedition supply yard", kinds: ["ore", "ingots"], canopy: true },
  { name: "Air conduit workshop", kinds: ["pipes", "tools"], canopy: false },
  { name: "Ignition fuel store", kinds: ["fuel", "crucibles"], canopy: true },
  { name: "Pressure casting yard", kinds: ["pipes", "moulds"], canopy: false },
  { name: "Gear fitting workshop", kinds: ["gears", "tools"], canopy: true },
  { name: "Smelting stores", kinds: ["crucibles", "ingots"], canopy: false },
  { name: "Pilot bellows workshop", kinds: ["bellows", "fuel"], canopy: true },
  { name: "Tempering service yard", kinds: ["trough", "tools"], canopy: false },
  { name: "Engine assembly yard", kinds: ["gears", "moulds"], canopy: true },
];

// The section returns to its first point: bores have an inner wall and both
// annular end faces, rather than an open, one-sided cylinder.
export function workyardPipeGeometry(radius = 0.34, length = 1.45) {
  const inner = radius - 0.1;
  return new THREE.LatheGeometry(
    [
      [radius, -length / 2],
      [radius, length / 2],
      [inner, length / 2],
      [inner, -length / 2],
      [radius, -length / 2],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    20,
  );
}

export function forgeWorkyardArt(kind, material, seed, canopy = false) {
  const root = new THREE.Group();
  root.name = kind;
  let serial = seed;
  const add = (geometry, m, x = 0, y = 0, z = 0) => {
    const shade = 0.88 + 0.08 * Math.sin(++serial * 7.1);
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        new Float32Array(geometry.attributes.position.count * 3).fill(shade),
        3,
      ),
    );
    const mesh = new THREE.Mesh(geometry, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const box = (w, h, d, m, x, y, z) =>
    add(stoneBlockGeometry(w, h, d, ++serial, 0.008), m, x, y, z);
  const bar = (a, b, radius = 0.05) => {
    const p = new THREE.Vector3(...a),
      q = new THREE.Vector3(...b),
      direction = q.clone().sub(p),
      mesh = add(
        new THREE.CylinderGeometry(radius, radius, direction.length(), 10),
        material.metal,
        ...p.clone().add(q).multiplyScalar(0.5).toArray(),
      );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    return mesh;
  };
  const shelf = (height = 0.82) => {
    for (const x of [-0.85, 0.85])
      box(0.3, height, 1.1, material.stone, x, height / 2, 0);
    box(2.3, 0.2, 1.23, material.dark, 0, height + 0.1, 0);
    return height + 0.2;
  };
  const vessel = (x, base, scale = 0.9) => {
    const mesh = add(palaceVesselGeometry(true), material.clay, x, base, 0);
    mesh.scale.setScalar(scale);
    for (const side of [-1, 1])
      add(
        new THREE.TorusGeometry(0.12, 0.035, 6, 16),
        material.metal,
        x + side * 0.63 * scale,
        base + 0.39 * scale,
        0,
      );
  };

  // The rear band joins the foundation; its opposite face is the open aisle.
  box(2.3, 0.24, 0.25, material.dark, 0, 0.12, -0.59);
  if (["ore", "fuel", "ingots"].includes(kind)) {
    box(2.3, 0.18, 1.16, material.stone, 0, 0.09, 0);
    box(2.3, 1.1, 0.22, material.stone, 0, 0.55, -0.59);
    for (const x of [-1.1, 1.1])
      box(0.15, 0.86, 1.16, material.dark, x, 0.43, 0);
    for (const x of [0]) {
      if (kind === "ingots") {
        for (let row = 0; row < 3; row++)
          for (const dx of [-0.55, 0.55]) {
            const mesh = box(
              0.94,
              0.18,
              0.62,
              material.metal,
              x + dx + (row % 2 ? 0.08 : 0),
              0.27 + row * 0.18,
              0,
            );
            mesh.rotation.y = row % 2 ? 0.08 : -0.05;
          }
      } else {
        for (let i = 0; i < 8; i++) {
          const geometry = new THREE.IcosahedronGeometry(1, 1),
            p = geometry.attributes.position;
          for (let j = 0; j < p.count; j++) {
            const wobble =
              0.9 +
              0.12 *
                Math.sin(p.getX(j) * 5 + p.getY(j) * 3 + p.getZ(j) * 7 + i);
            p.setXYZ(
              j,
              p.getX(j) * wobble * 0.38,
              p.getY(j) * wobble * 0.27,
              p.getZ(j) * wobble * 0.28,
            );
          }
          geometry.computeVertexNormals();
          geometry.computeBoundingBox();
          add(
            geometry,
            kind === "fuel" ? material.dark : material.stone,
            x + ((i % 4) - 1.5) * 0.48,
            0.18 - geometry.boundingBox.min.y + (i >= 4 ? 0.15 : 0),
            i >= 4 ? -0.13 : 0.22,
          );
        }
      }
    }
  } else if (kind === "trough") {
    box(2.3, 0.25, 1.2, material.dark, 0, 0.125, 0);
    for (const z of [-0.53, 0.53])
      box(2.3, 0.72, 0.16, material.stone, 0, 0.6, z);
    for (const x of [-1.07, 1.07])
      box(0.16, 0.72, 1.2, material.stone, x, 0.6, 0);
    for (const x of [0]) {
      box(1.7, 0.08, 0.7, material.clay, x, 0.29, 0);
      bar([x - 0.6, 0.97, 0.4], [x + 0.6, 0.97, -0.4]);
    }
  } else {
    const top = shelf();
    for (const x of [0]) {
      if (kind === "crucibles") vessel(x, top, 0.8);
      else if (kind === "moulds") {
        box(1.85, 0.12, 1, material.clay, x, top + 0.06, 0);
        const ring = add(
          workyardPipeGeometry(0.43, 0.16),
          material.metal,
          x,
          top + 0.2,
          0,
        );
        ring.scale.z = 0.85;
        for (const dx of [-0.72, 0.72])
          box(0.28, 0.2, 0.6, material.dark, x + dx, top + 0.22, 0);
      } else if (kind === "pipes") {
        for (const dx of [-0.55, 0.55])
          box(0.18, 0.28, 0.85, material.stone, x + dx, top + 0.14, 0);
        add(
          workyardPipeGeometry(),
          material.metal,
          x,
          top + 0.56,
          0,
        ).rotation.z = Math.PI / 2;
        for (const dx of [-0.55, 0.55])
          add(
            new THREE.TorusGeometry(0.36, 0.035, 6, 20),
            material.dark,
            x + dx,
            top + 0.56,
            0,
          ).rotation.y = Math.PI / 2;
      } else if (kind === "gears") {
        box(1.8, 0.18, 0.65, material.stone, x, top + 0.09, 0);
        const gear = add(
          forgeGearGeometry(3.2, 18, 0.5).scale(0.23, 0.23, 0.4),
          material.metal,
          x,
          top + 0.95,
          0,
        );
        gear.rotation.z = Math.PI / 24;
        bar([x, top + 0.3, 0], [x, top + 1.6, 0], 0.07);
        bar([x - 0.65, top + 0.95, 0], [x + 0.65, top + 0.95, 0], 0.07);
        for (const dx of [-0.62, 0.62])
          box(0.18, 0.8, 0.48, material.dark, x + dx, top + 0.4, 0);
      } else if (kind === "bellows") {
        box(1.8, 0.12, 0.9, material.clay, x, top + 0.06, 0);
        for (let i = 0; i < 6; i++) {
          const leaf = box(
            1.5 - i * 0.07,
            0.11,
            0.74 - i * 0.02,
            i % 2 ? material.dark : material.clay,
            x,
            top + 0.17 + i * 0.1,
            0,
          );
          leaf.rotation.z = 0.03 * (i % 2 ? 1 : -1);
        }
        box(1.2, 0.12, 0.58, material.metal, x, top + 0.79, 0);
        bar([x - 0.5, top + 0.88, 0], [x + 0.5, top + 0.88, 0], 0.055);
      } else if (kind === "tools") {
        box(0.65, 0.18, 0.6, material.dark, x, top + 0.09, 0);
        box(0.32, 0.26, 0.35, material.metal, x, top + 0.3, 0);
        const shape = new THREE.Shape();
        shape.moveTo(-0.7, 0);
        shape.lineTo(0.68, 0);
        shape.lineTo(0.95, 0.2);
        shape.lineTo(0.3, 0.3);
        shape.lineTo(-0.6, 0.3);
        shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, {
          depth: 0.35,
          bevelEnabled: false,
        });
        g.translate(0, 0, -0.175);
        add(g, material.metal, x, top + 0.43, 0);
        box(0.13, 0.09, 0.85, material.clay, x + 0.92, top + 0.045, 0);
        box(0.46, 0.2, 0.24, material.metal, x + 0.92, top + 0.1, -0.3);
      } else throw new Error(`Unknown workyard furnishing: ${kind}`);
    }
  }
  if (canopy) {
    for (const x of [-1.0, 1.0]) {
      box(0.25, 3.5, 0.3, material.metal, x, 1.75, 0);
      for (const z of [-0.6, 0.6])
        bar([x, 3.0, 0], [x, 3.51 - z * 0.25, z], 0.065);
    }
    for (const z of [-0.6, 0.6])
      box(2.25, 0.2, 0.18, material.metal, 0, 3.51 - z * 0.25, z);
    const roof = box(2.35, 0.18, 1.6, material.clay, 0, 3.68, 0);
    roof.rotation.x = Math.atan(0.25);
    for (const x of [-1.0, 0, 1.0]) {
      const seam = box(0.055, 0.04, 1.59, material.metal, x, 3.79, 0);
      seam.rotation.x = Math.atan(0.25);
    }
  }
  return root;
}
