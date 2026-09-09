import * as THREE from "three";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { weatherSkyStone } from "./sky-architecture.js";
import { poseHands } from "./pose.js";
import { boxEntry } from "./camera-collision.js";
import {
  COURIER_STOPS,
  COURIER_Z,
  normalizeCourier,
  courierPlatforms,
  courierCorridor,
  courierAnchor,
  courierCarSolids,
  onCourier,
  stepCourier,
} from "./courier-rules.js";

export function buildCourierFerry(game) {
  game.courierFerry = null;
  if (!game.map.courierFerry) return;
  const saved = normalizeCourier(game.progress.courierFerry);
  game.progress.courierFerry = saved;
  const y = game.terrainProfile.courierY + 0.24;
  const root = new THREE.Group(),
    fixed = new THREE.Group(),
    car = new THREE.Group();
  root.name = "The couriers’ aerial road";
  root.add(fixed, car);
  game.world.add(root);
  car.userData.animated = true;
  car.userData.cameraDynamic = true;
  const h = (game.courierFerry = {
    root,
    car,
    saved,
    y,
    x: COURIER_STOPS[saved.dock],
    docked: saved.dock,
    velocity: 0,
    trim: 0,
    wind: 0.8,
    time: 0,
    helm: false,
    recall: null,
    platforms: courierPlatforms(y),
    solids: [],
    sources: [],
    signs: [],
    pulleys: [],
  });
  const stone = pbrMaterial("rock", 0xc3c9c4);
  stone.normalScale.set(0.32, 0.32);
  weatherSkyStone(stone);
  const wood = pbrMaterial("monastery-wood", 0xa19372);
  const bronze = game.goldMat,
    iron = game.darkMat;
  let serial = 38000;
  const add = (
    geometry,
    material,
    x,
    py,
    z,
    parent = fixed,
    capture = true,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, py, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    if (capture) game.cameraSurfaces?.capture(mesh);
    return mesh;
  };
  const block = (w, t, d, x, py, z, mat = stone, parent = fixed) =>
    add(stoneBlockGeometry(w, t, d, serial++), mat, x, py, z, parent);
  const beam = (a, b, r = 0.07, mat = iron, parent = fixed) => {
    const from = new THREE.Vector3(...a),
      to = new THREE.Vector3(...b),
      delta = to.clone().sub(from);
    const mesh = add(
      new THREE.CylinderGeometry(r, r, delta.length(), 8),
      mat,
      ...from.clone().add(to).multiplyScalar(0.5).toArray(),
      parent,
      false,
    );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return mesh;
  };
  const sign = (text, x, py, z, width = 2, parent = fixed) => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const c = canvas.getContext("2d");
    c.fillStyle = "#dfcca0";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "bold 36px Georgia";
    c.fillText(text, 256, 64, 490);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return add(
      new THREE.PlaneGeometry(width, width / 4),
      new THREE.MeshStandardMaterial({
        map,
        transparent: true,
        depthWrite: false,
        roughness: 0.85,
      }),
      x,
      py,
      z,
      parent,
      false,
    );
  };
  // Each stair is solid to its base. Missing treads expose the lower landing.
  for (const p of h.platforms) {
    block(p.w * 2, p.y - p.bottom, p.d * 2, p.x, (p.y + p.bottom) / 2, p.z);
    if (p.stair || p.post)
      block(p.w * 2, 0.035, 0.09, p.x, p.y + 0.017, p.z - 1, bronze);
  }
  // A paved spur leads through the first court's existing northern portal.
  for (let x = 87; x < 120; x += 2.8) block(2.75, 0.16, 3, x, y - 0.23, 14);
  for (const [dock, x] of COURIER_STOPS.entries()) {
    for (const side of [-1, 1]) {
      const px = x + side * 8.3;
      for (let row = 0; row < 10; row++)
        block(1.5, 1.04, 1.5, px, y - 0.55 + 0.525 + row * 1.05, 27);
      block(1.8, 0.22, 1.8, px, y + 9.95, 27);
      h.solids.push({ x: px, z: 27, w: 0.75, d: 0.75, y: y - 0.55, h: 10.5 });
      beam([px, y + 9.9, 27], [x, y + 9.9, 12], 0.12, bronze);
    }
    for (let i = 0; i < 6; i++)
      block(2.99, 0.6, 1.7, x - 7.5 + i * 3, y + 9.9, 27);
    beam([x, y + 9.9, 27], [x, y + 9.9, 11], 0.2, bronze);
    beam([x, y + 9.9, 11], [x, y + 9.9, 17], 0.16, bronze);
    for (const z of [12, 16])
      beam([x, y + 9.9, z], [x, y + 9.3, z], 0.075, bronze);
    block(0.8, 1.2, 0.6, x - 4.7, y + 0.6, 20, iron);
    h.solids.push({ x: x - 4.7, z: 20, w: 0.4, d: 0.3, y, h: 1.2 });
    const wheel = add(
      new THREE.TorusGeometry(0.35, 0.045, 8, 24),
      bronze,
      x - 4.7,
      y + 1.2,
      20.36,
    );
    sign(dock ? `POST ${dock}` : "HOME", x, y + 0.04, 23, 2.3).rotation.x =
      -Math.PI / 2;
    if (dock) {
      const px = x + 5.2;
      block(0.85, 0.8, 0.5, px, y + 4.6, 25, iron);
      h.solids.push({ x: px, z: 25, w: 0.425, d: 0.25, y: y + 4.2, h: 0.8 });
      sign(`DISPATCH ${dock}`, px, y + 4.95, 25.27, 1.5);
      h.signs.push(sign("SEALED", px, y + 4.48, 25.28, 1.1));
    }
    h.sources.push({
      id: `courier-post-${dock}`,
      kind: "wind",
      x,
      y: y + 9,
      z: 27,
      near: 2,
      range: 30,
      gain: 0.055,
      activity: 0.5,
    });
    wheel.name = `Landing ${dock} empty-car retrieval crank`;
  }
  for (const z of [12, 16])
    beam([118, y + 9.3, z], [323, y + 9.3, z], 0.075, iron);
  for (let i = 0; i < 12; i++)
    block(0.505, 0.28, 5.4, -2.78 + i * 0.505, -0.14, 0, wood, car);
  for (const z of [-2.2, 2.2]) {
    block(6.4, 0.25, 0.22, 0, -0.42, z, iron, car);
    for (const x of [-2.7, 2.7])
      beam([x, 0, z], [x, 9.2, z], 0.055, bronze, car);
  }
  for (const x of [-2.7, 2.7]) {
    block(0.22, 0.2, 4.7, x, 9.2, 0, iron, car);
    for (const z of [-2, 2]) {
      const pulley = add(
        new THREE.TorusGeometry(0.26, 0.085, 8, 20),
        bronze,
        x,
        9.55,
        z,
        car,
        false,
      );
      h.pulleys.push(pulley);
    }
  }
  // Railings protect three sides; the south edge opens toward every landing.
  for (const x of [-3, 3]) {
    for (const z of [-2.5, 0, 2.5])
      beam([x, 0, z], [x, 1.1, z], 0.045, bronze, car);
    beam([x, 1.1, -2.5], [x, 1.1, 2.5], 0.04, bronze, car);
  }
  beam([-3, 1.1, -2.5], [3, 1.1, -2.5], 0.04, bronze, car);
  block(0.16, 5, 0.16, 1.4, 2.5, -0.7, wood, car);
  const sail = new THREE.Group();
  sail.position.set(1.4, 3, -0.7);
  car.add(sail);
  h.sail = sail;
  const cloth = new THREE.MeshStandardMaterial({
    color: 0xd1b985,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const canvas = add(
    new THREE.PlaneGeometry(4, 2.8, 12, 8),
    cloth,
    -1.4,
    0,
    0,
    sail,
    false,
  );
  canvas.userData.animated = true;
  h.cloth = canvas;
  beam([-3.4, 1.5, 0], [0.6, 1.5, 0], 0.035, wood, sail);
  beam([-3.4, -1.5, 0], [0.6, -1.5, 0], 0.035, wood, sail);
  beam([0, 0, 0.6], [0, 1.25, 0.6], 0.08, bronze, car);
  const helm = add(
    new THREE.TorusGeometry(0.48, 0.045, 8, 32),
    bronze,
    0,
    1.3,
    0.6,
    car,
    false,
  );
  h.wheel = helm;
  for (const angle of [0, Math.PI / 2]) {
    const spoke = block(0.86, 0.045, 0.045, 0, 0, 0, bronze, helm);
    spoke.rotation.z = angle;
  }
  h.handles = [-0.4, 0.4].map((x) => {
    const grip = new THREE.Object3D();
    grip.position.set(x, 0, 0.04);
    helm.add(grip);
    return grip;
  });
  sign("A / D  ·  TRIM", 0, 0.65, 0.7, 1.4, car);
  // A direction vane is visible with sound muted and while the sail is furled.
  const vane = new THREE.Group();
  vane.position.set(-2.6, 2.5, -2);
  car.add(vane);
  h.vane = vane;
  beam([-2.6, 0, -2], [-2.6, 2.5, -2], 0.03, bronze, car);
  beam([0, 0, -0.6], [0, 0, 0.6], 0.025, bronze, vane);
  const arrow = add(
    new THREE.ConeGeometry(0.17, 0.5, 3),
    bronze,
    0,
    0,
    -0.65,
    vane,
    false,
  );
  arrow.rotation.x = -Math.PI / 2;
  h.sources.push({
    id: "courier-sail",
    kind: "wind",
    x: h.x,
    y: y + 3,
    z: COURIER_Z,
    near: 3,
    range: 35,
    gain: 0.1,
    activity: 0,
  });
  h.sources.push({
    id: "courier-rope",
    kind: "rope",
    x: h.x,
    y: y + 5,
    z: COURIER_Z,
    near: 2,
    range: 25,
    gain: 0.12,
    activity: 0,
  });
  block(1.2, 1.2, 0.7, 120, y + 0.6, 21, iron);
  h.solids.push({ x: 120, z: 21, w: 0.6, d: 0.35, y, h: 1.2 });
  sign("THE COURIER ROAD", 120, y + 1.5, 21.4, 3);
  mergeArchitecture(fixed);
  updateCourierArt(game);
}

export function updateCourierArt(game) {
  const h = game.courierFerry;
  if (!h) return;
  h.car.position.set(h.x, h.y, COURIER_Z);
  h.sail.rotation.y = h.trim * 0.9;
  h.sail.scale.x = 0.16 + Math.abs(h.trim) * 0.84;
  h.wheel.rotation.z = -h.trim * 0.7;
  for (const pulley of h.pulleys) pulley.rotation.z = -(h.x - 126) / 0.26;
  h.vane.rotation.y = h.wind >= 0 ? 0 : Math.PI;
  const p = h.cloth.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i);
    p.setZ(
      i,
      Math.sin(((x + 2) * Math.PI) / 4) * 0.23 * Math.abs(h.trim) +
        Math.sin(h.time * 4 + x * 2 + y) * 0.035 * Math.abs(h.wind),
    );
  }
  p.needsUpdate = true;
  h.cloth.geometry.computeVertexNormals();
  for (const [i, s] of h.signs.entries()) s.visible = h.saved.post <= i;
  for (const s of h.sources) {
    if (s.id === "courier-sail" || s.id === "courier-rope") {
      s.x = h.x;
      s.activity = game.paused
        ? 0
        : s.kind === "rope"
          ? Math.min(
              1,
              Math.abs(h.velocity) / 3.8 + (h.recall != null ? 0.45 : 0),
            )
          : 0.15 + Math.abs(h.trim * h.wind) * 0.65;
    }
  }
}
export function updateCourierFerry(game, dt) {
  const h = game.courierFerry,
    p = game.player?.position;
  if (!h || !p) return;
  if (game.paused || game.health <= 0) {
    updateCourierArt(game);
    return;
  }
  const riding = game.grounded && onCourier(h, p);
  if (riding && h.recall != null) h.recall = null;
  if (!riding) {
    h.helm = false;
    h.trim = 0;
  }
  const dx = stepCourier(h, dt);
  if (riding) {
    p.x += dx;
    game.jumpY = p.y - game.groundHeight(p.x, p.z);
  }
  if (h.docked != null && riding && h.saved.dock !== h.docked) {
    h.saved.dock = h.docked;
    game.save();
    game.cb.toast?.(`Courier landing ${h.docked} secured`);
  }
  if (courierCorridor(game.map, p.x, p.z) && !h.saved.visited) {
    h.saved.visited = true;
    game.save();
  }
  updateCourierArt(game);
}
export function controlCourier(game, dt, inputX) {
  const h = game.courierFerry;
  if (!h?.helm) return false;
  if (game.keys.has("Space")) {
    h.trim = 0;
    game.keys.delete("Space");
    game.jumpBuffer = 0;
  } else h.trim = Math.max(-1, Math.min(1, h.trim + inputX * dt * 0.8));
  game.moveVelocity = { x: 0, z: 0 };
  game.velocityY = 0;
  game.grounded = true;
  game.player.position.set(h.x, h.y, COURIER_Z + 0.95);
  game.jumpY = h.y - game.groundHeight(h.x, COURIER_Z + 0.95);
  return true;
}
export function poseCourier(game) {
  const h = game.courierFerry;
  if (!h?.helm || !game.avatar) return;
  game.avatar.rotation.y = Math.PI;
  h.wheel.updateWorldMatrix(true, true);
  poseHands(
    game,
    h.handles.map((n) => n.getWorldPosition(new THREE.Vector3())),
  );
}
function nearby(game) {
  const h = game.courierFerry,
    p = game.player?.position;
  if (!h || !p || !game.grounded) return null;
  const close = (x, y, z, r = 1.8) =>
    Math.hypot(p.x - x, p.z - z) < r && Math.abs(p.y - y) < 0.55;
  if (close(120, h.y, 22.2, 2.1)) return { kind: "guide" };
  if (onCourier(h, p) && Math.hypot(p.x - h.x, p.z - COURIER_Z - 1.5) < 1.8)
    return { kind: "helm" };
  for (let i = 1; i < 4; i++)
    if (close(COURIER_STOPS[i] + 5.2, h.y + 4.2, 26.2))
      return { kind: "post", index: i };
  for (let i = 0; i < 4; i++)
    if (close(COURIER_STOPS[i] - 4.7, h.y, 21.2))
      return { kind: "recall", index: i };
  return null;
}
export function courierHint(game) {
  const h = game.courierFerry;
  if (!h) return null;
  if (h.helm)
    return {
      key: "E",
      label: `Release helm · A / D trim · Space brake · ${h.docked != null ? `DOCK ${h.docked}` : Math.abs(h.velocity).toFixed(1) + " m/s"}`,
    };
  const n = nearby(game);
  if (!n) return null;
  return {
    key: "E",
    label:
      n.kind === "guide"
        ? h.saved.post === 3
          ? "Join the courier dispatches"
          : "Read the courier road tablet"
        : n.kind === "helm"
          ? "Take the sail helm"
          : n.kind === "post"
            ? `Read dispatch ${n.index}`
            : h.docked === n.index
              ? "Ferry secured at this landing"
              : "Crank the empty ferry home",
  };
}
export function interactCourier(game) {
  const h = game.courierFerry;
  if (!h) return false;
  if (h.helm) {
    h.helm = false;
    h.trim = 0;
    game.save();
    return true;
  }
  const n = nearby(game);
  if (!n) return false;
  h.saved.visited = true;
  if (n.kind === "guide") {
    if (h.saved.post === 3) h.saved.recovered = true;
    game.save();
    game.cb.courierGuide?.();
  } else if (n.kind === "post") {
    if (n.index > h.saved.post + 1)
      game.cb.toast?.(`Read dispatch ${h.saved.post + 1} first`);
    else {
      h.saved.post = Math.max(h.saved.post, n.index);
      game.save();
      game.cb.courierFragment?.(n.index - 1);
    }
  } else if (n.kind === "helm") {
    if (game.carrying || game.climb || game.dodge || game.blockGrip) {
      game.cb.toast?.("Set down your cargo before taking the helm");
      return true;
    }
    h.helm = true;
    h.recall = null;
    game.crouching = false;
    game.jumpBuffer = 0;
    game.keys.delete("Space");
    controlCourier(game, 0, 0);
  } else if (h.docked !== n.index) {
    h.trim = 0;
    h.recall = n.index;
    game.cb.toast?.(
      "The retrieval rope draws the empty ferry toward this landing",
    );
  }
  return true;
}
export function courierObjective(game) {
  const h = game.courierFerry,
    p = game.player?.position;
  if (!h || !p || !courierCorridor(game.map, p.x, p.z)) return null;
  const direction = h.wind >= 0 ? "southerly" : "northerly";
  return {
    step: h.saved.post + (h.saved.recovered ? 1 : 0),
    text: h.saved.recovered
      ? "Courier register restored · Return through the north gate"
      : h.saved.post === 3
        ? "Sail home and join the three dispatches"
        : `Reach courier post ${h.saved.post + 1} · Dock, climb and read its dispatch`,
    detail: h.helm
      ? `${direction} wind · trim ${Math.round(h.trim * 100)}% · ${Math.abs(h.trim) < 0.02 ? "furled / braking" : Math.abs(h.wind) < 0.1 ? "wind lull" : h.wind * h.trim >= 0 ? "eastward drive" : "westward drive"}`
      : `${h.saved.post} / 3 dispatches · M charts the aerial road`,
  };
}
export function recoverCourierFall(game) {
  const h = game.courierFerry,
    p = game.player?.position;
  if (!h || !p || !courierCorridor(game.map, p.x, p.z) || p.y >= h.y - 6)
    return false;
  const a = courierAnchor(h);
  p.set(a.x, a.y, a.z);
  h.x = COURIER_STOPS[h.saved.dock];
  h.docked = h.saved.dock;
  h.velocity = 0;
  h.trim = 0;
  h.helm = false;
  h.recall = null;
  game.velocityY = 0;
  game.grounded = true;
  game.jumpY = a.y - game.groundHeight(a.x, a.z);
  game.fallPeak = a.y;
  game.motionLanding = null;
  game.airVelocity = null;
  game.cb.toast?.("The safety line returns you to the last courier landing");
  updateCourierArt(game);
  return true;
}
export function courierOccludes(game, a, b) {
  if (
    Math.max(a.x, b.x) < 116 ||
    Math.min(a.x, b.x) > 326 ||
    Math.max(a.z, b.z) < 10 ||
    Math.min(a.z, b.z) > 29
  )
    return false;
  const h = game.courierFerry;
  if (!h) return false;
  const boxes = [
    ...h.solids,
    ...courierCarSolids(h),
    ...h.platforms.map((p) => ({
      x: p.x,
      z: p.z,
      w: p.w,
      d: p.d,
      y: p.bottom,
      h: p.y - p.bottom,
    })),
  ];
  return boxes.some(
    (p) =>
      boxEntry(a, b, {
        min: { x: p.x - p.w, y: p.y, z: p.z - p.d },
        max: { x: p.x + p.w, y: p.y + p.h, z: p.z + p.d },
      }) != null,
  );
}
