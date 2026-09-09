import * as THREE from "three";
import { mergeArchitecture } from "./visuals.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { fittedWallGeometry } from "./sky-masonry.js";
import {
  bridgeArtMaterials,
  prepareBridgeGeometry,
  bridgeBoardGeometry,
  bridgeRope,
} from "./sky-bridge-art.js";
import { COURIER_STOPS, COURIER_Z } from "./courier-rules.js";
import {
  COURIER_SAIL,
  courierSailOpen,
  courierSailPoint,
  courierSailGeometry,
  courierSailMaterial,
  courierLinesGeometry,
  updateCourierLines,
} from "./courier-sail.js";

export function courierPulleyGeometry() {
  // The .075 m cable meets the .25 m groove under a bearing at 9.625 m.
  // Wide flanges enclose the cable without intersecting its circular section.
  const profile = [
    [0.08, -0.16],
    [0.34, -0.16],
    [0.34, -0.1],
    [0.265, -0.085],
    [0.25, -0.045],
    [0.25, 0.045],
    [0.265, 0.085],
    [0.34, 0.1],
    [0.34, 0.16],
    [0.08, 0.16],
    [0.08, -0.16],
  ];
  return new THREE.LatheGeometry(
    profile.map((p) => new THREE.Vector2(...p)),
    40,
  ).rotateX(Math.PI / 2);
}
export function courierPavingGeometry(w, d, seed) {
  const g = fittedWallGeometry(
    [
      [-w, -d],
      [w, -d],
      [w, d],
      [-w, d],
    ],
    0.18,
    seed,
    1.6,
  )
    .rotateX(-Math.PI / 2)
    .translate(0, -0.09, 0);
  // Wall stones have proud crowns. Dress the walking faces level with the
  // dock, retaining their recessed bevels and the continuous packed backing.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, Math.min(0, p.getY(i)));
  g.computeVertexNormals();
  return g;
}
function labelAtlas() {
  const labels = [
    "HOME",
    "POST 1",
    "POST 2",
    "POST 3",
    "DISPATCH 1",
    "DISPATCH 2",
    "DISPATCH 3",
    "SEALED",
    "COURIER",
    "ROAD",
    "TRIM",
    "RETURN",
  ];
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 384;
  const c = canvas.getContext("2d");
  c.fillStyle = "#dbcca7";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = "bold 40px Georgia";
  labels.forEach((text, i) =>
    c.fillText(
      text,
      ((i % 4) + 0.5) * 512,
      (Math.floor(i / 4) + 0.5) * 128,
      480,
    ),
  );
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return {
    labels,
    material: new THREE.MeshStandardMaterial({
      name: "Courier engraved labels",
      map,
      transparent: true,
      depthWrite: false,
      roughness: 0.95,
    }),
  };
}

