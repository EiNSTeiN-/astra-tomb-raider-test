import * as THREE from "three";
import { supportAt } from "./character-motion.js";
import { torchHandsBusy } from "./torch.js";
import { poseCylinderGrip } from "./hand-grip.js";
import { ORBIT_RINGS } from "./orbit-rules.js";

export const ORBIT_TURN = Object.freeze({
  align: 0.25,
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
export function orbitBearingStance(control) {
  return control.hardware.localToWorld(new THREE.Vector3(0, 0, 0.62));
}
function clearApproach(game, from, to) {
  const count = Math.max(1, Math.ceil(from.distanceTo(to) / 0.08));
  for (let i = 0; i <= count; i++) {
    const p = from.clone().lerp(to, i / count);
    if (
      !game.canMove(p.x, p.z, p.y - game.groundHeight(p.x, p.z)) ||
      Math.abs(supportAt(game, p.x, p.z, p.y).height - p.y) > 0.08
    )
      return false;
  }
  return true;
}
export const orbitTurnPhase = (op) => op.time - op.alignTime + ORBIT_TURN.align;

export function beginOrbitBearing(game, control) {
  const h = game.orbitVault,
    p = game.player.position;
  if (
    game.paused ||
    h.operation ||
    !game.grounded ||
    game.health <= 0 ||
    game.swimming ||
    game.diving ||
    torchHandsBusy(game) ||
    control.kind !== "bearing" ||
    !h.saved.started ||
    h.saved.aligned !== control.index ||
    h.saved.rest < control.index + 1
  )
    return false;
  const target = orbitBearingStance(control);
  if (p.x > target.x + 0.12 || !clearApproach(game, p, target)) {
    game.cb.toast?.(
      "Stand on the landing west of the bearing’s two hand grips.",
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
    alignTime: Math.max(ORBIT_TURN.align, (p.distanceTo(target) * 1.5) / 4),
  };
  game.nearest = null;
  game.cb.update?.(game.state());
  return true;
}
export function syncOrbitBearing(game, c, dt, initial = false) {
  const h = game.orbitVault,
    op = h.operation?.control === c ? h.operation : null;
  const target = Number(h.saved.aligned > c.index);
  c.turn = op
    ? op.turn
    : initial
      ? target
      : THREE.MathUtils.damp(c.turn, target, 10, dt);
  c.wheel.rotation.z = Math.PI / 4 - (c.turn * Math.PI) / 2;
  c.source.activity =
    !game.paused &&
    op &&
    orbitTurnPhase(op) > ORBIT_TURN.turnStart &&
    orbitTurnPhase(op) < ORBIT_TURN.detent
      ? 0.6
      : 0;
}
export function advanceOrbitBearing(game, dt, input) {
  const h = game.orbitVault,
    op = h?.operation;
  if (!op || game.paused) return false;
  const cancel = () => {
    h.operation = null;
    syncOrbitBearing(game, op.control, dt);
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
    game.carrying ||
    game.aimUntil > game.elapsed ||
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
  game.jumpY = next.y - game.groundHeight(next.x, next.z);
  game.avatar.rotation.y =
    op.yaw +
    Math.atan2(Math.sin(Math.PI / 2 - op.yaw), Math.cos(Math.PI / 2 - op.yaw)) *
      align;
  const time = orbitTurnPhase(op);
  op.turn = THREE.MathUtils.smoothstep(
    time,
    ORBIT_TURN.turnStart,
    ORBIT_TURN.detent,
  );
  if (time >= ORBIT_TURN.detent && !op.committed) {
    op.committed = true;
    h.saved.aligned = op.control.index + 1;
    game.audio.tone("click");
    game.save();
    game.cb.toast?.(
      `${ORBIT_RINGS[op.control.index].name} bearing calibrated. ${h.saved.aligned < 3 ? "The next ring is turning." : "Recover the chart at the centre."}`,
      4500,
    );
    game.cb.update?.(game.state());
  }
  if (time >= ORBIT_TURN.end) h.operation = null;
  syncOrbitBearing(game, op.control, dt);
  return true;
}
export function poseOrbitBearing(game) {
  const op = game.orbitVault?.operation;
  if (!op || !game.rig) return;
  const t = orbitTurnPhase(op),
    w = ORBIT_TURN;
  const weight =
    THREE.MathUtils.smoothstep(t, w.reachStart, w.reach) *
    (1 - THREE.MathUtils.smoothstep(t, w.lift, w.release));
  const wheel = op.control.wheel;
  wheel.updateWorldMatrix(true, true);
  const rotation = wheel.getWorldQuaternion(new THREE.Quaternion());
  const approach = 1 - THREE.MathUtils.smoothstep(t, w.reach, w.grasp),
    lift = THREE.MathUtils.smoothstep(t, w.open, w.lift);
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
