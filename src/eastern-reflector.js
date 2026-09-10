import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { timberGeometry } from "./monastery-architecture.js";
import { mergeArchitecture } from "./visuals.js";
import {
  REFLECTOR_LENGTH,
  REFLECTOR_HINGE,
  REFLECTOR_CLOSED,
  reflectorReleased,
  normalizeEasternReflector,
} from "./eastern-reflector-rules.js";

function sign(text, width = 2.8) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 128;
  const c = canvas.getContext("2d");
  c.fillStyle = "#f6dfac";
  c.font = "600 38px Georgia";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 384, 64, 740);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 6),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
  );
}

export function buildReflectorStation(game, f, group) {
  if (f.reflectorHeight === undefined || !game.map.easternReflector)
    return false;
  const site = game.map.easternReflector,
    y = game.groundHeight(site.x * 7, site.z * 7) + f.reflectorHeight;
  f.yOffset = y - game.groundHeight(f.x * 7, f.z * 7);
  group.position.y = y;
  game.box(1.2, 0.85, 0.7, game.stoneMat, 0, 0.425, 0, group);
  game.box(1.3, 0.12, 0.8, game.goldMat, 0, 0.9, 0, group);
  const core = (f.core = new THREE.Group());
  core.position.set(0, 1.18, 0.12);
  group.add(core);
  if (f.step === 0) {
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.055, 8, 24),
      game.goldMat,
    );
    core.add(wheel);
    for (let i = 0; i < 4; i++)
      game.box(0.05, 0.73, 0.06, game.goldMat, 0, 0, 0, core).rotation.z =
        (i * Math.PI) / 4;
  } else if (f.step === 1) {
    const pin = game.cylinder(
      0.12,
      0.12,
      1.25,
      game.goldMat,
      0,
      0,
      0,
      core,
      12,
    );
    pin.rotation.z = Math.PI / 2;
    game.box(0.7, 0.11, 0.15, game.darkMat, 0, 0.25, 0, core);
  } else {
    const tablet = game.box(
      0.95,
      0.65,
      0.13,
      game.stoneMat,
      0,
      0.08,
      0.02,
      core,
    );
    tablet.rotation.x = -0.18;
    for (let i = 0; i < 5; i++)
      game.box(
        0.65 - i * 0.055,
        0.025,
        0.04,
        game.goldMat,
        0,
        -0.1 + i * 0.095,
        0.11,
        core,
      );
  }
  const label = sign(
    ["BRACE THE REFLECTOR", "REAR LOCKING PIN", "EASTERN THRESHOLD"][f.step],
  );
  label.position.set(0, 1.92, 0.22);
  group.add(label);
  return true;
}

