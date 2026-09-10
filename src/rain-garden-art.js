import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { fittedWallGeometry } from "./sky-masonry.js";
import { timberGeometry } from "./monastery-architecture.js";
import { mergeArchitecture } from "./visuals.js";
import { windSurface } from "./wind-art.js";

export function prepareGardenGeometry(geometry, material, tint = 1) {
  if (material.vertexColors) {
    if (!geometry.attributes.color)
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Float32Array(geometry.attributes.position.count * 3).fill(tint),
          3,
        ),
      );
  } else geometry.deleteAttribute("color");
  if (material.userData.windMetal) windSurface(geometry);
  return geometry;
}

// The dressed faces end at y=0, exactly at the existing collision deck. The
// recessed joints expose continuous bedding rather than holes through the floor.
export function gardenPavingGeometry(w, d, thickness, seed = 1) {
  const paving = fittedWallGeometry(
    [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ],
    0.14,
    seed,
    1.05,
  )
    .rotateX(-Math.PI / 2)
    .translate(0, -0.07, 0);
  const p = paving.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, Math.min(0, p.getY(i)));
  paving.computeVertexNormals();
  const bed = stoneBlockGeometry(w, thickness - 0.09, d, seed + 1).translate(
    0,
    -(thickness + 0.09) / 2,
    0,
  );
  bed.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      new Float32Array(bed.attributes.position.count * 3).fill(0.68),
      3,
    ),
  );
  const geometry = mergeGeometries([paving, bed]);
  paving.dispose();
  bed.dispose();
  geometry.userData.gardenPaving = { w, d, thickness };
  return geometry;
}

// Curved timber segments retain end joints, unlike a smooth torus. Axis is Z.
export function gardenWheelSegment(inner, outer, depth, arc, seed = 1) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, arc, false);
  shape.absarc(0, 0, inner, arc, 0, true);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    steps: 1,
    curveSegments: 6,
  }).translate(0, 0, -depth / 2);
  const p = geo.attributes.position,
    uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const angle = Math.atan2(p.getY(i), p.getX(i));
    uv.setXY(i, Math.hypot(p.getX(i), p.getY(i)) + p.getZ(i), angle * outer);
  }
  geo.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      new Float32Array(p.count * 3).fill(0.75 + (seed % 7) * 0.027),
      3,
    ),
  );
  return geo;
}

