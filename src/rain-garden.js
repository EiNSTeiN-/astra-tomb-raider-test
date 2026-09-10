import {
  prepareGardenGeometry,
  gardenPavingGeometry,
  gardenLiftPulleyGeometry,
  gardenPlaque,
  buildGardenShelter,
  buildGardenWheel,
} from "./rain-garden-art.js";
import * as THREE from "three";
import {
  stoneBlockGeometry,
  carvedPanelGeometry,
} from "./temple-architecture.js";
import { timberGeometry } from "./monastery-architecture.js";
import { mergeArchitecture } from "./visuals.js";
import {
  flumeMaterial,
  curtainMaterial,
  impactMaterial,
} from "./waterfall-material.js";
import {
  GARDEN_FLOOR,
  GARDEN_UPPER,
  channelPorts,
  gardenChannelPosition,
  traceGarden,
  gardenPowered,
  normalizeRainGarden,
} from "./rain-garden-rules.js";

function label(text, width = 2.5) {
  const c = document.createElement("canvas");
  c.width = 768;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ece2b9";
  ctx.font = "600 36px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 384, 64, 744);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 6),
    new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
      roughness: 0.95,
    }),
  );
}
export function buildGardenStation(game, f, group) {
  if (f.gardenHeight === undefined || !game.map.rainGarden) return false;
  const site = game.map.rainGarden,
    y = game.groundHeight(site.x * 7, site.z * 7) + f.gardenHeight;
  group.position.y = y;
  f.yOffset = y - game.groundHeight(f.x * 7, f.z * 7);
  const stone = game.templeMaterial || game.stoneMat,
    metal = game.climbingMaterials?.metal || game.goldMat;
  const part = (w, h, d, py, mat = stone) => {
    const mesh = new THREE.Mesh(
      prepareGardenGeometry(stoneBlockGeometry(w, h, d, 9300 + f.step), mat),
      mat,
    );
    mesh.position.y = py;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  part(1.18, 0.16, 0.96, 0.08);
  part(0.87, 0.65, 0.66, 0.47);
  part(1.03, 0.16, 0.83, 0.83);
  part(0.24, 0.54, 0.24, 1.12, metal);
  const panel = new THREE.Mesh(
    prepareGardenGeometry(
      carvedPanelGeometry(0.57, 0.55, f.step, [12, 22]),
      stone,
    ),
    stone,
  );
  panel.position.set(0, 0.2, 0.34);
  panel.castShadow = panel.receiveShadow = true;
  group.add(panel);
  const core = (f.core = new THREE.Group());
  core.position.set(0, 1.35, 0);
  group.add(core);
  core.add(
    new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.055, 8, 24), game.goldMat),
  );
  for (let i = 0; i < 4; i++)
    game.box(0.055, 0.82, 0.07, game.goldMat, 0, 0, 0, core).rotation.z =
      (i * Math.PI) / 4;
  const sign = gardenPlaque(
    ["SPRING RELEASE", "GARDEN CHANNEL", "SANCTUARY SLUICE"][f.step],
    2.35,
    stone,
    metal,
    label,
  );
  for (const px of [-0.36, 0.36]) {
    const post = part(0.075, 1.22, 0.075, 1.43, metal);
    post.position.set(px, 1.43, -0.08);
  }
  sign.position.set(0, 2.05, 0.15);
  group.add(sign);
  return true;
}

