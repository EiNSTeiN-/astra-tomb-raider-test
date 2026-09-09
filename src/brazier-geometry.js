import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { campStone, campTube, tintCampGeometry } from "./camp-geometry.js";

// Relief paths are in the small recessed panel's own coordinates.
const MOTIFS = {
  jungle: [
    [
      [0, -0.36],
      [0, 0.36],
    ],
    [
      [-0.09, -0.12],
      [0, -0.22],
      [0.09, -0.12],
    ],
    [
      [-0.09, 0.13],
      [0, 0.02],
      [0.09, 0.13],
    ],
  ],
  desert: [
    [
      [-0.1, 0],
      [0, 0.13],
      [0.1, 0],
      [0, -0.13],
      [-0.1, 0],
    ],
    [
      [0, 0.2],
      [0, 0.37],
    ],
    [
      [0, -0.2],
      [0, -0.37],
    ],
  ],
  snow: [
    [
      [0, -0.34],
      [-0.1, -0.13],
      [0.1, 0.13],
      [0, 0.34],
      [-0.1, 0.13],
      [0.1, -0.13],
      [0, -0.34],
    ],
  ],
  water: [
    [
      [-0.1, -0.27],
      [-0.03, -0.2],
      [0.04, -0.3],
      [0.1, -0.23],
    ],
    [
      [-0.1, -0.02],
      [-0.03, 0.05],
      [0.04, -0.05],
      [0.1, 0.02],
    ],
    [
      [-0.1, 0.23],
      [-0.03, 0.3],
      [0.04, 0.2],
      [0.1, 0.27],
    ],
  ],
  volcano: [
    [
      [-0.08, -0.3],
      [-0.08, 0.18],
    ],
    [
      [0, -0.18],
      [0, 0.36],
    ],
    [
      [0.08, -0.3],
      [0.08, 0.18],
    ],
  ],
  sky: [
    [
      [-0.11, -0.2],
      [0, -0.32],
      [0.11, -0.2],
    ],
    [
      [-0.11, 0.03],
      [0, -0.09],
      [0.11, 0.03],
    ],
    [
      [-0.11, 0.26],
      [0, 0.14],
      [0.11, 0.26],
    ],
  ],
  crystal: [
    [
      [0, -0.38],
      [-0.1, -0.08],
      [-0.07, 0.25],
      [0, 0.38],
      [0.07, 0.25],
      [0.1, -0.08],
      [0, -0.38],
    ],
    [
      [0, -0.38],
      [0, 0.38],
    ],
  ],
  eclipse: [
    [
      [-0.1, -0.15],
      [0.1, -0.15],
    ],
    [
      [0, -0.36],
      [0, -0.21],
    ],
    [
      [0, 0.32],
      [-0.1, 0.23],
      [-0.1, 0.04],
      [0, -0.04],
      [0.1, 0.04],
      [0.1, 0.23],
      [0, 0.32],
    ],
  ],
};

