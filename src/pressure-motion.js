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

export const PRESSURE_LEVER = Object.freeze({
  readyAngle: 0.25,
  travel: 0.75,
  pivotForward: 0.14,
  stanceForward: 0.72,
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

export function pressureLeverStance(game, control) {
  const target = control.hardware
    .getWorldPosition(new THREE.Vector3())
    .add(new THREE.Vector3(-0.22, 0, PRESSURE_LEVER.stanceForward));
  target.y = supportAt(game, target.x, target.z, target.y).height;
  return target;
}

export function beginPressureWheel(game, control) {
  if (
    control.kind !== "valve" ||
    game.pressureRelay.saved.opened !== control.bank
  )
    return false;
  return beginPressureOperation(game, control, pressureWheelStance(control));
}

export function beginPressureLever(game, control) {
  const h = game.pressureRelay;
  if (
    !h.saved.recovered ||
    h.motion ||
    (control.kind !== "lift" && control.kind !== "call") ||
    (control.kind === "call" && control.stop === h.saved.lift)
  )
    return false;
  return beginPressureOperation(
    game,
    control,
    pressureLeverStance(game, control),
  );
}

function beginPressureOperation(game, control, target) {
  const h = game.pressureRelay,
    p = game.player.position;
  if (
    game.paused ||
    h.operation ||
    game.health <= 0 ||
    !game.grounded ||
    game.swimming ||
    game.diving ||
    torchHandsBusy(game)
  )
    return false;
  const front = target.z - (control.kind === "valve" ? 0.12 : 0.37);
  if (p.z < front || !clearApproach(game, p, target)) {
    game.cb.toast?.(
      control.kind === "valve"
        ? "Stand on the gallery in front of the valve’s two hand grips."
        : "Stand on the floor in front of the lift lever.",
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

export function syncPressureControl(game, control, dt, initial = false) {
  const h = game.pressureRelay;
  const op = h.operation?.control === control ? h.operation : null;
  const target = control.wheel ? Number(h.saved.opened > control.bank) : 0;
  control.turn = op
    ? op.turn
    : initial
      ? target
      : THREE.MathUtils.damp(control.turn, target, 10, dt);
  if (control.wheel)
    control.wheel.rotation.z =
      PRESSURE_WHEEL.readyAngle - (control.turn * Math.PI) / 2;
  else {
    control.lever.rotation.x =
      PRESSURE_LEVER.readyAngle + control.turn * PRESSURE_LEVER.travel;
    const position = control.lever.getWorldPosition(new THREE.Vector3());
    Object.assign(control.source, {
      x: position.x,
      y: position.y,
      z: position.z,
    });
    if (control.arrows) {
      const rising = h.motion ? h.motion.to > 1 : h.saved.lift === 0;
      control.arrows[0].visible = rising;
      control.arrows[1].visible = !rising;
    }
  }
  if (control.source)
    control.source.activity =
      !game.paused &&
      op &&
      pressureWheelPhase(op) > PRESSURE_WHEEL.turnStart &&
      pressureWheelPhase(op) < PRESSURE_WHEEL.detent
        ? 0.6
        : 0;
}

// Commit at the physical stop. Valves retain their open state; lift levers
// spring back after release while the requested journey continues.
export function advancePressureOperation(game, dt, input) {
  const h = game.pressureRelay,
    op = h?.operation;
  if (!op || game.paused) return false;
  const cancel = () => {
    h.operation = null;
    syncPressureControl(game, op.control, dt);
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
    if (op.control.kind === "valve") {
      h.saved.opened = op.control.bank + 1;
      h.time[op.control.bank] = 0;
      game.cb.toast?.(
        "Circuit open. Cross when the neighboring crowns meet.",
        4500,
      );
    } else {
      const stop =
        op.control.kind === "call" ? op.control.stop : 1 - h.saved.lift;
      h.motion = {
        time: 0,
        from: h.lift.root.position.y,
        to: stop ? 24.2 : 0.18,
      };
      game.cb.toast?.(
        op.control.kind === "call"
          ? "The return lift is on its way."
          : stop
            ? "Return lift rising to the dispatch gallery."
            : "Return lift descending to the intake floor.",
        3500,
      );
    }
    game.audio.tone("click");
    game.save();
    game.cb.update?.(game.state());
  }
  if (time >= PRESSURE_WHEEL.end) h.operation = null;
  syncPressureControl(game, op.control, dt);
  return true;
}

export function posePressureOperation(game) {
  const h = game.pressureRelay,
    op = h?.operation;
  if (!op || !game.rig) return;
  const t = pressureWheelPhase(op),
    w = PRESSURE_WHEEL;
  const weight =
    THREE.MathUtils.smoothstep(t, w.reachStart, w.reach) *
    (1 - THREE.MathUtils.smoothstep(t, w.lift, w.release));
  const handle = op.control.wheel || op.control.lever;
  handle.updateWorldMatrix(true, true);
  const rotation = handle.getWorldQuaternion(new THREE.Quaternion());
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
    (op.control.grips || [null, op.control.grip]).map(
      (g) => g && g.getWorldPosition(new THREE.Vector3()).add(away),
    ),
    new THREE.Vector3(-1, 0, 0).applyQuaternion(rotation),
    new THREE.Vector3(0, 1, 0).applyQuaternion(rotation),
    weight,
    closure,
    true,
  );
}