export function buildCourierConstruction(game, h, fixed) {
  const car = h.car,
    y = h.y,
    m = bridgeArtMaterials(),
    atlas = labelAtlas();
  h.construction = {
    materials: m,
    lines: [],
    cableEyes: [],
    suspension: [],
    paving: [],
  };
  let serial = 38000;
  const add = (
    geometry,
    material,
    x,
    py,
    z,
    parent = fixed,
    capture = true,
  ) => {
    const mesh = new THREE.Mesh(
      prepareBridgeGeometry(geometry, material, m),
      material,
    );
    mesh.position.set(x, py, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    if (capture) game.cameraSurfaces?.capture(mesh);
    return mesh;
  };
  const block = (w, t, d, x, py, z, material = m.stone, parent = fixed) =>
    add(stoneBlockGeometry(w, t, d, serial++), material, x, py, z, parent);
  const beam = (a, b, r = 0.06, material = m.metal, parent = fixed) => {
    const from = new THREE.Vector3(...a),
      to = new THREE.Vector3(...b),
      delta = to.clone().sub(from);
    const mesh = add(
      new THREE.CylinderGeometry(r, r, delta.length(), 10),
      material,
      ...from.clone().add(to).multiplyScalar(0.5).toArray(),
      parent,
      false,
    );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return mesh;
  };
  const rope = (points, r = 0.045, parent = fixed, segments = 12) =>
    add(bridgeRope(points, r, segments, 7), m.rope, 0, 0, 0, parent, false);
  const eye = (x, py, z, r = 0.14, parent = fixed) =>
    add(
      new THREE.TorusGeometry(r, 0.032, 7, 20),
      m.metal,
      x,
      py,
      z,
      parent,
      false,
    );
  const bolt = (x, py, z, parent = fixed, r = 0.04) =>
    add(
      new THREE.CylinderGeometry(r, r, 0.035, 6),
      m.metal,
      x,
      py,
      z,
      parent,
      false,
    );
  const sign = (text, x, py, z, width = 1, parent = fixed, dynamic = false) => {
    const i = atlas.labels.indexOf(text),
      g = new THREE.PlaneGeometry(width, width / 4),
      uv = g.attributes.uv;
    for (let n = 0; n < uv.count; n++)
      uv.setXY(
        n,
        ((i % 4) + uv.getX(n)) / 4,
        1 - (Math.floor(i / 4) + 1 - uv.getY(n)) / 3,
      );
    const mesh = add(g, atlas.material, x, py, z, parent, false);
    mesh.userData.animated = dynamic;
    return mesh;
  };
  const fitted = (w, t, d, x, py, z, scale = 1.1) =>
    add(
      fittedWallGeometry(
        [
          [-w / 2, -t / 2],
          [w / 2, -t / 2],
          [w / 2, t / 2],
          [-w / 2, t / 2],
        ],
        d,
        serial++,
        scale,
      ),
      m.stone,
      x,
      py,
      z,
    );

  for (const p of h.platforms) {
    if (p.dock !== undefined) {
      block(p.w * 2, 0.48, p.d * 2, p.x, p.y - 0.36, p.z);
      const g = courierPavingGeometry(p.w, p.d, serial++);
      h.construction.paving.push({ x: p.x, z: p.z, y: p.y, w: p.w, d: p.d });
      add(g, m.stone, p.x, p.y, p.z);
    } else {
      fitted(
        p.w * 2,
        p.y - p.bottom,
        p.d * 2,
        p.x,
        (p.y + p.bottom) / 2,
        p.z,
        0.85,
      );
      block(p.w * 2, 0.05, 0.11, p.x, p.y - 0.025, p.z - 1, m.metal);
    }
  }
  for (let x = 87; x < 120; x += 2.8) {
    block(2.75, 0.16, 3, x, y - 0.23, 14);
    block(0.12, 0.025, 2.6, x + 1.25, y - 0.142, 14, m.metal);
  }
  for (const [dock, x] of COURIER_STOPS.entries()) {
    for (const side of [-1, 1]) {
      const px = x + side * 8.3;
      fitted(1.5, 10.5, 1.5, px, y + 4.7, 27, 1.25);
      block(1.8, 0.22, 1.8, px, y + 9.95, 27);
      // Metal shoes and straps embed the cantilever timbers in the granite cap.
      block(0.8, 0.19, 1.2, px, y + 10.06, 27, m.metal);
      beam([px, y + 10.12, 27], [x, y + 9.9, 12], 0.12, m.wood);
      for (const dz of [-0.35, 0.35]) bolt(px, y + 10.18, 27 + dz);
      h.solids.push({ x: px, z: 27, w: 0.75, d: 0.75, y: y - 0.55, h: 10.5 });
    }
    for (let i = 0; i < 6; i++)
      block(2.99, 0.6, 1.7, x - 7.5 + i * 3, y + 9.9, 27);
    // The boom has real depth, two rear tension stays and straps at its joints.
    block(0.4, 0.4, 16, x, y + 9.9, 19, m.wood);
    for (const z of [12, 16, 26.5]) {
      block(0.49, 0.055, 0.28, x, y + 10.13, z, m.metal);
      for (const dx of [-0.14, 0.14]) bolt(x + dx, y + 10.16, z);
    }
    for (const z of [12, 16]) {
      beam([x, y + 9.9, z], [x, y + 9.3, z], 0.07);
      const band = eye(x, y + 9.3, z, 0.09);
      band.rotation.y = Math.PI / 2;
      h.construction.cableEyes.push({ x, y: y + 9.3, z });
    }
    // The landing control has a drum, a bearing shaft, and a returning line.
    block(0.8, 1.2, 0.6, x - 4.7, y + 0.6, 20, m.wood);
    for (const py of [0.12, 1.05])
      block(0.86, 0.12, 0.66, x - 4.7, y + py, 20, m.metal);
    h.solids.push({ x: x - 4.7, z: 20, w: 0.4, d: 0.3, y, h: 1.2 });
    const wheel = eye(x - 4.7, y + 1.2, 20.36, 0.35);
    for (const angle of [0, Math.PI / 2]) {
      const b = block(0.63, 0.06, 0.065, x - 4.7, y + 1.2, 20.36, m.wood);
      b.rotation.z = angle;
    }
    beam([x - 4.7, y + 1.2, 19.7], [x - 4.7, y + 1.2, 20.4], 0.065);
    rope(
      [
        [x - 4.7, y + 0.85, 19.65],
        [x - 4.7, y + 0.45, 18.3],
        [x - 5.8, y + 0.4, 17.1],
      ],
      0.025,
    );
    wheel.name = `Landing ${dock} retrieval wheel`;
    sign(dock ? `POST ${dock}` : "HOME", x, y + 0.012, 23, 2.3).rotation.x =
      -Math.PI / 2;
    if (dock) {
      const px = x + 5.2;
      block(0.85, 0.8, 0.5, px, y + 4.6, 25, m.wood);
      for (const dx of [-0.32, 0.32])
        block(0.075, 0.83, 0.54, px + dx, y + 4.6, 25, m.metal);
      block(0.12, 0.24, 0.055, px, y + 4.62, 25.29, m.metal);
      h.solids.push({ x: px, z: 25, w: 0.425, d: 0.25, y: y + 4.2, h: 0.8 });
      sign(`DISPATCH ${dock}`, px, y + 4.9, 25.276, 0.75);
      h.signs.push(sign("SEALED", px, y + 4.44, 25.278, 0.7, fixed, true));
    }
    h.sources.push({
      id: `courier-post-${dock}`,
      kind: "wind",
      x,
      y: y + 9,
      z: 27,
      near: 2,
      range: 30,
      gain: 0.055,
      activity: 0.5,
    });
  }
  // Continuous tracks turn back into embedded eyes at the terminal piers.
  for (const z of [12, 16]) {
    rope(
      [
        [118, y + 9.3, z],
        [220, y + 9.3, z],
        [323, y + 9.3, z],
      ],
      0.075,
      fixed,
      20,
    );
    for (const [end, px, side] of [
      [118, 117.7, -1],
      [323, 323.3, 1],
    ]) {
      rope(
        [
          [end, y + 9.3, z],
          [end + side * 1.2, y + 9.2, z + 0.8],
          [px, y + 8.8, 26.18],
        ],
        0.075,
        fixed,
        18,
      );
      eye(px, y + 8.8, 26.2, 0.19);
      block(0.55, 0.65, 0.14, px, y + 8.8, 26.27, m.metal);
    }
  }

  for (let i = 0; i < 12; i++) {
    const x = -2.78 + i * 0.505;
    add(
      bridgeBoardGeometry(0.492, 5.4, serial++).scale(1, 0.28 / 0.19, 1),
      m.wood,
      x,
      -0.14,
      0,
      car,
    );
    for (const z of [-2.2, 2.2]) bolt(x, 0.005, z, car, 0.032);
  }
  for (const x of [-2.5, 2.5]) block(0.22, 0.2, 5.4, x, -0.35, 0, m.wood, car);
  for (const z of [-2.2, 2.2]) block(6.4, 0.25, 0.22, 0, -0.42, z, m.wood, car);
  for (const x of [-2.7, 2.7]) {
    block(0.22, 0.2, 4.7, x, 9.2, 0, m.wood, car);
    beam([x, 9.625, -2.43], [x, 9.625, 2.43], 0.074, m.metal, car);
    for (const z of [-2, 2]) {
      const pulley = add(
        courierPulleyGeometry(),
        m.metal,
        x,
        9.625,
        z,
        car,
        false,
      );
      pulley.userData.animated = true;
      h.pulleys.push(pulley);
      for (const angle of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
        const spoke = block(0.5, 0.045, 0.34, 0, 0, 0, m.wood, pulley);
        spoke.rotation.z = angle;
      }
    }
    for (const z of [-2.28, 2.28]) {
      block(0.35, 0.2, 0.4, x, -0.27, z, m.metal, car);
      eye(x, 0.02, z, 0.11, car);
      rope(
        [
          [x, 0.04, z],
          [x, 4.5, z],
          [x, 9.18, z],
        ],
        0.055,
        car,
        20,
      );
      h.construction.suspension.push({ a: [x, 0.04, z], b: [x, 9.18, z] });
      for (const dx of [-0.18, 0.18])
        block(0.09, 0.65, 0.25, x + dx, 9.47, z, m.metal, car);
      // Rectangular straps seat against the beam beneath each clevis.
      for (const dz of [-0.04, 0, 0.04]) {
        for (const py of [9.09, 9.31])
          block(0.3, 0.03, 0.03, x, py, z + dz, m.metal, car);
        for (const dx of [-0.135, 0.135])
          block(0.03, 0.2, 0.03, x + dx, 9.2, z + dz, m.metal, car);
      }
    }
  }
  for (const x of [-3, 3]) {
    for (const z of [-2.5, 0, 2.5]) {
      block(0.1, 1.1, 0.1, x, 0.55, z, m.wood, car);
      block(0.16, 0.25, 0.16, x, 0.125, z, m.metal, car);
    }
    for (const py of [0.62, 1.05])
      for (const [a, b] of [
        [-2.5, 0],
        [0, 2.5],
      ])
        rope(
          [
            [x, py, a],
            [x, py - 0.06, (a + b) / 2],
            [x, py, b],
          ],
          0.038,
          car,
        );
  }
  for (const py of [0.62, 1.05])
    rope(
      [
        [-3, py, -2.5],
        [0, py - 0.09, -2.5],
        [3, py, -2.5],
      ],
      0.038,
      car,
    );
  block(
    0.16,
    COURIER_SAIL.mast,
    0.16,
    1.4,
    COURIER_SAIL.mast / 2,
    -0.7,
    m.wood,
    car,
  );
  block(0.38, 0.3, 0.38, 1.4, 0.15, -0.7, m.metal, car);
  for (const py of [0.7, 2.2, 5.7]) {
    const band = eye(1.4, py, -0.7, 0.11, car);
    band.rotation.x = Math.PI / 2;
  }
  const sail = new THREE.Group();
  sail.position.set(1.4, COURIER_SAIL.pivot, -0.7);
  sail.userData.animated = true;
  car.add(sail);
  h.sail = sail;
  h.cloth = add(
    courierSailGeometry(),
    courierSailMaterial(),
    0,
    0,
    0,
    sail,
    false,
  );
  h.cloth.userData.animated = true;
  beam([-3.4, 1.5, 0], [0.6, 1.5, 0], 0.055, m.wood, sail);
  const batten = new THREE.Group();
  batten.userData.animated = true;
  sail.add(batten);
  h.batten = batten;
  beam([-3.4, 0, -0.04], [0.6, 0, -0.04], 0.04, m.wood, batten);
  for (let i = 0; i <= 10; i++) {
    const x = -3.4 + i * 0.4;
    const top = add(
      new THREE.TorusGeometry(0.085, 0.012, 5, 12),
      m.rope,
      x,
      1.47,
      0,
      sail,
      false,
    );
    top.rotation.y = Math.PI / 2;
    const bottom = add(
      new THREE.TorusGeometry(0.047, 0.01, 5, 12),
      m.rope,
      x,
      0,
      -0.03,
      batten,
      false,
    );
    bottom.rotation.y = Math.PI / 2;
  }
  h.rigging = add(courierLinesGeometry(), m.rope, 0, 0, 0, car, false);
  h.rigging.userData.animated = true;
  for (const x of [-2.55, 2.55]) {
    beam([x, 0.25, 0], [x, 0.55, 0], 0.035, m.metal, car);
    beam([x - 0.18, 0.52, 0], [x + 0.18, 0.52, 0], 0.035, m.metal, car);
  }
  // Preserve the calibrated operator stance and wrist targets.
  beam([0, 0, 0.6], [0, 1.25, 0.6], 0.08, m.metal, car);
  block(0.28, 0.025, 0.3, 0, 0.0125, 0.6, m.metal, car);
  const helm = new THREE.Group();
  helm.position.set(0, 1.3, 0.6);
  helm.userData.animated = true;
  car.add(helm);
  h.wheel = helm;
  add(
    new THREE.TorusGeometry(0.48, 0.045, 8, 40),
    m.wood,
    0,
    0,
    0,
    helm,
    false,
  );
  for (const angle of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
    const b = block(0.9, 0.055, 0.055, 0, 0, 0, m.wood, helm);
    b.rotation.z = angle;
  }
  const hub = add(
    new THREE.CylinderGeometry(0.1, 0.1, 0.2, 16),
    m.metal,
    0,
    0,
    0,
    helm,
    false,
  );
  hub.rotation.x = Math.PI / 2;
  h.handles = [-0.4, 0.4].map((x) => {
    const grip = new THREE.Object3D();
    grip.position.set(x, 0, 0.04);
    helm.add(grip);
    return grip;
  });
  const dial = add(
    new THREE.CircleGeometry(0.22, 32),
    m.metal,
    0,
    0.59,
    0.57,
    car,
    false,
  );
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.24,
      mark = block(
        0.012,
        0.045,
        0.012,
        Math.sin(a) * 0.19,
        0.59 + Math.cos(a) * 0.19,
        0.58,
        m.wood,
        car,
      );
    mark.rotation.z = -a;
  }
  sign("TRIM", 0, 0.46, 0.59, 0.3, car);
  const needle = new THREE.Group();
  needle.position.set(0, 0.59, 0.592);
  needle.userData.animated = true;
  car.add(needle);
  h.trimNeedle = needle;
  add(
    new THREE.ConeGeometry(0.022, 0.17, 3),
    m.wood,
    0,
    0.08,
    0,
    needle,
    false,
  );
  const vane = new THREE.Group();
  vane.position.set(-2.6, 2.5, -2);
  car.add(vane);
  h.vane = vane;
  vane.userData.animated = true;
  beam([-2.6, 0, -2], [-2.6, 2.5, -2], 0.03, m.metal, car);
  beam([0, 0, -0.6], [0, 0, 0.6], 0.025, m.metal, vane);
  const arrow = add(
    new THREE.ConeGeometry(0.17, 0.5, 3),
    m.metal,
    0,
    0,
    -0.65,
    vane,
    false,
  );
  arrow.rotation.x = -Math.PI / 2;
  h.sources.push({
    id: "courier-sail",
    kind: "wind",
    x: h.x,
    y: y + 4.2,
    z: COURIER_Z,
    near: 3,
    range: 35,
    gain: 0.1,
    activity: 0,
  });
  h.sources.push({
    id: "courier-rope",
    kind: "rope",
    x: h.x - 2.7,
    y: y + 9.625,
    z: COURIER_Z,
    near: 2,
    range: 25,
    gain: 0.12,
    activity: 0,
  });
  block(1.2, 1.2, 0.7, 120, y + 0.6, 21);
  block(1.12, 0.62, 0.045, 120, y + 0.9, 21.37, m.metal);
  h.solids.push({ x: 120, z: 21, w: 0.6, d: 0.35, y, h: 1.2 });
  sign("COURIER", 120, y + 1.04, 21.402, 1);
  sign("ROAD", 120, y + 0.81, 21.402, 0.9);
  // Keep animated parts and their camera parents; batch each rigid assembly.
  for (const group of [fixed, car, sail, batten, helm, vane, ...h.pulleys])
    mergeArchitecture(group);
  dial.name = "Sail trim scale";
}

