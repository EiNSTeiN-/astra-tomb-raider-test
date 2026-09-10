import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { timberGeometry } from "./monastery-architecture.js";
import { mergeArchitecture } from "./visuals.js";
import {
  STAIR_RISE,
  STAIR_STEPS,
  STAIR_RUN,
  stairLocksReleased,
  normalizeFrozenStair,
} from "./frozen-stair-rules.js";

function sign(text, width = 1.7) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const c = canvas.getContext("2d");
  c.fillStyle = "#f0dbac";
  c.font = "600 32px Georgia";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 256, 48, 496);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, (width * 96) / 512),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
  );
}

export function buildFrozenStation(game, f, group) {
  if (f.stairHeight === undefined || !game.map.frozenStair) return false;
  const site = game.map.frozenStair;
  const y = game.groundHeight(site.x * 7, site.z * 7) + f.stairHeight;
  f.yOffset = y - game.groundHeight(f.x * 7, f.z * 7);
  group.position.y = y;
  game.box(1.05, 0.85, 0.55, game.darkMat, 0, 0.425, 0, group);
  game.box(1.12, 0.15, 0.65, game.goldMat, 0, 0.92, 0, group);
  const core = (f.core = new THREE.Group());
  core.userData.animated = true;
  core.position.set(0, 1.15, 0.12);
  group.add(core);
  if (f.step < 2) {
    game.cylinder(
      0.12,
      0.12,
      0.85,
      game.goldMat,
      0,
      0,
      0,
      core,
      10,
    ).rotation.z = Math.PI / 2;
    game.box(0.65, 0.1, 0.12, game.goldMat, 0.22, 0.22, 0.1, core);
    const ice = (f.frozenIce = new THREE.Group());
    group.add(ice);
    const iceMaterial = new THREE.MeshStandardMaterial({
      color: 0xb3d8df,
      roughness: 0.32,
      metalness: 0.05,
    });
    for (let i = 0; i < 5; i++) {
      const piece = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.23, 0),
        iceMaterial,
      );
      piece.position.set((i - 2) * 0.19, 1.12 + (i % 2) * 0.08, 0.14);
      piece.scale.set(1, 0.9, 1.4);
      piece.castShadow = true;
      ice.add(piece);
    }
  } else {
    const tablet = game.box(0.9, 0.5, 0.13, game.stoneMat, 0, 0.02, 0, core);
    tablet.rotation.x = -0.2;
  }
  const label = sign(["LOWER LOCK", "UPPER LOCK", "PASS RESTORED"][f.step]);
  label.position.set(0, 1.7, 0.32);
  group.add(label);
  return true;
}

