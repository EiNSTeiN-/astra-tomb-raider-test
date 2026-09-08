import * as THREE from "three";
import {
  HOIST_CARS,
  HOIST_RISE,
  HOIST_DECK,
  HOIST_RECORD,
  hoistHeight,
  normalizeBellHoist,
  insideBellHoist,
} from "./bell-hoist-rules.js";
import { bellGeometry, timberGeometry } from "./monastery-architecture.js";
import {
  stoneBlockGeometry,
  carvedPanelGeometry,
} from "./temple-architecture.js";
import { mergeArchitecture } from "./visuals.js";

function label(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const c = canvas.getContext("2d");
  c.fillStyle = "#ead3a4";
  c.font = "600 35px Georgia";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 256, 64, 495);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.45, 0.36),
    new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    }),
  );
  const group = new THREE.Group(),
    back = mesh.clone();
  mesh.position.z = 0.055;
  back.position.z = -0.055;
  back.rotation.y = Math.PI;
  group.add(mesh, back);
  return group;
}
export function buildBellHoist(game) {
  game.bellHoist = null;
  if (!game.map.bellHoist) return;
  const site = game.map.bellHoist,
    x = site.x * 7,
    z = site.z * 7,
    y = game.groundHeight(x, z);
  const saved = normalizeBellHoist(game.progress.bellHoist);
  game.progress.bellHoist = saved;
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.name = "The bellkeepers' hoist";
  game.world.add(root);
  const h = (game.bellHoist = {
    root,
    x,
    y,
    z,
    saved,
    cars: [],
    decks: [],
    solids: [],
    controls: [],
    sources: [],
    motion: null,
    open: saved.bell ? 1 : 0,
  });
  const stone = game.monasteryMaterials?.stone || game.stoneMat,
    bronze = new THREE.MeshStandardMaterial({
      color: 0x8e7749,
      metalness: 0.65,
      roughness: 0.57,
    }),
    wood =
      game.monasteryMaterials?.wood ||
      new THREE.MeshStandardMaterial({ color: 0x594736, roughness: 0.91 }),
    snow =
      game.monasteryMaterials?.snow ||
      new THREE.MeshStandardMaterial({ color: 0xd9e3ec, roughness: 1 }),
    iron = new THREE.MeshStandardMaterial({
      color: 0x343c3a,
      metalness: 0.65,
      roughness: 0.68,
    });
  let serial = 4100;
  const add = (
    geometry,
    material,
    px,
    py,
    pz,
    parent = root,
    camera = false,
  ) => {
    if (material.vertexColors && !geometry.attributes.color)
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Array(geometry.attributes.position.count * 3).fill(0.92),
          3,
        ),
      );
    const m = new THREE.Mesh(geometry, material);
    m.position.set(px, py, pz);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    if (camera) game.cameraSurfaces?.capture(m);
    return m;
  };
  const block = (
    w,
    thick,
    d,
    px,
    py,
    pz,
    mat = stone,
    parent = root,
    camera = true,
  ) =>
    add(
      (mat === wood ? timberGeometry : stoneBlockGeometry)(
        w,
        thick,
        d,
        serial++,
      ),
      mat,
      px,
      py,
      pz,
      parent,
      camera,
    );
  const solid = (px, py, pz, w, thick, d) => {
    const s = {
      x: x + px,
      z: z + pz,
      w: w / 2,
      d: d / 2,
      bottom: y + py - thick / 2,
      top: y + py + thick / 2,
    };
    h.solids.push(s);
    return s;
  };
  const wall = (w, thick, d, px, py, pz, mat = stone) => {
    block(w, thick, d, px, py, pz, mat);
    return solid(px, py, pz, w, thick, d);
  };
  const deck = (px, pz, w, d, height, parent = root) => {
    block(w, 0.38, d, px, height - 0.19, pz, stone, parent);
    const value = {
      x: x + px,
      z: z + pz,
      w: w / 2,
      d: d / 2,
      y: y + height,
      hoist: true,
    };
    h.decks.push(value);
    return value;
  };
  const rail = (px, pz, w, d, height) => {
    wall(w, 0.12, d, px, height + 1.1, pz, bronze);
    const length = Math.max(w, d),
      horizontal = w > d;
    for (let i = 0; i <= Math.ceil(length / 2.4); i++) {
      const along = -length / 2 + (length * i) / Math.ceil(length / 2.4);
      block(
        0.12,
        1.1,
        0.12,
        px + (horizontal ? along : 0),
        height + 0.55,
        pz + (horizontal ? 0 : along),
        bronze,
        root,
        false,
      );
    }
  };
  const control = (kind, px, py, pz, props = {}, parent = root) => {
    block(0.4, 0.92, 0.4, px, py + 0.46, pz, bronze, parent, false);
    const handle = add(
      new THREE.CylinderGeometry(0.045, 0.045, 0.55, 10),
      iron,
      px,
      py + 1.05,
      pz,
      parent,
    );
    handle.rotation.z = -0.45;
    const sign = label(props.text || kind.toUpperCase());
    sign.position.set(px, py + 1.42, pz);
    block(1.5, 0.4, 0.09, px, py + 1.42, pz, iron, parent, false);
    parent.add(sign);
    const c = {
      kind,
      position: new THREE.Vector3(x + px, y + py, z + pz),
      handle,
      sign,
      ...props,
    };
    c.solid = solid(px, py + 0.46, pz, 0.4, 0.92, 0.4);
    h.controls.push(c);
    return c;
  };
  // Snow-backed retaining walls, an open southern face, and a sheltered entrance.
  deck(0, 0, 39, 51, HOIST_DECK);
  for (const side of [-1, 1]) {
    block(1.8, 0.18, 51, side * 20, 15.32, 0, snow);
    for (let course = 0; course < 12; course++)
      for (let bay = 0; bay < 8; bay++)
        block(
          1.25,
          1.25,
          6.1,
          side * 20,
          course * 1.27 + 0.625,
          -22 + bay * 6.2,
        );
    solid(side * 20, 7.6, 0, 1.25, 15.2, 51);
    for (const pz of [-20, -7, 6, 20]) {
      wall(2.2, 15.5, 2.2, side * 18.8, 7.75, pz);
      block(3.4, 0.7, 3.5, side * 18.8, 15.2, pz);
      const relief = add(
        carvedPanelGeometry(2.8, 4.1, serial++),
        stone,
        side * 19.25,
        7.2,
        pz,
      );
      relief.rotation.y = (-side * Math.PI) / 2;
    }
  }
  for (const side of [-1, 1]) wall(16.5, 8, 1.1, side * 11.75, 4, -26);
  wall(8, 0.8, 1.6, 0, 7.6, -26);
  for (const px of [-15, 0, 15]) {
    wall(1.6, 14.5, 1.6, px, 7.25, 24);
    block(5.2, 0.5, 1.9, px, 14.5, 24);
    block(5.2, 0.35, 2.1, px, 14.9, 24, snow);
  }
  // A broken middle gallery joins the two lift shafts around the south wall.
  const mid = HOIST_DECK + HOIST_RISE,
    upper = HOIST_DECK + 2 * HOIST_RISE;
  deck(-12, -9, 6.2, 4.6, mid);
  deck(-13, 3, 4.2, 23, mid);
  deck(-8, 15, 14, 4.2, mid);
  deck(8, 15, 14, 4.2, mid); // two-metre jump gap
  deck(13, 11, 4.2, 8, mid);
  deck(11, 9, 4.2, 4.6, mid);
  rail(-15, 3, 0.12, 23, mid);
  rail(-8, 17.05, 14, 0.12, mid);
  rail(8, 17.05, 14, 0.12, mid);
  rail(15, 11, 0.12, 8, mid);
  // Upper east bell walk and the western archive each overlook the lift floor.
  deck(12, 9, 6.2, 4.6, upper);
  deck(13, -1, 4.2, 20, upper);
  deck(12, -14, 6.2, 8, upper);
  deck(-12, -9, 6.2, 4.6, upper);
  deck(-13, -13, 4.2, 8, upper);
  deck(-12, -14.8, 6.2, 3, upper);
  deck(-12, -21, 10, 8, upper);
  rail(15, -1, 0.12, 20, upper);
  rail(-15, -13, 0.12, 8, upper);
  for (const px of [-17, -7]) wall(0.75, 4.4, 8.5, px, upper + 2.2, -21);
  wall(10.5, 4.4, 0.75, -12, upper + 2.2, -25);
  for (const px of [-15.7, -8.3]) wall(2.5, 4.4, 0.75, px, upper + 2.2, -17);
  wall(5, 1, 0.8, -12, upper + 3.9, -17);
  block(11, 0.65, 9.1, -12, upper + 4.7, -21);
  block(11.2, 0.2, 9.3, -12, upper + 5.12, -21, snow);
  // Brackets carry each gallery from the retaining walls. Their lower ends
  // leave headroom for the path beneath them.
  const beamBetween = (a, b, width, depth, mat = wood) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.clone().sub(start),
      center = start.clone().add(end).multiplyScalar(0.5);
    const beam = block(
      width,
      delta.length(),
      depth,
      center.x,
      center.y,
      center.z,
      mat,
      root,
      false,
    );
    beam.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    game.cameraSurfaces?.capture(beam);
  };
  for (const [side, height, zs] of [
    [-1, mid, [-9, 3, 15]],
    [1, mid, [9, 15]],
    [-1, upper, [-9, -15]],
    [1, upper, [-15, -3, 9]],
  ])
    for (const pz of zs) {
      beamBetween(
        [side * 19, height - 3, pz],
        [side * 13, height - 0.45, pz],
        0.4,
        0.45,
      );
      block(7, 0.45, 0.65, side * 16, height - 0.55, pz, wood);
    }
  beamBetween([-7, 15.65, -9], [7, 15.65, 9], 0.5, 0.55);
  const cablePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-7, 14.8, -9),
    new THREE.Vector3(-4, 15.1, -9),
    new THREE.Vector3(4, 15.1, 9),
    new THREE.Vector3(7, 14.8, 9),
  ]);
  add(new THREE.TubeGeometry(cablePath, 40, 0.035, 7, false), iron, 0, 0, 0);
  // The archive door and east-to-west crossing both respond to the repaired bell.
  h.gate = new THREE.Group();
  h.gate.userData.cameraDynamic = true;
  root.add(h.gate);
  for (let i = 0; i < 7; i++)
    block(0.13, 3.6, 0.16, -13.7 + i * 0.57, upper + 1.8, -17, bronze, h.gate);
  h.gateSolid = solid(-12, upper + 1.8, -17, 4, 3.6, 0.25);
  h.bridge = new THREE.Group();
  h.bridge.position.set(9, upper, -14.8);
  h.bridge.userData.cameraDynamic = true;
  root.add(h.bridge);
  h.bridgeWest = new THREE.Group();
  h.bridgeWest.position.set(-9, upper, -14.8);
  h.bridgeWest.userData.cameraDynamic = true;
  root.add(h.bridgeWest);
  block(9, 0.35, 2.6, -4.5, -0.18, 0, wood, h.bridge);
  block(9, 0.35, 2.6, 4.5, -0.18, 0, wood, h.bridgeWest);
  for (const edge of [-1, 1])
    for (const [leaf, side] of [
      [h.bridge, -1],
      [h.bridgeWest, 1],
    ])
      block(9, 0.15, 0.15, side * 4.5, -0.1, edge * 1.16, bronze, leaf);
  h.bridgeDeck = {
    x,
    z: z - 14.8,
    w: 9,
    d: 1.3,
    y: y + upper,
    enabled: saved.bell,
  };
  h.decks.push(h.bridgeDeck);
  h.bridgeSolid = solid(8.7, upper + 2, -14.8, 0.5, 4, 3.1); // closed bridge blocks its east landing
  h.bridgeWestSolid = solid(-8.7, upper + 2, -14.8, 0.5, 4, 3.1);
  // Linked cargo platforms hang from fixed overhead sheaves and guides.
  for (const [i, [px, pz]] of HOIST_CARS.entries()) {
    const car = new THREE.Group();
    car.position.set(px, hoistHeight(saved.stop, i), pz);
    car.userData.cameraDynamic = true;
    root.add(car);
    const surface = deck(0, 0, 3.8, 4.4, 0, car);
    Object.assign(surface, {
      x: x + px,
      z: z + pz,
      y: y + car.position.y,
      car: i,
    });
    for (const side of [-1, 1]) {
      block(0.16, 15, 0.22, px + side * 2.05, 7.5, pz, iron);
      solid(px + side * 2.05, 7.5, pz, 0.16, 15, 0.22);
      block(0.14, 2.65, 0.14, side * 1.72, 1.325, 0, iron, car);
      block(0.32, 0.45, 0.32, side * 1.72, 0.5, 0, bronze, car, false);
    }
    block(4.8, 0.6, 1.4, px, 15.2, pz);
    block(3.7, 0.18, 0.25, 0, 2.65, 0, bronze, car);
    const sheave = add(
      new THREE.TorusGeometry(0.58, 0.11, 10, 32),
      bronze,
      px,
      14.8,
      pz,
    );
    sheave.rotation.y = Math.PI / 2;
    const cable = add(
      new THREE.CylinderGeometry(0.028, 0.028, 1, 7),
      iron,
      px,
      8,
      pz,
    );
    const actuator = control(
      "ride",
      0,
      0,
      1.55,
      { car: i, text: i ? "EAST LIFT" : "WEST LIFT" },
      car,
    );
    const source = {
      id: `refuge-hoist-${i}`,
      kind: "hoist",
      x: x + px,
      y: y + 14.8,
      z: z + pz,
      gain: 0.075,
      near: 2,
      range: 24,
      activity: 0,
    };
    h.sources.push(source);
    h.cars.push({ root: car, deck: surface, actuator, sheave, cable, source });
    for (const [floor, height] of [HOIST_DECK, mid, upper].entries()) {
      const sx = px + (i ? 3.8 : -3.8),
        sz = pz - 1.65;
      control("call", sx, height, sz, {
        car: i,
        stop: i ? 2 - floor : floor,
        text: ["GROUND", "MIDDLE", "UPPER"][floor],
      });
    }
  }
  h.tablet = control("guide", -3, HOIST_DECK, -23, { text: "THE BELLKEEPERS" });
  h.clapper = add(
    new THREE.CylinderGeometry(0.13, 0.2, 0.48, 12),
    bronze,
    -12,
    mid + 0.85,
    14.2,
  );
  h.clapper.rotation.z = Math.PI / 2;
  block(1.1, 0.7, 0.8, -12, mid + 0.35, 14.2);
  solid(-12, mid + 0.35, 14.2, 1.1, 0.7, 0.8);
  h.controls.push({
    kind: "clapper",
    position: new THREE.Vector3(x - 12, y + mid, z + 14.2),
  });
  h.bell = new THREE.Group();
  h.bell.position.set(12, upper + 4.8, -13);
  root.add(h.bell);
  add(bellGeometry(), bronze, 0, 0, 0, h.bell);
  h.bell.scale.setScalar(1.4);
  for (const side of [-1, 1])
    wall(0.38, 5.5, 0.48, 12 + side * 1.4, upper + 2.75, -13, wood);
  block(3.6, 0.45, 0.65, 12, upper + 5.5, -13, wood);
  h.tongue = add(
    new THREE.CylinderGeometry(0.04, 0.12, 1.05, 10),
    bronze,
    0,
    -1.15,
    0,
    h.bell,
  );
  const pull = new THREE.LineCurve3(
    new THREE.Vector3(12, upper + 3, -13),
    new THREE.Vector3(12, upper + 1, -11.4),
  );
  add(new THREE.TubeGeometry(pull, 1, 0.025, 7, false), wood, 0, 0, 0);
  h.controls.push({
    kind: "bell",
    position: new THREE.Vector3(x + 12, y + upper, z - 11.4),
  });
  block(1.8, 0.9, 1.2, -12, upper + 0.45, -22);
  solid(-12, upper + 0.45, -22, 1.8, 0.9, 1.2);
  h.record = block(1.1, 0.08, 0.7, -12, upper + 0.98, -22, bronze, root, false);
  h.controls.push({
    kind: "record",
    position: new THREE.Vector3(x - 12, y + upper, z - 21),
  });
  const banner = add(
    new THREE.PlaneGeometry(1.5, 3, 8, 14),
    new THREE.MeshStandardMaterial({
      color: 0x826859,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
    18,
    12,
    20,
  );
  banner.userData.animated = true;
  h.banner = banner;
  h.bannerBase = banner.geometry.attributes.position.array.slice();
  h.sources.push({
    id: "refuge-wind",
    kind: "wind",
    x: x + 18,
    y: y + 12,
    z: z + 20,
    gain: 0.13,
    near: 3,
    range: 30,
    activity: 0.5,
  });
  for (const car of h.cars) {
    car.sheave.userData.animated = true;
    car.cable.userData.animated = true;
  }
  h.clapper.userData.animated = true;
  h.record.userData.animated = true;
  mergeArchitecture(root);
  updateBellHoist(game, 0, true);
}

export function updateBellHoist(game, dt, initial = false) {
  const h = game.bellHoist;
  if (!h) return;
  if (game.paused && !initial) dt = 0;
  let completed = false;
  const m = h.motion;
  if (m) {
    m.time += dt;
    const t = Math.min(1, m.time / m.duration),
      ease = t * t * (3 - 2 * t);
    completed = t >= 1;
    h.cars.forEach((car, i) => {
      const previous = car.deck.y,
        local = THREE.MathUtils.lerp(m.from[i], hoistHeight(m.stop, i), ease);
      const p = game.player?.position,
        rider =
          game.grounded &&
          !game.climb &&
          p &&
          Math.abs(p.y - previous) < 0.24 &&
          Math.abs(p.x - car.deck.x) < car.deck.w &&
          Math.abs(p.z - car.deck.z) < car.deck.d;
      car.root.position.y = local;
      car.deck.y = h.y + local;
      if (rider) {
        p.y += car.deck.y - previous;
        game.jumpY = Math.max(0, p.y - game.groundHeight(p.x, p.z));
        game.fallPeak = p.y;
      }
    });
    if (completed) {
      h.saved.stop = m.stop;
      h.motion = null;
      game.save();
    }
  }
  for (const [i, car] of h.cars.entries()) {
    const py = car.root.position.y;
    car.actuator.position.set(car.deck.x, h.y + py, car.deck.z + 1.55);
    Object.assign(car.actuator.solid, {
      x: car.deck.x,
      z: car.deck.z + 1.55,
      bottom: h.y + py,
      top: h.y + py + 0.92,
    });
    car.actuator.handle.rotation.z = h.motion ? 0.45 : -0.45;
    const length = Math.max(0.1, 14.8 - py - 2.65);
    car.cable.position.y = py + 2.65 + length / 2;
    car.cable.scale.y = length;
    car.sheave.rotation.x = ((i ? -1 : 1) * py) / 0.58;
    car.source.activity = h.motion && !game.paused ? 1 : 0;
  }
  h.clapper.visible = !h.saved.clapper;
  h.tongue.visible = h.saved.bell;
  h.record.visible = !h.saved.recovered;
  const target = h.saved.bell ? 1 : 0;
  h.open = initial ? target : Math.min(target, h.open + dt * 0.45);
  h.bridge.rotation.z = -(1 - h.open) * Math.PI * 0.49;
  h.bridgeWest.rotation.z = -h.bridge.rotation.z;
  h.bridgeDeck.enabled = h.open > 0.995;
  h.bridgeSolid.enabled = h.open <= 0.995;
  h.bridgeWestSolid.enabled = h.open <= 0.995;
  h.gate.position.y = h.open * 4.2;
  h.gateSolid.enabled = h.open < 0.98;
  if (h.ringTime > 0) {
    h.ringTime = Math.max(0, h.ringTime - dt);
    h.bell.rotation.z =
      (Math.sin((6 - h.ringTime) * 5) * 0.14 * h.ringTime) / 6;
  }
  const positions = h.banner.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const px = h.bannerBase[i * 3],
      py = h.bannerBase[i * 3 + 1];
    positions.setZ(
      i,
      (Math.sin((game.elapsed || 0) * 1.7 + px * 2 + py) * 0.17 * (1.5 - py)) /
        3,
    );
  }
  positions.needsUpdate = true;
  if (!initial && insideBellHoist(game) && !h.saved.visited) {
    h.saved.visited = true;
    game.save();
    game.cb.toast?.(
      "Optional tomb · The bellkeepers’ hoist. Read the entrance tablet.",
      6500,
    );
  }
}
export function startHoist(game, stop) {
  const h = game.bellHoist;
  if (
    !h ||
    !Number.isInteger(stop) ||
    stop < 0 ||
    stop > 2 ||
    game.paused ||
    h.motion ||
    stop === h.saved.stop ||
    game.climb ||
    game.dodge ||
    game.ropeRide ||
    game.zipRide
  )
    return false;
  h.motion = {
    stop,
    from: h.cars.map((c) => c.root.position.y),
    time: 0,
    duration: Math.max(2, (Math.abs(stop - h.saved.stop) * HOIST_RISE) / 2.2),
  };
  return true;
}
export function bellHoistControl(game) {
  const h = game.bellHoist,
    p = game.player?.position;
  if (!h || !p || !game.grounded || game.swimming) return null;
  let nearest = null,
    distance = 1.6;
  for (const c of h.controls) {
    if (
      (c.kind === "clapper" && h.saved.clapper) ||
      (c.kind === "record" && h.saved.recovered)
    )
      continue;
    const d = p.distanceTo(c.position);
    if (d >= distance) continue;
    if (game.lineOfSight && !game.lineOfSight(p, c.position)) continue;
    nearest = c;
    distance = d;
  }
  return nearest;
}
export function bellHoistHint(game) {
  const c = bellHoistControl(game),
    h = game.bellHoist;
  if (!c) return null;
  if (h.motion && ["ride", "call"].includes(c.kind))
    return { key: "E", label: "The paired lifts are moving" };
  const floor =
    c.kind === "ride"
      ? (Math.round((h.cars[c.car].root.position.y - HOIST_DECK) / HOIST_RISE) +
          1) %
        3
      : null;
  return {
    key: "E",
    label:
      c.kind === "ride"
        ? `${floor === 0 ? "Lower" : "Raise"} to the ${["ground", "middle gallery", "upper gallery"][floor]}`
        : c.kind === "call"
          ? `Call ${c.car ? "east" : "west"} lift · ${c.text.toLowerCase()}`
          : c.kind === "guide"
            ? "Read the bellkeepers’ tablet"
            : c.kind === "clapper"
              ? "Recover the bronze bell tongue"
              : c.kind === "bell"
                ? h.saved.bell
                  ? "Ring the refuge bell"
                  : h.saved.clapper
                    ? "Fit the tongue and ring the bell"
                    : "The bell is missing its bronze tongue"
                : h.saved.bell
                  ? "Read the refuge register"
                  : "The refuge bell must sound first",
  };
}
export function bellHoistInteract(game) {
  const c = bellHoistControl(game),
    h = game.bellHoist;
  if (!c || game.paused) return false;
  if (c.kind === "guide") {
    game.cb.bellHoist?.();
    return true;
  }
  if (c.kind === "call") startHoist(game, c.stop);
  if (c.kind === "ride") {
    const floor =
      (Math.round((h.cars[c.car].root.position.y - HOIST_DECK) / HOIST_RISE) +
        1) %
      3;
    startHoist(game, c.car ? 2 - floor : floor);
  }
  if (c.kind === "clapper") {
    h.saved.clapper = true;
    game.audio.tone("collect");
    game.cb.toast?.(
      "Bronze tongue recovered · carry it in your pack to the upper east bell.",
      6000,
    );
    game.save();
  }
  if (c.kind === "bell") {
    if (!h.saved.clapper) {
      game.cb.toast?.("The bronze tongue rests in the broken middle gallery.");
      return true;
    }
    h.saved.bell = true;
    h.ringTime = 6;
    game.audio.bell?.(220, h.bell.getWorldPosition(new THREE.Vector3()));
    game.save();
    game.cb.toast?.(
      "The refuge bell answers · the upper crossing is opening.",
      5500,
    );
  }
  if (c.kind === "record" && h.saved.bell) {
    h.saved.recovered = true;
    game.save();
    game.cb.bellHoistRecord?.(HOIST_RECORD);
  }
  updateBellHoist(game, 0);
  return true;
}
export function bellHoistObjective(game) {
  if (!insideBellHoist(game)) return null;
  const s = game.bellHoist.saved;
  return {
    step: Number(s.clapper) + Number(s.bell) + Number(s.recovered),
    text: s.recovered
      ? "Return from the bellkeepers’ refuge"
      : s.bell
        ? "Cross the upper gallery and read the refuge register"
        : s.clapper
          ? "Reach the upper east bell and fit its bronze tongue"
          : "Find the bronze tongue in the middle gallery",
  };
}