export function gardenLiftPulleyGeometry() {
  return new THREE.LatheGeometry(
    [
      [0.08, -0.13],
      [0.51, -0.13],
      [0.51, -0.075],
      [0.42, -0.055],
      [0.41, -0.03],
      [0.41, 0.03],
      [0.42, 0.055],
      [0.51, 0.075],
      [0.51, 0.13],
      [0.08, 0.13],
      [0.08, -0.13],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    40,
  ).rotateX(Math.PI / 2);
}

export function gardenPlaque(text, width, stone, metal, label) {
  const root = new THREE.Group(),
    height = width / 6;
  root.name = `Garden mounted inscription: ${text}`;
  const add = (w, h, d, x, y, z, material) => {
    const mesh = new THREE.Mesh(
      prepareGardenGeometry(stoneBlockGeometry(w, h, d, 6700), material),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  };
  add(width + 0.15, height + 0.16, 0.13, 0, 0, -0.045, stone);
  for (const s of [-1, 1]) {
    add(width + 0.08, 0.032, 0.04, 0, s * (height / 2 + 0.035), 0.024, metal);
    add(0.032, height + 0.075, 0.04, s * (width / 2 + 0.022), 0, 0.024, metal);
  }
  const lettering = label(text, width);
  lettering.position.z = 0.03;
  root.add(lettering);
  mergeArchitecture(root);
  return root;
}

export function buildGardenShelter({ add, block, wood, metal }) {
  const span = (a, b, w, d = w) => {
    const from = new THREE.Vector3(...a),
      to = new THREE.Vector3(...b);
    const m = add(
      timberGeometry(w, from.distanceTo(to), d, 9900),
      wood,
      ...from.clone().add(to).multiplyScalar(0.5).toArray(),
    );
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      to.sub(from).normalize(),
    );
    return m;
  };
  // The four masonry guides support mortised plates and two open king-post
  // trusses. Even their lowest timber is above the upper passenger's head.
  for (const x of [7.25, 10.75]) {
    block(0.56, 0.24, 3.7, x, 11.02, 0, wood);
    for (const z of [-1.5, 1.5]) {
      block(0.59, 0.07, 0.56, x, 10.9, z, metal);
      block(0.63, 0.07, 0.58, x, 11.11, z, metal);
    }
  }
  for (const z of [-1.5, 1.5]) {
    block(4.05, 0.25, 0.28, 9, 11.23, z, wood);
    span([7, 11.3, z], [9, 12.5, z], 0.18, 0.24);
    span([9, 12.5, z], [11, 11.3, z], 0.18, 0.24);
    span([9, 11.3, z], [9, 12.5, z], 0.14, 0.2);
    for (const side of [-1, 1])
      span([9, 11.38, z], [9 + side * 1.12, 11.89, z], 0.1, 0.12);
  }
  block(0.19, 0.22, 4.1, 9, 12.54, 0, wood);
  for (const side of [-1, 1]) {
    block(0.2, 0.25, 4.1, 9 + side * 2, 11.36, 0, wood);
    const slope = Math.atan(1.2 / 2);
    for (let row = 0; row < 7; row++) {
      const ax = 0.12 + row * 0.31;
      for (let col = 0; col < 9; col++) {
        const z = -1.82 + col * 0.455;
        const tile = add(
          timberGeometry(0.49, 0.052, 0.443, 10000 + row * 9 + col),
          wood,
          9 + side * ax,
          12.65 - ax * 0.6 + (6 - row) * 0.009,
          z,
        );
        tile.rotation.z = -side * slope;
      }
    }
  }
  // The front truss supports the bearing outside the passenger's head space.
  for (const x of [8.83, 9.17]) block(0.07, 0.72, 0.65, x, 12.13, 1.25, metal);
  const pin = add(
    new THREE.CylinderGeometry(0.09, 0.09, 0.58, 12),
    metal,
    9,
    11.8,
    1,
  );
  pin.rotation.z = Math.PI / 2;
}

export function buildGardenWheel({ add, block, wood, metal, wheel }) {
  for (const side of [-1, 1]) {
    const z = side * 0.48;
    for (let i = 0; i < 16; i++) {
      const segment = add(
        gardenWheelSegment(1.97, 2.25, 0.2, Math.PI / 8 - 0.014, i),
        wood,
        0,
        0,
        z,
        wheel,
        false,
      );
      segment.rotation.z = (i * Math.PI) / 8;
      const angle = ((i + 0.5) * Math.PI) / 8;
      const stud = add(
        new THREE.CylinderGeometry(0.046, 0.055, 0.043, 8),
        metal,
        Math.cos(angle) * 2.1,
        Math.sin(angle) * 2.1,
        z + side * 0.13,
        wheel,
        false,
      );
      stud.rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const spoke = block(
        0.16,
        1.85,
        0.17,
        Math.cos(a) * 1.17,
        Math.sin(a) * 1.17,
        z,
        wood,
        wheel,
        false,
      );
      spoke.rotation.z = a - Math.PI / 2;
    }
    const hub = add(
      new THREE.CylinderGeometry(0.32, 0.32, 0.27, 12),
      metal,
      0,
      0,
      z,
      wheel,
      false,
    );
    hub.rotation.x = Math.PI / 2;
  }
  // Sixteen open buckets catch the falling feed. Each has a radial floor and
  // an outer lip; the ends meet the two segmented wooden rims.
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    for (const [radius, width, depth] of [
      [2.14, 0.39, 0.1],
      [2.34, 0.1, 0.31],
    ]) {
      const paddle = block(
        width,
        depth,
        1.16,
        Math.cos(a) * radius,
        Math.sin(a) * radius,
        0,
        wood,
        wheel,
        false,
      );
      paddle.rotation.z = a;
    }
  }
}
