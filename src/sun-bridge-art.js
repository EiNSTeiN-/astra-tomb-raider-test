import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { timberGeometry } from "./monastery-architecture.js";
import {
  gardenPavingGeometry,
  prepareGardenGeometry,
} from "./rain-garden-art.js";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";
import { SUN_FIELDS, SUN_LANDINGS, SUN_PIVOTS } from "./sun-bridge-rules.js";

function sign(text, width = 2.8) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const c = canvas.getContext("2d");
  c.fillStyle = "#e5ce98";
  c.font = "600 42px Georgia";
  c.textAlign = "center";
  c.textBaseline = "middle";
  text
    .split("\n")
    .forEach((line, i, lines) =>
      c.fillText(line, 512, 128 + (i - (lines.length - 1) / 2) * 58, 990),
    );
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
      roughness: 0.8,
    }),
  );
}
export function sunWheel(game, group, label) {
  const bronze = game.goldMat,
    iron = game.darkMat;
  game.box(1.25, 0.8, 0.65, iron, 0, 0.4, 0, group);
  game.box(1.4, 0.15, 0.8, game.stoneMat, 0, 0.85, 0, group);
  const wheel = new THREE.Group();
  wheel.position.set(0, 1.35, 0.12);
  wheel.rotation.z = Math.PI / 4;
  wheel.userData.animated = true;
  group.add(wheel);
  wheel.add(
    new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.043, 8, 32), bronze),
  );
  for (let i = 0; i < 3; i++)
    game.box(0.045, 0.72, 0.045, bronze, 0, 0, 0, wheel).rotation.z =
      (i * Math.PI) / 3;
  const grips = [-1, 1].map((side) => {
    const grip = new THREE.Object3D();
    grip.position.set(side * 0.23, 0, 0.16);
    wheel.add(grip);
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.019, 0.2, 16),
      iron,
    );
    bar.rotation.z = Math.PI / 2;
    grip.add(bar);
    for (const x of [-0.1, 0.1])
      game.box(0.025, 0.04, 0.16, bronze, side * 0.23 + x, 0, 0.08, wheel);
    return grip;
  });
  const axle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.4, 12),
    bronze,
  );
  axle.rotation.x = Math.PI / 2;
  axle.position.set(0, 1.35, -0.03);
  group.add(axle);
  const panel = sign(label, 2.5);
  game.box(2.65, 0.8, 0.13, iron, 0, 2.1, -0.06, group);
  for (const x of [-1.3, 1.3])
    game.box(0.055, 0.84, 0.18, bronze, x, 2.1, -0.025, group);
  for (const y of [1.71, 2.49])
    game.box(2.65, 0.045, 0.18, bronze, 0, y, -0.025, group);
  for (const x of [-0.75, 0.75])
    game.box(0.065, 1.3, 0.09, iron, x, 1.4, -0.08, group);
  panel.position.set(0, 2.1, 0.04);
  group.add(panel);
  mergeArchitecture(wheel);
  return { wheel, grips, group };
}
export function buildSunStation(game, f, group) {
  if (f.sunHeight === undefined) return false;
  group.position.y = game.terrainProfile.sunY + f.sunHeight;
  f.yOffset = group.position.y - game.groundHeight(f.x * 7, f.z * 7);
  const control = sunWheel(game, group, SUN_FIELDS[f.step].label);
  f.core = control.wheel;
  f.sunControl = control;
  return true;
}
export function buildSunBridgeArt(game, h) {
  const root = h.root,
    stone = game.stoneMat,
    dark = game.darkMat,
    bronze = game.goldMat,
    wood = pbrMaterial("monastery-wood", 0xa99c78, 0.55),
    rope = pbrMaterial("bark", 0x807452, 1);
  let seed = 38640;
  const add = (g, m, x, y, z, parent = root) => {
    const mesh = new THREE.Mesh(prepareGardenGeometry(g, m), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    game.cameraSurfaces?.capture(mesh);
    return mesh;
  };
  const block = (w, ht, d, x, y, z, mat = stone, parent = root) =>
    add(
      mat === wood
        ? timberGeometry(w, ht, d, ++seed)
        : stoneBlockGeometry(w, ht, d, ++seed),
      mat,
      x,
      y,
      z,
      parent,
    );
  const beam = (a, b, width, mat = wood, parent = root) => {
    const p = new THREE.Vector3(...a),
      q = new THREE.Vector3(...b),
      mid = p.clone().add(q).multiplyScalar(0.5),
      m = block(width, p.distanceTo(q), width, ...mid.toArray(), mat, parent);
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      q.sub(p).normalize(),
    );
    return m;
  };
  const solid = (x, z, w, d, bottom, top) => {
    const s = {
      x: h.x + x,
      z: h.z + z,
      w: w / 2,
      d: d / 2,
      bottom: h.y + bottom,
      top: h.y + top,
    };
    h.solids.push(s);
    return s;
  };
  const deck = (x, z, w, d, height, thickness = 0.35) => {
    add(gardenPavingGeometry(w, d, thickness, ++seed), stone, x, height, z);
    const data = {
      x: h.x + x,
      z: h.z + z,
      w: w / 2,
      d: d / 2,
      y: h.y + height,
      thickness,
    };
    h.decks.push(data);
    return data;
  };
  function pier(x, z, height) {
    const base = game.groundHeight(h.x + x, h.z + z) - h.y - 0.12;
    block(2.5, 0.5, 2.5, x, base + 0.25, z, dark);
    block(
      1.75,
      height - base - 0.35,
      1.75,
      x,
      (height + base - 0.35) / 2,
      z,
      stone,
    );
    solid(x, z, 1.75, 1.75, base, height - 0.35);
    for (const y of [base + 0.6, height - 1, height - 0.3])
      block(2.05, 0.22, 2.05, x, y, z, dark);
  }
  for (const [i, d] of SUN_LANDINGS.entries()) {
    deck(d.x, d.z, d.w, d.d, d.height);
    for (const side of [-1, 1])
      pier(d.x + side * (d.w / 2 - 0.4), d.z - 0.25, d.height);
    if (i === 0 || i === 4 || i === 5) {
      for (const side of [-1, 1]) {
        block(
          0.36,
          3.8,
          0.36,
          d.x + side * (d.w / 2 - 0.25),
          d.height + 1.9,
          d.z - 1.1,
          wood,
        );
        solid(
          d.x + side * (d.w / 2 - 0.25),
          d.z - 1.1,
          0.36,
          0.36,
          d.height,
          d.height + 3.8,
        );
      }
      beam(
        [d.x - d.w / 2, d.height + 3.6, d.z - 1.1],
        [d.x + d.w / 2, d.height + 3.6, d.z - 1.1],
        0.4,
      );
    }
  }
  // The southern stair is a supported walk, with physical risers below the controller’s 0.2 m step limit.
  for (let i = 0; i < 34; i++) {
    const top = ((i + 1) * 6) / 34,
      z = 16 - (i * 13.11) / 33;
    deck(-24, z, 2.8, 0.42, top, 0.2);
    block(2.7, top - 0.14, 0.4, -24, (top - 0.14) / 2, z, wood);
    solid(-24, z, 2.7, 0.4, 0, top - 0.14);
  }
  deck(-24, 1.2, 2.8, 2.4, 6);
  for (const side of [-1, 1]) {
    beam(
      [-24 + side * 1.55, 0.9, 16.2],
      [-24 + side * 1.55, 7, 1.5],
      0.12,
      rope,
    );
    for (let i = 0; i < 5; i++)
      block(
        0.16,
        1.1,
        0.16,
        -24 + side * 1.55,
        1.1 + i * 1.4,
        15 - i * 3.25,
        wood,
      );
  }
  const intro = sign(
    "THE HANGING GARDEN\nClimb the southern stair · M shows the spans",
    4.8,
  );
  block(5, 1.45, 0.15, -29, 2, 17.9, wood);
  for (const x of [-30.5, -27.5]) block(0.18, 2, 0.18, x, 1, 17.9, wood);
  intro.position.set(-29, 2, 18);
  root.add(intro);
  for (const [index, p] of SUN_PIVOTS.entries()) {
    pier(p.x, p.z, 6);
    deck(p.x, p.z, 4.6, 4.6, 6);
    const moving = new THREE.Group();
    moving.position.set(p.x, 6, p.z);
    moving.userData.cameraDynamic = true;
    moving.name = `Sun bridge ${index + 1}`;
    root.add(moving);
    const bridge = {
      x: h.x + p.x,
      z: h.z + p.z,
      angle: (h.saved.stops[index] * Math.PI) / 2,
      y: h.y + 6,
      root: moving,
      index,
      motion: null,
      rails: [],
    };
    h.bridges.push(bridge);
    for (let i = 0; i < 40; i++) {
      const x = -11.7 + i * 0.6;
      block(0.57, 0.2, 2.65, x, -0.1, 0, wood, moving);
      if (i % 4 === 0) block(0.14, 0.28, 2.85, x, -0.24, 0, dark, moving);
    }
    for (const side of [-1, 1]) {
      beam(
        [-12, -0.32, side * 1.07],
        [12, -0.32, side * 1.07],
        0.24,
        wood,
        moving,
      );
      for (let i = 0; i <= 8; i++) {
        let x = -12 + i * 3;
        if (Math.abs(x) === 3) x = Math.sign(x) * 3.5;
        if (i === 4) continue; // Leave the fixed central pier clear as the rails sweep past.
        block(0.13, 1.15, 0.13, x, 0.58, side * 1.5, wood, moving);
      }
      for (const end of [-1, 1]) {
        beam(
          [end * 3.5, 1.08, side * 1.5],
          [end * 12, 1.08, side * 1.5],
          0.085,
          rope,
          moving,
        );
        const rail = {
          bridge,
          offsetX: end * 7.75,
          offsetZ: side * 1.5,
          w: 4.25,
          d: 0.065,
          bottom: h.y + 6.5,
          top: h.y + 7.2,
        };
        h.solids.push(rail);
        bridge.rails.push(rail);
      }
    }
    const bearing = add(
      new THREE.CylinderGeometry(1.35, 1.55, 0.36, 24),
      bronze,
      0,
      -0.38,
      0,
      moving,
    );
    bearing.name = "Rotating bronze bearing";
    const surface = { bridge, w: 12, d: 1.33, y: h.y + 6, thickness: 0.4 };
    h.decks.push(surface);
    bridge.deck = surface;
    const controls = new THREE.Group();
    controls.position.set(p.x, 6, p.z - 0.5);
    root.add(controls);
    const control = sunWheel(
      game,
      controls,
      `${index === 0 ? "GARDEN" : "SUN"} SPAN\nUse to turn 90°`,
    );
    control.pivot = index;
    control.world = { x: h.x + p.x, z: h.z + p.z - 0.5, y: h.y + 6 };
    h.controls.push(control);
    solid(p.x, p.z - 0.5, 1.25, 0.65, 6, 6.9);
    for (const [radius, y] of [
      [1.8, 5.68],
      [1.95, 5.52],
    ])
      add(
        new THREE.TorusGeometry(radius, 0.07, 8, 40).rotateX(Math.PI / 2),
        bronze,
        p.x,
        y,
        p.z,
      );
    const source = {
      id: `sun-bridge-drive-${index}`,
      kind: "hoist",
      x: bridge.x,
      y: bridge.y - 0.15,
      z: bridge.z,
      near: 2,
      range: 28,
      gain: 0.11,
      activity: 0,
      rate: 0.7,
    };
    h.sources.push(source);
    bridge.source = source;
    mergeArchitecture(moving);
    mergeArchitecture(controls);
  }
  const recallRoot = new THREE.Group();
  recallRoot.position.set(-10, 6, -14.6);
  root.add(recallRoot);
  const recall = sunWheel(game, recallRoot, "RECALL GARDEN SPAN");
  recall.pivot = 0;
  recall.stop = 1;
  recall.world = { x: h.x - 10, z: h.z - 14.6, y: h.y + 6 };
  h.controls.push(recall);
  solid(-10, -14.6, 1.25, 0.65, 6, 6.9);
  mergeArchitecture(recallRoot);
  for (const [i, f] of SUN_FIELDS.entries())
    solid(f.x, f.z, 1.25, 0.65, f.height, f.height + 0.9);
  const returnRoot = new THREE.Group();
  returnRoot.userData.cameraDynamic = true;
  returnRoot.position.set(3, 2, -14);
  root.add(returnRoot);
  h.returnRoot = returnRoot;
  for (let i = 0; i < 43; i++)
    block(0.58, 0.2, 1.8, -12.6 + i * 0.6, -0.1, 0, wood, returnRoot);
  for (const side of [-1, 1])
    beam(
      [-13, -0.3, side * 0.7],
      [13, -0.3, side * 0.7],
      0.18,
      wood,
      returnRoot,
    );
  h.returnPlatform = { x: h.x + 3, z: h.z - 14, angle: 0, y: h.y + 2 };
  h.returnDeck = {
    bridge: h.returnPlatform,
    x: h.x + 3,
    z: h.z - 14,
    w: 13,
    d: 0.9,
    y: h.y + 2,
    thickness: 0.4,
  };
  h.decks.push(h.returnDeck);
  mergeArchitecture(returnRoot);
  h.returnCables = [];
  for (const x of [-8, 14])
    for (const z of [-15.05, -12.95]) {
      block(0.22, 8.5, 0.22, x, 4.25, z, wood);
      solid(x, z, 0.22, 0.22, 0, 8.5);
      const cable = add(
        new THREE.CylinderGeometry(0.028, 0.028, 1, 6),
        rope,
        x,
        5,
        z,
      );
      cable.userData.animated = true;
      h.returnCables.push(cable);
    }
  for (const x of [-8, 14]) beam([x, 8.6, -15.3], [x, 8.6, -12.7], 0.28);
  const weight = new THREE.Group();
  weight.userData.cameraDynamic = true;
  weight.position.set(-17, 5, -25);
  root.add(weight);
  h.weight = weight;
  block(1.7, 2, 1.7, 0, 0, 0, stone, weight);
  for (const x of [-0.65, 0.65]) block(0.12, 2.2, 1.9, x, 0, 0, bronze, weight);
  mergeArchitecture(weight);
  h.liftCable = add(
    new THREE.CylinderGeometry(0.028, 0.028, 1, 6),
    rope,
    0,
    0,
    0,
  );
  h.liftCable.userData.animated = true;
  h.weightCable = add(
    new THREE.CylinderGeometry(0.028, 0.028, 1, 6),
    rope,
    -17,
    8,
    -25,
  );
  h.weightCable.userData.animated = true;
  for (const x of [-18.4, -15.6]) block(0.35, 5.2, 0.35, x, 10, -25.4, wood);
  beam([-18.7, 12.5, -25.4], [-15.3, 12.5, -25.4], 0.35);
  const weightSound = {
    id: "sun-counterweight",
    kind: "hoist",
    x: h.x - 17,
    y: h.y + 4,
    z: h.z - 25,
    near: 2,
    range: 24,
    gain: 0.095,
    activity: 0,
    rate: 0.85,
  };
  h.sources.push(weightSound);
  h.weightSource = weightSound;
  const returnSound = {
    id: "sun-return-drive",
    kind: "hoist",
    x: h.x + 3,
    y: h.y + 6,
    z: h.z - 14,
    near: 2,
    range: 25,
    gain: 0.08,
    activity: 0,
    rate: 0.8,
  };
  h.sources.push(returnSound);
  h.returnSource = returnSound;
  for (let i = 0; i < 3; i++) {
    const p = SUN_FIELDS[i];
    h.sources.push({
      id: `sun-handwheel-${i}`,
      kind: "hoist",
      x: h.x + p.x,
      y: h.y + p.height + 1.35,
      z: h.z + p.z,
      near: 1,
      range: 15,
      gain: 0.08,
      activity: 0,
      rate: 0.7,
    });
  }
  mergeArchitecture(root);
}