export function brazierGeometry(biome, mats, detailed) {
  const root = new THREE.Group(),
    sides = mats.finish.sides,
    radial = detailed ? 48 : 16;
  const add = (
    geometry,
    material,
    x = 0,
    y = 0,
    z = 0,
    parent = root,
    shade = 1,
  ) => {
    const mesh = new THREE.Mesh(tintCampGeometry(geometry, shade), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const cylinder = (a, b, h, mat, y, segments = sides) =>
    add(new THREE.CylinderGeometry(a, b, h, segments), mat, 0, y);
  const lathe = (points, mat, segments = radial) =>
    add(
      new THREE.LatheGeometry(
        points.map((p) => new THREE.Vector2(...p)),
        segments,
      ),
      mat,
    );
  const box = (w, h, d, mat, x, y, z, parent = root) =>
    add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  cylinder(0.58, 0.64, 0.18, mats.stone, 0.03);
  cylinder(0.49, 0.57, 0.12, mats.stone, 0.18);
  cylinder(0.4, 0.47, 0.14, mats.stone, 0.31);
  cylinder(0.33, 0.33, 1.82, mats.stone, 1.29);
  for (const y of [0.43, 1.02, 1.64, 2.19]) {
    cylinder(0.36, 0.37, 0.085, mats.stone, y);
    if (detailed) cylinder(0.37, 0.37, 0.022, mats.metal, y + 0.045);
  }
  lathe(
    [
      [0.29, 2.17],
      [0.31, 2.23],
      [0.4, 2.25],
      [0.44, 2.3],
      [0.43, 2.35],
      [0.26, 2.39],
    ],
    mats.stone,
    sides * 2,
  );
  // A continuous thick wall includes the basin interior and its rolled rim.
  lathe(
    [
      [0, 2.22],
      [0.18, 2.22],
      [0.2, 2.32],
      [0.27, 2.4],
      [0.46, 2.55],
      [0.64, 2.69],
      [0.73, 2.76],
      [0.75, 2.82],
      [0.72, 2.87],
      [0.68, 2.86],
      [0.64, 2.77],
      [0.51, 2.66],
      [0.32, 2.52],
      [0.13, 2.48],
      [0, 2.48],
    ],
    mats.metal,
  );
  const rim = add(
    new THREE.TorusGeometry(0.714, 0.027, detailed ? 8 : 4, radial),
    mats.metal,
    0,
    2.856,
  );
  rim.rotation.x = Math.PI / 2;
  cylinder(0.39, 0.3, 0.08, mats.recess, 2.59, radial);
  for (let i = 0; i < (detailed ? 15 : 5); i++) {
    const a = i * 2.39996,
      r = 0.09 + Math.sqrt(i / (detailed ? 15 : 5)) * 0.28;
    const c = add(
      detailed ? campStone(i + 0.7) : new THREE.IcosahedronGeometry(1, 0),
      mats.coal,
      Math.cos(a) * r,
      2.64 + (i % 3) * 0.023,
      Math.sin(a) * r,
    );
    c.scale.set(
      0.09 + (i % 3) * 0.017,
      0.052 + (i % 4) * 0.009,
      0.08 + (i % 2) * 0.025,
    );
    c.rotation.y = a;
  }
  if (detailed) {
    for (let i = 0; i < sides; i++) {
      const a = ((i + 0.5) * Math.PI * 2) / sides,
        face = new THREE.Group();
      const radius = 0.33 * Math.cos(Math.PI / sides) + 0.001;
      face.position.set(Math.sin(a) * radius, 1.3, Math.cos(a) * radius);
      face.rotation.y = a;
      face.scale.x = Math.min(
        1,
        (2 * 0.33 * Math.sin(Math.PI / sides) - 0.025) / 0.286,
      );
      root.add(face);
      box(0.245, 1.32, 0.018, mats.recess, 0, 0, 0, face);
      for (const x of [-0.13, 0.13])
        box(0.027, 1.39, 0.035, mats.stone, x, 0, 0.011, face);
      for (const y of [-0.69, 0.69])
        box(0.286, 0.04, 0.035, mats.stone, 0, y, 0.011, face);
      for (const path of MOTIFS[biome])
        add(
          campTube(
            path.map(([x, y]) => [x, y, 0.024]),
            0.01,
            path.length * 4,
          ),
          mats.metal,
          0,
          0,
          0,
          face,
        );
      // Cast ribs brace the underside of the bowl and finish in a riveted tab.
      const rib = add(
        campTube(
          [
            [0, 2.32, 0.25],
            [0, 2.44, 0.36],
            [0, 2.6, 0.57],
            [0, 2.78, 0.72],
          ],
          0.024,
          16,
        ),
        mats.metal,
      );
      rib.rotation.y = a;
      const rivet = add(
        new THREE.SphereGeometry(0.035, 8, 6),
        mats.metal,
        Math.sin(a) * 0.727,
        2.78,
        Math.cos(a) * 0.727,
      );
      rivet.scale.y = 0.7;
    }
    for (const side of [-1, 1]) {
      const handle = add(
        new THREE.TorusGeometry(0.125, 0.021, 8, 24),
        mats.metal,
        side * 0.69,
        2.58,
      );
      handle.rotation.y = Math.PI / 2;
      box(0.04, 0.19, 0.1, mats.metal, side * 0.68, 2.65, 0);
    }
    for (const z of [-0.17, 0, 0.17])
      box(0.64, 0.025, 0.026, mats.metal, 0, 2.605, z);
  }
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const transformed = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const geometry = transformed.index
      ? transformed.toNonIndexed()
      : transformed;
    if (geometry !== transformed) transformed.dispose();
    if (!groups.has(mesh.material)) groups.set(mesh.material, []);
    groups.get(mesh.material).push(geometry);
    mesh.geometry.dispose();
  });
  return [...groups].map(([material, pieces]) => {
    const geometry = mergeGeometries(pieces, false);
    pieces.forEach((g) => g.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return { geometry, material };
  });
}