export function buildFrozenStair(game) {
  game.frozenStair = null;
  if (!game.map.frozenStair) return;
  const x = game.map.frozenStair.x * 7,
    z = game.map.frozenStair.z * 7;
  const y = game.groundHeight(x, z),
    root = new THREE.Group();
  root.name = "The frozen stair";
  root.position.set(x, y, z);
  game.world.add(root);
  const saved = normalizeFrozenStair(game.progress.frozenStair, game.progress);
  game.progress.frozenStair = saved;
  const stair = (game.frozenStair = {
    root,
    x,
    y,
    z,
    saved,
    decks: [],
    solids: [],
    steps: [],
    sources: [],
    motion: null,
    rails: [],
    open: saved.restored ? 1 : 0,
    control: new THREE.Vector3(x + 5, y, z + 2),
  });
  const wood = game.monasteryMaterials?.wood || game.stoneMat;
  const stone = game.monasteryMaterials?.stone || game.stoneMat;
  const snow = game.monasteryMaterials?.snow || game.stoneMat;
  const iron = new THREE.MeshStandardMaterial({
    color: 0x3e494b,
    metalness: 0.72,
    roughness: 0.58,
  });
  const bronze = game.goldMat;
  let serial = 51000;
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
          new Array(geometry.attributes.position.count * 3).fill(0.94),
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
    mat = stone,
    parent = root,
    camera = true,
  ) =>
    add(
      mat === wood
        ? timberGeometry(w, h, d, ++serial)
        : stoneBlockGeometry(w, h, d, ++serial),
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
    stair.solids.push(s);
    return s;
  };
  const deck = (px, pz, w, d, height, mat = wood, thickness = 0.28) => {
    block(w, thickness, d, px, height - thickness / 2, pz, mat);
    const surface = {
      x: x + px,
      z: z + pz,
      w: w / 2,
      d: d / 2,
      y: y + height,
      thickness,
    };
    stair.decks.push(surface);
    return surface;
  };
  const pier = (px, pz, top, width = 0.6) => {
    const floor = game.groundHeight(x + px, z + pz) - y;
    block(width + 0.35, 0.3, width + 0.35, px, floor + 0.1, pz, stone);
    block(width, top - floor, width, px, (floor + top) / 2, pz, wood);
    solid(px, pz, width, width, floor, top);
  };
  // The surviving west service gallery has a broken two-metre crossing.
  for (const [pz, height] of [
    [10, 1.4],
    [6.5, 2.8],
  ]) {
    const s = deck(-7, pz, 3.6, 3.4, height, stone, 0.5);
    game.obstacles.push({
      x: s.x,
      z: s.z,
      w: s.w,
      d: s.d,
      h: s.y - game.groundHeight(s.x, s.z),
      climbable: true,
      frozenStair: true,
    });
    for (const side of [-1, 1]) pier(-7 + side * 1.45, pz, height - 0.5);
  }
  deck(-7, 3.65, 3.6, 3.5, 2.8);
  deck(-7, -4, 3.6, 8, 2.8);
  for (const pz of [4, -2, -7]) {
    for (const side of [-1, 1]) pier(-7 + side * 1.45, pz, 2.52);
    block(4.3, 0.3, 0.4, -7, 2.4, pz, wood);
  }
  // Open rails leave the jump and the stair entry legible from the lower court.
  for (const [pz, length] of [
    [3.65, 3.5],
    [-4, 8],
  ]) {
    block(0.12, 0.15, length, -8.72, 3.8, pz, wood);
    solid(-8.72, pz, 0.12, length, 3.725, 3.875);
    for (const dz of [-length / 2 + 0.25, length / 2 - 0.25]) {
      block(0.15, 1, 0.15, -8.72, 3.3, pz + dz, wood);
      solid(-8.72, pz + dz, 0.15, 0.15, 2.8, 3.8);
    }
  }
  deck(0, -7, 6, 6.8, STAIR_RISE, stone, 0.45);
  for (const px of [-2.7, 2.7])
    for (const pz of [-4, -9.8]) pier(px, pz, STAIR_RISE - 0.4, 0.8);
  for (const px of [-2.9, 2.9]) {
    block(0.18, 1.1, 6.4, px, STAIR_RISE + 0.55, -7, wood);
    solid(px, -7, 0.18, 6.4, STAIR_RISE, STAIR_RISE + 1.1);
  }
  block(6, 0.22, 0.2, 0, STAIR_RISE + 1.1, -10.3, wood);
  // Two braced gantries carry the raising tackle and the fixed top hinge.
  for (const px of [-2.2, 2.2]) {
    pier(px, -3.8, 10, 0.55);
    block(0.85, 0.22, 0.85, px, 10, -3.8, bronze);
  }
  block(5.4, 0.55, 0.7, 0, 10, -3.8, wood);
  block(5.6, 0.12, 0.85, 0, 10.34, -3.8, snow);
  const flight = (stair.flight = new THREE.Group());
  flight.position.set(0, STAIR_RISE, 9 - STAIR_RUN);
  flight.userData.cameraDynamic = true;
  flight.userData.animated = true;
  root.add(flight);
  const rise = STAIR_RISE / STAIR_STEPS,
    run = STAIR_RUN / STAIR_STEPS;
  for (let i = 1; i <= STAIR_STEPS; i++) {
    const py = i * rise,
      pz = 9 - (i - 0.5) * run;
    block(
      3.4,
      0.14,
      run + 0.015,
      0,
      py - STAIR_RISE - 0.07,
      pz - flight.position.z,
      wood,
      flight,
    );
    block(
      3.45,
      0.045,
      0.055,
      0,
      py - STAIR_RISE - 0.025,
      pz - flight.position.z + run / 2 - 0.02,
      bronze,
      flight,
      false,
    );
    const d = {
      x,
      z: z + pz,
      w: 1.7,
      d: run / 2,
      y: y + py,
      thickness: 0.14,
      enabled: saved.restored,
    };
    stair.steps.push(d);
    stair.decks.push(d);
    for (const side of [-1, 1]) {
      const rail = solid(
        side * 1.78,
        pz,
        0.12,
        run,
        py - rise + 0.99,
        py + 1.11,
      );
      rail.enabled = saved.restored;
      stair.rails.push(rail);
    }
  }
  const beam = (a, b, width, depth, mat, parent = root) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.clone().sub(start);
    const m = block(
      width,
      delta.length(),
      depth,
      ...start.clone().add(end).multiplyScalar(0.5).toArray(),
      mat,
      parent,
      false,
    );
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    game.cameraSurfaces?.capture(m);
    return m;
  };
  for (const side of [-1, 1]) {
    beam(
      [side * 1.65, -STAIR_RISE - 0.1, STAIR_RUN],
      [side * 1.65, -0.1, 0],
      0.2,
      0.24,
      iron,
      flight,
    );
    beam(
      [side * 1.78, -STAIR_RISE + 1.05, STAIR_RUN],
      [side * 1.78, 1.05, 0],
      0.12,
      0.12,
      wood,
      flight,
    );
    for (let i = 0; i <= 6; i++)
      block(
        0.1,
        1.05,
        0.1,
        side * 1.78,
        -STAIR_RISE + i + 0.525,
        STAIR_RUN * (1 - i / 6),
        wood,
        flight,
        false,
      );
    const rope = add(
      new THREE.CylinderGeometry(0.032, 0.032, 1, 8),
      wood,
      0,
      0,
      0,
      root,
      false,
    );
    rope.userData.animated = true;
    stair.sources.push({
      id: `frozen-stair-tackle-${side}`,
      kind: "hoist",
      x: x + side * 1.7,
      y: y + 9.8,
      z: z - 3.8,
      gain: 0.055,
      near: 2,
      range: 26,
      activity: 0,
    });
    const sheave = add(
      new THREE.TorusGeometry(0.35, 0.07, 8, 28),
      bronze,
      side * 1.7,
      9.8,
      -3.8,
    );
    sheave.rotation.y = Math.PI / 2;
    sheave.userData.animated = true;
    (stair.tackle ||= []).push({ side, rope, sheave });
  }
  // The hauling wheel is clear of the lowering flight and works only after both pins.
  for (const px of [4.3, 5.7]) pier(px, 2, 1.6, 0.3);
  const wheel = (stair.wheel = add(
    new THREE.TorusGeometry(0.65, 0.085, 8, 32),
    bronze,
    5,
    1.35,
    2,
  ));
  wheel.userData.animated = true;
  for (let i = 0; i < 6; i++) {
    const spoke = block(0.075, 1.2, 0.075, 0, 0, 0, bronze, wheel, false);
    spoke.rotation.z = (i * Math.PI) / 3;
  }
  // Guide lines connect both brake stations and the hauling drum to the tackle.
  const cable = (points) =>
    add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
        24,
        0.025,
        6,
        false,
      ),
      iron,
      0,
      0,
      0,
      root,
      false,
    );
  cable([
    [5, 1.35, 2],
    [5, 1.35, -3.8],
    [1.7, 9.8, -3.8],
  ]);
  cable([
    [7, 1.15, 7],
    [7, 0.25, 5],
    [7, 0.25, -3.8],
    [2.2, 1, -3.8],
  ]);
  cable([
    [-7, 3.95, -7],
    [-4, 3.95, -7],
    [-2.2, 6, -3.8],
  ]);
  const label = sign("HAUL THE STAIR", 2.1);
  label.position.set(5, 2.35, 2.12);
  root.add(label);
  const guide = sign("WEST GALLERY · UPPER LOCK", 3.5);
  guide.position.set(-11, 1.1, 10.15);
  root.add(guide);
  block(3.7, 0.6, 0.16, -11, 1.1, 10, wood);
  for (const px of [-12.4, -9.6]) pier(px, 10, 0.85, 0.16);
  // The flight's closed pose is high above the approach. Retain a volume for
  // player/sound obstruction; camera bounds follow each moving primitive.
  stair.flightSolid = solid(0, 2.7, 3.7, 13.2, STAIR_RISE, 19);
  mergeArchitecture(flight);
  mergeArchitecture(root);
  updateFrozenStair(game, 0, true);
}

