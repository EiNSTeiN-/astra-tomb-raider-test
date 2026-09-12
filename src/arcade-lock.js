import * as THREE from "three";
import { buildArcadeArt } from "./arcade-lock-art.js";
import {
  ARCADE_RISE,
  ARCADE_FILL_SECONDS,
  arcadeDone,
  arcadeDeckAt,
  arcadeBlocked,
  arcadeFoundationDistance,
  normalizeArcadeLock,
  onArcadePontoon,
} from "./arcade-lock-rules.js";
import { finishFieldTask } from "./field-world.js";
import { currentFieldTask } from "./expeditions.js";
import { torchHandsBusy } from "./torch.js";
import { poseCylinderGrip } from "./hand-grip.js";
import { supportAt } from "./character-motion.js";

const smooth = (t, a, b) => THREE.MathUtils.smoothstep(t, a, b);
const approach = (value, target, amount) =>
  value +
  Math.sign(target - value) * Math.min(Math.abs(target - value), amount);
export function buildArcadeLock(game) {
  game.arcadeLock = null;
  if (!game.map.arcadeLock) return;
  const root = new THREE.Group(),
    y = game.terrainProfile.arcadeY;
  root.position.y = y;
  root.name = "The sunken arcade";
  game.world.add(root);
  const saved = normalizeArcadeLock(game.progress.arcadeLock, game.progress);
  game.progress.arcadeLock = saved;
  const h = (game.arcadeLock = {
    root,
    y,
    saved,
    decks: [],
    solids: [],
    sources: [],
    turn: null,
    ready: -1,
    gate: saved.level > 0 ? 1 : 0,
    inspection: arcadeDone(game.progress, 0) ? 1 : 0,
    weight: arcadeDone(game.progress, 1) ? 1 : 0,
    exit: arcadeDone(game.progress, 2) ? 1 : 0,
    time: 0,
  });
  buildArcadeArt(game, h);
  updateArcadeLock(game, 0);
}
function world(control) {
  return control.group.getWorldPosition(new THREE.Vector3());
}
function reachable(game, c) {
  const p = game.player?.position,
    q = world(c);
  return !!(
    p &&
    game.grounded &&
    !game.swimming &&
    !game.diving &&
    Math.abs(p.y - q.y) < 0.3 &&
    Math.hypot(p.x - q.x, p.z - q.z) < 2.1 &&
    p.z > q.z + 0.45
  );
}
function clearApproach(game, from, to) {
  const count = Math.max(1, Math.ceil(from.distanceTo(to) / 0.1));
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
function startTurn(game, c) {
  const h = game.arcadeLock,
    p = game.player.position,
    target = world(c);
  target.z += 0.78;
  if (
    h.turn ||
    game.paused ||
    game.health <= 0 ||
    !reachable(game, c) ||
    torchHandsBusy(game) ||
    game.crouching ||
    !clearApproach(game, p, target)
  )
    return false;
  h.turn = {
    control: c,
    time: 0,
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
export function arcadeFieldAction(game, f) {
  const h = game.arcadeLock,
    c = h?.controls.find((c) => c.feature === f);
  if (!c || !reachable(game, c)) return false;
  if (f.step === 2 && h.saved.level < 0.999) {
    game.cb.toast?.("Fill the lock before securing the upper arcade gate.");
    return false;
  }
  if (h.ready === f.step) {
    h.ready = -1;
    return true;
  }
  if (!startTurn(game, c))
    game.cb.toast?.("Stand in front of the handwheel with both hands free.");
  return false;
}
function nearby(game) {
  const h = game.arcadeLock;
  return h?.controls.find(
    (c) =>
      reachable(game, c) &&
      (c.kind !== "field" || !arcadeDone(game.progress, c.field)),
  );
}
export function arcadeInteract(game) {
  const h = game.arcadeLock;
  if (!h || game.paused || game.health <= 0) return false;
  if (h.turn) return true;
  const c = nearby(game);
  if (!c) return false;
  if (c.kind === "field") {
    finishFieldTask(game, c.feature);
    return true;
  }
  if (!arcadeDone(game.progress, 1))
    game.cb.toast?.("Raise the counterweight in the inspection passage first.");
  else if (arcadeDone(game.progress, 2))
    game.cb.toast?.(
      "The arcade is secured. Follow the open gate to the return stair.",
    );
  else if (
    Math.abs(h.saved.level - h.saved.target) > 0.001 ||
    h.gate !== (h.saved.target ? 1 : 0)
  )
    game.cb.toast?.(
      "The lock is changing level. Wait for the water to settle.",
    );
  else if (c.kind === "call" && c.target === h.saved.target)
    game.cb.toast?.("The platform is at this landing.");
  else if (!startTurn(game, c))
    game.cb.toast?.("Stand in front of the handwheel with both hands free.");
  return true;
}
export function advanceArcadeTurn(game, dt, input) {
  const h = game.arcadeLock,
    op = h?.turn;
  if (!op || game.paused) return false;
  if (
    !game.grounded ||
    game.health <= 0 ||
    game.swimming ||
    game.diving ||
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
  op.control.wheel.rotation.z =
    Math.PI / 4 -
    ((smooth(phase, 0.5, 1.15) * Math.PI) / 2) *
      (1 - smooth(phase, 1.42, 1.75));
  if (phase >= 1.15 && !op.committed) {
    op.committed = true;
    if (op.control.kind === "field") {
      h.ready = op.control.field;
      finishFieldTask(game, op.control.feature);
    } else {
      h.saved.target =
        op.control.kind === "call" ? op.control.target : 1 - h.saved.target;
      game.audio.tone("field");
      game.save();
    }
  }
  if (phase >= 1.75) h.turn = null;
  return true;
}
export function poseArcadeTurn(game) {
  const op = game.arcadeLock?.turn;
  if (!op || !game.rig) return;
  const t = op.time - op.align + 0.25,
    c = op.control,
    weight = smooth(t, 0.08, 0.28) * (1 - smooth(t, 1.4, 1.6));
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
export function updateArcadeLock(game, dt) {
  const h = game.arcadeLock;
  if (!h) return;
  dt = game.paused || !Number.isFinite(dt) ? 0 : Math.max(0, Math.min(1, dt));
  h.time += dt;
  const riding = onArcadePontoon(game) && !game.climb,
    p = game.player?.position,
    before = h.saved.level,
    oldY = h.pontoonDeck.y,
    oldGate = h.gate,
    previousMechanics = [h.inspection, h.weight, h.exit];
  h.inspection = approach(
    h.inspection,
    arcadeDone(game.progress, 0) ? 1 : 0,
    dt / 2,
  );
  h.weight = approach(h.weight, arcadeDone(game.progress, 1) ? 1 : 0, dt / 4);
  h.exit = approach(h.exit, arcadeDone(game.progress, 2) ? 1 : 0, dt / 3);
  // A watertight shutter closes the low dock before the inlet opens.
  h.gate = approach(
    h.gate,
    h.saved.target || h.saved.level > 0 ? 1 : 0,
    dt / 1.5,
  );
  if (!h.saved.target || h.gate === 1)
    h.saved.level = approach(
      h.saved.level,
      h.saved.target,
      dt / ARCADE_FILL_SECONDS,
    );
  const y = h.y + 0.9 + ARCADE_RISE * h.saved.level,
    dy = y - oldY;
  h.pontoon.position.y = y - h.y;
  h.pontoonDeck.y = y;
  h.pontoonSolid.bottom = y - 0.85;
  h.pontoonSolid.top = y;
  h.flowPlinth.bottom = y;
  h.flowPlinth.top = y + 1;
  for (const r of h.pontoonRails) {
    r.bottom = y;
    r.top = y + 1.05;
  }
  if (riding && dt) {
    p.y += dy;
    game.jumpY = p.y - game.groundHeight(p.x, p.z);
    game.fallPeak = p.y;
    if (h.turn)
      for (const key of ["from", "target", "last"]) h.turn[key].y += dy;
  }
  if (game.climb?.arcadePontoon) game.climb.end.y = y;
  h.boardGate.position.y = -5.25 + 6.3 * h.gate;
  h.boardSolid.bottom = h.y + h.boardGate.position.y;
  h.boardSolid.top = h.boardSolid.bottom + 6.3;
  h.inspectionGate.position.y = 0.4 + 3.3 * smooth(h.inspection, 0, 1);
  h.inspectionSolid.bottom = h.y + h.inspectionGate.position.y;
  h.inspectionSolid.top = h.inspectionSolid.bottom + 2.8;
  h.exitGate.position.y = 8.8 + 3.8 * smooth(h.exit, 0, 1);
  h.exitSolid.bottom = h.y + h.exitGate.position.y;
  h.exitSolid.top = h.exitSolid.bottom + 3.4;
  h.counterweight.position.y = -1.6 + 5.7 * smooth(h.weight, 0, 1);
  h.weightSolid.bottom = h.y + h.counterweight.position.y - 0.9;
  h.weightSolid.top = h.weightSolid.bottom + 1.8;
  const weightTop = h.counterweight.position.y + 0.9;
  h.weightCable.position.y = (8.9 + weightTop) / 2;
  h.weightCable.scale.y = 8.9 - weightTop;
  const waterY = 0.6 + ARCADE_RISE * h.saved.level;
  h.flow.visible = h.saved.target === 1 && h.saved.level < 1 && h.gate === 1;
  h.flow.position.y = (7.3 + waterY) / 2;
  h.flow.scale.y = 7.3 - waterY;
  h.flow.material.opacity = 0.4 + 0.07 * Math.sin(h.time * 17);
  const water = game.waterMeshes.find((w) => w.userData.arcade);
  if (water) water.position.y = h.y + waterY;
  for (const c of h.controls)
    if (h.turn?.control !== c)
      c.wheel.rotation.z = THREE.MathUtils.damp(
        c.wheel.rotation.z,
        Math.PI / 4,
        15,
        dt,
      );
  for (const s of h.sources) {
    const step = Number(s.id.at(-1));
    if (s.control !== undefined) {
      const c = h.controls[s.control],
        p = world(c);
      s.x = p.x;
      s.y = p.y + 1.35;
      s.z = p.z;
      s.activity = game.paused
        ? 0
        : h.turn?.control === c && !h.turn.committed
          ? 0.6
          : 0;
      continue;
    }
    s.activity = game.paused
      ? 0
      : s.id === "arcade-fill"
        ? h.flow.visible
          ? 1
          : 0
        : s.id === "arcade-platform"
          ? before !== h.saved.level || oldGate !== h.gate
            ? 0.7
            : 0
          : (h.turn?.control.field === step && !h.turn.committed) ||
              previousMechanics[step] !== [h.inspection, h.weight, h.exit][step]
            ? 0.6
            : 0;
    if (s.id === "arcade-platform") s.y = y + 0.4;
    if (s.id === "arcade-fill") s.y = h.y + waterY;
  }
  const support = p ? arcadeDeckAt(game, p.x, p.z, p.y) : null;
  if (
    dt &&
    game.grounded &&
    support?.surface.anchor !== undefined &&
    Math.abs(p.y - support.height) < 0.25
  ) {
    const a = support.surface.anchor;
    if (
      a === 0 ||
      (a === 1 && arcadeDone(game.progress, 1)) ||
      (a === 2 && arcadeDone(game.progress, 2))
    )
      h.saved.anchor = a;
  }
}
export function tryArcadeClimb(game, direction) {
  const h = game.arcadeLock,
    p = game.player.position;
  if (
    !h ||
    !game.swimming ||
    game.diving ||
    arcadeFoundationDistance(p.x, p.z) > 0
  )
    return false;
  const candidates = [
    h.pontoonDeck,
    ...h.decks.filter((d) => d.anchor === 1 || (d.x === 75.5 && h.gate === 0)),
  ];
  for (const d of candidates) {
    if (d.y - p.y < 0.2 || d.y - p.y > 2 || Math.abs(p.z - 217) > 1.3) continue;
    const x = THREE.MathUtils.clamp(p.x, d.x - d.w + 0.6, d.x + d.w - 0.6),
      z = THREE.MathUtils.clamp(p.z, 216.9, 217.7),
      dx = x - p.x,
      dz = z - p.z,
      dist = Math.hypot(dx, dz);
    if (
      dist < 0.1 ||
      dist > 2 ||
      (dx * direction.x + dz * direction.z) / dist < 0.5 ||
      arcadeBlocked(game, x, z, d.y)
    )
      continue;
    game.climb = {
      time: 0,
      start: p.clone(),
      end: new THREE.Vector3(x, d.y, z),
      height: d.y - p.y,
      arcade: true,
      arcadePontoon: !!d.pontoon,
    };
    game.swimming = false;
    game.diving = false;
    game.avatar.rotation.y = Math.atan2(dx, dz);
    game.audio.tone("jump");
    return true;
  }
  return false;
}
export function arcadeHint(game) {
  const h = game.arcadeLock;
  if (!h) return null;
  if (h.turn)
    return { key: "E", label: "Turning the handwheel · move to cancel" };
  if (
    game.swimming &&
    arcadeFoundationDistance(game.player.position.x, game.player.position.z) ===
      0
  )
    return {
      key: "Space",
      label:
        "Swim beside an open pontoon edge · Jump toward it to climb aboard",
    };
  const c = nearby(game);
  if (
    !c ||
    (c.kind === "field" &&
      currentFieldTask(game.level, game.progress)?.id !== c.feature.id)
  )
    return null;
  return {
    key: "E",
    label:
      c.kind === "field"
        ? c.feature.label
        : !arcadeDone(game.progress, 1)
          ? "Raise the inspection counterweight first"
          : arcadeDone(game.progress, 2)
            ? "Arcade secured · use the return stair"
            : Math.abs(h.saved.level - h.saved.target) > 0.001 ||
                h.gate !== (h.saved.target ? 1 : 0)
              ? "Lock changing level · wait"
              : c.kind === "call"
                ? c.target
                  ? "Call the pontoon to the upper gallery"
                  : "Drain the lock · recall the pontoon"
                : h.saved.target
                  ? "Drain the lock"
                  : "Fill the lock · ride the pontoon",
  };
}
export function arcadeObjective(game) {
  const h = game.arcadeLock,
    p = game.player?.position;
  if (
    !h ||
    !p ||
    game.progress.stage < 5 ||
    game.progress.stage > 5 ||
    arcadeFoundationDistance(p.x, p.z) > 8
  )
    return null;
  return {
    level: h.saved.level,
    moving: Math.abs(h.saved.level - h.saved.target) > 0.001,
    text: arcadeDone(game.progress, 2)
      ? "Arcade gate open · descend the return stair to the sanctuary"
      : !arcadeDone(game.progress, 0)
        ? "Enter from the east stair · tension the inspection cable"
        : !arcadeDone(game.progress, 1)
          ? "Follow the covered inspection passage to the counterweight"
          : h.saved.level < 0.999
            ? "Return to the lower dock · board the pontoon and fill the lock"
            : "Jump west onto the upper arcade · cross the two broken galleries to winch 3",
  };
}