export function buildEasternReflector(game) {
  game.easternReflector = null;
  if (!game.map.easternReflector) return;
  const site = game.map.easternReflector,
    x = site.x * 7,
    z = site.z * 7,
    y = game.groundHeight(x, z),
    root = new THREE.Group();
  root.position.set(x, y, z);
  root.name = "The eastern reflector";
  game.world.add(root);
  const saved = normalizeEasternReflector(
    game.progress.easternReflector,
    game.progress,
  );
  game.progress.easternReflector = saved;
  const r = (game.easternReflector = {
    root,
    x,
    y,
    z,
    saved,
    open: saved.raised ? 1 : 0,
    motion: null,
    decks: [],
    solids: [],
    sources: [],
    tackle: [],
    rampSurface: { reflector: true },
    control: new THREE.Vector3(x + 7, y, z + 2),
  });
  const stone = game.stoneMat,
    wood = game.climbingMaterials?.timber || game.campMaterials?.wood || stone,
    bronze = game.climbingMaterials?.metal || game.goldMat,
    ropeMaterial = game.climbingMaterials?.rope || game.darkMat,
    mirror = new THREE.MeshStandardMaterial({
      color: 0xc3c9bb,
      metalness: 1,
      roughness: 0.18,
      envMapIntensity: 1.15,
    });
  mirror.name = "Hammered reflector plates";
  let serial = 73000;
  const add = (
    geometry,
    material,
    px,
    py,
    pz,
    parent = root,
    camera = true,
  ) => {
    if (material.vertexColors && !geometry.attributes.color)
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Float32Array(geometry.attributes.position.count * 3).fill(0.94),
          3,
        ),
      );
    const mesh = new THREE.Mesh(geometry, material);
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
    material = stone,
    parent = root,
    camera = true,
  ) =>
    add(
      material === wood
        ? timberGeometry(w, h, d, ++serial)
        : stoneBlockGeometry(w, h, d, ++serial),
      material,
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
    r.solids.push(s);
    return s;
  };
  const deck = (px, pz, w, d, top) => {
    block(w, 0.3, d, px, top - 0.15, pz, wood);
    const v = {
      x: x + px,
      z: z + pz,
      w: w / 2,
      d: d / 2,
      y: y + top,
      thickness: 0.3,
      reflector: true,
    };
    r.decks.push(v);
    return v;
  };
  const pier = (px, pz, top, width = 0.55) => {
    const floor = game.groundHeight(x + px, z + pz) - y;
    block(width + 0.45, 0.3, width + 0.45, px, floor + 0.12, pz);
    const count = Math.ceil((top - floor) / 0.65),
      height = (top - floor) / count;
    for (let i = 0; i < count; i++)
      block(width, height - 0.015, width, px, floor + (i + 0.5) * height, pz);
    solid(px, pz, width, width, floor, top);
  };
  // The rear gallery is reached by a jump off the tilted reflector's timber back.
  deck(0, -7.5, 8, 3.8, 4.5);
  for (const px of [-3.65, 3.65])
    for (const pz of [-5.95, -9.05]) pier(px, pz, 4.2, 0.65);
  for (const px of [3.95]) {
    block(0.12, 1.05, 3.8, px, 5.025, -7.5, wood);
    solid(px, -7.5, 0.12, 3.8, 4.5, 5.55);
  }
  block(8, 0.15, 0.12, 0, 5.55, -9.35, wood);
  solid(0, -9.35, 8, 0.12, 5.4, 5.65);
  // Short returns leave a real opening for the westward service jump.
  for (const pz of [-8.9, -6.1]) {
    block(0.12, 1.05, 1.0, -3.95, 5.025, pz, wood);
    solid(-3.95, pz, 0.12, 1.0, 4.5, 5.55);
  }
  for (const [px, pz, w, d, top] of [
    [-7, -7.5, 3.2, 3.8, 3],
    [-7, -3.3, 3.2, 3.2, 1.5],
    [-7, 0.4, 3.2, 3.2, 0.15],
  ]) {
    deck(px, pz, w, d, top);
    for (const side of [-1, 1])
      pier(px + side * 1.25, pz, Math.max(0.1, top - 0.3), 0.4);
  }
  // Low coursed cheek walls frame the blocked front approach. A rear service
  // opening leaves an escape if the player drops beneath the gallery early.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 5; row++)
      for (let bay = 0; bay < 7; bay++)
        block(
          0.65,
          0.62,
          1.93,
          side * 4.7,
          0.31 + row * 0.63,
          -9.9 + bay * 1.96,
        );
    solid(side * 4.7, -4, 0.65, 13.7, 0, 3.15);
  }
  for (const side of [-1, 1]) {
    for (let row = 0; row < 5; row++)
      for (let bay = 0; bay < 3; bay++)
        block(
          1.1,
          0.62,
          0.65,
          side * (1.85 + bay * 1.1),
          0.31 + row * 0.63,
          -11,
        );
    solid(side * 2.95, -11, 3.3, 0.65, 0, 3.15);
  }
  // Two masonry bearings and an overhead tackle carry the heavy reflector.
  for (const px of [-5.1, 5.1]) {
    pier(px, -4, 13.4, 1.1);
    block(1.8, 0.42, 1.6, px, 13.35, -4);
    const bearing = add(
      new THREE.CylinderGeometry(0.48, 0.48, 1.7, 20),
      bronze,
      px,
      REFLECTOR_HINGE.y,
      -4,
    );
    bearing.rotation.z = Math.PI / 2;
  }
  block(11.5, 0.7, 1.25, 0, 13.7, -4, wood);
  const shaft = add(
    new THREE.CylinderGeometry(0.09, 0.09, 8.1, 12),
    bronze,
    0,
    13.35,
    -4,
    root,
    false,
  );
  shaft.rotation.z = Math.PI / 2;
  const panel = (r.panel = new THREE.Group());
  panel.name = "Tilting mirror and walkable timber back";
  panel.position.set(0, REFLECTOR_HINGE.y, REFLECTOR_HINGE.z);
  panel.userData.animated = true;
  panel.userData.cameraDynamic = true;
  root.add(panel);
  for (let column = 0; column < 12; column++)
    block(
      0.73,
      REFLECTOR_LENGTH,
      0.12,
      (column - 5.5) * 0.73,
      4,
      -0.14,
      wood,
      panel,
    );
  for (const px of [-4.5, 4.5]) block(0.2, 8.1, 0.44, px, 4, 0, bronze, panel);
  for (const py of [0, 8]) block(9.2, 0.18, 0.44, 0, py, 0, bronze, panel);
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 9; col++) {
      const tile = add(
        new THREE.BoxGeometry(0.94, 0.94, 0.065),
        mirror,
        col - 4,
        row + 0.5,
        0.065,
        panel,
        false,
      );
      tile.rotation.y = Math.sin(row * 17 + col * 7) * 0.009;
    }
  // The wood face stays flush for traversal; fine metal ties sit on its perimeter.
  for (const px of [-4.34, 4.34])
    for (let row = 0; row < 9; row++)
      add(
        new THREE.SphereGeometry(0.07, 8, 6),
        bronze,
        px,
        row,
        -0.23,
        panel,
        false,
      );
  for (const side of [-1, 1]) {
    const rope = add(
      new THREE.CylinderGeometry(0.035, 0.035, 1, 8),
      ropeMaterial,
      0,
      0,
      0,
      root,
      false,
    );
    rope.userData.animated = true;
    const sheave = add(
      new THREE.TorusGeometry(0.34, 0.065, 8, 28),
      bronze,
      side * 3.7,
      13.35,
      -4,
      root,
      false,
    );
    sheave.rotation.y = Math.PI / 2;
    sheave.userData.animated = true;
    r.tackle.push({ side, rope, sheave });
    r.sources.push({
      id: `eastern-reflector-tackle-${side}`,
      kind: "hoist",
      x: x + side * 3.7,
      y: y + 13.35,
      z: z - 3.7,
      gain: 0.055,
      near: 2,
      range: 27,
      activity: 0,
    });
  }
  for (const px of [6.3, 7.7]) pier(px, 2, 1.55, 0.3);
  const wheel = (r.wheel = add(
    new THREE.TorusGeometry(0.62, 0.075, 8, 32),
    bronze,
    7,
    1.35,
    2,
    root,
    false,
  ));
  wheel.userData.animated = true;
  for (let i = 0; i < 6; i++)
    block(0.06, 1.14, 0.06, 0, 0, 0, bronze, wheel, false).rotation.z =
      (i * Math.PI) / 3;
  const drum = (r.drum = new THREE.Group());
  drum.position.set(7, 1.35, 1.7);
  drum.userData.animated = true;
  root.add(drum);
  const barrel = add(
    new THREE.CylinderGeometry(0.28, 0.28, 0.65, 20),
    bronze,
    0,
    0,
    0,
    drum,
    false,
  );
  barrel.rotation.x = Math.PI / 2;
  for (const dz of [-0.2, 0, 0.2])
    add(
      new THREE.TorusGeometry(0.29, 0.04, 8, 20),
      ropeMaterial,
      0,
      0,
      dz,
      drum,
      false,
    );
  block(1.7, 0.18, 0.85, 7, 1.0, 1.7, wood);
  const cable = (points) =>
    add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
        32,
        0.025,
        6,
        false,
      ),
      ropeMaterial,
      0,
      0,
      0,
      root,
      false,
    );
  cable([
    [7, 1.35, 1.7],
    [7, 1.35, -4],
    [7, 13.1, -4],
    [3.7, 13.35, -4],
  ]);
  cable([
    [7, 1.18, 7],
    [7, 0.2, 6],
    [5.6, 0.2, 3],
    [4.5, 0.2, 2.7],
  ]);
  cable([
    [0, 5.6, -7],
    [2.8, 5.6, -7],
    [5.1, 5.6, -4],
  ]);
  const wheelLabel = sign("HAUL THE REFLECTOR", 2.6);
  wheelLabel.position.set(7, 2.45, 2.2);
  root.add(wheelLabel);
  const routeLabel = sign("TIMBER BACK → REAR GALLERY", 3.6);
  routeLabel.position.set(-4.9, 1.25, 5.3);
  root.add(routeLabel);
  block(3.8, 0.65, 0.15, -4.9, 1.25, 5.14, wood);
  const returnLabel = sign("SERVICE DESCENT", 2.7);
  returnLabel.position.set(-7, 4.0, -8.4);
  root.add(returnLabel);
  r.sources.push({
    id: "eastern-reflector-drum",
    kind: "hoist",
    x: x + 7,
    y: y + 1.35,
    z: z + 2.2,
    gain: 0.06,
    near: 1.2,
    range: 20,
    activity: 0,
  });
  mergeArchitecture(panel);
  mergeArchitecture(wheel);
  mergeArchitecture(drum);
  mergeArchitecture(root);
  updateEasternReflector(game, 0, true);
}

