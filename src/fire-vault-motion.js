import * as THREE from "three";
import { supportAt } from "./character-motion.js";
import { extinguishTorch, torchHandsBusy } from "./torch.js";
import { poseCylinderGrip } from "./hand-grip.js";

export const CAUSEWAY_WHEEL = Object.freeze({
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
  returnStart: 1.76,
  end: 2.1,
});

export function wheelStance(control) {
  return control.position.clone().add(new THREE.Vector3(0, 0, 0.54));
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

export function beginCausewayWheel(game, control) {
  const v = game.fireVault,
    p = game.player.position;
  if (
    game.paused ||
    v.operation ||
    v.rotors.some((r) => r.moving) ||
    game.health <= 0 ||
    !game.grounded ||
    game.swimming ||
    game.diving ||
    torchHandsBusy(game)
  )
    return false;
  const target = wheelStance(control);
  if (p.z < control.position.z + 0.18 || !clearApproach(game, p, target)) {
    game.cb.toast?.("Stand on the platform beside the wheel’s two hand grips.");
    return false;
  }
  v.operation = {
    index: control.index,
    control,
    from: p.clone(),
    target,
    last: p.clone(),
    yaw: game.avatar.rotation.y,
    time: 0,
    turn: 0,
    committed: false,
    startAngle: v.rotors[control.index].angle,
    // Smoothstep peaks at 1.5 times average speed. Stay at walking speed.
    alignTime: Math.max(
      CAUSEWAY_WHEEL.alignTime,
      (p.distanceTo(target) * 1.5) / 4,
    ),
  };
  extinguishTorch(game, "Torch put out to turn the crossing with both hands.");
  game.nearest = null;
  game.cb.update?.(game.state());
  return true;
}

export function causewayPhase(op) {
  return op.time - op.alignTime + CAUSEWAY_WHEEL.alignTime;
}

export function causewayReach(game) {
  const op = game.fireVault?.operation;
  if (!op) return 0;
  const time = causewayPhase(op);
  return (
    THREE.MathUtils.smoothstep(
      time,
      CAUSEWAY_WHEEL.reachStart,
      CAUSEWAY_WHEEL.reach,
    ) *
    (1 -
      THREE.MathUtils.smoothstep(
        time,
        CAUSEWAY_WHEEL.lift,
        CAUSEWAY_WHEEL.release,
      ))
  );
}

export function causewayWheelMoving(op) {
  const time = causewayPhase(op);
  return (
    (time > CAUSEWAY_WHEEL.turnStart && time < CAUSEWAY_WHEEL.detent) ||
    (time > CAUSEWAY_WHEEL.returnStart && time < CAUSEWAY_WHEEL.end)
  );
}

export function syncCausewayHandle(control, op, dt, initial = false) {
  if (op?.index === control.index) {
    const back = THREE.MathUtils.smoothstep(
      causewayPhase(op),
      CAUSEWAY_WHEEL.returnStart,
      CAUSEWAY_WHEEL.end,
    );
    control.handle.rotation.z =
      CAUSEWAY_WHEEL.readyAngle - (op.turn * (1 - back) * Math.PI) / 2;
  } else
    control.handle.rotation.z = initial
      ? CAUSEWAY_WHEEL.readyAngle
      : THREE.MathUtils.damp(
          control.handle.rotation.z,
          CAUSEWAY_WHEEL.readyAngle,
          10,
          dt,
        );
}

// This is an ordinary player action. Movement takes control immediately, pause
// freezes it, and only the detent commits the quarter-turn to persistent state.
export function advanceCausewayWheel(game, dt, input) {
  const v = game.fireVault,
    op = v?.operation;
  if (!op || game.paused) return false;
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
  ) {
    v.operation = null;
    return false;
  }
  op.time += dt;
  const align = THREE.MathUtils.smoothstep(op.time, 0, op.alignTime),
    next = op.from.clone().lerp(op.target, align);
  if (!clearApproach(game, game.player.position, next)) {
    v.operation = null;
    return false;
  }
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
  const time = causewayPhase(op);
  op.turn = THREE.MathUtils.smoothstep(
    time,
    CAUSEWAY_WHEEL.turnStart,
    CAUSEWAY_WHEEL.detent,
  );
  if (time >= CAUSEWAY_WHEEL.detent && !op.committed) {
    op.committed = true;
    v.saved.turns[op.index] = (v.saved.turns[op.index] + 1) % 4;
    game.audio.tone("click");
    game.save();
    game.cb.update?.(game.state());
  }
  if (time >= CAUSEWAY_WHEEL.end) v.operation = null;
  return true;
}

export function poseCausewayWheel(game) {
  const op = game.fireVault?.operation;
  if (!op || !game.rig) return;
  const weight = causewayReach(game);
  syncCausewayHandle(op.control, op, 0);
  op.control.handle.updateWorldMatrix(true, true);
  const rotation = op.control.handle.getWorldQuaternion(new THREE.Quaternion());
  const time = causewayPhase(op),
    approach =
      1 -
      THREE.MathUtils.smoothstep(
        time,
        CAUSEWAY_WHEEL.reach,
        CAUSEWAY_WHEEL.grasp,
      ),
    lift = THREE.MathUtils.smoothstep(
      time,
      CAUSEWAY_WHEEL.open,
      CAUSEWAY_WHEEL.lift,
    ),
    closure =
      THREE.MathUtils.smoothstep(
        time,
        CAUSEWAY_WHEEL.grasp,
        CAUSEWAY_WHEEL.turnStart,
      ) *
      (1 -
        THREE.MathUtils.smoothstep(
          time,
          CAUSEWAY_WHEEL.detent,
          CAUSEWAY_WHEEL.open,
        )),
    away = new THREE.Vector3(
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
