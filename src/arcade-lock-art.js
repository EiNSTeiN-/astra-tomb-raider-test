import * as THREE from "three";
import { sunWheel } from "./sun-bridge-art.js";
import {
  sunConstructionMaterials,
  sunRopeGeometry,
} from "./sun-bridge-construction.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { timberGeometry } from "./monastery-architecture.js";
import {
  prepareGardenGeometry,
  gardenPavingGeometry,
} from "./rain-garden-art.js";
import { mergeArchitecture } from "./visuals.js";
import { weatherPalaceStone } from "./palace-material.js";
import { vaultStoneGeometry } from "./palace-geometry.js";
import { pbrMaterial } from "./visuals.js";
import { ARCADE_FIELDS } from "./arcade-lock-rules.js";

function arcadeMaterials(game) {
  const m = sunConstructionMaterials(game);
  if (m.stone.name !== "Salt-stained lock masonry") {
    weatherPalaceStone(m.stone);
    m.stone.name = "Salt-stained lock masonry";
  }
  return m;
}
export function buildArcadeStation(game, f, group) {
  if (f.arcadeHeight === undefined) return false;
  group.position.y = game.terrainProfile.arcadeY + f.arcadeHeight;
  f.yOffset = group.position.y - game.groundHeight(f.x * 7, f.z * 7);
  arcadeMaterials(game);
  f.arcadeControl = sunWheel(
    game,
    group,
    ["ENTRY CABLE", "INSPECTION WEIGHT", "ARCADE GATE"][f.step],
  );
  f.core = f.arcadeControl.wheel;
  return true;
}
export function buildArcadeArt(game, h) {
  const root = h.root,
    m = arcadeMaterials(game);
  let seed = 72700;
  const add = (geometry, material, x = 0, y = 0, z = 0, parent = root) => {
    const mesh = new THREE.Mesh(
      prepareGardenGeometry(geometry, material),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    game.cameraSurfaces?.capture(mesh);
    return mesh;
  };
  const block = (w, height, d, x, y, z, material = m.stone, parent = root) =>
    add(
      material === m.wood
        ? timberGeometry(w, height, d, ++seed)
        : stoneBlockGeometry(w, height, d, ++seed, 0.035),
      material,
      x,
      y,
      z,
      parent,
    );
  const solid = (x, z, w, d, bottom, top) => {
    const s = {
      x,
      z,
      w: w / 2,
      d: d / 2,
      bottom: h.y + bottom,
      top: h.y + top,
    };
    h.solids.push(s);
    return s;
  };
  const deck = (x, z, w, d, y, anchor) => {
    add(gardenPavingGeometry(w, d, 0.34, ++seed), m.stone, x, y, z);
    const data = { x, z, w: w / 2, d: d / 2, y: h.y + y, anchor };
    h.decks.push(data);
    solid(x, z, w, d, y - 0.34, y).step = true;
    return data;
  };
  const pier = (x, z, top) => {
    const base = game.groundHeight(x, z) - h.y - 0.08;
    block(1.9, 0.35, 1.9, x, base + 0.175, z);
    const n = Math.ceil((top - base - 0.5) / 0.65),
      height = (top - base - 0.5) / n;
    for (let i = 0; i < n; i++)
      block(1.5, height - 0.013, 1.5, x, base + 0.35 + (i + 0.5) * height, z);
    block(1.85, 0.23, 1.85, x, top - 0.35, z);
    solid(x, z, 1.5, 1.5, base, top - 0.25);
    const proxy = add(
      new THREE.BoxGeometry(1.5, top - base - 0.25, 1.5),
      m.stone,
      x,
      (base + top - 0.25) / 2,
      z,
    );
    root.remove(proxy);
    proxy.geometry.dispose();
  };
  // Lower entrance, covered inspection passage and water-side boarding dock.
  deck(84, 217, 7, 6, 1.2, 0);
  deck(79, 217, 4, 3, 1.2);
  deck(75.5, 217, 4, 4.4, 1.2);
  for (let i = 0; i < 6; i++) deck(87.8 + i * 0.65, 217, 0.68, 3, 1 - i * 0.2);
  deck(84, 213, 3.4, 4, 1.2);
  for (let i = 0; i < 4; i++) deck(84, 210 - i * 2, 3.4, 2.05, 1 - i * 0.2);
  deck(63, 202, 45, 3.8, 0.4);
  for (const z of [199.8, 204.2]) {
    const width = z < 202 ? 34 : 31;
    block(width, 2.8, 0.6, 50 + width / 2, 1.55, z);
    solid(50 + width / 2, z, width, 0.6, 0.15, 2.95);
    for (let x = 50; x <= 81; x += 5.6)
      block(0.45, 3.1, 0.75, x, 1.55, z, m.wood);
  }
  block(35, 0.28, 5.4, 67, 3.12, 202);
  solid(67, 202, 35, 5.4, 2.98, 3.26);
  for (let x = 50; x <= 84; x += 5.6)
    block(0.3, 0.24, 5.6, x, 3.35, 202, m.wood);
  // Entry grille controls access to the inspection passage.
  h.inspectionGate = new THREE.Group();
  h.inspectionGate.position.set(84, 0.4, 204.8);
  h.inspectionGate.userData.cameraDynamic = true;
  root.add(h.inspectionGate);
  for (let x = -1.5; x <= 1.51; x += 0.5)
    block(0.065, 2.8, 0.1, x, 1.4, 0, m.iron, h.inspectionGate);
  for (const y of [0.2, 1.4, 2.6])
    block(3.3, 0.075, 0.12, 0, y, 0, m.bronze, h.inspectionGate);
  h.inspectionSolid = solid(84, 204.8, 3.4, 0.2, 0.4, 3.2);
  mergeArchitecture(h.inspectionGate);
  // Retaining walls are built around the two boarding apertures. The east
  // sluice seals the low opening before water can rise above its sill.
  for (const x of [61.95, 74.05]) {
    const top = x > 70 ? 1.05 : 6.26,
      bottom = -3.3;
    const n = Math.ceil((top - bottom) / 0.8),
      course = (top - bottom) / n;
    for (let i = 0; i < n; i++)
      block(0.9, course - 0.012, 22.5, x, bottom + (i + 0.5) * course, 217);
    solid(x, 217, 0.9, 22.5, bottom, top);
    for (const z of [209.85, 224.15]) {
      block(0.9, 7.4 - top, 8.2, x, (7.4 + top) / 2, z);
      solid(x, z, 0.9, 8.2, top, 7.4);
    }
  }
  for (const z of [205.45, 228.55]) {
    block(13.1, 10.7, 0.9, 68, 2.05, z);
    solid(68, z, 13.1, 0.9, -3.3, 7.4);
  }
  // Buttresses, cornices and blue inset plaster tie the engineering bay to
  // the surrounding palace courts without closing either boarding opening.
  const plaster = pbrMaterial("palace-plaster", 0xadb8ac);
  weatherPalaceStone(plaster);
  plaster.normalScale.set(0.35, 0.35);
  for (const x of [61.95, 74.05])
    for (const z of [207.5, 212.2, 221.8, 226.5]) {
      const outside = x < 68 ? x - 0.6 : x + 0.6;
      block(1.3, 7.5, 1.3, outside, 3.65, z);
      solid(outside, z, 1.3, 1.3, -0.1, 7.4);
      block(1.65, 0.22, 1.65, outside, 7.42, z);
    }
  for (const x of [61.95, 74.05])
    for (const z of [209.85, 224.15]) {
      block(1.25, 0.22, 8.35, x, 7.52, z);
      const outside = x < 68 ? x - 0.465 : x + 0.465;
      block(0.025, 3.5, 3.4, outside, 4.5, z, plaster);
      for (const edge of [-1.8, 1.8])
        block(0.08, 3.8, 0.12, outside, 4.5, z + edge, m.bronze);
      for (const y of [2.65, 6.35])
        block(0.08, 0.12, 3.7, outside, y, z, m.bronze);
    }
  for (const z of [205.45, 228.55]) block(13.7, 0.24, 1.3, 68, 7.52, z);
  h.boardGate = new THREE.Group();
  h.boardGate.position.set(74.05, -5.25, 217);
  h.boardGate.userData.cameraDynamic = true;
  root.add(h.boardGate);
  for (let i = 0; i < 9; i++)
    block(0.3, 6.3, 0.52, 0, 3.15, -2.12 + i * 0.53, m.wood, h.boardGate);
  for (const y of [0.2, 3.15, 6.1])
    block(0.4, 0.16, 4.8, 0, y, 0, m.bronze, h.boardGate);
  h.boardSolid = solid(74.05, 217, 0.4, 4.8, -5.25, 1.05);
  mergeArchitecture(h.boardGate);
  // Moving pontoon: sealed tanks beneath a framed plank deck.
  h.pontoon = new THREE.Group();
  h.pontoon.position.set(68, 0.9, 217);
  h.pontoon.userData.cameraDynamic = true;
  root.add(h.pontoon);
  for (let i = 0; i < 8; i++)
    block(0.635, 0.18, 4.4, -2.275 + i * 0.65, -0.09, 0, m.wood, h.pontoon);
  for (const z of [-2.05, 2.05])
    block(5.25, 0.2, 0.22, 0, -0.27, z, m.wood, h.pontoon);
  for (const x of [-1.75, 1.75]) {
    const tank = add(
      new THREE.CylinderGeometry(0.36, 0.36, 4.2, 18),
      m.bronze,
      x,
      -0.48,
      0,
      h.pontoon,
    );
    tank.rotation.x = Math.PI / 2;
    for (const z of [-1.6, 1.6])
      add(
        new THREE.TorusGeometry(0.375, 0.03, 6, 24),
        m.iron,
        x,
        -0.48,
        z,
        h.pontoon,
      );
  }
  for (const z of [-2.2, 2.2]) {
    for (const x of [-2.45, 2.45])
      block(0.13, 1.05, 0.13, x, 0.52, z, m.wood, h.pontoon);
    add(
      sunRopeGeometry([-2.45, 0.95, z], [2.45, 0.95, z], 0.035, 0.13),
      m.rope,
      0,
      0,
      0,
      h.pontoon,
    );
  }
  h.pontoonDeck = {
    x: 68,
    z: 217,
    w: 2.6,
    d: 2.2,
    y: h.y + 0.9,
    pontoon: true,
  };
  h.decks.push(h.pontoonDeck);
  h.pontoonSolid = solid(68, 217, 5.2, 4.4, 0.05, 0.9);
  h.pontoonRails = [-2.2, 2.2].map((z) =>
    solid(68, 217 + z, 5.2, 0.15, 0.9, 1.95),
  );
  const flowControl = new THREE.Group();
  flowControl.position.set(0, 0, -0.5);
  h.pontoon.add(flowControl);
  h.flowControl = {
    ...sunWheel(game, flowControl, "FILL / DRAIN LOCK"),
    kind: "flow",
  };
  mergeArchitecture(flowControl);
  mergeArchitecture(h.pontoon);
  // Four fixed guide masts keep the platform aligned through the full rise.
  for (const x of [64.95, 71.05])
    for (const z of [214.35, 219.65]) {
      block(0.18, 10, 0.18, x, 2.4, z, m.iron);
      solid(x, z, 0.18, 0.18, -2.6, 7.4);
    }
  h.controls = game.items
    .filter((f) => f.arcadeHeight !== undefined)
    .map((f) => ({
      ...f.arcadeControl,
      field: f.step,
      kind: "field",
      feature: f,
    }));
  h.controls.push(h.flowControl);
  h.flowPlinth = solid(68, 216.5, 1.4, 0.8, 0.9, 1.9);
  // Calls on both fixed banks retrieve a platform after a fall or a reload.
  for (const [x, z, y, target, label] of [
    [77, 216, 1.2, 0, "LOWER DOCK"],
    [60, 216, 6.6, 1, "UPPER GALLERY"],
  ]) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    root.add(g);
    h.controls.push({ ...sunWheel(game, g, label), kind: "call", target });
    solid(x, z, 1.4, 0.8, y, y + 1);
    mergeArchitecture(g);
  }
  for (const [i, p] of ARCADE_FIELDS.entries())
    solid(p.x, p.z, 1.4, 0.8, p.height, p.height + 1);
  // Raised arcade: two climbing jumps lead to the gate's upper control.
  for (const d of [
    [60, 217, 8, 4, 6.6, 1],
    [51, 217, 4.5, 4, 7.8],
    [43, 217, 5, 4, 8.8],
    [34, 217, 15, 4, 8.8],
    [28, 217, 7, 6, 8.8, 2],
  ]) {
    deck(...d);
    for (const z of [d[1] - 1.25, d[1] + 1.25]) pier(d[0], z, d[4]);
  }
  for (const [x, floor] of [
    [37, 8.8],
    [43, 8.8],
    [51, 7.8],
    [60, 6.6],
  ]) {
    for (const z of [215.35, 218.65]) {
      block(0.55, 2.2, 0.55, x, floor + 1.1, z);
      solid(x, z, 0.55, 0.55, floor, floor + 2.2);
      block(0.8, 0.2, 0.8, x, floor + 2.13, z);
    }
    for (let i = 0; i < 13; i++) {
      const arch = add(
        vaultStoneGeometry(
          1.375,
          1.925,
          (i * Math.PI) / 13 + 0.004,
          ((i + 1) * Math.PI) / 13 - 0.004,
          0.65,
        ),
        m.stone,
        x,
        floor + 2.2,
        217,
      );
      arch.rotation.y = Math.PI / 2;
    }
  }
  // The exit grille opens onto a permanent stone return stair.
  deck(28, 220.6, 3.4, 1.3, 8.8);
  for (let i = 0; i < 44; i++)
    deck(28, 221 + i * 0.55, 3.4, 0.57, 8.8 - i * 0.2);
  for (let i = 0; i < 44; i++) {
    const top = 8.8 - i * 0.2 - 0.34;
    if (top > 0.05) {
      block(2.8, top, 0.55, 28, top / 2, 221 + i * 0.55);
      solid(28, 221 + i * 0.55, 2.8, 0.55, 0, top);
    }
  }
  deck(28, 245.1, 4, 3, 0);
  h.exitGate = new THREE.Group();
  h.exitGate.position.set(28, 8.8, 220);
  h.exitGate.userData.cameraDynamic = true;
  root.add(h.exitGate);
  for (let x = -1.7; x <= 1.71; x += 0.425)
    block(0.09, 3.4, 0.15, x, 1.7, 0, m.bronze, h.exitGate);
  for (const y of [0.2, 1.7, 3.2])
    block(3.65, 0.12, 0.18, 0, y, 0, m.iron, h.exitGate);
  h.exitSolid = solid(28, 220, 3.7, 0.3, 8.8, 12.2);
  mergeArchitecture(h.exitGate);
  for (const x of [25.9, 30.1]) {
    block(0.55, 4.2, 0.65, x, 10.9, 220);
    solid(x, 220, 0.55, 0.65, 8.8, 13);
  }
  block(5, 0.4, 0.9, 28, 13.15, 220);
  h.counterweight = new THREE.Group();
  h.counterweight.position.set(68, -1.6, 225);
  h.counterweight.userData.cameraDynamic = true;
  root.add(h.counterweight);
  block(1.3, 1.8, 1.3, 0, 0, 0, m.stone, h.counterweight);
  h.weightSolid = solid(68, 225, 1.3, 1.3, -2.5, -0.7);
  mergeArchitecture(h.counterweight);
  h.weightCable = add(
    new THREE.CylinderGeometry(0.035, 0.035, 1, 6),
    m.rope,
    68,
    1,
    225,
  );
  h.weightCable.userData.animated = true;
  for (const x of [66.8, 69.2]) block(0.2, 9, 0.2, x, 4.5, 225, m.iron);
  block(3, 0.2, 0.35, 68, 8.9, 225, m.iron);
  // Bronze height marks remain legible with sound muted.
  for (let i = 0; i <= 7; i++)
    block(0.09, 0.035, 0.4, 73.53, i + 0.2, 220.6, m.bronze);
  h.flow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.65, 1),
    new THREE.MeshBasicMaterial({
      color: 0xb8ddd7,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  h.flow.position.set(73.25, 4, 223);
  h.flow.rotation.y = Math.PI / 2;
  root.add(h.flow);
  block(1.4, 0.5, 1.1, 73.6, 7.5, 223);
  block(1.5, 0.12, 1.3, 73.5, 7.82, 223, m.bronze);
  for (const [i, p] of ARCADE_FIELDS.entries())
    h.sources.push({
      id: `arcade-wheel-${i}`,
      kind: "hoist",
      x: p.x,
      y: h.y + p.height + 1.35,
      z: p.z,
      near: 1,
      range: 16,
      gain: 0.08,
      activity: 0,
    });
  for (let i = 3; i < h.controls.length; i++) {
    const c = h.controls[i],
      p = c.group.getWorldPosition(new THREE.Vector3());
    h.sources.push({
      id: `arcade-control-${i}`,
      kind: "hoist",
      x: p.x,
      y: p.y + 1.35,
      z: p.z,
      near: 1,
      range: 16,
      gain: 0.07,
      activity: 0,
      control: i,
    });
  }
  h.sources.push({
    id: "arcade-fill",
    kind: "waterfall",
    x: 73.25,
    y: h.y + 4,
    z: 223,
    near: 2,
    range: 30,
    gain: 0.12,
    activity: 0,
  });
  h.sources.push({
    id: "arcade-platform",
    kind: "hoist",
    x: 68,
    y: h.y + 1.3,
    z: 217,
    near: 1,
    range: 18,
    gain: 0.055,
    activity: 0,
  });
  mergeArchitecture(root);
}