export function startEasternReflector(game) {
  const r = game.easternReflector;
  if (
    !r ||
    r.saved.raised ||
    r.motion ||
    game.paused ||
    game.progress.stage !== 5 ||
    !reflectorReleased(game.progress)
  )
    return false;
  r.motion = { time: 0, duration: 4.4 };
  game.keys?.clear();
  return true;
}

export function updateEasternReflector(game, dt, initial = false) {
  const r = game.easternReflector;
  if (!r) return;
  if (game.paused && !initial) dt = 0;
  if (r.motion) {
    r.motion.time += dt;
    const t = Math.min(1, r.motion.time / r.motion.duration);
    r.open = t * t * (3 - 2 * t);
    if (t >= 1) {
      r.saved.raised = true;
      r.motion = null;
      game.audio.tone("gate");
      game.cb.toast?.(
        "The reflector is seated. Cross beneath its bearing and read the eastern threshold.",
      );
      game.save();
    }
  }
  r.panel.rotation.x = (1 - r.open) * REFLECTOR_CLOSED;
  r.wheel.rotation.z = -r.open * Math.PI * 8;
  r.drum.rotation.z = r.wheel.rotation.z;
  for (const source of r.sources)
    source.activity = r.motion && !game.paused ? 1 : 0;
  const endpoint = new THREE.Vector3(0, 8, 0)
    .applyEuler(r.panel.rotation)
    .add(r.panel.position);
  for (const t of r.tackle) {
    const a = new THREE.Vector3(t.side * 3.7, 13.35, -4),
      b = new THREE.Vector3(t.side * 3.7, endpoint.y, endpoint.z),
      delta = b.clone().sub(a);
    t.rope.position.copy(a.add(b).multiplyScalar(0.5));
    t.rope.scale.y = delta.length();
    t.rope.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    t.sheave.rotation.z = r.open * Math.PI * 5;
  }
}

