import * as THREE from "three";
import {
  PRESSURE_DECKS,
  PRESSURE_PISTONS,
  normalizePressure,
  pistonHeight,
  insidePressure,
  pressureAnchor,
} from "./pressure-rules.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { campTube } from "./camp-geometry.js";
import { mergeArchitecture } from "./visuals.js";
import { forgePlume } from "./forge-effects.js";
import {
  pressureMaterials,
  pressureSlagMaterial,
} from "./pressure-materials.js";
import { buildPressureArt, updatePressureArt } from "./pressure-art.js";

function sign(text, width = 1.8) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const c = canvas.getContext("2d");
  c.fillStyle = "#dbbd88";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = "600 36px Georgia";
  c.fillText(text, 256, 64, 492);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
      roughness: 1,
    }),
  );
}

export function buildPressureRelay(game) {
  game.pressureRelay = null;
  const site = game.map.pressureRelay;
  if (!site) return;
  const x = site.x * 7,
    z = site.z * 7,
    y = game.groundHeight(x, z),
    root = new THREE.Group();
  root.position.set(x, y, z);
  root.name = "The Cinder Relay";
  game.world.add(root);
  const saved = normalizePressure(game.progress.pressureRelay);
  game.progress.pressureRelay = saved;
  const h = (game.pressureRelay = {
    root,
    x,
    y,
    z,
    saved,
    anchor: saved.rest,
    time: [0, 0, 0],
    visualTime: { value: 0 },
    decks: [],
    rests: [],
    pistons: [],
    solids: [],
    controls: [],
    sources: [],
    motion: null,
  });
  const materials = pressureMaterials(game),
    { stone, metal, bronze } = materials;
  h.walls = [];
  h.piers = [];
  let serial = 9000;
  const add = (
    geometry,
    material,
    px,
    py,
    pz,
    parent = root,
    camera = false,
  ) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(px, py, pz);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    if (camera) game.cameraSurfaces?.capture(m);
    return m;
  };
  const box = (
    w,
    t,
    d,
    px,
    py,
    pz,
    mat = stone,
    parent = root,
    camera = true,
  ) =>
    add(
      mat === stone
        ? stoneBlockGeometry(w, t, d, serial++)
        : new THREE.BoxGeometry(w, t, d),
      mat,
      px,
      py,
      pz,
      parent,
      camera,
    );
  const solid = (px, py, pz, w, t, d) => {
    const o = {
      x: x + px,
      z: z + pz,
      w: w / 2,
      d: d / 2,
      bottom: y + py - t / 2,
      top: y + py + t / 2,
    };
    h.solids.push(o);
    return o;
  };
  const wall = (w, t, d, px, py, pz, mat = stone) => {
    const mesh = box(w, t, d, px, py, pz, mat);
    (t > 20 ? h.piers : h.walls).push({ mesh, w, t, d, x: px, y: py, z: pz });
    solid(px, py, pz, w, t, d);
  };
  const deck = (px, pz, w, d, py, parent = root, local = false) => {
    const mesh = box(
      w,
      0.35,
      d,
      local ? 0 : px,
      local ? -0.175 : py - 0.175,
      local ? 0 : pz,
      metal,
      parent,
    );
    const v = {
      x: x + px,
      z: z + pz,
      w: w / 2,
      d: d / 2,
      y: y + py,
      pressure: true,
      mesh,
    };
    h.decks.push(v);
    return v;
  };
  // An open-framed foundry rises above the hot settling floor. The eastern aisle
  // leads back to the intake door without crossing a live piston bed.
  h.floorMesh = box(44, 0.4, 46, 0, -0.25, 0);
  const hot = pressureSlagMaterial();
  const slag = add(new THREE.PlaneGeometry(28, 34), hot, -3, 0.025, -5);
  slag.rotation.x = -Math.PI / 2;
  wall(1.4, 5, 46, -22, 2.4, 0);
  wall(44, 5, 1.4, 0, 2.4, -23);
  wall(1.4, 5, 29, 22, 2.4, -9.5);
  wall(1.4, 5, 9, 22, 2.4, 19.5);
  wall(44, 5, 1.4, 0, 2.4, 23);
  wall(1.4, 2.2, 10, 22, 6, 10);
  for (const px of [-21, 21])
    for (const pz of [-21, -7, 7, 21]) {
      wall(1.4, 27, 1.4, px, 13.3, pz);
      box(2.1, 0.6, 2.1, px, 26.8, pz, bronze);
    }
  box(44, 1.1, 1.7, 0, 27.7, -21);
  box(44, 1.1, 1.7, 0, 27.7, 21);
  for (const px of [-21, 21]) box(1.7, 1.1, 44, px, 27.7, 0);
  for (const [i, d] of PRESSURE_DECKS.entries()) {
    const v = deck(d.x, d.z, d.w * 2, d.d * 2, d.y);
    v.rest = i;
    h.rests.push(v);
    if (i) {
      box(1.2, d.y - 0.2, 1.2, d.x, d.y / 2 - 0.2, d.z);
      solid(d.x, d.y / 2 - 0.2, d.z, 1.2, d.y - 0.2, 1.2);
      for (const side of [-1, 1]) {
        const strut = box(
          0.23,
          Math.hypot(d.w - 1, 3),
          0.23,
          d.x + (side * (d.w - 1)) / 2,
          d.y - 1.7,
          d.z,
          bronze,
          root,
          false,
        );
        strut.rotation.z = -side * Math.atan2(d.w - 1, 3);
      }
    }
    for (const edge of [-1, 1])
      box(
        d.w * 2,
        0.03,
        0.08,
        d.x,
        d.y + 0.015,
        d.z + edge * (d.d - 0.06),
        bronze,
        root,
        false,
      );
    const control = {
      kind: i < 3 ? "valve" : "record",
      bank: i,
      position: new THREE.Vector3(x + d.x + 1, y + d.y, z + d.z),
      turn: 0,
    };
    box(0.7, 0.6, 0.65, d.x + 1, d.y + 0.3, d.z - 1.15);
    solid(d.x + 1, d.y + 0.3, d.z - 1.15, 0.7, 0.6, 0.65);
    if (i < 3) {
      const wheel = new THREE.Group();
      wheel.position.set(d.x + 1, d.y + 1, d.z - 1.15);
      root.add(wheel);
      add(new THREE.TorusGeometry(0.37, 0.045, 8, 24), bronze, 0, 0, 0, wheel);
      control.wheel = wheel;
      wheel.userData.animated = true;
      for (let a = 0; a < 4; a++) {
        const spoke = box(0.035, 0.65, 0.035, 0, 0, 0, bronze, wheel, false);
        spoke.rotation.z = (a * Math.PI) / 4;
      }
    } else {
      const leaves = new THREE.MeshStandardMaterial({
        color: 0xc4af85,
        roughness: 0.95,
      });
      // An open metal-bound ledger rests on the dispatch console. Its modeled
      // leaves and ruled entries identify the record from the gallery approach.
      for (const side of [-1, 1]) {
        const leaf = new THREE.Group();
        leaf.position.set(d.x + 1 + side * 0.19, d.y + 0.67, d.z - 1.15);
        leaf.rotation.z = side * 0.13;
        root.add(leaf);
        box(0.39, 0.025, 0.57, 0, -0.035, 0, bronze, leaf, false);
        box(0.35, 0.045, 0.53, 0, 0, 0, leaves, leaf, false);
        for (let line = 0; line < 7; line++)
          box(
            0.22 + (line % 3) * 0.015,
            0.002,
            0.009,
            0,
            0.024,
            -0.19 + line * 0.06,
            metal,
            leaf,
            false,
          );
      }
    }
    const plaque = sign(i < 3 ? `CIRCUIT ${i + 1}` : "DISPATCH");
    plaque.position.set(d.x + 1, d.y + 1.65, d.z - 1.15);
    root.add(plaque);
    h.controls.push(control);
    const lampX = d.x - 1.8,
      lampZ = d.z - d.d + 0.7;
    box(0.28, 1.5, 0.28, lampX, d.y + 0.75, lampZ, bronze, root, false);
    add(
      new THREE.CylinderGeometry(0.3, 0.12, 0.25, 12),
      bronze,
      lampX,
      d.y + 1.6,
      lampZ,
    );
    const flame = add(
      new THREE.ConeGeometry(0.12, 0.5, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb66c, toneMapped: false }),
      lampX,
      d.y + 2,
      lampZ,
    );
    flame.userData.animated = true;
    game.flames?.push(flame);
  }
  for (const [i, p] of PRESSURE_PISTONS.entries()) {
    const crown = new THREE.Group();
    crown.position.set(p.x, p.low, p.z);
    crown.userData.animated = true;
    crown.userData.cameraDynamic = true;
    root.add(crown);
    const d = deck(p.x, p.z, 4.2, 4.2, p.low, crown, true);
    d.piston = i;
    for (const e of [-1, 1]) {
      box(4.05, 0.035, 0.09, 0, 0.017, e * 1.98, bronze, crown, false);
      box(0.09, 0.035, 4.05, e * 1.98, 0.017, 0, bronze, crown, false);
    }
    for (let j = -3; j <= 3; j++)
      box(3.9, 0.025, 0.045, 0, 0.012, j * 0.48, bronze, crown, false);
    const collar = add(
      new THREE.CylinderGeometry(1.55, 1.55, 0.42, 32),
      metal,
      0,
      -0.55,
      0,
      crown,
    );
    game.cameraSurfaces?.capture(collar);
    const shaft = new THREE.Group();
    shaft.position.set(p.x, 0, p.z);
    shaft.userData.cameraDynamic = shaft.userData.animated = true;
    root.add(shaft);
    add(
      new THREE.CylinderGeometry(1.1, 1.1, 1, 24),
      bronze,
      0,
      0.5,
      0,
      shaft,
      true,
    );
    const base = add(
      new THREE.CylinderGeometry(1.45, 1.65, 0.35, 24),
      metal,
      p.x,
      0.18,
      p.z,
    );
    const column = solid(p.x, p.low / 2, p.z, 2.2, p.low, 2.2);
    const port = add(
      new THREE.TorusGeometry(0.22, 0.07, 6, 16),
      bronze,
      p.x + 1.6,
      0.6,
      p.z,
    );
    port.rotation.y = Math.PI / 2;
    const source = {
      id: `relay-piston-${i}`,
      kind: "steam",
      x: x + p.x + 1.6,
      y: y + 0.6,
      z: z + p.z,
      near: 2,
      range: 23,
      gain: 0.12,
      activity: 0,
    };
    const drive = {
      id: `relay-drive-${i}`,
      kind: "hoist",
      x: x + p.x,
      y: y + p.low - 0.5,
      z: z + p.z,
      near: 2,
      range: 25,
      gain: 0.065,
      activity: 0,
    };
    h.sources.push(source, drive);
    const amount = { value: 0 },
      plume = forgePlume(h.visualTime, amount, true, 701 + i);
    plume.position.set(p.x + 1.6, 0.6, p.z);
    plume.scale.setScalar(0.6);
    root.add(plume);
    h.pistons.push({
      root: crown,
      deck: d,
      shaft,
      column,
      source,
      drive,
      amount,
      plume,
      base,
      collar,
    });
    const bank = PRESSURE_DECKS[p.bank];
    add(
      campTube(
        [
          [p.x + 1.6, 0.45, p.z],
          [p.x + 2, 0.45, p.z + 2],
          [bank.x + 2, 0.45, p.z + 2],
          [bank.x + 2, 0.45, bank.z],
        ],
        0.095,
        16,
      ),
      bronze,
      0,
      0,
      0,
    );
  }
  const liftRoot = new THREE.Group();
  liftRoot.position.set(16, saved.lift ? 24.2 : 0.18, -8);
  liftRoot.userData.animated = liftRoot.userData.cameraDynamic = true;
  root.add(liftRoot);
  h.lift = {
    root: liftRoot,
    deck: deck(16, -8, 4.2, 4.2, liftRoot.position.y, liftRoot, true),
  };
  box(4.2, 0.05, 0.1, 0, 0.03, -2, bronze, liftRoot, false);
  const liftControl = {
    kind: "lift",
    position: new THREE.Vector3(x + 16, y + liftRoot.position.y, z - 8),
  };
  h.controls.push(liftControl);
  h.lift.control = liftControl;
  const bar = add(
    new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8),
    bronze,
    1.2,
    0.9,
    1.4,
    liftRoot,
  );
  bar.rotation.z = 0.4;
  const liftSign = sign("RETURN", 1.2);
  liftSign.position.set(0, 1.3, 1.8);
  liftRoot.add(liftSign);
  for (const px of [13.5, 18.5]) {
    box(0.24, 26, 0.24, px, 13, -8, metal);
    solid(px, 13, -8, 0.24, 26, 0.24);
  }
  h.lift.source = {
    id: "relay-return",
    kind: "hoist",
    x: x + 16,
    y: y + 24,
    z: z - 8,
    near: 2,
    range: 28,
    gain: 0.06,
    activity: 0,
  };
  h.sources.push(h.lift.source);
  for (const [stop, px, py, pz] of [
    [1, 16, 24.2, -14],
    [0, 19, 0.18, -6.5],
  ]) {
    h.controls.push({
      kind: "call",
      stop,
      position: new THREE.Vector3(x + px, y + py, z + pz),
    });
    const plaque = sign("CALL LIFT", 1.2);
    plaque.position.set(px, py + 0.03, pz);
    plaque.rotation.x = -Math.PI / 2;
    root.add(plaque);
  }
  h.sources.push({
    id: "relay-slag",
    kind: "lava",
    x: x - 3,
    y: y + 0.2,
    z: z - 5,
    gain: 0.1,
    near: 3,
    range: 32,
    activity: 0.5,
  });
  const tablet = sign("THE CINDER RELAY", 3.6);
  tablet.position.set(20, 2, 10);
  tablet.rotation.y = Math.PI / 2;
  root.add(tablet);
  h.entrySign = tablet;
  h.controls.push({
    kind: "guide",
    position: new THREE.Vector3(x + 20, y + 0.18, z + 10),
  });
  buildPressureArt(game, { add, box, solid, sign, materials });
  mergeArchitecture(root);
  updatePressureRelay(game, 0, true);
}

