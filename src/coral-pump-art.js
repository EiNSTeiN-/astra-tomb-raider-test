import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { patinatedBronze } from "./observatory-geometry.js";
import {
  hydraulicPlaque,
  hydraulicStreamMaterial,
} from "./hydraulic-geometry.js";
import { mergeArchitecture } from "./visuals.js";

export function pumpRotor(material, radius = 1) {
  const root = new THREE.Group();
  root.userData.animated = true;
  const add = (geometry, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    return m;
  };
  add(new THREE.TorusGeometry(radius * 0.88, radius * 0.065, 8, 40));
  add(
    new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, radius * 0.55, 20),
  ).rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const blade = add(
      new THREE.BoxGeometry(radius * 0.2, radius * 0.68, radius * 0.22),
      Math.sin(a) * radius * 0.51,
      Math.cos(a) * radius * 0.51,
    );
    blade.rotation.z = -a - 0.32;
    blade.rotation.y = 0.28;
  }
  mergeArchitecture(root);
  return root;
}
export function buildCoralStation(game, f, group) {
  if (game.level.id !== "tides" || f.stage !== 2) return false;
  const core = (f.core = new THREE.Group());
  core.userData.animated = true;
  group.add(core);
  if (f.step === 2) return true; // The delivery point is the physical pump.
  game.box(1.6, 0.8, 0.9, game.darkMat, 0, 0.4, 0, group);
  game.box(1.75, 0.15, 1, game.goldMat, 0, 0.88, 0, group);
  if (f.step === 0) {
    const rotor = pumpRotor(game.goldMat, 1.15);
    core.position.y = 2.05;
    core.add(rotor);
    for (const x of [-0.75, 0.75])
      game.box(0.1, 0.6, 0.15, game.darkMat, x, 1.1, -0.15, group);
  } else {
    game.box(3.4, 1.35, 0.22, game.stoneMat, 0, 1.45, -0.1, group);
    for (const [i, text] of [
      "PUMPKEEPER’S DIAGRAM",
      "INTAKE AT LEAST HALF OPEN",
      "HOLD THE NEEDLE BETWEEN GOLD TICKS",
    ].entries()) {
      const label = hydraulicPlaque(text, 3.2, "#f1d69d", 32);
      label.position.set(0, 1.86 - i * 0.42, 0.04);
      group.add(label);
    }
  }
  return true;
}

