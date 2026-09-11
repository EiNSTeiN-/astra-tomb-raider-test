import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import {
  gardenPavingGeometry,
  prepareGardenGeometry,
} from "./rain-garden-art.js";
import { mergeArchitecture } from "./visuals.js";
import { CRANE_SITE, CRANE_DECK } from "./astral-crane-rules.js";

function inscription(text, width = 4) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const c = canvas.getContext("2d"),
    lines = text.split("\n");
  c.fillStyle = "#ead8ad";
  c.font = "600 45px Georgia";
  c.textAlign = "center";
  c.textBaseline = "middle";
  lines.forEach((s, i) =>
    c.fillText(s, 512, 128 + (i - (lines.length - 1) / 2) * 63, 985),
  );
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
      roughness: 0.9,
    }),
  );
}

export function spindleModel(game) {
  const group = new THREE.Group();
  const add = (geo, material, y) => {
    const mesh = new THREE.Mesh(prepareGardenGeometry(geo, material), material);
    mesh.position.y = y;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  add(new THREE.CylinderGeometry(0.25, 0.25, 1.4, 20), game.darkMat, 0.82);
  for (const y of [0.12, 0.4, 1.2, 1.52])
    add(new THREE.CylinderGeometry(0.48, 0.48, 0.18, 24), game.goldMat, y);
  for (let i = 0; i < 8; i++) {
    const piece = add(
      new THREE.BoxGeometry(0.1, 0.85, 0.1),
      game.goldMat,
      0.82,
    );
    piece.position.x = Math.sin((i * Math.PI) / 4) * 0.31;
    piece.position.z = Math.cos((i * Math.PI) / 4) * 0.31;
  }
  add(new THREE.SphereGeometry(0.2, 16, 12), game.glowMat, 0.82);
  return group;
}

export function buildCraneStation(game, f, group) {
  if (f.craneHeight === undefined) return false;
  group.position.y = game.terrainProfile.craneY + f.craneHeight;
  f.yOffset = group.position.y - game.groundHeight(f.x * 7, f.z * 7);
  const core = (f.core = new THREE.Group());
  core.userData.animated = true;
  group.add(core);
  if (f.step === 1) {
    game.box(1.5, 0.9, 0.9, game.darkMat, 0, 0.45, 0, group);
    const tablet = game.box(1.5, 0.1, 1.1, game.goldMat, 0, 1, 0, group);
    tablet.rotation.x = 0.3;
    const sign = inscription("INSPECTION 4.9–6.0 m\nWALL CLEARANCE 8.4 m", 3.4);
    game.box(3.55, 1, 0.12, game.darkMat, 0, 1.7, 0.32, group);
    for (const x of [-1.55, 1.55])
      game.box(0.09, 1.7, 0.09, game.goldMat, x, 0.85, 0.3, group);
    sign.position.set(0, 1.7, 0.4);
    group.add(sign);
  } else {
    core.add(spindleModel(game));
    game.cylinder(0.75, 0.9, 0.18, game.darkMat, 0, -0.09, 0, group, 24);
    for (const side of [-1, 1])
      game.box(0.12, 0.35, 0.9, game.goldMat, side * 0.68, 0.1, 0, group);
  }
  return true;
}

export function buildCraneConstruction(game, h) {
  const { root } = h,
    stone = game.stoneMat,
    metal = game.goldMat;
  let seed = 81700;
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
  const solid = (x, z, w, d, bottom, top, angle = 0) =>
    h.solids.push({
      x: CRANE_SITE.x + x,
      z: CRANE_SITE.z + z,
      w: w / 2,
      d: d / 2,
      bottom: h.base + bottom,
      top: h.base + top,
      angle,
    });
  const deck = (x, z, w, d, y, thickness = 0.28) => {
    add(gardenPavingGeometry(w, d, thickness, ++seed), stone, x, y, z);
    h.decks.push({
      x: CRANE_SITE.x + x,
      z: CRANE_SITE.z + z,
      w: w / 2,
      d: d / 2,
      y: h.base + y,
      thickness,
      cranePlatform: true,
    });
  };
  const beam = (
    a,
    b,
    width = 0.15,
    parent = root,
    mat = metal,
    camera = true,
  ) => {
    const from = new THREE.Vector3(...a),
      to = new THREE.Vector3(...b),
      delta = to.clone().sub(from),
      mid = from.clone().add(to).multiplyScalar(0.5);
    const mesh = add(
      new THREE.CylinderGeometry(width / 2, width / 2, delta.length(), 10),
      mat,
      mid.x,
      mid.y,
      mid.z,
      parent,
      false,
    );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    if (camera) game.cameraSurfaces?.capture(mesh);
    return mesh;
  };
  const rail = (a, b, floor) => {
    beam([a[0], floor + 1.05, a[1]], [b[0], floor + 1.05, b[1]], 0.12);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      count = Math.ceil(length / 2);
    for (let i = 0; i <= count; i++) {
      const x = a[0] + ((b[0] - a[0]) * i) / count,
        z = a[1] + ((b[1] - a[1]) * i) / count;
      block(0.15, 1.1, 0.15, x, floor + 0.55, z, metal);
      solid(x, z, 0.16, 0.16, floor, floor + 1.1);
    }
    solid(
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      Math.abs(a[0] - b[0]) + 0.12,
      Math.abs(a[1] - b[1]) + 0.12,
      floor + 0.98,
      floor + 1.12,
    );
  };
  const sign = (text, x, y, z, width, angle = 0, floor = CRANE_DECK) => {
    const plaque = new THREE.Group();
    plaque.position.set(x, y, z);
    plaque.rotation.y = angle;
    root.add(plaque);
    block(
      width + 0.12,
      width / 4 + 0.1,
      0.12,
      0,
      0,
      -0.07,
      game.darkMat,
      plaque,
    );
    const face = inscription(text, width);
    plaque.add(face);
    const postHeight = y - floor;
    for (const side of [-1, 1]) {
      const px = side * (width / 2 - 0.18);
      block(0.1, postHeight, 0.1, px, -postHeight / 2, -0.08, metal, plaque);
      solid(
        x + px * Math.cos(angle) - 0.08 * Math.sin(angle),
        z - px * Math.sin(angle) - 0.08 * Math.cos(angle),
        0.14,
        0.14,
        floor,
        y,
      );
    }
    mergeArchitecture(plaque);
  };

  deck(0, 16.1, 5, 0.8, 0.2);
  deck(0, 14, 5, 4, 0.4);
  deck(-14, 0, 6, 14, CRANE_DECK);
  deck(-6, -6, 10, 3, CRANE_DECK);
  deck(6, -6, 10, 3, CRANE_DECK);
  deck(14, 0, 6, 14, CRANE_DECK);
  for (let i = 0; i < 21; i++)
    deck(-14, 17.75 - i * 0.5, 2.8, 0.52, (i + 1) * 0.2, 0.25);
  deck(-14, 7.3, 2.8, 0.65, CRANE_DECK);
  // Grounded columns and deep joists support the galleries and their gap.
  for (const x of [-16, -12, 12, 16])
    for (const z of [-6, 5]) {
      block(0.65, 3.92, 0.65, x, 1.96, z);
      solid(x, z, 0.65, 0.65, 0, 3.92);
      block(1, 0.3, 1, x, 0.15, z);
    }
  for (const [x, length] of [
    [-6, 10],
    [6, 10],
  ])
    for (const z of [-7.2, -4.8])
      block(length, 0.5, 0.2, x, CRANE_DECK - 0.42, z, metal);
  for (const x of [-15.25, -12.75]) beam([x, -0.08, 18], [x, 3.9, 7.5], 0.2);
  rail([-17, -6.8], [-17, 6.8], CRANE_DECK);
  // Open the north inside corners where the crosswalk meets either gallery.
  rail([-11, -4], [-11, 6.8], CRANE_DECK);
  rail([-11, -7.4], [-1, -7.4], CRANE_DECK);
  rail([-11, -4.6], [-1, -4.6], CRANE_DECK);
  rail([1, -7.4], [11, -7.4], CRANE_DECK);
  rail([1, -4.6], [11, -4.6], CRANE_DECK);
  rail([17, -6.8], [17, 6.8], CRANE_DECK);
  rail([11, -4], [11, 6.8], CRANE_DECK);
  sign("ASTRAL SPINDLE\nCLIMB THE WEST STAIR", 0, 2.8, 16.4, 4.7, 0, 0);
  sign(
    "SURVEY · HOIST · CROSS\nTHE GAP MARKS THE OLD JOINT",
    -14,
    6.8,
    -6.5,
    5,
  );
  sign("ASTRAL SOCKET", 14, 6.8, -6.5, 4);

  // A segmented stone mast carries the rotating bronze lattice boom.
  add(new THREE.CylinderGeometry(2.1, 2.5, 0.5, 32), stone, 0, 0.25, 0);
  solid(0, 0, 4.2, 4.2, 0, 0.5);
  for (let i = 0; i < 12; i++) {
    add(
      new THREE.CylinderGeometry(1.05, 1.1, 1.15, 16),
      stone,
      0,
      1.15 + i * 1.15,
      0,
    );
    add(
      new THREE.CylinderGeometry(1.14, 1.14, 0.12, 24),
      metal,
      0,
      0.6 + i * 1.15,
      0,
    );
  }
  solid(0, 0, 2.2, 2.2, 0, 15);
  h.boom = new THREE.Group();
  h.boom.userData.animated = h.boom.userData.cameraDynamic = true;
  root.add(h.boom);
  for (const [x, y] of [
    [-0.65, 15],
    [0.65, 15],
    [0, 16.5],
  ])
    beam([x, y, -5], [x, y, 14], 0.22, h.boom);
  for (let z = -5; z < 14; z += 1.9) {
    for (const side of [-1, 1]) {
      beam([side * 0.65, 15, z], [0, 16.5, z + 1.9], 0.13, h.boom);
      beam([0, 16.5, z], [side * 0.65, 15, z + 1.9], 0.13, h.boom);
    }
    beam([-0.65, 15, z], [0.65, 15, z], 0.14, h.boom);
  }
  block(2.4, 2.1, 2.5, 0, 14.4, -4.3, stone, h.boom);
  h.slew = add(
    new THREE.CylinderGeometry(1.7, 1.7, 0.35, 40),
    metal,
    0,
    14.1,
    0,
    h.boom,
  );
  h.sheave = add(
    new THREE.TorusGeometry(0.45, 0.1, 10, 32),
    metal,
    0,
    15.2,
    14,
    h.boom,
  );
  h.sheave.rotation.y = Math.PI / 2;
  h.sheave.userData.animated = true;
  h.cable = add(
    new THREE.CylinderGeometry(0.035, 0.035, 1, 8),
    metal,
    0,
    8,
    14,
    h.boom,
    false,
  );
  h.cable.userData.animated = true;
  h.cargo = spindleModel(game);
  h.cargo.userData.animated = h.cargo.userData.cameraDynamic = true;
  root.add(h.cargo);
  for (const mesh of h.cargo.children) game.cameraSurfaces?.capture(mesh);
  h.sling = new THREE.Group();
  h.sling.userData.animated = h.sling.userData.cameraDynamic = true;
  root.add(h.sling);
  for (const side of [-1, 1])
    beam([side * 0.52, 0.35, 0], [0, 2.05, 0], 0.055, h.sling, metal, false);

  // The fork's split lintel leaves a narrow slot for the hoist cable, while the
  // wider spindle must pass through the measured opening below it.
  const fork = new THREE.Group();
  fork.rotation.y = 0.55;
  root.add(fork);
  const obstacle = (w, height, d, x, y, z, parent, angle, mat = stone) => {
    block(w, height, d, x, y, z, mat, parent);
    const c = Math.cos(angle),
      s = Math.sin(angle);
    solid(
      x * c + z * s,
      z * c - x * s,
      w,
      d,
      y - height / 2,
      y + height / 2,
      angle,
    );
  };
  for (const z of [12.4, 15.6])
    obstacle(0.85, 8.25, 0.6, 0, 4.125, z, fork, 0.55);
  obstacle(1.25, 4.7, 3.8, 0, 2.35, 14, fork, 0.55);
  for (const z of [13.05, 14.95])
    obstacle(1.25, 0.55, 1.58, 0, 7.925, z, fork, 0.55, metal);
  const wall = new THREE.Group();
  wall.rotation.y = 1.01;
  root.add(wall);
  for (let i = 0; i < 5; i++)
    obstacle(1.25, 1.6, 4, 0, 0.8 + i * 1.6, 14, wall, 1.01);
  obstacle(1.5, 0.2, 4.3, 0, 8.1, 14, wall, 1.01, metal);
  for (let i = 0; i <= 9; i++) {
    const a = (i * Math.PI) / 18;
    block(
      0.12,
      0.025,
      0.7,
      Math.sin(a) * 14,
      0.03,
      Math.cos(a) * 14,
      metal,
    ).rotation.y = a;
  }

  // Two hand controls sit within reach of the west gallery's standing mark.
  const console = (h.console = new THREE.Group());
  console.position.set(-13.05, CRANE_DECK, 3);
  root.add(console);
  block(0.65, 1.05, 1.5, 0, 0.525, 0, game.darkMat, console);
  h.handles = [];
  for (const z of [-0.35, 0.35]) {
    const wheel = add(
      new THREE.TorusGeometry(0.3, 0.06, 8, 28),
      metal,
      -0.35,
      1.15,
      z,
      console,
      false,
    );
    wheel.rotation.y = Math.PI / 2;
    const grip = new THREE.Object3D();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      beam(
        [0, 0, 0],
        [Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0],
        0.045,
        wheel,
        metal,
        false,
      );
    }
    beam([0, -0.22, -0.02], [0, -0.22, -0.16], 0.065, wheel, metal, false);
    grip.position.set(0, -0.22, -0.1);
    wheel.add(grip);
    h.handles.push(grip);
    h.controlWheels.push(wheel);
  }
  solid(-13.05, 3, 0.65, 1.5, CRANE_DECK, CRANE_DECK + 1.05);
  sign(
    "↑ HOIST ↓\n← SWING →",
    -13.43,
    CRANE_DECK + 0.55,
    3,
    1.35,
    -Math.PI / 2,
  );
  h.sources = [
    {
      id: "astral-crane-slew",
      kind: "machine",
      x: CRANE_SITE.x,
      y: h.base + 14,
      z: CRANE_SITE.z,
      near: 2,
      range: 34,
      gain: 0.14,
      activity: 0,
    },
    {
      id: "astral-crane-hoist",
      kind: "hoist",
      x: CRANE_SITE.x,
      y: h.base + 10,
      z: CRANE_SITE.z + 14,
      near: 2,
      range: 28,
      gain: 0.09,
      activity: 0,
    },
    {
      id: "astral-crane-wind",
      kind: "wind",
      x: CRANE_SITE.x,
      y: h.base + 16,
      z: CRANE_SITE.z,
      near: 3,
      range: 40,
      gain: 0.11,
      activity: 0,
    },
  ];
  mergeArchitecture(fork);
  mergeArchitecture(wall);
  mergeArchitecture(h.boom);
  mergeArchitecture(root);
}