export function buildRainGarden(game) {
  game.rainGarden = null;
  if (!game.map.rainGarden) return;
  const site = game.map.rainGarden,
    x = site.x * 7,
    z = site.z * 7,
    y = game.groundHeight(x, z),
    root = new THREE.Group();
  root.name = "The rain garden";
  root.position.set(x, y, z);
  game.world.add(root);
  const saved = normalizeRainGarden(game.progress.rainGarden, game.progress);
  game.progress.rainGarden = saved;
  const g = (game.rainGarden = {
    root,
    x,
    y,
    z,
    saved,
    decks: [],
    solids: [],
    channels: [],
    sources: [],
    turn: null,
    motion: null,
    time: { value: 0 },
    wheelAngle: 0,
  });
  const stone = game.templeMaterial || game.stoneMat,
    wood = game.climbingMaterials?.timber || game.campMaterials.wood,
    metal = game.climbingMaterials?.metal || game.goldMat,
    rope = game.climbingMaterials?.rope || game.darkMat;
  const water = flumeMaterial(g.time, game.level);
  water.name = "Rain garden channel flow";
  let seed = 88000;
  const add = (geo, mat, px, py, pz, parent = root, camera = true) => {
    prepareGardenGeometry(geo, mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(px, py, pz);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    if (camera) game.cameraSurfaces?.capture(mesh);
    return mesh;
  };
  const block = (
    w,
    h,
    d,
    px,
    py,
    pz,
    mat = stone,
    parent = root,
    camera = true,
  ) =>
    add(
      mat === wood
        ? timberGeometry(w, h, d, ++seed)
        : stoneBlockGeometry(w, h, d, ++seed),
      mat,
      px,
      py,
      pz,
      parent,
      camera,
    );
  const solid = (px, pz, w, d, bottom, top) => {
    const s = {
      x: x + px,
      z: z + pz,
      w: w / 2,
      d: d / 2,
      bottom: y + bottom,
      top: y + top,
    };
    g.solids.push(s);
    return s;
  };
  const deck = (px, pz, w, d, top, thickness = 0.35, parent = root) => {
    if (d > 0.5 && w > 1.7 && thickness <= 0.45)
      add(
        gardenPavingGeometry(w, d, thickness, ++seed),
        stone,
        px,
        top,
        pz,
        parent,
      );
    else block(w, thickness, d, px, top - thickness / 2, pz, stone, parent);
    const data = {
      x: x + px,
      z: z + pz,
      w: w / 2,
      d: d / 2,
      y: y + top,
      thickness,
      garden: true,
    };
    g.decks.push(data);
    return data;
  };
  const pier = (px, pz, top, w = 0.7) => {
    const bottom = game.groundHeight(x + px, z + pz) - y;
    const n = Math.ceil((top - bottom) / 0.6),
      h = (top - bottom) / n;
    for (let i = 0; i < n; i++)
      block(w, h - 0.012, w, px, bottom + (i + 0.5) * h, pz);
    block(w + 0.35, 0.2, w + 0.35, px, bottom + 0.1, pz);
    solid(px, pz, w, w, bottom, top);
  };
  const sign = (text, px, py, pz, width = 3) => {
    const m = gardenPlaque(text, width, stone, metal, label);
    m.position.set(px, py, pz);
    root.add(m);
    return m;
  };
  const rail = (px, pz, w, d, top) => {
    block(w, 0.13, d, px, top + 1.1, pz, wood);
    solid(px, pz, w, d, top + 0.98, top + 1.22);
    const length = Math.max(w, d),
      count = Math.ceil(length / 1.8);
    for (let i = 0; i <= count; i++) {
      const along = -length / 2 + (length * i) / count,
        cx = px + (w > d ? along : 0),
        cz = pz + (d > w ? along : 0);
      block(0.12, 1.1, 0.12, cx, top + 0.55, cz, wood);
      solid(cx, cz, 0.12, 0.12, top, top + 1.1);
    }
  };
  // An open undercroft supports the irrigation terrace. The west stair is solid
  // masonry; its treads fit the same support and camera geometry as its surface.
  deck(0, 1, 12.6, 16, GARDEN_FLOOR, 0.45);
  for (const px of [-5.7, 5.7])
    for (const pz of [-6.3, 0, 7.9]) pier(px, pz, GARDEN_FLOOR - 0.45, 0.9);
  for (const pz of [-6.3, 0, 7.9]) {
    for (let course = 0; course < 12; course++)
      block(1.034, 0.34, 0.7, -5.69 + course * 1.035, 4.99, pz);
    solid(0, pz, 12.42, 0.7, 4.82, 5.16);
    for (const px of [-5.7, 5.7]) {
      block(1.25, 0.23, 1.1, px, 4.77, pz);
      solid(px, pz, 1.25, 1.1, 4.65, 4.885);
    }
  }
  for (let i = 0; i < 36; i++)
    deck(
      -9,
      10.65 - i * 0.3,
      2.6,
      0.32,
      ((i + 1) * GARDEN_FLOOR) / 36,
      ((i + 1) * GARDEN_FLOOR) / 36,
    );
  deck(-7.4, -0.75, 5.8, 1.66, GARDEN_FLOOR);
  rail(0, -6.92, 12.6, 0.13, GARDEN_FLOOR);
  rail(6.18, 6.0, 0.13, 5.8, GARDEN_FLOOR);
  block(0.22, 1.25, 0.22, -11.5, 0.625, 11.8, wood);
  sign("CHANNEL TERRACE →", -11.5, 1.3, 11.8, 2.3);
  sign("SPRING → CHANNELS → WHEEL", 0, 6.74, -6.92, 4.8);
  // The original lower spring valve controls a lifted sluice inside this stone
  // headwall. Its feed reaches the west port of the middle row.
  for (const px of [-7.25, -5.95]) pier(px, -3.5, 8.1, 0.75);
  block(2.1, 0.6, 1.2, -6.6, 8.15, -3.5);
  const relief = add(
    carvedPanelGeometry(1.0, 2.2, ++seed),
    stone,
    -6.6,
    6.9,
    -3.1,
  );
  const shutter = (g.springGate = block(
    0.95,
    1.65,
    0.18,
    -6.6,
    6.2,
    -2.95,
    metal,
    root,
    false,
  ));
  shutter.userData.animated = true;
  // Shallow channel stones can be stepped across. Each tile has two open ports
  // and a real recessed bed; only the path connected to the spring carries water.
  for (let i = 0; i < 9; i++) {
    const p = gardenChannelPosition(i),
      tile = new THREE.Group();
    tile.position.set(p.x, GARDEN_FLOOR, p.z);
    tile.userData.animated = true;
    root.add(tile);
    block(3.3, 0.13, 3.3, 0, 0.065, 0, stone, tile, false);
    g.decks.push({
      x: x + p.x,
      z: z + p.z,
      w: 1.65,
      d: 1.65,
      y: y + GARDEN_FLOOR + 0.13,
      thickness: 0.13,
      garden: true,
    });
    const pivot = new THREE.Group();
    pivot.userData.animated = true;
    tile.add(pivot);
    const wet = new THREE.Group();
    wet.userData.animated = true;
    pivot.add(wet);
    const ends = channelPorts(i, 0);
    for (const direction of ends) {
      const a = (-direction * Math.PI) / 2,
        arm = new THREE.Group();
      arm.rotation.y = a;
      pivot.add(arm);
      block(0.72, 0.1, 1.76, 0, 0.16, -0.87, stone, arm, false);
      for (const side of [-1, 1])
        block(0.1, 0.18, 1.76, side * 0.4, 0.26, -0.87, stone, arm, false);
      const sheet = add(
        new THREE.PlaneGeometry(0.69, 1.76),
        water,
        0,
        0.225,
        -0.87,
        wet,
        false,
      );
      sheet.rotation.x = -Math.PI / 2;
      // Match the water arm to the stone arm's local cardinal direction.
      sheet.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      sheet.rotation.z = (direction * Math.PI) / 2;
    }
    block(0.7, 0.1, 0.7, 0, 0.16, 0, stone, pivot, false);
    const centre = add(
      new THREE.PlaneGeometry(0.72, 0.72),
      water,
      0,
      0.226,
      0,
      wet,
      false,
    );
    centre.rotation.x = -Math.PI / 2;
    const cap = add(
      new THREE.CylinderGeometry(0.22, 0.25, 0.28, 16),
      metal,
      0.95,
      0.18,
      0.95,
      tile,
      false,
    );
    const handle = add(
      new THREE.TorusGeometry(0.2, 0.035, 6, 16),
      metal,
      0.95,
      0.38,
      0.95,
      tile,
      false,
    );
    handle.rotation.x = Math.PI / 2;
    const number = label(String(i + 1), 0.7);
    number.position.set(0.95, 0.142, 1.42);
    number.rotation.x = -Math.PI / 2;
    tile.add(number);
    g.channels.push({
      root: tile,
      pivot,
      wet,
      position: new THREE.Vector3(
        x + p.x + 0.95,
        y + GARDEN_FLOOR,
        z + p.z + 0.95,
      ),
    });
    // The very low rims are decorative walking detail, kept below step height.
    mergeArchitecture(pivot);
    mergeArchitecture(tile);
  }
  const flume = (ax, az, bx, bz, py, width = 0.8) => {
    const length = Math.hypot(bx - ax, bz - az),
      group = new THREE.Group();
    group.position.set((ax + bx) / 2, py, (az + bz) / 2);
    group.rotation.y = Math.atan2(bx - ax, bz - az);
    root.add(group);
    block(width + 0.2, 0.12, length, 0, -0.06, 0, stone, group, false);
    for (const side of [-1, 1])
      block(
        0.12,
        0.22,
        length,
        side * (width / 2 + 0.06),
        0.05,
        0,
        stone,
        group,
        false,
      );
    const surface = add(
      new THREE.PlaneGeometry(width, length),
      water,
      0,
      0.055,
      0,
      group,
      false,
    );
    surface.rotation.x = -Math.PI / 2;
    surface.userData.animated = true;
    mergeArchitecture(group);
    return surface;
  };
  g.inlet = [flume(-6.6, -2.9, -6.6, 0, 5.84), flume(-6.6, 0, -5.25, 0, 5.84)];
  g.outlet = flume(5.25, -3.5, 7.3, -3.5, 5.84);
  for (const [text, px, pz] of [
    ["IN", -5.45, 0.4],
    ["OUT", 5.4, -3.1],
  ]) {
    block(0.1, 0.8, 0.1, px, 6.0, pz, metal);
    sign(text, px, 6.4, pz, 0.75);
  }
  // Restored irrigation drives a wheel below the raised headrace.
  const wheel = (g.wheel = new THREE.Group());
  wheel.position.set(9, 2.5, -3.5);
  wheel.userData.animated = true;
  root.add(wheel);
  buildGardenWheel({ add, block, wood, metal, wheel });
  for (const pz of [-4.25, -2.75]) pier(9, pz, 2.55, 0.65);
  const shaft = add(
    new THREE.CylinderGeometry(0.18, 0.18, 2.2, 16),
    metal,
    9,
    2.5,
    -3.5,
  );
  shaft.rotation.x = Math.PI / 2;
  const fallTop = 5.895,
    fallBottom = 0.07,
    fallHeight = fallTop - fallBottom;
  const curtain = (g.fall = add(
    new THREE.PlaneGeometry(0.75, fallHeight, 4, 20),
    curtainMaterial(g.time, { value: fallHeight }, 23, game.level),
    7.3,
    (fallTop + fallBottom) / 2,
    -3.5,
    root,
    false,
  ));
  curtain.rotation.y = -Math.PI / 2;
  curtain.castShadow = false;
  const pool = (g.pool = add(
    new THREE.PlaneGeometry(4.8, 3),
    water,
    8.4,
    0.04,
    -3.5,
    root,
    false,
  ));
  pool.rotation.x = -Math.PI / 2;
  for (const dz of [-5.1, -1.9]) {
    block(5.3, 0.45, 0.35, 8.4, 0.225, dz);
    solid(8.4, dz, 5.3, 0.35, 0, 0.45);
  }
  const foam = (g.foam = add(
    new THREE.PlaneGeometry(2.6, 1.8),
    impactMaterial(g.time, game.level),
    7.3,
    0.07,
    -3.5,
    root,
    false,
  ));
  foam.rotation.x = -Math.PI / 2;
  // A geared rope drum raises a level cargo platform between the terrace and
  // the sanctuary walk. Both landings can call it; the lever travels aboard.
  deck(6.75, 0, 2.0, 2.6, GARDEN_FLOOR);
  deck(9, -4.9, 3.4, 7.4, GARDEN_UPPER);
  deck(7, -7, 6, 3.4, GARDEN_UPPER);
  for (const px of [7.25, 10.75])
    for (const pz of [-1.5, 1.5]) pier(px, pz, 10.9, 0.42);
  for (const pz of [-7.8, -4]) pier(10.5, pz, GARDEN_UPPER - 0.35, 0.65);
  pier(4.4, -7.8, GARDEN_UPPER - 0.35, 0.65);
  buildGardenShelter({ add, block, wood, metal });
  rail(10.65, -5, 0.13, 7.4, GARDEN_UPPER);
  rail(7, -8.6, 6, 0.13, GARDEN_UPPER);
  const car = (g.car = new THREE.Group());
  car.position.set(9, saved.stop ? GARDEN_UPPER : GARDEN_FLOOR, 0);
  car.userData.animated = true;
  car.userData.cameraDynamic = true;
  root.add(car);
  for (let plank = 0; plank < 10; plank++)
    block(0.332, 0.19, 3.2, -1.53 + plank * 0.34, -0.095, 0, wood, car);
  for (const pz of [-1.2, 1.2]) {
    block(3.4, 0.1, 0.25, 0, -0.23, pz, wood, car);
    for (const px of [-1.48, 1.48])
      block(0.1, 0.025, 0.45, px, 0.014, pz, metal, car, false);
  }
  g.carDeck = {
    x: x + 9,
    z,
    w: 1.7,
    d: 1.6,
    y: y + car.position.y,
    thickness: 0.28,
    garden: true,
  };
  g.decks.push(g.carDeck);
  for (const px of [-1.55, 1.55]) {
    block(0.1, 1.0, 0.1, px, 0.5, 1.45, wood, car);
    block(0.1, 1, 0.1, px, 0.5, -1.45, wood, car);
  }
  block(3.2, 0.12, 0.12, 0, 1.0, 1.45, wood, car);
  g.carRail = solid(
    9,
    1.45,
    3.2,
    0.12,
    car.position.y + 0.94,
    car.position.y + 1.06,
  );
  const lever = (g.lever = block(
    0.08,
    0.68,
    0.08,
    0,
    1.1,
    0.9,
    metal,
    car,
    false,
  ));
  lever.userData.animated = true;
  block(0.26, 0.7, 0.26, 0, 0.35, 0.9, wood, car);
  const cable = (g.cable = add(
    new THREE.CylinderGeometry(0.04, 0.04, 1, 8),
    rope,
    9,
    9,
    1.45,
    root,
    false,
  ));
  cable.userData.animated = true;
  const pulley = (g.pulley = add(
    gardenLiftPulleyGeometry(),
    metal,
    9,
    11.8,
    1,
    root,
    false,
  ));
  pulley.userData.animated = true;
  pulley.rotation.y = Math.PI / 2;
  add(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(9, 2.5, -4.2),
        new THREE.Vector3(10.4, 5, -3),
        new THREE.Vector3(10.4, 11.6, 0.3),
        new THREE.Vector3(9, 11.8, 0.55),
      ]),
      32,
      0.04,
      6,
      false,
    ),
    rope,
    0,
    0,
    0,
    root,
    false,
  );
  const wrap = Array.from({ length: 17 }, (_, i) => {
    const a = Math.PI - (i * Math.PI) / 16;
    return new THREE.Vector3(
      9,
      11.8 + Math.sin(a) * 0.45,
      1 + Math.cos(a) * 0.45,
    );
  });
  add(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(wrap),
      32,
      0.04,
      8,
      false,
    ),
    rope,
    0,
    0,
    0,
    root,
    false,
  );
  block(0.24, 0.27, 0.14, 0, 1.08, 1.45, metal, car, false);
  g.calls = [
    new THREE.Vector3(x + 6.7, y + GARDEN_FLOOR, z + 1),
    new THREE.Vector3(x + 9, y + GARDEN_UPPER, z - 2.1),
  ];
  for (const [i, p] of g.calls.entries()) {
    block(0.3, 1.1, 0.3, p.x - x, p.y - y + 0.55, p.z - z, stone);
    sign("CALL LIFT", p.x - x, p.y - y + 1.1, p.z - z + 0.12, 1.2);
  }
  const rideSign = gardenPlaque("SANCTUARY LIFT", 2.7, stone, metal, label);
  rideSign.position.set(0, 1, 1.55);
  car.add(rideSign);
  g.sources = [
    {
      id: "rain-garden-spring",
      kind: "waterfall",
      x: x - 6.6,
      y: y + 5.9,
      z,
      gain: 0.22,
      near: 2,
      range: 28,
      activity: 0,
    },
    {
      id: "rain-garden-wheel-water",
      kind: "waterfall",
      x: x + 7.3,
      y: y + 0.3,
      z: z - 3.5,
      gain: 0.3,
      near: 2,
      range: 32,
      activity: 0,
    },
    {
      id: "rain-garden-lift",
      kind: "hoist",
      x: x + 9,
      y: y + 11.8,
      z: z + 1.4,
      gain: 0.06,
      near: 2,
      range: 25,
      activity: 0,
    },
  ];
  for (const mesh of [g.fall, g.foam, g.pool]) mesh.userData.animated = true;
  mergeArchitecture(wheel);
  mergeArchitecture(car);
  mergeArchitecture(root);
  updateRainGarden(game, 0, true);
}