export function reflectorHint(game) {
  const r = game.easternReflector;
  if (
    !r ||
    game.progress.stage !== 5 ||
    game.progress.field.includes("field-5-2")
  )
    return null;
  const p = game.player.position;
  if (
    Math.hypot(p.x - r.control.x, p.z - r.control.z) > 1.7 ||
    Math.abs(p.y - r.control.y) > 0.6
  )
    return null;
  return {
    key: "E",
    label: r.motion
      ? "Reflector rising · keep clear"
      : r.saved.raised
        ? "Cross beneath the raised reflector"
        : reflectorReleased(game.progress)
          ? "Haul the eastern reflector upright"
          : "Brace the reflector and release the rear pin first",
  };
}

export function reflectorInteract(game) {
  const hint = reflectorHint(game);
  if (!hint) return false;
  if (!startEasternReflector(game)) game.cb.toast?.(hint.label);
  return true;
}

export function reflectorObjective(game) {
  const r = game.easternReflector;
  if (
    !r ||
    game.progress.stage !== 5 ||
    !reflectorReleased(game.progress) ||
    r.saved.raised
  )
    return null;
  return {
    text: r.motion
      ? "The eastern reflector is rising · keep clear"
      : "Return to the hauling wheel and raise the reflector",
    target: { x: r.control.x / 7, z: r.control.z / 7 },
  };
}
