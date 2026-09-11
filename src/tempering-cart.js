import * as THREE from "three";
import { buildCartConstruction } from "./tempering-cart-art.js";
import { poseHands } from "./pose.js";
import {
  CART_LENGTH,
  CART_FLOOR,
  cartInspected,
  normalizeTemperingCart,
  temperingPose,
  cartLocal,
  onTemperingCart,
  stepTemperingCart,
} from "./tempering-cart-rules.js";

export function buildTemperingCart(game) {
  game.temperingCart = null;
  if (!game.map.temperingCart) return;
  const saved = normalizeTemperingCart(
    game.progress.temperingCart,
    game.progress,
  );
  game.progress.temperingCart = saved;
  const root = new THREE.Group(),
    car = new THREE.Group();
  root.name = "Obsidian tempering railway";
  root.position.y = game.terrainProfile.temperingY;
  car.userData.animated = car.userData.cameraDynamic = true;
  root.add(car);
  game.world.add(root);
  const h = (game.temperingCart = {
    root,
    car,
    saved,
    base: root.position.y,
    floor: root.position.y + CART_FLOOR,
    distance: saved.stop * CART_LENGTH,
    pose: temperingPose(saved.stop * CART_LENGTH, saved.turned),
    docked: saved.stop,
    velocity: 0,
    drive: false,
    input: 0,
    recall: null,
    turn: null,
    time: { value: 0 },
    decks: [],
    solids: [],
    wheels: [],
  });
  buildCartConstruction(game, h);
  updateCartArt(game);
}
export function updateCartArt(game) {
  const h = game.temperingCart;
  if (!h) return;
  const turning = h.turn,
    amount = turning ? Math.min(1, turning.time / 2.4) : 0;
  const ease = amount * amount * (3 - 2 * amount);
  const angle =
    ((turning
      ? Number(turning.from) + (turning.from ? -ease : ease)
      : Number(h.saved.turned)) *
      Math.PI) /
    2;
  h.table.rotation.y = angle;
  if (h.docked === 1) h.pose.angle = angle;
  h.car.position.set(h.pose.x, CART_FLOOR, h.pose.z);
  h.car.rotation.y = h.pose.angle;
  h.bridge.visible = !turning;
  Object.assign(
    h.bridgeDeck,
    h.saved.turned
      ? { x: 151.3, z: 406.8, w: 1.7, d: 0.75 }
      : { x: 153.2, z: 403.3, w: 0.75, d: 1.7 },
    { enabled: !turning },
  );
  for (const w of h.wheels) w.rotation.z = -h.distance / 0.33;
  h.pump.rotation.z =
    Math.sin(h.time.value * 7) * Math.min(0.2, Math.abs(h.velocity) * 0.05);
  h.handwheel.rotation.z = angle * 6;
  const complete =
    game.progress.stage > 6 || game.progress.field.includes("field-6-2");
  h.cargo.visible = h.saved.loaded && !complete;
  h.steam.value = cartInspected(game.progress) ? 0.45 : 0.12;
  Object.assign(h.sources[0], {
    x: h.pose.x,
    y: h.floor - 0.5,
    z: h.pose.z,
    activity: game.paused ? 0 : Math.min(1, Math.abs(h.velocity) / 5),
  });
  h.sources[1].activity = !game.paused && turning ? 1 : 0;
  h.sources[2].activity = game.paused ? 0 : h.steam.value;
}
export function startCartTurn(game) {
  const h = game.temperingCart;
  if (
    !h ||
    game.paused ||
    h.turn ||
    h.docked !== 1 ||
    !cartInspected(game.progress) ||
    onTemperingCart(h, game.player?.position)
  )
    return false;
  h.drive = false;
  h.input = 0;
  h.velocity = 0;
  h.turn = { from: h.saved.turned, time: 0 };
  return true;
}
export function updateTemperingCart(game, dt) {
  const h = game.temperingCart,
    p = game.player?.position;
  if (!h) return;
  if (game.paused || game.health <= 0) {
    updateCartArt(game);
    return;
  }
  h.time.value += dt;
  const riding = game.grounded && onTemperingCart(h, p),
    local = riding ? cartLocal(h, p.x, p.z) : null;
  if (!riding) {
    h.drive = false;
    h.input = 0;
  } else h.recall = null;
  if (h.turn) {
    h.turn.time += dt;
    if (h.turn.time >= 2.4) {
      h.saved.turned = !h.turn.from;
      h.turn = null;
      game.save();
    }
  } else {
    let input = h.drive ? h.input : 0;
    if (h.recall != null) {
      const target = h.recall * CART_LENGTH;
      if (h.docked === h.recall) h.recall = null;
      else if (
        h.docked === 1 &&
        ((target < 70 && h.saved.turned) || (target > 70 && !h.saved.turned))
      )
        startCartTurn(game);
      else input = Math.sign(target - h.distance);
    }
    if (!h.turn) stepTemperingCart(h, dt, input);
    if (h.docked != null && h.saved.stop !== h.docked) {
      h.saved.stop = h.docked;
      game.save();
      game.cb.toast?.(
        [
          "Loading landing secured",
          "Inspection turntable secured · climb to the coolant gauge",
          "Tempering landing secured",
        ][h.docked],
      );
    }
  }
  updateCartArt(game);
  if (riding) {
    const c = Math.cos(h.pose.angle),
      s = Math.sin(h.pose.angle);
    p.x = h.pose.x + local.x * c + local.z * s;
    p.z = h.pose.z - local.x * s + local.z * c;
    game.jumpY = p.y - game.groundHeight(p.x, p.z);
    game.fallPeak = p.y;
  }
}
export function controlTemperingCart(game, dt, input) {
  const h = game.temperingCart;
  if (!h?.drive) return false;
  h.input = game.keys.has("Space") ? 0 : Math.max(-1, Math.min(1, input));
  game.jumpBuffer = 0;
  game.crouching = false;
  game.moveVelocity = { x: 0, z: 0 };
  game.velocityY = 0;
  game.grounded = true;
  const c = Math.cos(h.pose.angle),
    s = Math.sin(h.pose.angle);
  game.player.position.set(h.pose.x - 0.8 * c, h.floor, h.pose.z + 0.8 * s);
  game.jumpY =
    h.floor - game.groundHeight(game.player.position.x, game.player.position.z);
  return true;
}
export function poseTemperingCart(game) {
  const h = game.temperingCart;
  if (!h?.drive || !game.avatar) return;
  game.avatar.rotation.y = Math.PI / 2 + h.pose.angle;
  h.pump.updateWorldMatrix(true, true);
  poseHands(
    game,
    h.handles.map((n) => n.getWorldPosition(new THREE.Vector3())),
  );
}
function nearby(game) {
  const h = game.temperingCart,
    p = game.player?.position;
  if (!h || !p || !game.grounded) return null;
  if (onTemperingCart(h, p) && cartLocal(h, p.x, p.z).x < 0.3)
    return { kind: "drive" };
  const near = (x, y, z, r) =>
    Math.abs(p.y - y) < 0.55 && Math.hypot(p.x - x, p.z - z) < r;
  if (
    cartInspected(game.progress) &&
    near(h.control.x, h.control.y, h.control.z, 1.6)
  )
    return { kind: "turn" };
  for (const [stop, c] of h.calls.entries())
    if (near(c.x, h.floor, c.z, 1.1)) return { kind: "recall", stop };
  return null;
}
export function cartHint(game) {
  const h = game.temperingCart;
  if (!h) return null;
  if (h.drive)
    return {
      key: "E",
      label: `Release handle · W / S or ↑ / ↓ drive · Space brake · ${h.docked == null ? Math.abs(h.velocity).toFixed(1) + " m/s" : "landing " + h.docked}`,
    };
  const n = nearby(game);
  if (!n) return null;
  return {
    key: "E",
    label:
      n.kind === "turn"
        ? h.turn
          ? "Turntable rotating…"
          : h.docked !== 1
            ? "Bring the cart onto the turntable"
            : h.saved.turned
              ? "Turn the rails toward the loading landing"
              : "Turn the rails toward the tempering cradle"
        : n.kind === "recall"
          ? h.docked === n.stop
            ? "Cart secured at this landing"
            : "Winch the empty cart to this landing"
          : h.saved.loaded
            ? "Take the cart handle"
            : game.progress.field.includes("field-6-0")
              ? "Secure the blank and take the handle"
              : "Lift the key blank at the loading bench",
  };
}
export function interactTemperingCart(game) {
  const h = game.temperingCart;
  if (!h) return false;
  if (h.drive) {
    h.drive = false;
    h.input = 0;
    game.save();
    return true;
  }
  const n = nearby(game);
  if (!n) return false;
  if (n.kind === "turn") {
    if (!startCartTurn(game)) game.cb.toast?.(cartHint(game).label);
  } else if (n.kind === "recall") {
    if (n.stop === 2 && !cartInspected(game.progress))
      game.cb.toast?.(
        "Inspect the cooling bath at the gallery before turning the rails north.",
      );
    else if (!h.turn && h.docked !== n.stop) {
      h.recall = n.stop;
      h.input = 0;
      game.cb.toast?.(
        "The retrieval chain draws the empty cart toward this landing.",
      );
    }
  } else if (!h.turn) {
    if (!h.saved.loaded && !game.progress.field.includes("field-6-0")) {
      game.cb.toast?.("Lift the obsidian blank at the loading bench first.");
      return true;
    }
    if (game.climb || game.dodge || game.blockGrip) return true;
    h.saved.loaded = true;
    h.drive = true;
    h.recall = null;
    game.carrying = false;
    game.crouching = false;
    game.jumpBuffer = 0;
    game.keys.delete("Space");
    controlTemperingCart(game, 0, 0);
    game.save();
  }
  return true;
}