export function startFrozenStair(game) {
  const s = game.frozenStair;
  if (
    !s ||
    s.motion ||
    s.saved.restored ||
    game.paused ||
    game.progress.stage !== 3 ||
    !stairLocksReleased(game.progress)
  )
    return false;
  s.motion = { time: 0, duration: 3.2 };
  game.keys?.clear();
  return true;
}
export function updateFrozenStair(game, dt, initial = false) {
  const s = game.frozenStair;
  if (!s) return;
  if (game.paused && !initial) dt = 0;
  if (s.motion) {
    s.motion.time += dt;
    const t = Math.min(1, s.motion.time / s.motion.duration);
    s.open = t * t * (3 - 2 * t);
    if (t >= 1) {
      s.saved.restored = true;
      s.motion = null;
      game.audio.tone("gate");
      game.cb.toast?.(
        "The stair is seated. Climb its steps and read the pass marker.",
      );
      game.save();
    }
  }
  s.flight.rotation.x = (-(1 - s.open) * Math.PI) / 2;
  s.flightSolid.enabled = !s.saved.restored;
  for (const d of s.steps) d.enabled = s.saved.restored;
  for (const rail of s.rails) rail.enabled = s.saved.restored;
  for (const source of s.sources)
    source.activity = s.motion && !game.paused ? 1 : 0;
  s.wheel.rotation.z = -s.open * Math.PI * 6;
  const local = new THREE.Vector3(0, -STAIR_RISE, STAIR_RUN)
    .applyEuler(s.flight.rotation)
    .add(s.flight.position);
  for (const t of s.tackle) {
    const a = new THREE.Vector3(t.side * 1.7, 9.8, -3.8),
      b = new THREE.Vector3(t.side * 1.7, local.y + 0.2, local.z);
    const delta = b.clone().sub(a);
    t.rope.position.copy(a.add(b).multiplyScalar(0.5));
    t.rope.scale.y = delta.length();
    t.rope.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    t.sheave.rotation.z = s.open * Math.PI * 4;
  }
}
export function frozenStairHint(game) {
  const s = game.frozenStair;
  if (
    !s ||
    game.progress.stage !== 3 ||
    game.progress.field.includes("field-3-2")
  )
    return null;
  const p = game.player.position;
  if (
    Math.hypot(p.x - s.control.x, p.z - s.control.z) > 1.7 ||
    Math.abs(p.y - s.control.y) > 0.6
  )
    return null;
  return {
    key: "E",
    label: s.motion
      ? "Stair lowering · keep clear"
      : s.saved.restored
        ? "Climb the restored stair"
        : stairLocksReleased(game.progress)
          ? "Haul the frozen stair into place"
          : "Release the lower and upper locks first",
  };
}
export function frozenStairInteract(game) {
  if (!frozenStairHint(game)) return false;
  if (!startFrozenStair(game)) game.cb.toast?.(frozenStairHint(game).label);
  return true;
}
export function frozenStairObjective(game) {
  const s = game.frozenStair;
  if (
    !s ||
    game.progress.stage !== 3 ||
    !stairLocksReleased(game.progress) ||
    s.saved.restored
  )
    return null;
  return {
    text: s.motion
      ? "The frozen stair is lowering · keep clear"
      : "Haul the frozen stair into place",
    target: { x: s.control.x / 7, z: s.control.z / 7 },
  };
}
