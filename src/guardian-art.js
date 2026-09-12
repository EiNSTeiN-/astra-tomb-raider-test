import {
  guardianPauldronGeometry,
  guardianSurfaceData,
  weatherGuardianMaterial,
} from "./guardian-surfaces.js";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { pbrMaterial } from "./visuals.js";
import { poseFeet } from "./pose.js";

// Rigidly weighted armor pieces share three skinned draws. Their joints remain
// mechanical; no stone surface stretches when a knee or elbow bends.
const geometryCache = new Map();
const materialCache = new WeakMap();
const WHITE = new THREE.Color(0xffffff);
export const GUARDIAN_PALETTES = {
  jungle: [0x8a9785, 0xa58c55],
  desert: [0xc7aa7c, 0xba8751],
  snow: [0x9caeb5, 0x9d9c8d],
  water: [0x79a39e, 0x8e9976],
  volcano: [0x62616a, 0xc08658],
  sky: [0xb7b4a1, 0xbc9e64],
  crystal: [0x939ba9, 0x9c91a9],
  eclipse: [0x646873, 0xc4af77],
};
const smooth = (x) => {
  x = THREE.MathUtils.clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
};

function skeleton(kind) {
  const root = new THREE.Bone(),
    bones = [root],
    named = { root };
  root.name = "GuardianRoot";
  const add = (name, parent, x, y, z = 0) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    bones.push(b);
    named[name] = b;
    return b;
  };
  const pelvis = add("pelvis", root, 0, 1.65);
  const chest = add("chest", pelvis, 0, 0.47);
  add("head", chest, 0, 0.85);
  add("core", chest, 0, 0.12, 0.45);
  for (const [side, x] of [
    ["Left", -1],
    ["Right", 1],
  ]) {
    const hip = add(`${side}UpLeg`, pelvis, x * 0.32, 0);
    const knee = add(`${side}Leg`, hip, 0, -0.76);
    add(`${side}Foot`, knee, 0, -0.72);
    const shoulder = add(
      `${side}Arm`,
      chest,
      x * (kind === "hunter" ? 0.65 : 0.76),
      0.48,
    );
    const elbow = add(`${side}ForeArm`, shoulder, 0, -0.64);
    const hand = add(`${side}Hand`, elbow, 0, -0.58);
    if (side === "Right") {
      const weapon = add("weapon", hand, 0, -0.04, 0.08);
      add("muzzle", weapon, 0, kind === "sentry" ? 1.45 : 0, 0.13);
    } else if (kind === "bulwark") add("shield", hand, 0.18, 0.34, 0.23);
  }
  root.updateMatrixWorld(true);
  return { root, bones, named };
}

