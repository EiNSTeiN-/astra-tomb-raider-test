import * as THREE from "three";
import { supportAt } from "./character-motion.js";
import { torchHandsBusy } from "./torch.js";
import { poseCylinderGrip } from "./hand-grip.js";

export const PRESSURE_WHEEL = Object.freeze({
  readyAngle: Math.PI / 4,
  alignTime: 0.25,
  reachStart: 0.08,
  reach: 0.25,
  grasp: 0.4,
  turnStart: 0.55,
  detent: 1.22,
  open: 1.37,
  lift: 1.52,
  release: 1.72,
  end: 1.85,
});

export function pressureWheelStance(control) {
  return control.position.clone().add(new THREE.Vector3(0, 0, -0.53));
}

function clearApproach(game, from, target) {
  const count = Math.max(1, Math.ceil(from.distanceTo(target) / 0.08));
  for (let i = 0; i <= count; i++) {
    const p = from.clone().lerp(target, i / count);
    if (
      !game.canMove(p.x, p.z, p.y - game.groundHeight(p.x, p.z)) ||
      Math.abs(supportAt(game, p.x, p.z, p.y).height - p.y) > 0.08
    )
      return false;
  }
  return true;
}

export function beginPressureWheel(game, control) {
  const h = game.pressureRelay,
    p = game.player.position;
  if (
    game.paused ||
    h.operation ||
    game.health <= 0 ||
    !game.grounded ||
    game.swimming ||
    game.diving ||
    torchHandsBusy(game) ||
    control.kind !== "valve" ||
    h.saved.opened !== control.bank
  )
    return false;
  const target = pressureWheelStance(control);
  if (p.z < target.z - 0.12 || !clearApproach(game, p, target)) {
    game.cb.toast?.(
      "Stand on the gallery in front of the valve’s two hand grips.",
    );
    return false;
  }
  h.operation = {
    control,
    from: p.clone(),
    target,
    last: p.clone(),
    yaw: game.avatar.rotation.y,
    time: 0,
    turn: 0,
    committed: false,
    alignTime: Math.max(
      PRESSURE_WHEEL.alignTime,
      (p.distanceTo(target) * 1.5) / 4,
    ),
  };
  game.nearest = null;
  game.cb.update?.(game.state());
  return true;
}

export const pressureWheelPhase = (op) =>
  op.time - op.alignTime + PRESSURE_WHEEL.alignTime;

export function syncPressureWheel(game, control, dt, initial = false) {
  const h = game.pressureRelay;
  const op = h.operation?.control === control ? h.operation : null;
  const target = Number(h.saved.opened > control.bank);
  control.turn = op
    ? op.turn
    : initial
      ? target
      : THREE.MathUtils.damp(control.turn, target, 10, dt);
  control.wheel.rotation.z =
    PRESSURE_WHEEL.readyAngle - (control.turn * Math.PI) / 2;
  if (control.source)
    control.source.activity =
      !game.paused &&
      op &&
      pressureWheelPhase(op) > PRESSURE_WHEEL.turnStart &&
      pressureWheelPhase(op) < PRESSURE_WHEEL.detent
        ? 0.6
        : 0;
}

// Only a completed turn opens the circuit. A canceled partial turn returns to
// its closed stop; a completed valve stays open across movement and reloads.
export function advancePressureWheel(game, dt, input) {
  const h = game.pressureRelay,
    op = h?.operation;
  if (!op || game.paused) return false;
  const cancel = () => {
    h.operation = null;
    syncPressureWheel(game, op.control, dt);
    return false;
  };
  if (
    !game.grounded ||
    game.swimming ||
    game.diving ||
    game.health <= 0 ||
    game.climb ||
    game.dodge ||
    game.blockGrip ||
    game.ropeRide ||
    game.zipRide ||
    game.aimUntil > game.elapsed ||
    game.carrying ||
    Math.hypot(input.x, input.z) > 0.05 ||
    game.keys.has("Space") ||
    game.player.position.distanceTo(op.last) > 0.2
  )
    return cancel();
  op.time += dt;
  const align = THREE.MathUtils.smoothstep(op.time, 0, op.alignTime);
  const next = op.from.clone().lerp(op.target, align);
  if (!clearApproach(game, game.player.position, next)) return cancel();
  game.moveVelocity =
    dt > 0
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
  const time = pressureWheelPhase(op);
  op.turn = THREE.MathUtils.smoothstep(
    time,
    PRESSURE_WHEEL.turnStart,
    PRESSURE_WHEEL.detent,
  );
  if (time >= PRESSURE_WHEEL.detent && !op.committed) {
    op.committed = true;
    h.saved.opened = op.control.bank + 1;
    h.time[op.control.bank] = 0;
    game.audio.tone("click");
    game.save();
    game.cb.toast?.(
      "Circuit open. Cross when the neighboring crowns meet.",
      4500,
    );
    game.cb.update?.(game.state());
  }
  if (time >= PRESSURE_WHEEL.end) h.operation = null;
  syncPressureWheel(game, op.control, dt);
  return true;
}

export function posePressureWheel(game) {
  const h = game.pressureRelay,
    op = h?.operation;
  if (!op || !game.rig) return;
  const t = pressureWheelPhase(op),
    w = PRESSURE_WHEEL;
  const weight =
    THREE.MathUtils.smoothstep(t, w.reachStart, w.reach) *
    (1 - THREE.MathUtils.smoothstep(t, w.lift, w.release));
  op.control.wheel.updateWorldMatrix(true, true);
  const rotation = op.control.wheel.getWorldQuaternion(new THREE.Quaternion());
  const approach = 1 - THREE.MathUtils.smoothstep(t, w.reach, w.grasp);
  const lift = THREE.MathUtils.smoothstep(t, w.open, w.lift);
  const closure =
    THREE.MathUtils.smoothstep(t, w.grasp, w.turnStart) *
    (1 - THREE.MathUtils.smoothstep(t, w.detent, w.open));
  const away = new THREE.Vector3(
    0,
    0,
    0.2 * Math.max(approach, lift),
  ).applyQuaternion(rotation);
  poseCylinderGrip(
    game,
    op.control.grips.map((g) =>
      g.getWorldPosition(new THREE.Vector3()).add(away),
    ),
    new THREE.Vector3(-1, 0, 0).applyQuaternion(rotation),
    new THREE.Vector3(0, 1, 0).applyQuaternion(rotation),
    weight,
    closure,
    true,
  );
}