export function updatePressureRelay(game, dt, initial = false) {
  const h = game.pressureRelay;
  if (!h) return;
  if (game.paused && !initial) dt = 0;
  h.visualTime.value += dt;
  for (let i = 0; i < 3; i++) if (h.saved.opened > i) h.time[i] += dt;
  const move = (car, next) => {
    const before = car.deck.y,
      p = game.player?.position;
    const rider =
      !initial &&
      game.grounded &&
      !game.climb &&
      p &&
      Math.abs(p.y - before) < 0.24 &&
      Math.abs(p.x - car.deck.x) < car.deck.w &&
      Math.abs(p.z - car.deck.z) < car.deck.d;
    car.root.position.y = next;
    car.deck.y = h.y + next;
    if (rider) {
      p.y += car.deck.y - before;
      game.jumpY = Math.max(0, p.y - game.groundHeight(p.x, p.z));
      game.fallPeak = p.y;
    }
    return dt > 0 ? Math.abs(car.deck.y - before) / dt : 0;
  };
  for (const [i, car] of h.pistons.entries()) {
    const height = pistonHeight(
        i,
        h.time[PRESSURE_PISTONS[i].bank],
        h.saved.opened,
      ),
      speed = move(car, height);
    car.shaft.scale.y = Math.max(0.05, height - 0.6);
    car.column.top = h.y + Math.max(0.05, height - 0.35);
    car.drive.y = car.deck.y - 0.5;
    car.source.activity = car.drive.activity = game.paused
      ? 0
      : Math.min(1, speed * 0.6);
    if (dt > 0 || initial) car.amount.value = Math.min(1, speed * 0.6);
  }
  if (h.motion) {
    const m = h.motion;
    m.time += dt;
    const t = Math.min(1, m.time / 8),
      ease = t * t * (3 - 2 * t);
    move(h.lift, m.from + (m.to - m.from) * ease);
    if (t === 1) {
      h.saved.lift = m.to > 1 ? 1 : 0;
      h.motion = null;
      game.save();
    }
  }
  h.lift.control.position.y = h.lift.deck.y;
  h.lift.source.y = h.lift.deck.y;
  h.lift.source.activity = h.motion && !game.paused ? 1 : 0;
  for (const c of h.controls)
    if (c.wheel) {
      const target =
        c.kind === "record"
          ? Number(h.saved.recovered)
          : Number(h.saved.opened > c.bank);
      c.turn = initial ? target : Math.min(target, c.turn + dt * 0.65);
      c.wheel.rotation.z = (c.turn * Math.PI) / 2;
    }
  updatePressureArt(h);
  if (initial || game.paused || !insidePressure(game)) return;
  if (!h.saved.visited) {
    h.saved.visited = true;
    game.save();
    game.cb.toast?.(
      "Optional tomb · The Cinder Relay. Read the intake tablet.",
      6500,
    );
  }
  const p = game.player.position;
  if (game.grounded)
    for (const [i, d] of h.rests.entries())
      if (
        Math.abs(p.y - d.y) < 0.25 &&
        Math.abs(p.x - d.x) < d.w &&
        Math.abs(p.z - d.z) < d.d
      ) {
        h.anchor = i;
        if (i > h.saved.rest) {
          h.saved.rest = i;
          game.save();
          game.cb.toast?.(
            `${PRESSURE_DECKS[i].name} · Safe gallery recorded`,
            3500,
          );
        }
      }
  if (
    p.y < h.y + 0.1 &&
    p.x < h.x + 11 &&
    p.x > h.x - 17 &&
    p.z < h.z + 12 &&
    p.z > h.z - 22
  ) {
    const anchor = pressureAnchor(h);
    p.set(anchor.x, anchor.y, anchor.z);
    game.grounded = true;
    game.velocityY = 0;
    game.jumpY = anchor.y - game.groundHeight(anchor.x, anchor.z);
    game.fallPeak = anchor.y;
    if (game.moveVelocity) {
      game.moveVelocity.x = 0;
      game.moveVelocity.z = 0;
    }
    game.damage?.(12);
    game.save();
    game.cb.toast?.(
      "The settling floor is too hot. You recover at the last safe gallery.",
      4000,
    );
  }
}