function shape(points, depth = 0.07, bevel = 0.025, holes = []) {
  const s = new THREE.Shape(points.map((p) => new THREE.Vector2(...p)));
  for (const points of holes)
    s.holes.push(new THREE.Path(points.map((p) => new THREE.Vector2(...p))));
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 8,
  });
  return g.translate(0, 0, -depth / 2);
}
function geometryFor(kind, detail) {
  const key = `${kind}-${detail}`;
  if (geometryCache.has(key)) return geometryCache.get(key);
  const { bones, named } = skeleton(kind);
  const parts = [[], [], []],
    segments = detail ? 20 : 10;
  const add = (
    bone,
    material,
    geometry,
    at = [0, 0, 0],
    scale = [1, 1, 1],
    rotation = [0, 0, 0],
    tint = 0xffffff,
  ) => {
    const node = named[bone],
      transform = new THREE.Matrix4().compose(
        new THREE.Vector3(...at),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...scale),
      );
    transform.premultiply(node.matrixWorld);
    let g = geometry;
    if (g.index) {
      g = geometry.toNonIndexed();
      geometry.dispose();
    }
    g.applyMatrix4(transform);
    const p = g.attributes.position,
      n = g.attributes.normal;
    const colors = [],
      indices = [],
      weights = [],
      uv = [];
    const color = new THREE.Color(tint);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      const grain =
        Math.sin(x * 11 + y * 19 + z * 7) * Math.sin(y * 13 - x * 5 + z * 16);
      const wear =
        material === 2
          ? 1
          : 0.84 + grain * 0.055 + Math.max(0, n.getY(i)) * 0.1;
      colors.push(color.r * wear, color.g * wear, color.b * wear);
      const axis =
        Math.abs(n.getX(i)) > 0.65 ? 0 : Math.abs(n.getY(i)) > 0.65 ? 1 : 2;
      uv.push((axis === 0 ? z : x) / 1.8, (axis === 1 ? z : y) / 1.8);
      indices.push(bones.indexOf(node), 0, 0, 0);
      weights.push(1, 0, 0, 0);
    }
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    g.clearGroups();
    guardianSurfaceData(g);
    parts[material].push(g);
  };
  const orb = (b, mat, at, scale, tint) =>
    add(
      b,
      mat,
      new THREE.SphereGeometry(1, segments, detail ? 12 : 7),
      at,
      scale,
      [0, 0, 0],
      tint,
    );
  const ring = (
    b,
    mat,
    radius,
    tube,
    at,
    scale = [1, 1, 1],
    rotate = [0, 0, 0],
  ) =>
    add(
      b,
      mat,
      new THREE.TorusGeometry(radius, tube, detail ? 6 : 4, segments),
      at,
      scale,
      rotate,
    );
  const plate = (
    b,
    mat,
    points,
    at,
    depth = 0.07,
    tint = 0xffffff,
    rotation = [0, 0, 0],
  ) =>
    add(
      b,
      mat,
      shape(points, depth, detail ? 0.022 : 0.012),
      at,
      [1, 1, 1],
      rotation,
      tint,
    );
  const shell = (b, mat, profile, at, scale = [1, 1, 1], tint) =>
    add(
      b,
      mat,
      new THREE.LatheGeometry(
        profile.map((p) => new THREE.Vector2(...p)),
        segments,
      ),
      at,
      scale,
      [0, 0, 0],
      tint,
    );
  const line = (b, mat, points, radius = 0.012, tint = 0xffffff) => {
    if (!detail) return;
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
      false,
      "centripetal",
    );
    add(
      b,
      mat,
      new THREE.TubeGeometry(curve, points.length * 3, radius, 4, false),
      undefined,
      undefined,
      undefined,
      tint,
    );
  };
  // Pelvis, separated abdominal lamellae, cuirass, and a recessed power seal.
  orb("pelvis", 0, [0, 0.02, 0], [0.48, 0.3, 0.31], 0x515854);
  for (let i = 0; i < 3; i++)
    shell(
      "pelvis",
      i === 1 ? 1 : 0,
      [
        [0.36, 0],
        [0.43, 0.025],
        [0.43, 0.1],
        [0.37, 0.12],
      ],
      [0, 0.13 + i * 0.12, 0],
      [1, 1, 0.7],
    );
  shell(
    "chest",
    0,
    [
      [0, -0.27],
      [0.35, -0.26],
      [0.49, -0.1],
      [0.6, 0.25],
      [0.56, 0.48],
      [0.31, 0.6],
      [0, 0.61],
    ],
    [0, 0, 0],
    [1, 1, 0.68],
  );
  for (const s of [-1, 1]) {
    plate(
      "chest",
      0,
      [
        [s * 0.07, 0.48],
        [s * 0.43, 0.43],
        [s * 0.53, 0.24],
        [s * 0.26, 0.08],
        [s * 0.12, 0.18],
      ],
      [0, 0.03, 0.34],
      0.09,
    );
    line(
      "chest",
      1,
      [
        [s * 0.1, 0.46, 0.415],
        [s * 0.36, 0.39, 0.46],
        [s * 0.44, 0.28, 0.43],
        [s * 0.26, 0.19, 0.45],
      ],
      0.012,
    );
    plate(
      "pelvis",
      0,
      [
        [-0.18, 0],
        [0.18, 0],
        [0.22, -0.39],
        [0, -0.47],
        [-0.22, -0.39],
      ],
      [s * 0.25, 0.09, 0.29],
      0.05,
    );
    line("pelvis", 1, [
      [s * 0.25 - 0.1, 0.01, 0.34],
      [s * 0.25, -0.25, 0.35],
      [s * 0.25 + 0.1, 0.01, 0.34],
    ]);
  }
  orb("chest", 0, [0, 0.12, 0.43], [0.25, 0.25, 0.06], 0x242b2a);
  ring("chest", 1, 0.23, 0.038, [0, 0.12, 0.465]);
  add(
    "core",
    2,
    new THREE.IcosahedronGeometry(0.145, 1),
    [0, 0, 0.025],
    [1, 1, 0.55],
  );
  for (const s of [-1, 1])
    line(
      "chest",
      1,
      [
        [s * 0.14, -0.09, 0.43],
        [s * 0.32, -0.14, 0.35],
        [s * 0.4, -0.05, 0.35],
      ],
      0.015,
    );
  shell(
    "head",
    1,
    [
      [0.14, -0.4],
      [0.19, -0.37],
      [0.19, -0.22],
      [0.14, -0.2],
    ],
    [0, 0, 0],
  );
  orb("head", 0, [0, 0.03, -0.035], [0.31, 0.41, 0.28]);
  // Open eye sockets in the mask reveal small, recessed lenses.
  const face = [
    [-0.25, 0.34],
    [-0.34, 0.16],
    [-0.29, -0.18],
    [-0.14, -0.35],
    [0, -0.39],
    [0.14, -0.35],
    [0.29, -0.18],
    [0.34, 0.16],
    [0.25, 0.34],
  ];
  const eyes = [-1, 1].map((s) => [
    [s * 0.06, 0.13],
    [s * 0.25, 0.18],
    [s * 0.23, 0.055],
    [s * 0.075, 0.04],
  ]);
  add("head", 0, shape(face, 0.1, 0.018, eyes), [0, 0, 0.23]);
  for (const s of [-1, 1]) {
    orb("head", 0, [s * 0.16, 0.105, 0.24], [0.135, 0.082, 0.035], 0x111d20);
    orb("head", 2, [s * 0.16, 0.11, 0.282], [0.066, 0.022, 0.008]);
    line(
      "head",
      1,
      [
        [s * 0.04, 0.17, 0.31],
        [s * 0.2, 0.22, 0.31],
        [s * 0.28, 0.19, 0.29],
      ],
      0.018,
    );
    line(
      "head",
      1,
      [
        [s * 0.25, 0, 0.3],
        [s * 0.15, -0.09, 0.34],
        [s * 0.11, -0.24, 0.31],
      ],
      0.011,
    );
  }
  plate(
    "head",
    0,
    [
      [0, 0.23],
      [-0.068, -0.08],
      [0, -0.13],
      [0.068, -0.08],
    ],
    [0, 0, 0.34],
    0.08,
  );
  line(
    "head",
    0,
    [
      [-0.095, -0.23, 0.3],
      [0, -0.2, 0.33],
      [0.095, -0.23, 0.3],
    ],
    0.014,
    0x353b39,
  );
  ring(
    "head",
    1,
    0.31,
    0.04,
    [0, 0.29, -0.015],
    [1, 0.88, 1],
    [Math.PI / 2, 0, 0],
  );
  // Layered greaves, knee bearings, shoulder plates, elbows, and fingers.
  for (const side of ["Left", "Right"]) {
    const sign = side === "Left" ? -1 : 1;
    orb(`${side}UpLeg`, 1, [0, -0.015, 0], [0.19, 0.19, 0.2]);
    shell(
      `${side}UpLeg`,
      0,
      [
        [0, -0.68],
        [0.17, -0.67],
        [0.22, -0.4],
        [0.22, -0.16],
        [0.13, -0.11],
        [0, -0.11],
      ],
      [0, 0, 0],
      [1, 1, 0.92],
    );
    orb(`${side}Leg`, 1, [0, 0, 0], [0.16, 0.15, 0.16]);
    plate(
      `${side}Leg`,
      0,
      [
        [-0.18, 0.08],
        [0, 0.2],
        [0.18, 0.08],
        [0.15, -0.12],
        [0, -0.2],
        [-0.15, -0.12],
      ],
      [0, 0, 0.155],
      0.095,
    );
    shell(
      `${side}Leg`,
      0,
      [
        [0, -0.64],
        [0.12, -0.63],
        [0.18, -0.48],
        [0.2, -0.19],
        [0.16, -0.14],
        [0, -0.14],
      ],
      [0, 0, 0],
      [1, 1, 0.95],
    );
    line(
      `${side}Leg`,
      1,
      [
        [0, -0.21, 0.22],
        [-0.07, -0.37, 0.21],
        [0, -0.58, 0.16],
        [0.07, -0.37, 0.21],
        [0, -0.21, 0.22],
      ],
      0.014,
    );
    orb(`${side}Foot`, 1, [0, 0.015, 0], [0.13, 0.13, 0.13]);
    const foot = shape(
      [
        [-0.17, -0.04],
        [-0.17, 0.065],
        [-0.1, 0.13],
        [0.17, 0.11],
        [0.24, -0.035],
      ],
      0.33,
      0.025,
    );
    add(
      `${side}Foot`,
      0,
      foot,
      [0, -0.105, 0.1],
      [1, 1, 1],
      [0, Math.PI / 2, 0],
    );
    for (let j = 0; j < 3; j++)
      line(
        `${side}Foot`,
        1,
        [
          [-0.16, -0.005 - j * 0.02, 0.21 + j * 0.07],
          [0, 0.025 - j * 0.02, 0.21 + j * 0.07],
          [0.16, -0.005 - j * 0.02, 0.21 + j * 0.07],
        ],
        0.01,
      );
    orb(`${side}Arm`, 1, [0, 0, 0], [0.2, 0.2, 0.22]);
    for (let j = 0; j < 3; j++) {
      add(
        `${side}Arm`,
        j === 0 ? 1 : 0,
        guardianPauldronGeometry(detail, j, sign),
        [sign * 0.04, 0.02 - j * 0.105, -0.015],
      );
    }
    shell(
      `${side}Arm`,
      0,
      [
        [0, -0.56],
        [0.135, -0.55],
        [0.18, -0.35],
        [0.16, -0.2],
        [0, -0.18],
      ],
      [0, 0, 0],
    );
    orb(`${side}ForeArm`, 1, [0, 0, 0], [0.15, 0.15, 0.16]);
    shell(
      `${side}ForeArm`,
      0,
      [
        [0, -0.52],
        [0.14, -0.51],
        [0.21, -0.35],
        [0.2, -0.15],
        [0.13, -0.1],
        [0, -0.1],
      ],
      [0, 0, 0],
    );
    ring(
      `${side}ForeArm`,
      1,
      0.16,
      0.022,
      [0, -0.49, 0],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    );
    line(
      `${side}ForeArm`,
      1,
      [
        [-0.1, -0.17, 0.19],
        [0, -0.28, 0.235],
        [0.1, -0.17, 0.19],
      ],
      0.015,
    );
    orb(`${side}Hand`, 0, [0, -0.08, 0.01], [0.16, 0.17, 0.14]);
    for (let j = 0; j < (detail ? 4 : 2); j++)
      orb(
        `${side}Hand`,
        1,
        [(j - (detail ? 1.5 : 0.5)) * 0.067, -0.13, 0.13],
        [0.037, 0.09, 0.045],
      );
  }
  // Equipment defines each combat silhouette before its health bar is visible.
  if (kind === "sentry") {
    ring("head", 1, 0.63, 0.035, [0, 0.1, -0.19]);
    ring("head", 0, 0.56, 0.055, [0, 0.1, -0.21]);
    for (let j = 0; j < 8; j++) {
      const a = (j * Math.PI) / 4;
      plate(
        "head",
        1,
        [
          [-0.05, 0],
          [0, 0.24],
          [0.05, 0],
        ],
        [Math.sin(a) * 0.62, 0.1 + Math.cos(a) * 0.62, -0.18],
        0.035,
        0xffffff,
        [0, 0, -a],
      );
    }
    shell(
      "weapon",
      1,
      [
        [0, -1.24],
        [0.04, -1.22],
        [0.048, 1.04],
        [0.065, 1.14],
        [0, 1.15],
      ],
      [0, 0, 0],
    );
    ring("weapon", 1, 0.29, 0.043, [0, 1.45, 0]);
    add("muzzle", 2, new THREE.IcosahedronGeometry(0.16, 1));
    for (const s of [-1, 1])
      plate(
        "weapon",
        0,
        [
          [s * 0.12, 0],
          [s * 0.32, 0.34],
          [s * 0.28, 0.68],
          [s * 0.18, 0.4],
        ],
        [0, 1.1, 0],
        0.06,
      );
  } else if (kind === "hunter") {
    plate(
      "head",
      1,
      [
        [-0.09, 0.1],
        [0, -0.31],
        [0.09, 0.1],
        [0, 0.19],
      ],
      [0, -0.04, 0.4],
      0.18,
    );
    for (const s of [-1, 1]) {
      plate(
        "head",
        0,
        [
          [-0.06, 0],
          [0.05, 0.52],
          [0.14, 0.65],
          [0.1, -0.08],
        ],
        [s * 0.22, 0.25, -0.08],
        0.1,
        0xffffff,
        [-0.5, 0, -s * 0.25],
      );
      plate(
        s < 0 ? "LeftForeArm" : "RightForeArm",
        1,
        [
          [0, 0.05],
          [0.07, -0.7],
          [0.28, -1.05],
          [0.2, -0.35],
        ],
        [s * 0.15, -0.2, 0.1],
        0.045,
        0xffffff,
        [0, (s * Math.PI) / 2, 0],
      );
    }
  } else {
    const broad = kind === "bulwark";
    for (let j = -2; j <= 2; j++)
      plate(
        "head",
        j % 2 ? 0 : 1,
        [
          [-0.045, 0],
          [-0.055, 0.24 - Math.abs(j) * 0.025],
          [0, 0.34 - Math.abs(j) * 0.04],
          [0.055, 0.24 - Math.abs(j) * 0.025],
          [0.045, 0],
        ],
        [j * 0.115, 0.3, -0.04],
        0.075,
        0xffffff,
        [0, 0, -j * 0.15],
      );
    shell(
      "weapon",
      1,
      [
        [0, 0.18],
        [0.065, 0.16],
        [0.06, -0.69],
        [0.035, -0.76],
        [0, -0.76],
      ],
      [0, 0, 0],
    );
    orb(
      "weapon",
      0,
      [0, -0.67, 0],
      broad ? [0.33, 0.22, 0.23] : [0.23, 0.25, 0.23],
    );
    for (let j = 0; j < 6; j++)
      plate(
        "weapon",
        1,
        [
          [0.13, 0.23],
          [0.29, 0.13],
          [0.3, -0.12],
          [0.13, -0.25],
        ],
        [0, -0.67, 0],
        0.038,
        0xffffff,
        [0, (j * Math.PI) / 3, 0],
      );
    if (broad) {
      const outline = [
        [-0.61, 0.63],
        [-0.38, 0.87],
        [0.38, 0.87],
        [0.61, 0.63],
        [0.55, -0.35],
        [0, -0.94],
        [-0.55, -0.35],
      ];
      plate("shield", 1, outline, [0, 0, 0], 0.14);
      plate(
        "shield",
        0,
        outline.map(([x, y]) => [x * 0.88, y * 0.88]),
        [0, 0.015, 0.105],
        0.11,
      );
      orb("shield", 1, [0, 0.12, 0.22], [0.19, 0.23, 0.12]);
      for (const s of [-1, 1])
        line(
          "shield",
          1,
          [
            [s * 0.42, 0.61, 0.19],
            [s * 0.18, 0.31, 0.24],
            [s * 0.36, -0.2, 0.22],
            [0, -0.65, 0.21],
          ],
          0.025,
        );
      plate(
        "shield",
        2,
        [
          [0, 0.11],
          [-0.04, 0],
          [0, -0.11],
          [0.04, 0],
        ],
        [0, 0.12, 0.34],
        0.014,
      );
    }
  }
  const geometries = parts.map((list) => {
    const g = mergeGeometries(list, false);
    list.forEach((p) => p.dispose());
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.8, 0), 4.3);
    g.computeBoundingBox();
    return g;
  });
  geometryCache.set(key, geometries);
  return geometries;
}