export function buildCoralPumpArt(game, pump) {
  const root = pump.root,
    stone = game.stoneMat,
    dark = game.darkMat;
  const bronze = patinatedBronze();
  bronze.name = "Salt-weathered coral pump bronze";
  const iron = new THREE.MeshStandardMaterial({
    color: 0x2e4747,
    roughness: 0.72,
    metalness: 0.6,
  });
  const gold = game.goldMat;
  let serial = 61000;
  const add = (geometry, material, x, y, z, parent = root, capture = true) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    if (capture) game.cameraSurfaces?.capture(m);
    return m;
  };
  const block = (
    w,
    h,
    d,
    x,
    y,
    z,
    mat = stone,
    parent = root,
    capture = true,
  ) =>
    add(stoneBlockGeometry(w, h, d, ++serial), mat, x, y, z, parent, capture);
  const solid = (x, y, z, w, h, d) =>
    pump.solids.push({
      x: pump.x + x,
      z: pump.z + z,
      w: w / 2,
      d: d / 2,
      bottom: pump.y + y - h / 2,
      top: pump.y + y + h / 2,
    });
  const body = (w, h, d, x, y, z, mat = stone) => {
    block(w, h, d, x, y, z, mat);
    solid(x, y, z, w, h, d);
  };
  const ring = (radius, tube, x, y, z, mat = bronze, parent = root) =>
    add(
      new THREE.TorusGeometry(radius, tube, 8, 48),
      mat,
      x,
      y,
      z,
      parent,
      false,
    );
  const label = (text, width, x, y, z, parent = root) => {
    const m = hydraulicPlaque(text, width, "#f1d9ab", 34);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const pipe = (points, radius = 0.21) =>
    add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
        40,
        radius,
        10,
        false,
      ),
      bronze,
      0,
      0,
      0,
    );
  // Salt-worn supports and a surviving back wall frame the maintenance aisle.
  for (const x of [-7, 7]) {
    body(1.2, 0.4, 1.3, x, 0.1, -3.6, dark);
    body(0.85, 4.5, 0.9, x, 2.5, -3.6);
    block(1.3, 0.35, 1.3, x, 4.85, -3.6);
  }
  block(15.1, 0.55, 1.3, 0, 5.2, -3.6);
  solid(0, 5.2, -3.6, 15.1, 0.55, 1.3);
  for (const x of [-6, -4.5, -3, 3, 4.5, 6])
    body(
      1.4,
      1.1 + (Math.abs(x) > 4 ? 0.5 : 0),
      0.7,
      x,
      Math.abs(x) > 4 ? 0.7 : 0.45,
      -3.6,
    );
  label("THE CORAL PUMP", 5, 0, 5.18, -2.9);
  // The round casing exposes its inspection face and the replaceable impeller.
  body(3.3, 0.65, 2.1, 0, 0.22, 0, dark);
  for (const x of [-1.05, 1.05]) body(0.45, 0.75, 1.5, x, 0.85, 0, bronze);
  const casing = add(
    new THREE.CylinderGeometry(1.38, 1.38, 0.8, 56, 1, true),
    bronze,
    0,
    1.85,
    -0.22,
  );
  casing.rotation.x = Math.PI / 2;
  const back = add(
    new THREE.CylinderGeometry(1.33, 1.33, 0.1, 48),
    iron,
    0,
    1.85,
    -0.65,
  );
  back.rotation.x = Math.PI / 2;
  for (const z of [-0.63, 0.22]) ring(1.39, 0.12, 0, 1.85, z);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const bolt = add(
      new THREE.CylinderGeometry(0.075, 0.075, 0.12, 6),
      iron,
      Math.sin(a) * 1.4,
      1.85 + Math.cos(a) * 1.4,
      0.31,
      root,
      false,
    );
    bolt.rotation.x = Math.PI / 2;
  }
  solid(0, 1.7, -0.2, 3, 3.4, 1.9);
  pump.rotor = pumpRotor(bronze, 1.15);
  pump.rotor.position.set(0, 1.85, 0.02);
  root.add(pump.rotor);
  label("IMPELLER SEAT", 1.6, 0, 0.45, 1.07);
  // Intake cistern, return loop and a receiving channel make the flow legible.
  for (const x of [-6.6, -3.4]) body(0.35, 1, 3.4, x, 0.4, -1.5, dark);
  for (const z of [-3, 0]) body(3.5, 1, 0.35, -5, 0.4, z, dark);
  block(3.1, 0.2, 2.8, -5, -0.02, -1.5, dark);
  pipe([
    [-5, 0.5, -1.5],
    [-5, 1.45, -1.5],
    [-3.6, 1.5, -0.7],
    [-1.4, 1.85, -0.25],
  ]);
  pipe([
    [1.3, 1.85, -0.25],
    [2.6, 1.7, -0.25],
    [5.1, 2.2, 0.1],
    [5.1, 2.1, 1.7],
  ]);
  pipe(
    [
      [2.6, 1.7, -0.25],
      [3.6, 1.2, -2.3],
      [0, 1.15, -2.65],
      [-3.5, 1.2, -2.3],
      [-5, 0.8, -1.5],
    ],
    0.15,
  );
  for (const x of [-3.5, 3.5]) body(0.5, 1.1, 0.5, x, 0.5, -0.5, dark);
  for (const x of [4.25, 5.95]) body(0.25, 0.65, 4, x, 0.25, 2.9, dark);
  for (const z of [1, 4.8]) body(1.95, 0.65, 0.25, 5.1, 0.25, z, dark);
  block(1.55, 0.16, 3.6, 5.1, -0.04, 2.9, dark);
  // Water is local to the pump; it does not alter chapter swimming volumes.
  const water = new THREE.MeshStandardMaterial({
    color: 0x6ca3a5,
    roughness: 0.2,
    metalness: 0.25,
    transparent: true,
    opacity: 0.8,
  });
  pump.intakeWater = add(
    new THREE.PlaneGeometry(2.8, 2.6),
    water,
    -5,
    0.67,
    -1.5,
    root,
    false,
  );
  pump.intakeWater.rotation.x = -Math.PI / 2;
  pump.outletWater = add(
    new THREE.PlaneGeometry(1.4, 3.45),
    water.clone(),
    5.1,
    0.2,
    2.9,
    root,
    false,
  );
  pump.outletWater.rotation.x = -Math.PI / 2;
  const stream = hydraulicStreamMaterial(pump.time);
  pump.jet = add(
    new THREE.CylinderGeometry(0.14, 0.22, 1.9, 12, 12, true),
    stream,
    5.1,
    1.15,
    1.7,
    root,
    false,
  );
  pump.jet.userData.animated = true;
  pump.foam = ring(
    0.3,
    0.045,
    5.1,
    0.22,
    1.7,
    new THREE.MeshBasicMaterial({
      color: 0xc9e2dc,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }),
  );
  pump.foam.rotation.x = -Math.PI / 2;
  pump.foam.userData.animated = true;
  // Two independently labelled wheel controls share a readable central gauge.
  pump.wheels = {};
  for (const [key, x] of [
    ["intake", -2.8],
    ["bypass", 2.8],
  ]) {
    body(0.55, 1.2, 0.6, x, 0.55, 1.2, dark);
    const wheel = new THREE.Group();
    wheel.userData.animated = true;
    wheel.position.set(x, 1.5, 1.4);
    root.add(wheel);
    ring(0.55, 0.065, 0, 0, 0, bronze, wheel);
    for (let i = 0; i < 4; i++) {
      const spoke = add(
        new THREE.BoxGeometry(0.055, 1.02, 0.055),
        bronze,
        0,
        0,
        0,
        wheel,
        false,
      );
      spoke.rotation.z = (i * Math.PI) / 4;
    }
    pump.wheels[key] = wheel;
    pipe(
      [
        [x, 1.4, 1.1],
        [x, 1.4, 0.2],
        [x, 1.4, -0.55],
      ],
      0.08,
    );
    label(key.toUpperCase(), 1.5, x, 2.43, 1.3);
    block(1.65, 0.65, 0.14, x, 2.43, 1.2, dark);
    // Four pips communicate the selected detent independently of colour.
    pump.pips[key] = [];
    for (let i = 0; i < 4; i++) {
      const pip = add(
        new THREE.SphereGeometry(0.055, 8, 6),
        gold,
        x - 0.24 + i * 0.16,
        2.21,
        1.32,
        root,
        false,
      );
      pip.userData.animated = true;
      pump.pips[key].push(pip);
    }
    pump.controls[key] = new THREE.Vector3(pump.x + x, pump.y, pump.z + 2.4);
  }
  // A local pressure repeater remains visible beside either valve in portrait
  // view. All three needles read the same pressure, rather than separate puzzles.
  pump.repeaters = [];
  const dial = new THREE.MeshStandardMaterial({
    color: 0x203b38,
    roughness: 0.95,
  });
  const pointer = new THREE.MeshBasicMaterial({ color: 0xf4dec1 });
  for (const x of [-2.8, 2.8]) {
    pipe(
      [
        [x, 1.4, 0.7],
        [x, 2.5, 0.7],
        [x, 3.12, 1.25],
      ],
      0.04,
    );
    const face = add(
      new THREE.CylinderGeometry(0.53, 0.53, 0.09, 40),
      dial,
      x,
      3.12,
      1.3,
    );
    face.rotation.x = Math.PI / 2;
    ring(0.54, 0.045, x, 3.12, 1.37);
    for (const value of [0, 10, 20, 30, 36, 46, 50, 60, 70, 80]) {
      const a = 2.1 - (value / 80) * 4.2,
        edge = value === 36 || value === 46;
      const mark = add(
        new THREE.BoxGeometry(edge ? 0.04 : 0.02, edge ? 0.16 : 0.065, 0.02),
        gold,
        x + Math.sin(a) * 0.43,
        3.12 + Math.cos(a) * 0.43,
        1.39,
        root,
        false,
      );
      mark.rotation.z = -a;
    }
    const needle = new THREE.Group();
    needle.userData.animated = true;
    needle.position.set(x, 3.12, 1.43);
    root.add(needle);
    add(
      new THREE.BoxGeometry(0.025, 0.39, 0.025),
      pointer,
      0,
      0.17,
      0,
      needle,
      false,
    );
    add(new THREE.SphereGeometry(0.05, 10, 6), bronze, 0, 0, 0, needle, false);
    pump.repeaters.push(needle);
  }
  const face = add(
    new THREE.CylinderGeometry(0.92, 0.92, 0.13, 56),
    dark,
    0,
    3.9,
    0.1,
  );
  face.rotation.x = Math.PI / 2;
  ring(0.93, 0.065, 0, 3.9, 0.2);
  for (let value = 0; value <= 80; value += 4) {
    const a = 2.1 - (value / 80) * 4.2,
      major = value % 20 === 0;
    const tick = add(
      new THREE.BoxGeometry(major ? 0.035 : 0.018, major ? 0.16 : 0.07, 0.025),
      gold,
      Math.sin(a) * 0.78,
      3.9 + Math.cos(a) * 0.78,
      0.22,
      root,
      false,
    );
    tick.rotation.z = -a;
  }
  for (const value of [36, 46]) {
    const a = 2.1 - (value / 80) * 4.2;
    const tick = add(
      new THREE.BoxGeometry(0.055, 0.25, 0.04),
      gold,
      Math.sin(a) * 0.72,
      3.9 + Math.cos(a) * 0.72,
      0.25,
      root,
      false,
    );
    tick.rotation.z = -a;
  }
  pump.needle = new THREE.Group();
  pump.needle.userData.animated = true;
  pump.needle.position.set(0, 3.9, 0.3);
  root.add(pump.needle);
  add(
    new THREE.BoxGeometry(0.045, 0.65, 0.035),
    new THREE.MeshBasicMaterial({ color: 0xf4dec1 }),
    0,
    0.27,
    0,
    pump.needle,
    false,
  );
  add(
    new THREE.SphereGeometry(0.09, 12, 8),
    bronze,
    0,
    0,
    0,
    pump.needle,
    false,
  );
  label("STEADY FLOW", 1.3, 0, 3.57, 0.29);
  label("INTAKE ≥ HALF · NEEDLE BETWEEN GOLD TICKS", 5.6, 0, 4.53, -2.9);
  block(5.9, 0.48, 0.15, 0, 4.53, -3, dark);
  // Keep transparent and moving components outside the static batches.
  pump.intakeWater.userData.animated =
    pump.outletWater.userData.animated = true;
  mergeArchitecture(root);
}
