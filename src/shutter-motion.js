import * as THREE from "three";
import { supportAt } from "./character-motion.js";
import { poseCylinderGrip } from "./hand-grip.js";
import { torchHandsBusy } from "./torch.js";
import { finishFieldTask } from "./field-world.js";
import { SHUTTER_STATIONS, shutterGust } from "./shutter-house-rules.js";

export const SHUTTER_WHEEL = Object.freeze({
  align: 0.25,
  reachStart: 0.08,
  reach: 0.28,
  grasp: 0.42,
  turnStart: 0.5,
  detent: 1.15,
  open: 1.25,
  lift: 1.4,
  release: 1.6,
  resetStart: 1.42,
  end: 1.75,
});
export const shutterTurnPhase = (op) =>
  op.time - op.alignTime + SHUTTER_WHEEL.align;
export function shutterStance(game, index) {
  const h = game.shutterHouse,
    s = SHUTTER_STATIONS[index];
  return new THREE.Vector3(h.x + s.x, h.y + s.height, h.z + s.z + 0.78);
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
export function prepareShutterTurn(game, index) {
  const h = game.shutterHouse,
    p = game.player.position,
    target = shutterStance(game, index);
  if (
    torchHandsBusy(game) ||
    game.swimming ||
    game.diving ||
    game.crouching ||
    h.wheelTurn[index] > 0.02
  )
    return false;
  if (p.z < target.z - 0.35 || !clearApproach(game, p, target)) {
    game.cb.toast?.(
      "Stand on the landing in front of the shutter's two grips.",
    );
    return false;
  }
  h.turn = {
    index,
    time: 0,
    amount: 0,
    committed: false,
    from: p.clone(),
    target,
    last: p.clone(),
    yaw: game.avatar.rotation.y,
    alignTime: Math.max(SHUTTER_WHEEL.align, (p.distanceTo(target) * 1.5) / 4),
  };
  game.keys?.clear();
  return true;
}
export function syncShutterControls(game, dt = 0) {
  const h = game.shutterHouse;
  for (let i = 0; i < 3; i++) {
    const op = h.turn?.index === i ? h.turn : null;
    const phase = op ? shutterTurnPhase(op) : 0;
    const desired =
      (h.saved.turns[i] + (op && !op.committed ? op.amount : 0)) / 3;
    h.louverAmount[i] = op
      ? desired
      : THREE.MathUtils.damp(h.louverAmount[i], desired, 14, dt);
    for (const slat of h.louvers[i])
      slat.rotation.x = (1 - h.louverAmount[i]) * Math.PI * 0.47;
    h.wheelTurn[i] = op
      ? op.amount *
        (1 -
          THREE.MathUtils.smoothstep(
            phase,
            SHUTTER_WHEEL.resetStart,
            SHUTTER_WHEEL.end,
          ))
      : THREE.MathUtils.damp(h.wheelTurn[i], 0, 18, dt);
    const f = game.items.find((f) => f.id === `field-5-${i}`);
    if (f?.core)
      f.core.rotation.z = Math.PI / 4 - (h.wheelTurn[i] * Math.PI) / 2;
    if (f?.shutterRatchet)
      f.shutterRatchet.rotation.z = -h.louverAmount[i] * Math.PI * 1.5;
    const gust = shutterGust(i, h.time, h.saved.turns[i]);
    h.sources[i * 2].activity = game.paused ? 0 : gust.activity;
    h.sources[i * 2 + 1].activity =
      game.paused || !op
        ? 0
        : phase > SHUTTER_WHEEL.turnStart && phase < SHUTTER_WHEEL.detent
          ? 1
          : phase > SHUTTER_WHEEL.resetStart && phase < SHUTTER_WHEEL.end
            ? 0.2
            : 0;
  }
}
export function advanceShutterTurn(game, dt, input) {
  const h = game.shutterHouse,
    op = h?.turn;
  if (!op || game.paused) return false;
  const cancel = () => {
    h.turn = null;
    syncShutterControls(game, 0);
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
    Math.hypot(input.x, input.z) > 0.05 ||
    game.keys.has("Space") ||
    game.player.position.distanceTo(op.last) > 0.2
  )
    return cancel();
  op.time += dt;
  const align = THREE.MathUtils.smoothstep(op.time, 0, op.alignTime),
    next = op.from.clone().lerp(op.target, align);
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
  const phase = shutterTurnPhase(op);
  op.amount = THREE.MathUtils.smoothstep(
    phase,
    SHUTTER_WHEEL.turnStart,
    SHUTTER_WHEEL.detent,
  );
  if (phase >= SHUTTER_WHEEL.detent && !op.committed) {
    op.committed = true;
    h.saved.turns[op.index] = Math.min(3, h.saved.turns[op.index] + 1);
    if (h.saved.turns[op.index] === 3)
      finishFieldTask(
        game,
        game.items.find((f) => f.id === `field-5-${op.index}`),
      );
    else {
      game.audio.tone("field");
      game.cb.toast?.(
        `${h.saved.turns[op.index]} / 3 catches seated · Use for the next catch`,
      );
      game.save();
    }
  }
  syncShutterControls(game, 0);
  if (phase >= SHUTTER_WHEEL.end) h.turn = null;
  return true;
}
export function poseShutterTurn(game) {
  const op = game.shutterHouse?.turn;
  if (!op || !game.rig) return;
  const w = SHUTTER_WHEEL,
    t = shutterTurnPhase(op),
    f = game.items.find((f) => f.id === `field-5-${op.index}`);
  const weight =
    THREE.MathUtils.smoothstep(t, w.reachStart, w.reach) *
    (1 - THREE.MathUtils.smoothstep(t, w.lift, w.release));
  f.core.updateWorldMatrix(true, true);
  const rotation = f.core.getWorldQuaternion(new THREE.Quaternion());
  const away = new THREE.Vector3(
    0,
    0,
    0.18 *
      Math.max(
        1 - THREE.MathUtils.smoothstep(t, w.reach, w.grasp),
        THREE.MathUtils.smoothstep(t, w.open, w.lift),
      ),
  );
  poseCylinderGrip(
    game,
    f.shutterGrips.map((grip) =>
      grip.getWorldPosition(new THREE.Vector3()).add(away),
    ),
    new THREE.Vector3(-1, 0, 0).applyQuaternion(rotation),
    new THREE.Vector3(0, 1, 0).applyQuaternion(rotation),
    weight,
    THREE.MathUtils.smoothstep(t, w.grasp, w.turnStart) *
      (1 - THREE.MathUtils.smoothstep(t, w.detent, w.open)),
    true,
  );
}
