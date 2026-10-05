import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { fittedWallGeometry } from "./sky-masonry.js";

export function skyChamberWallPlan(
  length,
  stage = 0,
  side = 0,
  leafWidth = 6.2,
) {
  const variant = (((stage + side + 3) % 3) + 3) % 3;
  const count = [2, 3, 4][variant],
    radius = [1.08, 0.68, 0.57][variant],
    bottom = [1.35, 1.6, 1.3][variant],
    top = [5.1, 4.7, 4.15][variant];
  return {
    variant,
    bottom,
    top,
    radius,
    niches: Array.from({ length: count }, (_, i) => ({
      x: ((i + 0.5) * length) / count - length / 2,
      bottom,
      top,
      radius,
      head: radius * 0.73,
      // A fully folded leaf occupies a bay alongside each side wall. Keep
      // its exterior blind-bay backing outside the timber and rear brace.
      backing:
        side !== 0 &&
        -side * (((i + 0.5) * length) / count - length / 2) + radius >
          6.5 - leafWidth - 0.15
          ? 0.02
          : -0.32,
    })),
  };
}

export function skyGateWallGeometry(length, floor, seed, plan = null) {
  const parts = [];
  const panel = (points, depth = 0.82, z = 0) => {
    const g = fittedWallGeometry(points, depth, ++seed, 1.2);
    g.translate(0, 0, z);
    parts.push(g);
  };
  // The optional plan retains compatibility with the earlier gate helper.
  plan ??= {
    bottom: 1.6,
    top: 4.7,
    niches: [-length / 3, 0, length / 3].map((x) => ({
      x,
      bottom: 1.6,
      top: 4.7,
      radius: 0.62,
      head: 0.45,
    })),
  };
  const half = length / 2,
    step = length / plan.niches.length;
  panel([
    [-half, floor],
    [half, floor],
    [half, plan.bottom],
    [-half, plan.bottom],
  ]);
  for (const niche of plan.niches) {
    const { x: cx, bottom, top, radius, head } = niche,
      left = cx - step / 2,
      right = cx + step / 2;
    panel([
      [left, bottom],
      [cx - radius, bottom],
      [cx - head, top],
      [left, top],
    ]);
    panel([
      [cx + radius, bottom],
      [right, bottom],
      [right, top],
      [cx + head, top],
    ]);
    panel(
      [
        [cx - radius, bottom],
        [cx + radius, bottom],
        [cx + head, top],
        [cx - head, top],
      ],
      0.18,
      niche.backing ?? -0.32,
    );
  }
  panel([
    [-half, plan.top],
    [half, plan.top],
    [half, 7],
    [-half, 7],
  ]);
  const geometry = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  geometry.userData.niches = plan.niches.map((n) => n.x);
  return geometry;
}

export function skyTimberSurface(geometry) {
  if (!geometry.attributes.gateTimberCoord)
    geometry.setAttribute(
      "gateTimberCoord",
      geometry.attributes.position.clone(),
    );
  return geometry;
}