export function updateCourierConstruction(h) {
  const open = courierSailOpen(h.trim);
  h.sail.rotation.y = h.trim * 0.9;
  h.trimNeedle.rotation.z = -h.trim * 0.7;
  h.batten.position.y = 1.4 - 2.8 * open;
  const p = h.cloth.geometry.attributes.position,
    uv = h.cloth.geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const q = courierSailPoint(
      uv.getX(i),
      1 - uv.getY(i),
      h.trim,
      h.time,
      h.wind,
    );
    p.setXYZ(i, q.x, q.y, q.z);
  }
  p.needsUpdate = true;
  h.cloth.geometry.computeVertexNormals();
  h.sail.updateMatrix();
  const corner = (u, v) =>
    courierSailPoint(u, v, h.trim, h.time, h.wind).applyMatrix4(h.sail.matrix);
  const lines = [
    { a: new THREE.Vector3(1.4, 6.1, -0.7), b: corner(0, 0), sag: 0.015 },
    { a: new THREE.Vector3(1.4, 6.1, -0.7), b: corner(1, 0), sag: 0.015 },
    { a: new THREE.Vector3(-2.55, 0.55, 0), b: corner(0, 1), sag: 0.05 },
    { a: new THREE.Vector3(2.55, 0.55, 0), b: corner(1, 1), sag: 0.05 },
  ];
  updateCourierLines(h.rigging.geometry, lines);
  h.construction.lines = lines;
  const center = corner(0.5, 0.5);
  const wind = h.sources.find((s) => s.id === "courier-sail"),
    rope = h.sources.find((s) => s.id === "courier-rope");
  Object.assign(wind, {
    x: h.x + center.x,
    y: h.y + center.y,
    z: COURIER_Z + center.z,
  });
  Object.assign(rope, { x: h.x - 2.7, y: h.y + 9.625, z: COURIER_Z });
}
