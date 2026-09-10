import * as THREE from "three";
import { boxEntry } from "./camera-collision.js";
import { buildCoralPumpArt } from "./coral-pump-art.js";
import { finishFieldTask } from "./field-world.js";
import {
  PUMP_FIELD,
  PUMP_SETTLE_SECONDS,
  pumpPartsReady,
  pumpComplete,
  normalizeCoralPump,
  pumpPressureTarget,
  advancePump,
} from "./coral-pump-rules.js";

export function buildCoralPump(game) {
  game.coralPump = null;
  if (game.level.id !== "tides") return;
  const feature = game.items.find((f) => f.id === PUMP_FIELD);
  if (!feature) return;
  const x = feature.x * 7,
    z = feature.z * 7,
    y = game.groundHeight(x, z);
  const root = new THREE.Group();
  root.name = "The coral pump";
  root.position.set(x, y, z);
  game.world.add(root);
  const saved = normalizeCoralPump(game.progress.coralPump, game.progress);
  game.progress.coralPump = saved;
  const done = pumpComplete(game.progress);
  const p = (game.coralPump = {
    root,
    x,
    y,
    z,
    feature,
    saved,
    solids: [],
    controls: { seat: new THREE.Vector3(x, y, z + 2.5) },
    pips: {},
    time: { value: 0 },
    pressure: done ? 44 : 0,
    stable: done ? PUMP_SETTLE_SECONDS : 0,
    sources: [],
  });
  buildCoralPumpArt(game, p);
  p.sources.push(
    {
      id: "coral-pump-bearing",
      kind: "machine",
      x,
      y: y + 1.85,
      z,
      gain: 0.08,
      near: 2,
      range: 24,
      activity: 0,
    },
    {
      id: "coral-pump-outflow",
      kind: "stream",
      x: x + 5.1,
      y: y + 0.22,
      z: z + 1.7,
      gain: 0.14,
      near: 2,
      range: 28,
      activity: 0,
    },
  );
  updateCoralPump(game, 0);
}
export function updateCoralPump(game, dt) {
  const p = game.coralPump;
  if (!p) return;
  const done = pumpComplete(game.progress);
  if (!game.paused) {
    p.time.value += dt;
    if (done) {
      p.pressure = pumpPressureTarget(p.saved);
      p.stable = PUMP_SETTLE_SECONDS;
    } else if (
      game.progress.stage === 2 &&
      p.saved.installed &&
      dt > 0 &&
      advancePump(p, dt)
    )
      finishFieldTask(game, p.feature);
    p.rotor.rotation.z -=
      dt * (p.saved.installed ? p.saved.intake / 3 : 0) * 3.8;
  }
  p.rotor.visible = p.saved.installed;
  for (const key of ["intake", "bypass"]) {
    p.wheels[key].rotation.z = THREE.MathUtils.damp(
      p.wheels[key].rotation.z,
      -p.saved[key] * Math.PI * 0.65,
      8,
      game.paused ? 0 : dt,
    );
    p.pips[key].forEach((pip, i) => {
      pip.visible = i === p.saved[key];
    });
  }
  p.needle.rotation.z = -(2.1 - (p.pressure / 80) * 4.2);
  for (const needle of p.repeaters) needle.rotation.z = p.needle.rotation.z;
  const flow = p.saved.installed ? Math.min(1, p.pressure / 44) : 0;
  p.jet.visible = p.foam.visible = flow > 0.035;
  p.jet.scale.x = p.jet.scale.z = Math.sqrt(Math.max(0.01, flow));
  p.foam.scale.setScalar(0.8 + 0.14 * Math.sin(p.time.value * 6));
  p.outletWater.material.opacity = 0.3 + 0.5 * flow;
  p.sources[0] &&
    (p.sources[0].activity = game.paused
      ? 0
      : p.saved.installed
        ? p.saved.intake / 3
        : 0);
  p.sources[1] && (p.sources[1].activity = game.paused ? 0 : flow);
}
function nearControl(game) {
  const p = game.coralPump;
  if (
    !p ||
    game.progress.stage !== 2 ||
    pumpComplete(game.progress) ||
    game.diving ||
    game.swimming ||
    !game.grounded ||
    game.climb
  )
    return null;
  let best = null,
    distance = 1.55;
  for (const [key, pos] of Object.entries(p.controls)) {
    if (key === "seat" && p.saved.installed) continue;
    const d = Math.hypot(
      game.player.position.x - pos.x,
      game.player.position.z - pos.z,
    );
    if (d < distance && Math.abs(game.player.position.y - pos.y) < 0.6) {
      best = key;
      distance = d;
    }
  }
  return best;
}
export function coralPumpHint(game) {
  const key = nearControl(game);
  if (!key) return null;
  const p = game.coralPump;
  return {
    key: "E",
    label: !pumpPartsReady(game.progress)
      ? "Recover the impeller and read the pumpkeeper’s diagram first"
      : !p.saved.installed
        ? key === "seat"
          ? "Install the recovered impeller"
          : "Install the impeller in the central seat first"
        : `Turn ${key} wheel · ${p.saved[key]} / 3 open`,
  };
}
export function coralPumpInteract(game) {
  const key = nearControl(game);
  if (!key) return false;
  if (game.paused) return true;
  const p = game.coralPump;
  if (
    !pumpPartsReady(game.progress) ||
    (!p.saved.installed && key !== "seat")
  ) {
    game.cb.toast?.(coralPumpHint(game).label);
    return true;
  }
  if (!p.saved.installed) {
    p.saved.installed = true;
    game.carrying = false;
    game.cb.toast?.(
      "Impeller seated. Open the intake at least halfway, then adjust the bypass to hold the needle between the gold ticks.",
      6500,
    );
  } else {
    p.saved[key] = (p.saved[key] + 1) % 4;
    p.stable = 0;
    game.cb.toast?.(
      `${key === "intake" ? "Intake" : "Bypass"} ${p.saved[key]} / 3 open · watch the pressure settle`,
    );
  }
  game.audio.tone("field");
  game.save();
  updateCoralPump(game, 0);
  game.cb.update?.(game.state());
  return true;
}
export function coralPumpObjective(game) {
  const p = game.coralPump;
  if (
    !p ||
    game.progress.stage !== 2 ||
    !pumpPartsReady(game.progress) ||
    pumpComplete(game.progress)
  )
    return null;
  return {
    text: !p.saved.installed
      ? "Install the recovered pump impeller"
      : p.stable > 0
        ? `Steady flow · ${Math.floor(p.stable)} / ${PUMP_SETTLE_SECONDS} seconds`
        : "Balance the pump · intake ≥ half, needle between gold ticks",
    target: { x: p.x / 7, z: (p.z + 2.5) / 7 },
  };
}
export function coralPumpBlocked(game, x, z, y, clearance = 1.8) {
  const p = game.coralPump;
  if (!p || Math.abs(x - p.x) > 9 || Math.abs(z - p.z) > 7) return false;
  return p.solids.some(
    (s) =>
      Math.abs(x - s.x) < s.w + 0.23 &&
      Math.abs(z - s.z) < s.d + 0.23 &&
      y < s.top &&
      y + clearance > s.bottom,
  );
}
export function coralPumpOccludes(game, from, to) {
  const p = game.coralPump;
  if (!p) return false;
  const hits = (min, max) => boxEntry(from, to, { min, max }, 0, true) !== null;
  if (
    !hits(
      { x: p.x - 9, y: p.y - 1, z: p.z - 6 },
      { x: p.x + 9, y: p.y + 6, z: p.z + 6 },
    )
  )
    return false;
  return p.solids.some((s) =>
    hits(
      { x: s.x - s.w, y: s.bottom, z: s.z - s.d },
      { x: s.x + s.w, y: s.top, z: s.z + s.d },
    ),
  );
}
