import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import {
  prepareGardenGeometry,
  gardenPavingGeometry,
  gardenPlaque,
} from "./rain-garden-art.js";
import { mergeArchitecture } from "./visuals.js";
import { forgePlume } from "./forge-effects.js";
import { flumeMaterial } from "./waterfall-material.js";
import { CART_FLOOR } from "./tempering-cart-rules.js";

function label(text, width) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#eee0be";
  ctx.font = "600 40px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 512, 64, 990);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 6),
    new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
      roughness: 0.85,
    }),
  );
}
export function buildCartStation(game, f, group) {
  if (f.cartHeight === undefined) return false;
  group.position.y = game.terrainProfile.temperingY + f.cartHeight;
  f.yOffset = group.position.y - game.groundHeight(f.x * 7, f.z * 7);
  const metal = game.forgeMetal || game.goldMat;
  for (const x of [-0.48, 0.48])
    game.box(0.16, 0.85, 0.8, metal, x, 0.425, 0, group);
  game.box(1.25, 0.12, 0.95, metal, 0, 0.9, 0, group);
  const core = (f.core = new THREE.Group());
  core.userData.animated = true;
  group.add(core);
  if (f.step === 1) {
    const dial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.1, 32),
      metal,
    );
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, 1.3, 0);
    group.add(dial);
    const needle = game.box(
      0.035,
      0.5,
      0.03,
      game.goldMat,
      0,
      1.3,
      0.07,
      group,
    );
    needle.rotation.z = -0.4;
  } else {
    const blank = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.48, 0),
      game.darkMat,
    );
    blank.scale.set(1.6, 0.3, 0.65);
    blank.position.y = 1.06;
    core.add(blank);
    for (const x of [-0.5, 0.5])
      game.box(0.07, 0.22, 0.6, metal, x, 1.05, 0, group);
  }
  return true;
}

