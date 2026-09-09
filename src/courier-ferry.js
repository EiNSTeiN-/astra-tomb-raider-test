import * as THREE from "three";
import {
  buildCourierConstruction,
  updateCourierConstruction,
} from "./courier-construction.js";
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
  buildCourierConstruction(game, h, fixed);
  updateCourierArt(game);
}

export function updateCourierArt(game) {
  const h = game.courierFerry;
  if (!h) return;
  h.car.position.set(h.x, h.y, COURIER_Z);
  updateCourierConstruction(h);
  h.wheel.rotation.z = -h.trim * 0.7;
  for (const pulley of h.pulleys) pulley.rotation.z = -(h.x - 126) / 0.25;
  h.vane.rotation.y = h.wind >= 0 ? 0 : Math.PI;
  for (const [i, s] of h.signs.entries()) s.visible = h.saved.post <= i;
  for (const s of h.sources) {
    if (s.id === "courier-sail" || s.id === "courier-rope") {
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
