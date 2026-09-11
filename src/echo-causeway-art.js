import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import {
  gardenPavingGeometry,
  prepareGardenGeometry,
} from "./rain-garden-art.js";
import { quartzGeometry, mineralMaterial } from "./mineral-art.js";
import { mergeArchitecture } from "./visuals.js";
import { CAUSEWAY_LANDINGS, CAUSEWAY_STONES } from "./echo-causeway-rules.js";

function inscription(text, width) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const c = canvas.getContext("2d"),
    lines = text.split("\n");
  c.fillStyle = "#d7e7e6";
  c.font = "600 44px Georgia";
  c.textAlign = "center";
  c.textBaseline = "middle";
  lines.forEach((line, i) =>
    c.fillText(line, 512, 128 + (i - (lines.length - 1) / 2) * 64, 980),
  );
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
      roughness: 0.95,
    }),
  );
}
export function buildCausewayStation(game, f, group) {
  if (f.causewayHeight === undefined) return false;
  group.position.y = game.terrainProfile.causewayY + f.causewayHeight;
  f.yOffset = group.position.y - game.groundHeight(f.x * 7, f.z * 7);
  const core = (f.core = new THREE.Group());
  core.userData.animated = true;
  group.add(core);
  const level = (f.causewayLight = { value: 0.15 });
  const gem = new THREE.Mesh(
    quartzGeometry(0.39, 1.5, f.step * 0.4),
    mineralMaterial(new THREE.Color(0x84bccc), level),
  );
  gem.position.y = 0.9;
  core.add(gem);
  for (const [radius, height, y] of [
    [0.9, 0.2, 0.1],
    [0.6, 0.7, 0.55],
    [0.8, 0.15, 0.97],
  ])
    game.cylinder(
      radius,
      radius + 0.05,
      height,
      game.darkMat,
      0,
      y,
      0,
      group,
      16,
    );
  for (const y of [1.15, 1.7]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.66, 0.055, 8, 36),
      game.goldMat,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    group.add(ring);
  }
  const panel = inscription(
    ["OUTER RELAY", "GALLERY RELAY", "CHAMBER RELAY"][f.step],
    2.5,
  );
  panel.position.set(0, 0.5, 0.66);
  group.add(panel);
  return true;
}