function materials(game) {
  let cached = materialCache.get(game);
  if (cached?.scene === game.world) return cached;
  const palette =
    GUARDIAN_PALETTES[game.level?.biome] || GUARDIAN_PALETTES.jungle;
  const stone =
    typeof document !== "undefined"
      ? pbrMaterial("temple", palette[0])
      : game.stoneMat.clone();
  stone.color.set(palette[0]).lerp(WHITE, 0.18);
  stone.vertexColors = true;
  stone.roughness = 0.92;
  stone.normalScale.set(0.38, 0.38);
  weatherGuardianMaterial(stone, game.level?.biome);
  const metal = game.goldMat.clone();
  metal.color.set(palette[1]);
  metal.vertexColors = true;
  metal.metalness = 0.72;
  metal.roughness = 0.47;
  metal.normalMap = null;
  metal.normalScale.set(0.14, 0.14);
  weatherGuardianMaterial(metal, game.level?.biome, true);
  cached = { scene: game.world, stone, metal };
  materialCache.set(game, cached);
  return cached;
}

export function buildGuardianArt(game, kind, color) {
  const model = new THREE.Group();
  model.name = `Guardian ${kind}`;
  const scale = kind === "bulwark" ? 1.18 : kind === "hunter" ? 0.84 : 1;
  const { root, bones, named } = skeleton(kind);
  model.add(root);
  model.updateMatrixWorld(true);
  const skeletonData = new THREE.Skeleton(bones);
  const { stone, metal } = materials(game);
  const glow = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.2,
    roughness: 0.32,
    vertexColors: true,
  });
  const tiers = [geometryFor(kind, true), geometryFor(kind, false)];
  const skins = [stone, metal, glow].map((material, i) => {
    const mesh = new THREE.SkinnedMesh(tiers[0][i], material);
    mesh.name = `${kind} ${["carved stone", "aged metal", "lenses"][i]}`;
    mesh.bind(skeletonData);
    mesh.castShadow = i < 2;
    mesh.receiveShadow = true;
    // Bounds include all authored poses, without scanning every vertex per frame.
    mesh.boundingSphere = tiers[0][i].boundingSphere.clone();
    model.add(mesh);
    return mesh;
  });
  model.scale.setScalar(scale);
  const legs = ["Left", "Right"].map((s) => [
    named[`${s}UpLeg`],
    named[`${s}Leg`],
    named[`${s}Foot`],
  ]);
  return {
    body: model,
    arms: [named.LeftArm, named.RightArm],
    shield: named.shield || null,
    core: named.core,
    glow,
    scale,
    art: {
      model,
      bones: named,
      skeleton: skeletonData,
      legs,
      tiers,
      skins,
      tier: 0,
      scale,
      feet: null,
      step: null,
      nextFoot: 0,
      previous: null,
      footfall: 0,
      muzzle: named.muzzle,
    },
  };
}