export function buildCartConstruction(game, h) {
  const { root, car } = h,
    stone = game.stoneMat,
    metal = game.forgeMetal || game.goldMat;
  let seed = 19500;
  const add = (geo, mat, x, y, z, parent = root, camera = true) => {
    const mesh = new THREE.Mesh(prepareGardenGeometry(geo, mat), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    if (camera) game.cameraSurfaces?.capture(mesh);
    return mesh;
  };
  const block = (
    w,
    height,
    d,
    x,
    y,
    z,
    mat = stone,
    parent = root,
    camera = true,
  ) =>
    add(stoneBlockGeometry(w, height, d, ++seed), mat, x, y, z, parent, camera);
  const solid = (x, z, w, d, bottom, top) =>
    h.solids.push({
      x,
      z,
      w: w / 2,
      d: d / 2,
      bottom: h.base + bottom,
      top: h.base + top,
    });
  const deck = (x, z, w, d, y, thickness = 0.28) => {
    if (w > 2 && d > 2 && thickness < 0.5)
      add(gardenPavingGeometry(w, d, thickness, ++seed), stone, x, y, z);
    else block(w, thickness, d, x, y - thickness / 2, z);
    const data = {
      x,
      z,
      w: w / 2,
      d: d / 2,
      y: h.base + y,
      thickness,
      cartPlatform: true,
    };
    h.decks.push(data);
    return data;
  };
  const pier = (x, z, top, w = 0.65) => {
    const bottom = game.groundHeight(x, z) - h.base;
    const n = Math.max(1, Math.ceil((top - bottom) / 0.5)),
      step = (top - bottom) / n;
    for (let i = 0; i < n; i++)
      block(w, step - 0.01, w, x, bottom + (i + 0.5) * step, z);
    solid(x, z, w, w, bottom, top);
  };
  const rail = (x, z, w, d, y) => {
    block(w, 0.09, d, x, y + 1.05, z, metal);
    solid(x, z, w, d, y + 1, y + 1.1);
    const length = Math.max(w, d),
      n = Math.ceil(length / 2);
    for (let i = 0; i <= n; i++) {
      const t = -length / 2 + (i * length) / n,
        px = x + (w > d ? t : 0),
        pz = z + (d > w ? t : 0);
      block(0.09, 1.05, 0.09, px, y + 0.525, pz, metal);
      solid(px, pz, 0.09, 0.09, y, y + 1.05);
    }
  };
  const sign = (text, x, y, z, width = 3) => {
    const mesh = gardenPlaque(text, width, stone, metal, label);
    mesh.name = `Forge inscription: ${text}`;
    mesh.position.set(x, y, z);
    root.add(mesh);
    for (const dx of [-width * 0.35, width * 0.35])
      block(0.08, 1.4, 0.08, x + dx, y - 0.7, z, metal);
  };
  // Fitted loading platforms and a separate raised inspection gallery.
  deck(84, 400, 8, 8, CART_FLOOR);
  deck(154, 398, 8, 8, CART_FLOOR);
  deck(147, 406, 6, 8, CART_FLOOR);
  deck(150, 402, 2, 2, CART_FLOOR);
  deck(147, 336, 10, 8, CART_FLOOR);
  for (const [x, z] of [
    [80.5, 396.5],
    [87.5, 403.5],
    [150.5, 394.5],
    [157.5, 401.5],
    [144.5, 409.5],
    [149.5, 403],
    [142.5, 332.5],
    [151.5, 339.5],
  ])
    pier(x, z, CART_FLOOR - 0.28);
  for (let i = 0; i < 8; i++) {
    deck(84, 393.4 + i * 0.4, 3, 0.42, (i + 1) * 0.15, (i + 1) * 0.15);
    deck(138.9 + i * 0.4, 337, 0.42, 3, (i + 1) * 0.15, (i + 1) * 0.15);
  }
  for (let i = 0; i < 28; i++)
    deck(147, 403.2 - i * 0.3, 2.4, 0.32, CART_FLOOR + (i + 1) * 0.15, 0.3);
  deck(147, 393, 5, 4, 5.4);
  for (const x of [144.8, 149.2])
    for (const z of [391.3, 394.7]) pier(x, z, 5.12);
  // Inclined steel stringers support the stair treads, below the walking surface.
  for (const x of [145.9, 148.1]) {
    const beam = block(0.14, 0.28, 9.2, x, 3.04, 399.15, metal);
    beam.rotation.x = Math.atan2(4.2, 8.4);
  }
  rail(144.6, 393, 0.09, 4, 5.4);
  rail(149.4, 393, 0.09, 4, 5.4);
  rail(147, 391.1, 5, 0.09, 5.4);
  sign("COOLANT INSPECTION · TURN TABLE", 147, 7.1, 391.1, 4.5);
  sign("LOAD BLANK · BOARD CART →", 84, 2.85, 396.2, 4.5);
  sign("TEMPERING CRADLE", 147, 2.85, 332.2, 4);
  deck(83.2, 404.35, 1.5, 0.9, CART_FLOOR, 0.16);
  deck(152.3, 336.8, 1.8, 1.5, CART_FLOOR, 0.16);
  // Rail head, web and foot are separate sections on close-spaced sleepers.
  const track = (x, z, length, angle, parent = root) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = angle;
    parent.add(group);
    for (let n = 0; n <= Math.ceil(length / 1.8); n++)
      block(
        0.22,
        0.1,
        2.7,
        -length / 2 + (n * length) / Math.ceil(length / 1.8),
        0.05,
        0,
        stone,
        group,
        false,
      );
    for (const side of [-1, 1]) {
      block(length, 0.06, 0.22, 0, 0.13, side * 1.05, metal, group, false);
      block(length, 0.13, 0.065, 0, 0.215, side * 1.05, metal, group, false);
      block(
        length,
        0.04,
        0.12,
        0,
        0.3 - 0.02,
        side * 1.05,
        metal,
        group,
        false,
      );
    }
    mergeArchitecture(group);
  };
  track(115.4, 406, 68.8, 0);
  track(154, 367.4, 68.8, Math.PI / 2);
  for (const [x, z] of [
    [79.7, 406],
    [154, 331.7],
  ]) {
    const width = x === 154 ? 2.7 : 0.3,
      depth = x === 154 ? 0.3 : 2.7;
    block(width, 0.65, depth, x, 0.45, z, metal);
    solid(x, z, width, depth, 0, 0.8);
  }
  // The rotating rail segment and boarding bridge share the table's transform.
  const table = (h.table = new THREE.Group());
  table.position.set(154, 0, 406);
  table.userData.animated = table.userData.cameraDynamic = true;
  root.add(table);
  add(
    new THREE.CylinderGeometry(4.25, 4.35, 0.16, 64),
    stone,
    154,
    -0.08,
    406,
    root,
    false,
  );
  const rim = add(
    new THREE.TorusGeometry(4.1, 0.07, 8, 64),
    metal,
    154,
    0.07,
    406,
    root,
    false,
  );
  rim.rotation.x = Math.PI / 2;
  track(0, 0, 8.1, 0, table);
  block(8.1, 0.2, 0.55, 0, -0.08, 0, metal, table, false);
  const bridge = (h.bridge = new THREE.Group());
  table.add(bridge);
  bridge.userData.animated = true;
  block(1.5, 0.16, 3.4, -0.8, CART_FLOOR - 0.08, -2.7, metal, bridge, false);
  h.bridgeDeck = {
    x: 153.2,
    z: 403.3,
    w: 0.75,
    d: 1.7,
    y: h.floor,
    thickness: 0.16,
  };
  h.decks.push(h.bridgeDeck);
  // A cargo basket leaves the rear half free for the pump operator.
  for (let i = 0; i < 7; i++)
    block(0.58, 0.18, 2.8, -1.8 + i * 0.6, -0.09, 0, metal, car);
  for (const z of [-1.05, 1.05])
    block(4.2, 0.18, 0.13, 0, -0.28, z, metal, car);
  for (const x of [-1.45, 1.45]) {
    const axle = add(
      new THREE.CylinderGeometry(0.07, 0.07, 2.65, 12),
      metal,
      x,
      -0.57,
      0,
      car,
      false,
    );
    axle.rotation.x = Math.PI / 2;
    for (const z of [-1.05, 1.05]) {
      const wheel = new THREE.Group();
      wheel.position.set(x, -0.57, z);
      wheel.userData.animated = true;
      car.add(wheel);
      h.wheels.push(wheel);
      const disc = add(
        new THREE.CylinderGeometry(0.33, 0.33, 0.15, 24),
        metal,
        0,
        0,
        0,
        wheel,
        false,
      );
      disc.rotation.x = Math.PI / 2;
      add(
        new THREE.TorusGeometry(0.32, 0.035, 8, 24),
        metal,
        0,
        0,
        z > 0 ? -0.09 : 0.09,
        wheel,
        false,
      );
      for (let i = 0; i < 6; i++) {
        add(
          new THREE.SphereGeometry(0.025, 6, 4),
          game.goldMat,
          Math.cos((i * Math.PI) / 3) * 0.17,
          Math.sin((i * Math.PI) / 3) * 0.17,
          z > 0 ? 0.085 : -0.085,
          wheel,
          false,
        );
      }
    }
  }
  h.carSolids = [];
  const carBar = (x, z, w, d, bottom, top) => {
    block(w, top - bottom, d, x, (bottom + top) / 2, z, metal, car);
    h.carSolids.push({ x, z, w: w / 2, d: d / 2, bottom, top });
  };
  carBar(0, 1.3, 4.05, 0.1, 0.95, 1.05);
  carBar(1.98, 0, 0.1, 2.6, 0.65, 0.75);
  carBar(-1.98, 0, 0.1, 2.6, 0.95, 1.05);
  for (const x of [-1.98, 1.98])
    for (const z of [-1.3, 1.3]) carBar(x, z, 0.1, 0.1, 0, 1);
  const cargo = (h.cargo = new THREE.Group());
  cargo.userData.animated = true;
  car.add(cargo);
  for (const z of [-0.6, 0.6])
    block(1.8, 0.25, 0.12, 0.85, 0.2, z, metal, car, false);
  const blank = add(
    new THREE.OctahedronGeometry(0.75, 0),
    game.darkMat,
    0.85,
    0.36,
    0,
    cargo,
    false,
  );
  blank.scale.set(1.1, 0.3, 0.7);
  for (const x of [0.2, 1.5])
    block(0.08, 0.04, 1.2, x, 0.52, 0, metal, cargo, false);
  block(0.22, 0.82, 0.25, -0.12, 0.41, 0, metal, car, false);
  const pump = (h.pump = new THREE.Group());
  pump.position.set(-0.12, 0.9, 0);
  pump.userData.animated = true;
  car.add(pump);
  block(0.07, 0.38, 0.07, 0, 0.19, 0, metal, pump, false);
  block(0.075, 0.075, 0.9, 0, 0.38, 0, metal, pump, false);
  h.handles = [-0.3, 0.3].map((z) => {
    const n = new THREE.Object3D();
    n.position.set(0, 0.38, z);
    pump.add(n);
    return n;
  });
  // A caged work lamp keeps the handle and the next rail joints readable.
  block(0.26, 0.08, 0.26, 1.7, 1.02, -1.1, metal, car, false);
  block(0.26, 0.06, 0.26, 1.7, 1.4, -1.1, metal, car, false);
  for (const x of [-0.11, 0.11])
    for (const z of [-0.11, 0.11])
      block(0.025, 0.35, 0.025, 1.7 + x, 1.21, -1.1 + z, metal, car, false);
  add(
    new THREE.CylinderGeometry(0.065, 0.085, 0.24, 12),
    game.glowMat || game.goldMat,
    1.7,
    1.2,
    -1.1,
    car,
    false,
  );
  h.lamp = new THREE.PointLight(0xffcc88, 8, 10, 2);
  h.lamp.position.set(1.7, 1.2, -1.1);
  car.add(h.lamp);
  h.carSolids.push({ x: 0.85, z: 0, w: 0.9, d: 0.65, bottom: 0.1, top: 0.55 });
  h.calls = [
    { x: 81, z: 402 },
    { x: 153, z: 398 },
    { x: 145, z: 339 },
  ];
  for (const p of h.calls) {
    block(0.25, 1.1, 0.25, p.x, CART_FLOOR + 0.55, p.z, metal);
    sign("RECALL CART", p.x, CART_FLOOR + 1.15, p.z, 1.6);
  }
  h.control = { x: 147, z: 393.3, y: h.base + 5.4 };
  block(0.22, 1.05, 0.22, 147, 5.925, 393.3, metal);
  const handwheel = (h.handwheel = add(
    new THREE.TorusGeometry(0.4, 0.055, 8, 32),
    metal,
    147,
    6.5,
    393.3,
    root,
    false,
  ));
  handwheel.userData.animated = true;
  for (let i = 0; i < 3; i++) {
    const spoke = block(0.06, 0.8, 0.06, 0, 0, 0, metal, handwheel, false);
    spoke.rotation.z = (i * Math.PI) / 3;
  }
  // A lined cooling bath makes the inspection's quiet steam emitter visible.
  for (const z of [397, 400]) {
    block(4.2, 0.9, 0.32, 162, 0.45, z);
    solid(162, z, 4.2, 0.32, 0, 0.9);
  }
  for (const x of [160, 164]) {
    block(0.32, 0.9, 3, x, 0.45, 398.5);
    solid(x, 398.5, 0.32, 3, 0, 0.9);
  }
  const water = flumeMaterial(h.time, { ...game.level, water: 0x548d95 });
  const sheet = add(
    new THREE.PlaneGeometry(3.65, 2.65),
    water,
    162,
    0.65,
    398.5,
    root,
    false,
  );
  sheet.rotation.x = -Math.PI / 2;
  sheet.castShadow = false;
  h.steam = { value: 0 };
  const plume = forgePlume(h.time, h.steam, true, 48);
  plume.position.set(162, 0.7, 398.5);
  root.add(plume);
  const pipe = new THREE.CatmullRomCurve3([
    new THREE.Vector3(147, 5.7, 392),
    new THREE.Vector3(150, 5.7, 392),
    new THREE.Vector3(159, 1.2, 397),
    new THREE.Vector3(162, 1.2, 398.5),
  ]);
  add(
    new THREE.TubeGeometry(pipe, 32, 0.11, 8, false),
    metal,
    0,
    0,
    0,
    root,
    false,
  );
  h.sources = [
    {
      id: "tempering-wheels",
      kind: "machine",
      x: 84,
      y: h.base + 0.7,
      z: 406,
      gain: 0.075,
      near: 1.5,
      range: 24,
      activity: 0,
    },
    {
      id: "tempering-table",
      kind: "hoist",
      x: 154,
      y: h.base + 0.3,
      z: 406,
      gain: 0.055,
      near: 2,
      range: 24,
      activity: 0,
    },
    {
      id: "tempering-bath",
      kind: "steam",
      x: 162,
      y: h.base + 0.9,
      z: 398.5,
      gain: 0.09,
      near: 2,
      range: 20,
      activity: 0,
    },
  ];
  mergeArchitecture(car);
  mergeArchitecture(table);
  mergeArchitecture(root);
}