export function buildCausewayArt(game, h) {
  const root = h.root,
    stone = game.stoneMat,
    dark = game.darkMat,
    bronze = game.goldMat;
  let seed = 93800;
  const add = (geometry, material, x, y, z, parent = root, camera = true) => {
    const mesh = new THREE.Mesh(
      prepareGardenGeometry(geometry, material),
      material,
    );
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
    material = stone,
    parent = root,
    camera = true,
  ) =>
    add(
      stoneBlockGeometry(w, height, d, ++seed),
      material,
      x,
      y,
      z,
      parent,
      camera,
    );
  const solid = (x, z, w, d, bottom, top) => {
    const s = {
      x,
      z,
      w: w / 2,
      d: d / 2,
      bottom: h.base + bottom,
      top: h.base + top,
    };
    h.solids.push(s);
    return s;
  };
  const deck = (x, z, w, d, top, thickness = 0.4) => {
    add(gardenPavingGeometry(w, d, thickness, ++seed), stone, x, top, z);
    const data = {
      x,
      z,
      w: w / 2,
      d: d / 2,
      y: h.base + top,
      thickness,
      causeway: true,
    };
    h.decks.push(data);
    return data;
  };
  const pier = (x, z, top, width = 0.9) => {
    const samples = [-width / 2, width / 2].flatMap((dx) =>
      [-width / 2, width / 2].map(
        (dz) => game.groundHeight(x + dx, z + dz) - h.base,
      ),
    );
    const bottom = Math.min(...samples) - 0.15,
      height = top - bottom;
    const count = Math.max(1, Math.ceil(height / 0.7));
    for (let i = 0; i < count; i++)
      block(
        width,
        height / count - 0.012,
        width,
        x,
        bottom + ((i + 0.5) * height) / count,
        z,
        dark,
      );
    block(width + 0.3, 0.24, width + 0.3, x, bottom + 0.12, z, stone);
    solid(x, z, width, width, bottom, top);
  };
  const rail = (x, z, width, depth, y) => {
    block(width, 0.16, depth, x, y + 1.03, z, bronze);
    solid(x, z, width, depth, y + 0.91, y + 1.12);
    const n = Math.ceil(Math.max(width, depth) / 1.8);
    for (let i = 0; i <= n; i++) {
      const t = (i / n - 0.5) * Math.max(width, depth),
        px = x + (width > depth ? t : 0),
        pz = z + (depth > width ? t : 0);
      block(0.14, 1, 0.14, px, y + 0.5, pz, bronze);
      solid(px, pz, 0.14, 0.14, y, y + 1.05);
    }
  };
  const sign = (text, x, y, z, width, flip = false) => {
    block(width + 0.18, width / 4 + 0.16, 0.15, x, y, z, dark);
    const face = inscription(text, width);
    face.position.set(x, y, z + (flip ? -0.085 : 0.085));
    face.rotation.y = flip ? Math.PI : 0;
    root.add(face);
  };
  for (const [i, a] of CAUSEWAY_LANDINGS.entries()) {
    const d = deck(a.x, a.z, a.w * 2, a.d * 2, a.height, 0.5);
    h.landings.push(d);
    for (const dx of [-a.w + 0.7, a.w - 0.7])
      for (const dz of [-a.d + 0.7, a.d - 0.7])
        pier(a.x + dx, a.z + dz, a.height - 0.5);
    const light = new THREE.PointLight(
      0x9bc5de,
      i === 1 ? 14 : 10,
      i === 1 ? 29 : 22,
      2,
    );
    light.position.set(a.x, a.height + 3.5, a.z);
    root.add(light);
  }
  // The entrance flight joins the southern trail. All other galleries can only
  // be reached by the stone crossings; completed crossings remain available.
  for (let i = 0; i < 28; i++) {
    const top = (i + 1) * 0.15,
      z = 273.7 - i * 0.43;
    block(2.6, top, 0.45, 217, top / 2, z, dark);
    h.decks.push({
      x: 217,
      z,
      w: 1.3,
      d: 0.225,
      y: h.base + top,
      thickness: top,
      causeway: true,
    });
  }
  rail(214.15, 258.4, 0.14, 4.7, 4.2);
  rail(217, 256.15, 5.7, 0.14, 4.2);
  rail(252, 262.85, 7.7, 0.14, 4.2);
  rail(255.85, 259, 0.14, 7.7, 4.2);
  rail(248.15, 224, 0.14, 7.7, 7.2);
  rail(255.85, 224, 0.14, 7.7, 7.2);
  rail(252, 220.15, 7.7, 0.14, 7.2);
  for (const [x, z, y] of [
    [217, 255.75, 4.2],
    [252, 263.7, 4.2],
    [252, 219.8, 7.2],
  ]) {
    for (const side of [-1, 1]) pier(x + side * 2.35, z, y + 4.7, 0.65);
    block(5.5, 0.4, 0.7, x, y + 4.9, z);
  }
  sign("SOUND THE RELAY\nFOLLOW THE RISING STONES", 217, 6.2, 255.98, 4.3);
  sign(
    "FOUR STONES · ONE ECHO\nTHE NEXT RELAY HOLDS THE WAY",
    252,
    6.4,
    263.55,
    4.4,
    true,
  );
  sign("THE VOICE RETURNS\nTHE CROSSINGS REMEMBER", 252, 9.35, 220.2, 4.5);
  for (const x of [210.8, 213.2]) pier(x, 274, 1.8, 0.16);
  sign("ECHO CAUSEWAY ↑", 212, 1.3, 274, 3.2);
  for (const [number, p] of CAUSEWAY_STONES.entries()) {
    const moving = new THREE.Group();
    moving.position.set(p.x, -2.2, p.z);
    moving.userData.animated = moving.userData.cameraDynamic = true;
    root.add(moving);
    add(gardenPavingGeometry(3.6, 3.6, 0.42, ++seed), stone, 0, 0, 0, moving);
    add(
      new THREE.CylinderGeometry(1.28, 1.36, 9, 12),
      dark,
      0,
      -4.9,
      0,
      moving,
    );
    for (const y of [-0.6, -2.2, -4.4, -6.6])
      add(
        new THREE.CylinderGeometry(1.39, 1.39, 0.18, 12),
        bronze,
        0,
        y,
        0,
        moving,
      );
    const glow = new THREE.MeshStandardMaterial({
      color: 0x7599ad,
      emissive: 0x559bc3,
      emissiveIntensity: 0.3,
      roughness: 0.65,
    });
    for (const side of [-1, 1]) {
      block(3.35, 0.075, 0.075, 0, -0.22, side * 1.81, glow, moving, false);
      block(0.075, 0.075, 3.35, side * 1.81, -0.22, 0, glow, moving, false);
    }
    for (let mark = 0; mark <= p.index; mark++)
      block(
        0.1,
        0.025,
        0.48,
        (mark - p.index / 2) * 0.25,
        0.018,
        0,
        bronze,
        moving,
        false,
      );
    add(new THREE.CylinderGeometry(1.65, 1.8, 1.2, 12), dark, p.x, -6.8, p.z);
    const d = {
      x: p.x,
      z: p.z,
      w: 1.8,
      d: 1.8,
      y: h.base - 2.2,
      thickness: 0.42,
      moving: true,
      causeway: true,
    };
    h.decks.push(d);
    const shaft = solid(p.x, p.z, 2.65, 2.65, -11.6, -2.6);
    const source = {
      id: `echo-causeway-stone-${number}`,
      kind: "crystal",
      // The resonant inlay is on the upper approach edge. A listener standing
      // above the crossing should hear it without the slab muffling itself.
      x: p.x + (p.chain ? 0 : -1.94),
      y: h.base - 2.06,
      z: p.z + (p.chain ? 1.94 : 0),
      gain: 0.12,
      near: 2,
      range: 20,
      rate: 0.86 + p.index * 0.08 + p.chain * 0.025,
      activity: 0,
    };
    h.sources.push(source);
    h.stones.push({ ...p, root: moving, deck: d, shaft, glow, source });
    mergeArchitecture(moving);
  }
  for (let chain = 0; chain < 2; chain++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0x8fd6e4,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 0.72, 40),
      material,
    );
    ring.userData.animated = true;
    root.add(ring);
    h.rings.push(ring);
  }
  for (const [i, f] of game.items
    .filter((f) => f.causewayHeight !== undefined)
    .entries()) {
    h.sources.push({
      id: `echo-causeway-relay-${i}`,
      kind: "crystal",
      x: f.x * 7,
      y: f.group.position.y + 2.05,
      z: f.z * 7,
      gain: 0.18,
      near: 2,
      range: 28,
      rate: 0.86 + i * 0.16,
      activity: 0,
    });
  }
  mergeArchitecture(root);
}