function updateFeet(game, enemy, dt, distance) {
  const rig = enemy.art,
    model = rig.model,
    p = enemy.group.position;
  model.updateWorldMatrix(true, true);
  const desired = rig.legs.map((_, i) => {
    const position = model.localToWorld(
      new THREE.Vector3((i ? 1 : -1) * 0.32, 0, 0.02),
    );
    position.y = game.groundHeight(position.x, position.z) + 0.17 * rig.scale;
    return position;
  });
  if (!rig.feet || (rig.previous && p.distanceTo(rig.previous) > 4)) {
    rig.feet = desired.map((v) => v.clone());
    rig.step = null;
  }
  const moving = distance > 0.001,
    speed = dt ? distance / dt : 0;
  const yaw = enemy.group.rotation.y,
    forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  if (!rig.step) {
    const errors = rig.feet.map((v, i) => v.distanceTo(desired[i]));
    let index = rig.nextFoot;
    if (!moving) index = errors[0] > errors[1] ? 0 : 1;
    if (moving || errors[index] > 0.48 * rig.scale) {
      const to = desired[index]
        .clone()
        .addScaledVector(
          forward,
          moving ? Math.min(1.2, 0.22 + speed * 0.2) * rig.scale : 0,
        );
      to.y = game.groundHeight(to.x, to.z) + 0.17 * rig.scale;
      rig.step = {
        index,
        from: rig.feet[index].clone(),
        to,
        time: 0,
        duration: THREE.MathUtils.clamp(0.62 / Math.max(speed, 1.5), 0.04, 0.3),
      };
      rig.nextFoot = 1 - index;
    }
  }
  if (rig.step) {
    const step = rig.step;
    step.time += dt;
    const t = Math.min(1, step.time / step.duration);
    rig.feet[step.index].lerpVectors(step.from, step.to, smooth(t));
    rig.feet[step.index].y +=
      Math.sin(t * Math.PI) * (enemy.state === "rush" ? 0.3 : 0.19) * rig.scale;
    if (t === 1) {
      if (
        game.elapsed - rig.footfall > 0.12 &&
        p.distanceTo(game.player.position) < 24
      ) {
        game.audio.noiseHit?.(0.035, 0.13, 260, rig.feet[step.index]);
        rig.footfall = game.elapsed;
      }
      rig.step = null;
    }
  }
  // Let the hips settle under the planted support, instead of stretching a
  // straight leg and lifting its foot off the floor late in the stance.
  for (let i = 0; i < 2; i++) {
    const foot = model.worldToLocal(rig.feet[i].clone());
    const horizontal = Math.hypot(foot.x - (i ? 0.32 : -0.32), foot.z);
    const support =
      foot.y + Math.sqrt(Math.max(0.4, (1.48 * 0.99) ** 2 - horizontal ** 2));
    rig.bones.pelvis.position.y = Math.min(
      rig.bones.pelvis.position.y,
      Math.max(1.18, support),
    );
  }
  poseFeet({ rig: { model, legs: rig.legs }, avatar: enemy.group }, rig.feet);
  const inverse = model.getWorldQuaternion(new THREE.Quaternion());
  for (const leg of rig.legs) {
    const parent = leg[2].parent
      .getWorldQuaternion(new THREE.Quaternion())
      .invert();
    leg[2].quaternion.copy(parent.multiply(inverse));
  }
}

