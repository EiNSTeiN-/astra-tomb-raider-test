import * as THREE from "three";
import { buildSunBridgeArt } from "./sun-bridge-art.js";
import {
  SUN_FIELDS,
  sunDone,
  sunDeckAt,
  sunAnchor,
  sunLocal,
  sunWorld,
  sunFoundationDistance,
  normalizeSunBridge,
} from "./sun-bridge-rules.js";
import { finishFieldTask } from "./field-world.js";
import { torchHandsBusy } from "./torch.js";
import { poseCylinderGrip } from "./hand-grip.js";
import { supportAt } from "./character-motion.js";
const smooth = (t, a, b) => THREE.MathUtils.smoothstep(t, a, b);
export function buildSunBridge(game) {
  game.sunBridge = null;
  if (!game.map.sunBridge) return;
  const { x, z } = game.map.sunBridge,
    y = game.terrainProfile.sunY,
    root = new THREE.Group();
  root.position.set(x, y, z);
  root.name = "The hanging garden";
  game.world.add(root);
  const saved = normalizeSunBridge(game.progress.sunBridge, game.progress);
  game.progress.sunBridge = saved;
  const h = (game.sunBridge = {
    x,
    y,
    z,
    root,
    saved,
    decks: [],
    solids: [],
    bridges: [],
    controls: [],
    sources: [],
    turn: null,
    ready: -1,
    lift: sunDone(game.progress, 1) ? 1 : 0,
    returned: sunDone(game.progress, 2) ? 1 : 0,
    fallFrom: null,
    time: 0,
  });
  buildSunBridgeArt(game, h);
  updateSunBridge(game, 0);
}
function canReach(game, p, distance = 2.2) {
  const q = game.player?.position;
  return !!(
    q &&
    game.grounded &&
    !game.swimming &&
    Math.abs(q.y - p.y) < 0.3 &&
    Math.hypot(q.x - p.x, q.z - p.z) < distance
  );
}
function fieldControl(game, index) {
  const h = game.sunBridge,
    p = SUN_FIELDS[index],
    f = game.items.find((f) => f.id === `field-5-${index}`);
  return f?.sunControl
    ? {
        ...f.sunControl,
        world: { x: h.x + p.x, y: h.y + p.height, z: h.z + p.z },
        field: index,
      }
    : null;
}
function clearApproach(game, from, to) {
  const n = Math.max(1, Math.ceil(from.distanceTo(to) / 0.1));
  for (let i = 0; i <= n; i++) {
    const p = from.clone().lerp(to, i / n);
    if (
      !game.canMove(p.x, p.z, p.y - game.groundHeight(p.x, p.z)) ||
      Math.abs(supportAt(game, p.x, p.z, p.y).height - p.y) > 0.08
    )
      return false;
  }
  return true;
}
function startTurn(game, control, stop) {
  const h = game.sunBridge,
    p = game.player.position,
    target = new THREE.Vector3(
      control.world.x,
      control.world.y,
      control.world.z + 0.78,
    );
  if (
    h.turn ||
    game.paused ||
    game.health <= 0 ||
    !canReach(game, control.world) ||
    torchHandsBusy(game) ||
    game.crouching ||
    p.z < target.z - 0.35 ||
    !clearApproach(game, p, target)
  )
    return false;
  h.turn = {
    control,
    stop,
    time: 0,
    amount: 0,
    committed: false,
    from: p.clone(),
    target,
    last: p.clone(),
    yaw: game.avatar.rotation.y,
    align: Math.max(0.25, (p.distanceTo(target) * 1.5) / 4),
  };
  game.keys.clear();
  return true;
}
export function sunFieldAction(game, f) {
  const h = game.sunBridge;
  if (!h || !canReach(game, { x: f.x * 7, y: h.y + f.sunHeight, z: f.z * 7 }))
    return false;
  if (h.ready === f.step) {
    h.ready = -1;
    return true;
  }
  const control = fieldControl(game, f.step);
  if (control) startTurn(game, control);
  return false;
}
function nearby(game) {
  const h = game.sunBridge;
  if (!h) return null;
  for (const c of h.controls) if (canReach(game, c.world)) return c;
  for (const i of [0, 2])
    if (sunDone(game.progress, i)) {
      const c = fieldControl(game, i);
      if (c && canReach(game, c.world))
        return {
          ...c,
          field: undefined,
          pivot: i === 0 ? 0 : 1,
          stop: i === 0 ? 0 : 1,
        };
    }
  return null;
}
export function sunInteract(game) {
  const h = game.sunBridge;
  if (!h || game.paused || game.health <= 0) return false;
  if (h.turn) return true;
  const c = nearby(game);
  if (!c) return false;
  if (!sunDone(game.progress, c.pivot)) {
    game.cb.toast?.(
      c.pivot
        ? "Raise the crossing support in the upper weight gallery first."
        : "Tension the garden cable at the entry landing first.",
    );
    return true;
  }
  const b = h.bridges[c.pivot],
    stop = c.stop ?? 1 - h.saved.stops[c.pivot];
  if (b.motion) {
    game.cb.toast?.("The span is turning. Wait for it to meet the landing.");
    return true;
  }
  if (stop === h.saved.stops[c.pivot]) {
    game.cb.toast?.("The span is aligned with this landing.");
    return true;
  }
  if (!startTurn(game, c, stop))
    game.cb.toast?.("Stand in front of the handwheel with both hands free.");
  return true;
}
export function advanceSunTurn(game, dt, input) {
  const h = game.sunBridge,
    op = h?.turn;
  if (!op || game.paused) return false;
  if (
    !game.grounded ||
    game.health <= 0 ||
    game.swimming ||
    game.crouching ||
    game.climb ||
    game.dodge ||
    Math.hypot(input.x, input.z) > 0.05 ||
    game.keys.has("Space") ||
    game.player.position.distanceTo(op.last) > 0.2
  ) {
    h.turn = null;
    return false;
  }
  op.time += dt;
  const align = smooth(op.time, 0, op.align),
    next = op.from.clone().lerp(op.target, align);
  if (!clearApproach(game, game.player.position, next)) {
    h.turn = null;
    return false;
  }
  game.moveVelocity = dt
    ? {
        x: (next.x - game.player.position.x) / dt,
        z: (next.z - game.player.position.z) / dt,
      }
    : { x: 0, z: 0 };
  game.player.position.copy(next);
  op.last.copy(next);
  game.avatar.rotation.y =
    op.yaw +
    Math.atan2(Math.sin(Math.PI - op.yaw), Math.cos(Math.PI - op.yaw)) * align;
  const phase = op.time - op.align + 0.25;
  op.amount = smooth(phase, 0.5, 1.15);
  op.control.wheel.rotation.z =
    Math.PI / 4 - ((op.amount * Math.PI) / 2) * (1 - smooth(phase, 1.42, 1.75));
  if (phase >= 1.15 && !op.committed) {
    op.committed = true;
    if (op.control.field !== undefined) {
      h.ready = op.control.field;
      finishFieldTask(
        game,
        game.items.find((f) => f.id === `field-5-${op.control.field}`),
      );
    } else {
      const i = op.control.pivot,
        b = h.bridges[i];
      h.saved.stops[i] = op.stop;
      b.motion = { from: b.angle, to: (op.stop * Math.PI) / 2, time: 0 };
      game.audio.tone("field");
      game.save();
    }
  }
  if (phase >= 1.75) h.turn = null;
  return true;
}
export function poseSunTurn(game) {
  const op = game.sunBridge?.turn;
  if (!op || !game.rig) return;
  const t = op.time - op.align + 0.25,
    c = op.control;
  const weight = smooth(t, 0.08, 0.28) * (1 - smooth(t, 1.4, 1.6));
  c.wheel.updateWorldMatrix(true, true);
  const q = c.wheel.getWorldQuaternion(new THREE.Quaternion()),
    away = new THREE.Vector3(
      0,
      0,
      0.18 * Math.max(1 - smooth(t, 0.28, 0.42), smooth(t, 1.25, 1.4)),
    );
  poseCylinderGrip(
    game,
    c.grips.map((g) => g.getWorldPosition(new THREE.Vector3()).add(away)),
    new THREE.Vector3(-1, 0, 0).applyQuaternion(q),
    new THREE.Vector3(0, 1, 0).applyQuaternion(q),
    weight,
    smooth(t, 0.42, 0.5) * (1 - smooth(t, 1.15, 1.25)),
    true,
  );
}
export function updateSunBridge(game, dt) {
  const h = game.sunBridge;
  if (!h) return;
  dt = game.paused || !Number.isFinite(dt) ? 0 : Math.max(0, Math.min(dt, 1));
  h.time += dt;
  const p = game.player?.position,
    previousLift = h.lift,
    previousReturn = h.returned;
  if (sunDone(game.progress, 1)) h.lift = Math.min(1, h.lift + dt / 4);
  if (sunDone(game.progress, 2)) h.returned = Math.min(1, h.returned + dt / 3);
  const support = p ? sunDeckAt(game, p.x, p.z, p.y) : null;
  for (const b of h.bridges) {
    const riding = !!(
        dt &&
        game.grounded &&
        !game.climb &&
        support?.surface.bridge === b &&
        Math.abs(p.y - b.y) < 0.25
      ),
      local = riding ? sunLocal(b, p.x, p.z) : null,
      previousY = b.y;
    if (b.motion) {
      b.motion.time += dt;
      const t = smooth(b.motion.time, 0, 4);
      b.angle = THREE.MathUtils.lerp(b.motion.from, b.motion.to, t);
      if (t === 1) b.motion = null;
    }
    b.y = h.y + (b.index === 0 ? 6 : 2 + 4 * smooth(h.lift, 0, 1));
    b.deck.y = b.y;
    b.root.position.y = b.y - h.y;
    b.root.rotation.y = b.angle;
    for (const s of b.rails) {
      s.bottom = b.y + 0.5;
      s.top = b.y + 1.2;
    }
    if (riding) {
      const q = sunWorld(b, local.x, local.z);
      p.x = q.x;
      p.z = q.z;
      p.y += b.y - previousY;
      game.jumpY = p.y - game.groundHeight(p.x, p.z);
      game.fallPeak = p.y;
    }
    b.source.y = b.y - 0.15;
    b.source.activity = game.paused
      ? 0
      : b.motion
        ? 1
        : b.index && h.lift !== previousLift
          ? 0.7
          : 0;
  }
  h.weight.position.y = 5 - 3.3 * smooth(h.lift, 0, 1);
  const cableStart = new THREE.Vector3(-17, 12.6, -25),
    cableEnd = new THREE.Vector3(16, h.bridges[1].y - h.y - 0.5, 0),
    cableDelta = cableEnd.clone().sub(cableStart);
  h.liftCable.position.copy(cableStart).add(cableEnd).multiplyScalar(0.5);
  h.liftCable.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    cableDelta.clone().normalize(),
  );
  h.liftCable.scale.y = cableDelta.length();
  const weightTop = h.weight.position.y + 1;
  h.weightCable.position.y = (12.6 + weightTop) / 2;
  h.weightCable.scale.y = 12.6 - weightTop;
  h.weightSource.y = h.y + h.weight.position.y;
  h.weightSource.activity = game.paused ? 0 : h.lift !== previousLift ? 1 : 0;
  const returnY = h.y + 2 + 4 * smooth(h.returned, 0, 1);
  if (
    dt &&
    game.grounded &&
    support?.surface === h.returnDeck &&
    Math.abs(p.y - h.returnDeck.y) < 0.25
  ) {
    p.y += returnY - h.returnDeck.y;
    game.jumpY = p.y - game.groundHeight(p.x, p.z);
    game.fallPeak = p.y;
  }
  h.returnPlatform.y = h.returnDeck.y = returnY;
  h.returnRoot.position.y = returnY - h.y;
  for (const cable of h.returnCables) {
    const bottom = returnY - h.y;
    cable.position.y = (8.5 + bottom) / 2;
    cable.scale.y = 8.5 - bottom;
  }
  h.returnSource.y = returnY;
  h.returnSource.activity = game.paused
    ? 0
    : h.returned !== previousReturn
      ? 1
      : 0;
  for (const c of h.controls)
    if (h.turn?.control.wheel !== c.wheel)
      c.wheel.rotation.z = THREE.MathUtils.damp(
        c.wheel.rotation.z,
        Math.PI / 4,
        15,
        dt,
      );
  for (let i = 0; i < 3; i++) {
    const f = game.items?.find((f) => f.id === `field-5-${i}`),
      active = h.turn?.control.field === i && !h.turn.committed;
    if (f?.sunControl && h.turn?.control.wheel !== f.core)
      f.core.rotation.z = THREE.MathUtils.damp(
        f.core.rotation.z,
        Math.PI / 4,
        15,
        dt,
      );
    h.sources.find((s) => s.id === `sun-handwheel-${i}`).activity = game.paused
      ? 0
      : active
        ? 0.6
        : 0;
  }
  if (
    dt &&
    p &&
    game.grounded &&
    support &&
    Math.abs(support.height - p.y) < 0.25
  ) {
    h.fallFrom = p.y;
    if (!support.surface.bridge) {
      if (
        Math.hypot(p.x - h.x - 16, p.z - h.z) < 2.2 &&
        sunDone(game.progress, 1)
      )
        h.saved.anchor = 3;
      else if (
        Math.hypot(p.x - h.x + 10, p.z - h.z + 14) < 3 &&
        sunDone(game.progress, 0)
      )
        h.saved.anchor = 2;
      else if (
        Math.hypot(p.x - h.x + 10, p.z - h.z) < 2.2 &&
        sunDone(game.progress, 0)
      )
        h.saved.anchor = 1;
      else if (Math.hypot(p.x - h.x + 24, p.z - h.z) < 3) h.saved.anchor = 0;
    }
  }
  if (p && sunFoundationDistance(p.x, p.z) > 2) h.fallFrom = null;
}
export function recoverSunFall(game) {
  const h = game.sunBridge,
    p = game.player?.position;
  if (
    !h ||
    !p ||
    h.fallFrom === null ||
    sunFoundationDistance(p.x, p.z) > 2 ||
    p.y >= h.fallFrom - 1.8 ||
    game.climb
  )
    return false;
  const a = sunAnchor(game);
  p.set(a.x, a.y, a.z);
  game.jumpY = a.y - game.groundHeight(a.x, a.z);
  game.grounded = true;
  game.velocityY = 0;
  game.airVelocity = null;
  h.fallFrom = null;
  h.turn = null;
  game.fallPeak = a.y;
  game.damage?.(8);
  game.cb.toast?.("The belay holds. Returned to the last fixed landing.");
  game.save();
  return true;
}
export function sunHint(game) {
  const h = game.sunBridge;
  if (!h) return null;
  if (h.turn)
    return { key: "E", label: "Turning the handwheel · move to cancel" };
  const c = nearby(game);
  if (!c) return null;
  const b = h.bridges[c.pivot];
  return {
    key: "E",
    label: !sunDone(game.progress, c.pivot)
      ? c.pivot
        ? "Raise the counterweight support first"
        : "Tension the entry cable first"
      : b.motion
        ? "Span turning · wait for its landing"
        : c.stop !== undefined
          ? c.stop === h.saved.stops[c.pivot]
            ? "Span aligned with this landing"
            : "Recall the span to this landing"
          : "Turn span 90° · ride or wait on the central pier",
  };
}
export function sunObjective(game) {
  const h = game.sunBridge,
    p = game.player?.position;
  if (
    !h ||
    !p ||
    game.progress.stage < 5 ||
    sunFoundationDistance(p.x, p.z) > 8
  )
    return null;
  return {
    text: sunDone(game.progress, 2)
      ? "Return crossing open · recall the garden span at the north gallery"
      : !sunDone(game.progress, 0)
        ? "Climb the southern stair and tension the entry cable"
        : !sunDone(game.progress, 1)
          ? "Turn the garden span north · jump the broken weight gallery"
          : h.saved.stops[0] === 1
            ? "Return to central pier A and turn its span east–west"
            : p.x < h.x + 4
              ? "Jump the gap to the sun span · reach its central handwheel"
              : h.saved.stops[1] === 0
                ? "Turn the sun span north at its central handwheel"
                : "Follow the sun span north and release the final winch",
    stops: [...h.saved.stops],
    moving: h.bridges.map((b) => !!b.motion),
  };
}