export function turnGardenChannel(game, index) {
  const g = game.rainGarden;
  if (
    !g ||
    game.paused ||
    g.turn ||
    gardenPowered(game.progress) ||
    game.progress.stage !== 2 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > 8
  )
    return false;
  g.turn = { index, from: g.saved.rotations[index], time: 0, duration: 0.36 };
  return true;
}
export function startGardenLift(game, stop) {
  const g = game.rainGarden;
  if (
    !g ||
    game.paused ||
    !gardenPowered(game.progress) ||
    g.motion ||
    (stop !== 0 && stop !== 1) ||
    stop === g.saved.stop
  )
    return false;
  g.motion = { time: 0, duration: 3.3, from: g.car.position.y, stop };
  return true;
}
export function updateRainGarden(game, dt, initial = false) {
  const g = game.rainGarden;
  if (!g) return;
  if (game.paused && !initial) dt = 0;
  g.time.value += dt;
  if (g.turn) {
    const t = g.turn;
    t.time += dt;
    if (t.time >= t.duration) {
      g.saved.rotations[t.index] = (t.from + 1) % 4;
      g.turn = null;
      game.save();
    }
  }
  const spring =
      gardenPowered(game.progress) || game.progress.field.includes("field-2-0"),
    flow = traceGarden(g.saved.rotations, g.turn?.index ?? -1);
  g.flow = spring ? flow : { path: [], complete: false };
  g.channels.forEach((c, i) => {
    const t = g.turn?.index === i ? g.turn : null,
      amount = t ? Math.min(1, t.time / t.duration) : 0;
    c.pivot.rotation.y =
      (-(t ? t.from + amount : g.saved.rotations[i]) * Math.PI) / 2;
    c.wet.visible = g.flow.path.some((p) => p.index === i);
  });
  g.springGate.position.y = 6.2 + (spring ? 1.4 : 0);
  for (const s of g.inlet) s.visible = spring;
  g.outlet.visible = g.flow.complete;
  const powered = gardenPowered(game.progress);
  g.fall.visible = g.foam.visible = g.pool.visible = !!powered;
  if (powered) g.wheelAngle -= dt * 0.55;
  g.wheel.rotation.z = g.wheelAngle;
  const m = g.motion;
  if (m) {
    m.time += dt;
    const t = Math.min(1, m.time / m.duration),
      ease = t * t * (3 - 2 * t),
      previous = g.carDeck.y;
    g.car.position.y = THREE.MathUtils.lerp(
      m.from,
      m.stop ? GARDEN_UPPER : GARDEN_FLOOR,
      ease,
    );
    g.carDeck.y = g.y + g.car.position.y;
    const p = game.player?.position;
    if (
      game.grounded &&
      !game.climb &&
      p &&
      Math.abs(p.y - previous) < 0.24 &&
      Math.abs(p.x - g.carDeck.x) < g.carDeck.w &&
      Math.abs(p.z - g.carDeck.z) < g.carDeck.d
    ) {
      p.y += g.carDeck.y - previous;
      game.jumpY = p.y - game.groundHeight(p.x, p.z);
      game.fallPeak = p.y;
    }
    if (t >= 1) {
      g.saved.stop = m.stop;
      g.motion = null;
      game.save();
    }
  }
  g.lever.rotation.z = g.motion?.stop === 1 ? -0.45 : 0.45;
  g.carRail.bottom = g.carDeck.y + 0.94;
  g.carRail.top = g.carDeck.y + 1.06;
  g.pulley.rotation.z = -g.car.position.y / 0.45;
  const length = 11.8 - g.car.position.y - 1.2;
  g.cable.position.y = g.car.position.y + 1.2 + length / 2;
  g.cable.scale.y = Math.max(0.1, length);
  g.sources[0].activity = spring && !game.paused ? 1 : 0;
  g.sources[1].activity = powered && !game.paused ? 1 : 0;
  g.sources[2].activity = g.motion && !game.paused ? 1 : 0;
}
function gardenControl(game) {
  const g = game.rainGarden,
    p = game.player?.position;
  if (!g || !p || !game.grounded || game.swimming) return null;
  const near = (v, d = 1.5) =>
    Math.abs(p.y - v.y) < 0.65 && Math.hypot(p.x - v.x, p.z - v.z) < d;
  if (
    Math.abs(p.y - g.carDeck.y) < 0.3 &&
    Math.abs(p.x - g.carDeck.x) < 1.7 &&
    Math.abs(p.z - g.carDeck.z) < 1.6
  )
    return { kind: "ride" };
  for (const [stop, v] of g.calls.entries())
    if (near(v, 1.05)) return { kind: "call", stop };
  if (game.progress.stage !== 2 || gardenPowered(game.progress)) return null;
  let best = null,
    distance = 1.45;
  for (const [index, c] of g.channels.entries())
    if (near(c.position, distance)) {
      distance = Math.hypot(p.x - c.position.x, p.z - c.position.z);
      best = { kind: "turn", index };
    }
  return best;
}
export function gardenHint(game) {
  const c = gardenControl(game),
    g = game.rainGarden;
  if (!c) return null;
  return {
    key: "E",
    label:
      c.kind === "turn"
        ? g.turn
          ? "Channel turning…"
          : `Turn channel ${c.index + 1} · join the wet ends`
        : !gardenPowered(game.progress)
          ? "Connect the spring, then open the garden channel"
          : g.motion
            ? "Water lift travelling"
            : c.kind === "call"
              ? "Call the water lift"
              : g.saved.stop
                ? "Lower the water lift"
                : "Ride the water lift to the sanctuary",
  };
}
export function gardenInteract(game) {
  const c = gardenControl(game);
  if (!c) return false;
  if (c.kind === "turn") turnGardenChannel(game, c.index);
  else if (
    !startGardenLift(
      game,
      c.kind === "call" ? c.stop : 1 - game.rainGarden.saved.stop,
    )
  )
    game.cb.toast?.(gardenHint(game).label);
  return true;
}