export function animateGuardian(game, enemy, dt) {
  const rig = enemy.art;
  if (!rig) return;
  const p = enemy.group.position,
    b = rig.bones;
  const distance = rig.previous
    ? Math.hypot(p.x - rig.previous.x, p.z - rig.previous.z)
    : 0;
  const cameraDistance = game.camera
    ? p.distanceTo(game.camera.position)
    : p.distanceTo(game.player.position);
  const low = game.store?.data.settings.quality === "low";
  const threshold = low ? 26 : 42;
  const nextTier =
    cameraDistance > threshold + 5
      ? 1
      : cameraDistance < threshold - 5
        ? 0
        : rig.tier;
  if (rig.tier !== nextTier) {
    rig.tier = nextTier;
    rig.skins.forEach((m, i) => {
      m.geometry = rig.tiers[nextTier][i];
    });
  }
  rig.model.visible = cameraDistance < (low ? 80 : 125);
  const windup = enemy.state === "windup",
    recover = enemy.state === "recover",
    rush = enemy.state === "rush",
    stagger = enemy.state === "stagger";
  const wind = windup ? 1 - enemy.timer / enemy.spec.windup : 0;
  const recovery = recover ? 1 - enemy.timer / enemy.spec.recovery : 0;
  const kind = enemy.kind;
  for (const bone of Object.values(b)) bone.rotation.set(0, 0, 0);
  b.pelvis.position.y =
    1.53 -
    (rush ? 0.16 : windup && kind === "hunter" ? 0.1 * smooth(wind * 2) : 0);
  b.chest.rotation.x = rush
    ? 0.3
    : recover
      ? 0.18 * (1 - smooth(recovery))
      : stagger
        ? -0.1
        : 0;
  b.head.rotation.x = -b.chest.rotation.x * 0.55;
  b.LeftArm.rotation.z = 0.1;
  b.RightArm.rotation.z = -0.1;
  b.LeftForeArm.rotation.x = -0.14;
  b.RightForeArm.rotation.x = -0.14;
  const gait =
    Math.sin((game.elapsed || 0) * 6 + enemy.phase) *
    Math.min(0.18, distance * 2.5);
  b.LeftArm.rotation.x = gait;
  b.RightArm.rotation.x = -gait;
  if (kind === "sentry") {
    b.RightArm.rotation.x =
      -0.28 -
      (windup
        ? smooth(wind * 2) * 0.3
        : recover
          ? (1 - smooth(recovery)) * 0.25
          : 0);
    b.RightForeArm.rotation.x = -0.23;
    b.LeftArm.rotation.x = windup ? -smooth(wind * 2) * 1.25 : -0.12;
    b.LeftForeArm.rotation.x = windup ? -0.5 : -0.2;
  } else if (kind === "hunter") {
    const crouch = windup
      ? smooth(wind * 2)
      : rush
        ? 1
        : recover
          ? 1 - smooth(recovery)
          : 0;
    b.chest.rotation.x += crouch * 0.24;
    b.LeftArm.rotation.x = b.RightArm.rotation.x = crouch * 0.6;
    b.LeftForeArm.rotation.x = b.RightForeArm.rotation.x = -0.6 - crouch * 0.45;
  } else {
    const raise = windup ? smooth(wind / 0.6) : 0;
    const strike = windup
      ? smooth((wind - 0.8) / 0.2)
      : recover
        ? 1 - smooth(recovery)
        : 0;
    b.RightArm.rotation.x = windup
      ? -raise * 2.6 + strike * 1.7
      : recover
        ? -0.9 * strike
        : -gait;
    b.RightForeArm.rotation.x = windup ? -raise * 0.65 * (1 - strike) : -0.12;
    b.chest.rotation.x += windup ? -raise * 0.13 + strike * 0.35 : 0;
    b.chest.rotation.y = windup
      ? -raise * 0.16 * (1 - strike)
      : recover
        ? 0.12 * strike
        : 0;
    if (kind === "bulwark") {
      const open = recover ? 1 : stagger ? 0.7 : 0;
      b.LeftArm.rotation.set(
        -0.32 + open * 0.3,
        open * -0.7,
        0.32 - open * 0.85,
      );
      b.LeftForeArm.rotation.x = -0.48;
      b.shield.rotation.y = -0.16 - open * 0.6;
      b.shield.rotation.x = open * 0.3;
    }
  }
  b.core.rotation.z = game.elapsed * 0.3;
  enemy.glow.emissiveIntensity =
    enemy.flash > 0
      ? 3
      : windup
        ? 1.5 + Math.sin(game.elapsed * 18) * 0.25
        : 0.8;
  // Feet remain anchored in world space during a strike and its recoil.
  if (rig.model.visible) updateFeet(game, enemy, dt, distance);
  rig.previous ||= p.clone();
  rig.previous.copy(p);
  rig.model.updateWorldMatrix(true, true);
}