export function pressureControl(game) {
  const h = game.pressureRelay,
    p = game.player?.position;
  if (!h || !p || !game.grounded || game.climb || game.dodge || game.swimming)
    return null;
  let found = null,
    best = 1.7;
  for (const c of h.controls) {
    const d = p.distanceTo(c.position);
    if (d < best && (!game.lineOfSight || game.lineOfSight(p, c.position))) {
      found = c;
      best = d;
    }
  }
  return found;
}
export function pressureHint(game) {
  const c = pressureControl(game),
    h = game.pressureRelay;
  if (!c) return null;
  return {
    key: "E",
    label:
      c.kind === "guide"
        ? "Read the pressure crews’ tablet"
        : c.kind === "valve"
          ? h.saved.opened > c.bank
            ? "Pressure circuit is running"
            : h.saved.opened === c.bank
              ? `Open pressure circuit ${c.bank + 1}`
              : "Open the earlier pressure circuit first"
          : c.kind === "record"
            ? h.saved.recovered
              ? "Read the dispatch ledger"
              : "Recover the dispatch ledger and release the return lift"
            : c.kind === "call"
              ? h.saved.recovered
                ? `Call return lift to the ${c.stop ? "dispatch gallery" : "intake floor"}`
                : "Release the lift from the dispatch gallery"
              : !h.saved.recovered
                ? "Release the return lift from the dispatch gallery"
                : h.motion
                  ? "The return lift is moving"
                  : h.saved.lift
                    ? "Lower the return lift"
                    : "Raise the return lift",
  };
}
export function pressureInteract(game) {
  const c = pressureControl(game),
    h = game.pressureRelay;
  if (!c || game.paused) return false;
  if (c.kind === "guide") game.cb.pressureGuide?.();
  else if (c.kind === "valve" && h.saved.opened === c.bank) {
    h.saved.opened++;
    h.time[c.bank] = 0;
    game.audio.tone("solve");
    game.save();
    game.cb.toast?.(
      "Watch the crowns. Cross when the neighboring platforms meet.",
      4500,
    );
  } else if (c.kind === "record" && h.saved.rest === 3) {
    h.saved.recovered = true;
    game.audio.tone("collect");
    game.save();
    game.cb.pressureRecord?.();
  } else if (
    c.kind === "call" &&
    h.saved.recovered &&
    !h.motion &&
    c.stop !== h.saved.lift
  )
    h.motion = {
      time: 0,
      from: h.lift.root.position.y,
      to: c.stop ? 24.2 : 0.18,
    };
  else if (c.kind === "lift" && h.saved.recovered && !h.motion)
    h.motion = {
      time: 0,
      from: h.lift.root.position.y,
      to: h.saved.lift ? 0.18 : 24.2,
    };
  return true;
}
export function pressureObjective(game) {
  if (!insidePressure(game)) return null;
  const s = game.pressureRelay.saved;
  return {
    step: s.recovered ? 4 : s.rest,
    text: s.recovered
      ? "Return through the intake gallery"
      : s.rest === 3
        ? "Recover the pressure crews’ dispatch ledger"
        : s.opened === s.rest
          ? `Open pressure circuit ${s.rest + 1}`
          : `Ride the paired pistons to ${PRESSURE_DECKS[s.rest + 1].name.toLowerCase()}`,
  };
}
