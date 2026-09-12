import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import {
  archStoneGeometry,
  weatherDesertStone,
} from "./desert-architecture.js";
import {
  gardenPavingGeometry,
  prepareGardenGeometry,
} from "./rain-garden-art.js";
import { mergeArchitecture } from "./visuals.js";
import { windMetal, windSurface } from "./wind-art.js";
import {
  SURVEY_LOOKOUTS,
  SURVEY_MONUMENTS,
  SURVEY_DOORS,
  SURVEY_COURT,
  surveyDone,
} from "./desert-survey-rules.js";

function materials(game) {
  return (game.world.userData.desertSurveyMaterials ||= (() => {
    const stone = game.stoneMat.clone(),
      dark = game.darkMat.clone();
    weatherDesertStone(stone);
    weatherDesertStone(dark);
    return {
      stone,
      dark,
      bronze: windMetal("cast"),
      iron: windMetal("iron"),
      worn: windMetal("worn"),
    };
  })());
}
function builder(game, root, m) {
  let seed = 39041;
  const add = (g, material, x, y, z, parent = root) => {
    prepareGardenGeometry(g, material);
    const o = new THREE.Mesh(g, material);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    game.cameraSurfaces?.capture(o);
    return o;
  };
  const block = (w, h, d, x, y, z, material = m.stone, parent = root) =>
    add(stoneBlockGeometry(w, h, d, ++seed), material, x, y, z, parent);
  const cylinder = (
    radius,
    length,
    x,
    y,
    z,
    material = m.bronze,
    parent = root,
  ) =>
    add(
      new THREE.CylinderGeometry(radius, radius, length, 24),
      material,
      x,
      y,
      z,
      parent,
    );
  return { add, block, cylinder };
}
function lettering(text, width) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const c = canvas.getContext("2d");
  c.font = "600 43px Georgia";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "#ead5a6";
  text
    .split("\n")
    .forEach((line, i, lines) =>
      c.fillText(line, 512, 128 + (i - (lines.length - 1) / 2) * 58, 995),
    );
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
      roughness: 0.85,
    }),
  );
}
export function surveyGlyph(sign, material) {
  const root = new THREE.Group();
  if (sign === "sun") {
    root.add(
      new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.115, 8, 48), material),
    );
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4,
        o = new THREE.Mesh(stoneBlockGeometry(0.105, 0.28, 0.15, i), material);
      o.position.set(Math.sin(angle) * 0.85, Math.cos(angle) * 0.85, 0);
      o.rotation.z = -angle;
      root.add(o);
    }
  } else {
    const vertices =
      sign === "crown"
        ? [
            [-0.9, -0.6],
            [0.9, -0.6],
            [0.9, 0.75],
            [0.38, 0.32],
            [0.23, -0.12],
            [-0.23, -0.12],
            [-0.38, 0.32],
            [-0.9, 0.75],
          ]
        : [
            [-0.94, 0.68],
            [-0.35, 0.14],
            [0.92, -0.12],
            [0.2, -0.64],
            [-0.24, -0.27],
            [-0.78, -0.02],
          ];
    const shape = new THREE.Shape(vertices.map((p) => new THREE.Vector2(...p))),
      g = new THREE.ExtrudeGeometry(shape, {
        depth: 0.18,
        steps: 1,
        bevelEnabled: true,
        bevelThickness: 0.018,
        bevelSize: 0.018,
        bevelSegments: 1,
      });
    g.translate(0, 0, -0.09);
    root.add(new THREE.Mesh(g, material));
  }
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
      if (material.userData.windMetal) windSurface(o.geometry);
    }
  });
  return root;
}
export function buildSurveyStation(game, f, group) {
  if (f.surveyHeight === undefined) return false;
  const base = game.terrainProfile.surveyBases[f.step];
  group.position.y = base + f.surveyHeight;
  f.yOffset = group.position.y - game.groundHeight(f.x * 7, f.z * 7);
  if (f.step === 2) {
    f.core = new THREE.Group();
    group.add(f.core);
    return true;
  }
  const m = materials(game),
    { add, block, cylinder } = builder(game, group, m);
  block(1.4, 0.24, 1.4, 0, 0.12, 0, m.dark);
  cylinder(0.19, 1, 0, 0.7, 0);
  cylinder(0.48, 0.13, 0, 1.23, 0);
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12,
      mark = block(
        0.023,
        0.013,
        i % 3 ? 0.08 : 0.15,
        Math.sin(a) * 0.4,
        1.31,
        Math.cos(a) * 0.4,
        m.worn,
      );
    mark.rotation.y = a;
  }
  const yawRoot = new THREE.Group(),
    pitchRoot = new THREE.Group();
  yawRoot.position.y = 1.38;
  yawRoot.add(pitchRoot);
  group.add(yawRoot);
  yawRoot.userData.cameraDynamic = true;
  for (const x of [-0.32, 0.32]) {
    block(0.1, 0.43, 0.1, x, 0.06, 0, m.bronze, yawRoot);
    const pivot = cylinder(0.11, 0.2, x, 0.19, 0, m.worn, yawRoot);
    pivot.rotation.z = Math.PI / 2;
  }
  pitchRoot.position.y = 0.19;
  const barrel = cylinder(0.14, 1.3, 0, 0, 0, m.bronze, pitchRoot);
  barrel.rotation.x = Math.PI / 2;
  for (const z of [-0.62, -0.4, 0.45, 0.64]) {
    const collar = cylinder(0.175, 0.065, 0, 0, z, m.iron, pitchRoot);
    collar.rotation.x = Math.PI / 2;
  }
  const lens = add(
    new THREE.CircleGeometry(0.125, 40),
    new THREE.MeshPhysicalMaterial({
      color: 0x508786,
      metalness: 0.2,
      roughness: 0.12,
      clearcoat: 1,
    }),
    0,
    0,
    -0.658,
    pitchRoot,
  );
  lens.rotation.y = Math.PI;
  const eyepiece = cylinder(0.09, 0.18, 0, 0, 0.72, m.iron, pitchRoot);
  eyepiece.rotation.x = Math.PI / 2;
  const eye = new THREE.Object3D();
  eye.position.set(0, 0.035, 0.92);
  pitchRoot.add(eye);
  block(2.5, 0.85, 0.4, 2.5, 0.43, 1.8, m.dark);
  const plaque = lettering(
    SURVEY_LOOKOUTS[f.step].label + "\nSIGHT THE MONUMENT · RECORD ITS SIGN",
    2.35,
  );
  plaque.position.set(2.5, 0.58, 2.011);
  group.add(plaque);
  f.core = yawRoot;
  f.surveyControl = { group, yawRoot, pitchRoot, eye, index: f.step };
  mergeArchitecture(pitchRoot);
  mergeArchitecture(yawRoot);
  return true;
}
export function buildDesertSurveyArt(game, h) {
  const root = h.root,
    m = materials(game),
    { add, block, cylinder } = builder(game, root, m);
  const solid = (x, z, w, d, bottom, top, step = false) => {
    const s = { x, z, w: w / 2, d: d / 2, bottom, top, step };
    h.solids.push(s);
    return s;
  };
  const deck = (x, z, w, d, y) => {
    add(
      gardenPavingGeometry(w, d, 0.28, Math.round(x * 91 + z)),
      m.stone,
      x,
      y,
      z,
    );
    h.decks.push({ x, z, w: w / 2, d: d / 2, y });
    solid(x, z, w, d, y - 0.28, y, true);
  };
  for (const [i, p] of SURVEY_LOOKOUTS.entries()) {
    const base = game.terrainProfile.surveyBases[i],
      top = base + p.height;
    deck(p.x, p.z, 9, 8, top);
    for (let j = 0; j < 6; j++)
      block(6.5, 0.61, 5.7, p.x, base + 0.31 + j * 0.62, p.z);
    solid(p.x, p.z, 6.5, 5.7, base, top - 0.28);
    for (let j = 0; j < 20; j++) {
      const y = top - j * 0.2,
        z = p.z + 4 + j * 0.55;
      deck(p.x, z, 3.4, 0.57, y);
      if (y - base > 0.3) {
        block(2.8, y - base - 0.28, 0.55, p.x, (y + base - 0.28) / 2, z);
        solid(p.x, z, 2.8, 0.55, base, y - 0.28);
      }
    }
    // Low parapets protect the two sides without hiding the horizon through the optic.
    for (const x of [p.x - 4.25, p.x + 4.25]) {
      block(0.5, 0.85, 7.8, x, top + 0.425, p.z);
      solid(x, p.z, 0.5, 7.8, top, top + 0.85);
    }
    solid(p.x, p.z, 1.4, 1.4, top, top + 1.3);
    solid(p.x + 2.5, p.z + 1.8, 2.5, 0.4, top, top + 0.85);
    h.controls.push(
      game.items.find((f) => f.id === `field-0-${i}`).surveyControl,
    );
    h.sources.push({
      id: `survey-instrument-${i}`,
      kind: "machine",
      x: p.x,
      y: top + 1.57,
      z: p.z,
      near: 1,
      range: 12,
      gain: 0.045,
      activity: 0,
    });
  }
  for (const [i, p] of SURVEY_MONUMENTS.entries()) {
    const y = game.groundHeight(p.x, p.z),
      g = new THREE.Group();
    g.position.set(p.x, y, p.z);
    root.add(g);
    const toward = SURVEY_LOOKOUTS[Math.min(i, 1)];
    g.rotation.y = Math.atan2(toward.x - p.x, toward.z - p.z);
    const local = builder(game, g, m);
    local.block(3.6, 0.4, 3.6, 0, 0.2, 0, m.dark);
    for (let j = 0; j < 11; j++)
      local.block(1.7, 0.76, 1.7, 0, 0.4 + (j + 0.5) * 0.78, 0);
    local.block(2.5, 0.35, 2.3, 0, 9.12, 0);
    const glyph = surveyGlyph(p.sign, m.stone);
    glyph.position.y = p.height;
    glyph.scale.setScalar(2.5);
    g.add(glyph);
    // A stem meets the bottom of each carved sign instead of suspending it.
    local.block(0.7, p.height - 8.5, 0.7, 0, (p.height + 8.5) / 2, 0, m.dark);
    solid(p.x, p.z, 1.7, 1.7, y, y + p.height - 1.5);
    h.monuments.push({
      x: p.x,
      y: y + p.height,
      z: p.z,
      sign: p.sign,
      name: p.name,
      root: g,
    });
    mergeArchitecture(g);
  }
  const y = game.terrainProfile.surveyBases[2];
  deck(SURVEY_COURT.x, 282, 35, 12, y + 0.2);
  for (const [i, p] of SURVEY_DOORS.entries()) {
    const g = new THREE.Group();
    g.position.set(p.x, y + 0.2, p.z);
    root.add(g);
    const local = builder(game, g, m);
    for (const x of [-2.4, 2.4]) {
      for (let j = 0; j < 5; j++)
        local.block(1.4, 0.66, 2, x, 0.33 + j * 0.68, 0);
      solid(p.x + x, p.z, 1.4, 2, y + 0.2, y + 3.6);
      local.block(1.7, 0.2, 2.25, x, 3.6, 0);
    }
    for (const side of [-1, 1])
      for (let j = 0; j < 9; j++)
        local.add(
          archStoneGeometry(1.7, 0.65, 1.5, side, j / 9, (j + 1) / 9),
          m.stone,
          0,
          3.4,
          0,
        );
    const leaf = new THREE.Group();
    leaf.userData.cameraDynamic = true;
    leaf.position.z = -0.12;
    g.add(leaf);
    local.block(3.35, 3.4, 0.45, 0, 1.7, 0, m.dark, leaf);
    for (const [j, sign] of p.signs.entries()) {
      const glyph = surveyGlyph(sign, m.bronze);
      glyph.scale.setScalar(0.58);
      glyph.position.set(j ? 0.8 : -0.8, 1.8, 0.25);
      leaf.add(glyph);
    }
    // Bronze channels retain the rising slab; twin cables run to the lintel.
    for (const x of [-1.8, 1.8])
      local.block(0.14, 7.4, 0.2, x, 3.7, -0.12, m.bronze);
    local.block(3.85, 0.22, 0.4, 0, 7.4, -0.12, m.bronze);
    const cables = [];
    for (const x of [-1.4, 1.4]) {
      const pulley = local.cylinder(0.18, 0.2, x, 7.2, -0.12, m.iron);
      pulley.rotation.x = Math.PI / 2;
      const cable = local.cylinder(0.026, 1, x, 5.3, -0.12, m.iron);
      cable.userData.animated = true;
      cables.push(cable);
    }
    const barrier = solid(p.x, p.z, 3.4, 0.5, y + 0.2, y + 3.6);
    // Short roofed recesses give the opened threshold a real interior.
    for (const x of [-2.05, 2.05]) {
      local.block(0.65, 3.5, 7, x, 1.75, -4);
      solid(p.x + x, p.z - 4, 0.65, 7, y + 0.2, y + 3.7);
    }
    local.block(4.75, 0.4, 8, 0, 3.7, -3.6);
    solid(p.x, p.z - 3.6, 4.75, 8, y + 3.7, y + 4.1);
    local.block(4.5, 3.5, 0.5, 0, 1.75, -7.6);
    solid(p.x, p.z - 7.6, 4.5, 0.5, y + 0.2, y + 3.7);
    deck(p.x, p.z - 3.5, 3.5, 8, y + 0.2);
    const seal = local.cylinder(0.35, 0.06, 0, 1.4, -7.27, m.bronze);
    seal.rotation.x = Math.PI / 2;
    const sign = lettering("SURVEY THRESHOLD", 2.4);
    sign.position.set(0, 2.1, -7.31);
    g.add(sign);
    h.doors.push({
      root: g,
      leaf,
      barrier,
      cables,
      x: p.x,
      y: y + 0.2,
      z: p.z,
      open: i === 2 && surveyDone(game.progress, 2) ? 1 : 0,
    });
    mergeArchitecture(leaf);
    mergeArchitecture(g);
  }
  h.sources.push({
    id: "survey-threshold",
    kind: "hoist",
    x: SURVEY_DOORS[2].x,
    y: y + 2,
    z: 280,
    near: 1,
    range: 18,
    gain: 0.075,
    activity: 0,
  });
  mergeArchitecture(root);
}