export function weatherGateTimber(material) {
  material.userData.skyGateTimber = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
      attribute vec3 gateTimberCoord; varying vec3 vGateTimber;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      vGateTimber=gateTimberCoord;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
      varying vec3 vGateTimber;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
      float grain=sin(vGateTimber.x*13.7+vGateTimber.y*8.3+vGateTimber.z*17.1);
      float luma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(luma)*vec3(1.08,1.025,.9),.4);
      diffuseColor.rgb*=.92+.08*grain;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.23,.208,.174),.12);`,
      );
  };
  material.customProgramCacheKey = () => "vesper-gate-timber-1";
}

export function hingeStrapGeometry(side, length = 5.6) {
  const shape = new THREE.Shape();
  const points = [
    [0, -0.19],
    [0.35, -0.19],
    [0.52, -0.12],
    [length - 0.35, -0.065],
    [length, 0],
    [length - 0.35, 0.065],
    [0.52, 0.12],
    [0.35, 0.19],
    [0, 0.19],
  ];
  points.forEach(([x, y], i) => shape[i ? "lineTo" : "moveTo"](-side * x, y));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.07,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 8,
  });
  g.translate(0, 0, -0.035);
  return g;
}

export function hingeBarrelGeometry(height = 0.27) {
  const points = [
    [0.105, -height / 2],
    [0.15, -height / 2],
    [0.17, -height / 2 + 0.035],
    [0.17, height / 2 - 0.035],
    [0.15, height / 2],
    [0.105, height / 2],
    [0.105, -height / 2],
  ];
  return new THREE.LatheGeometry(
    points.map((p) => new THREE.Vector2(...p)),
    24,
  );
}

export function buildSkyGateLeaf({
  gate,
  leaf,
  side,
  cx,
  m,
  add,
  block,
  detail,
}) {
  detail.name = "Wind-screen joinery and fasteners";
  const width = gate.leafWidth,
    edge = width / 2 - 0.27,
    columns = Math.ceil(width / 3.1),
    bay = (2 * edge) / columns,
    stiles = Array.from({ length: columns + 1 }, (_, i) => -edge + i * bay);
  // Framed half-panels admit wind between pitched laths. The rear diagonal
  // ties the latch rail to the lower hinge; all fittings share the leaf parent.
  for (const [i, xx] of stiles.entries())
    block(
      i === 0 || i === columns ? 0.38 : 0.26,
      7.3,
      0.43,
      m.wood,
      cx + xx,
      3.7,
      0,
      leaf,
    );
  for (const yy of [0.24, 1, 3.4, 6.8, 7.15])
    block(
      width - 0.75,
      yy === 0.24 || yy === 7.15 ? 0.36 : 0.26,
      0.4,
      m.wood,
      cx,
      yy,
      0,
      leaf,
    );
  for (let col = 0; col < columns; col++)
    for (let row = 0; row < 11; row++) {
      const slat = block(
        bay - 0.34,
        0.37,
        0.145,
        m.wood,
        cx - edge + (col + 0.5) * bay,
        0.7 + row * 0.595,
        -0.015,
        leaf,
      );
      slat.rotation.x = 0.12 + (gate.stage % 3) * 0.025;
    }
  const brace = block(
    0.21,
    Math.hypot(width - 0.64, 6.2),
    0.13,
    m.wood,
    cx,
    3.7,
    -0.215,
    leaf,
  );
  brace.rotation.z = side * Math.atan((width - 0.64) / 6.2);
  for (const end of [-1, 1])
    block(
      0.4,
      0.44,
      0.13,
      m.metal,
      cx - side * end * (width / 2 - 0.32),
      3.7 + end * 3.1,
      -0.225,
      leaf,
    );
  for (const yy of [1, 3.4, 6.8]) {
    add(
      hingeStrapGeometry(side, width - 0.6),
      m.metal,
      -side * 0.23,
      yy,
      0.255,
      leaf,
    );
    add(hingeBarrelGeometry(), m.metal, 0, yy, 0, leaf);
    block(0.22, 0.22, 0.3, m.metal, -side * 0.17, yy, 0.12, leaf);
    for (const along of [0.48, 1.25, 2.4, 3.6, 4.85, 6.1, 7.35].filter(
      (x) => x < width - 1,
    )) {
      const xx = -side * (along + 0.23);
      const washer = add(
        new THREE.CylinderGeometry(0.071, 0.071, 0.02, 12),
        m.metal,
        xx,
        yy,
        0.307,
        detail,
      );
      washer.rotation.x = Math.PI / 2;
      const bolt = add(
        new THREE.CylinderGeometry(0.043, 0.049, 0.045, 6),
        m.metal,
        xx,
        yy,
        0.337,
        detail,
      );
      bolt.rotation.x = Math.PI / 2;
    }
  }
  // Joinery pegs sit on the rails rather than floating in the louver openings.
  for (const xx of stiles)
    for (const yy of [0.24, 1, 3.4, 6.8, 7.15]) {
      const peg = add(
        new THREE.CylinderGeometry(0.055, 0.055, 0.025, 10),
        m.wood,
        cx + xx,
        yy,
        0.225,
        detail,
      );
      peg.rotation.x = Math.PI / 2;
    }
  return detail;
}

export function buildSkyGateJamb({ side, m, add, block, halfWidth = 6.5 }) {
  // An L-shaped reveal exposes the hinge axis while retaining the existing
  // structural footprint. The returns support both the lintel and drive.
  block(1.34, 8, 0.35, m.trim, side * halfWidth, 4, 6.0);
  block(0.64, 8, 0.87, m.trim, side * (halfWidth + 0.37), 4, 6.78);
  for (let row = 0; row < 8; row++) {
    block(1.48, 0.985, 0.53, m.trim, side * halfWidth, row + 0.535, 6.0);
    block(
      0.78,
      0.985,
      1.03,
      m.trim,
      side * (halfWidth + 0.37),
      row + 0.535,
      6.78,
    );
  }
  for (const yy of [1, 3.4, 6.8]) {
    for (const dy of [-0.245, 0.245])
      add(
        hingeBarrelGeometry(0.18),
        m.metal,
        side * (halfWidth - 0.3),
        yy + dy,
        6.5,
      );
    add(
      new THREE.CylinderGeometry(0.1, 0.1, 0.72, 16),
      m.metal,
      side * (halfWidth - 0.3),
      yy,
      6.5,
    );
    const cap = add(
      new THREE.SphereGeometry(0.14, 16, 10),
      m.metal,
      side * (halfWidth - 0.3),
      yy + 0.38,
      6.5,
    );
    cap.scale.y = 0.5;
    block(
      0.39,
      0.18,
      0.18,
      m.metal,
      side * (halfWidth - 0.12),
      yy + 0.245,
      6.45,
    );
    block(
      0.39,
      0.18,
      0.18,
      m.metal,
      side * (halfWidth - 0.12),
      yy - 0.245,
      6.45,
    );
  }
}

export function buildSkyGateCrown({
  m,
  add,
  block,
  root,
  detail,
  halfWidth = 6.5,
}) {
  block(2 * halfWidth + 0.45, 0.5, 1.45, m.wood, 0, 8.05, 6.5, root, true);
  for (const side of [-1, 1])
    for (let row = 0; row < 4; row++)
      block(
        2.35,
        0.39,
        1.7,
        m.trim,
        side * (halfWidth - 0.7 - row * 0.63),
        8.5 + row * 0.36,
        6.5,
        root,
        true,
      );
  block(2 * halfWidth - 5.1, 0.48, 1.85, m.trim, 0, 9.93, 6.5, root, true);
  block(2.15, 1.82, 0.85, m.trim, 0, 9.07, 6.55, root, true);
  add(
    new THREE.TorusGeometry(0.69, 0.065, 10, 48),
    m.metal,
    0,
    9.13,
    7.035,
    detail,
  );
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const curve = new THREE.CatmullRomCurve3(
      Array.from({ length: 7 }, (_, k) => {
        const a = angle + k * 0.12,
          r = 0.13 + k * 0.067;
        return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0);
      }),
    );
    add(
      new THREE.TubeGeometry(curve, 18, 0.045, 7, false),
      m.metal,
      0,
      9.13,
      7.045,
      detail,
    );
  }
  add(
    new THREE.SphereGeometry(0.125, 16, 10),
    m.metal,
    0,
    9.13,
    7.07,
    detail,
  ).scale.z = 0.4;
}
