import * as THREE from "three";
import { buildDesertSurveyArt } from "./desert-survey-art.js";
import {
  SURVEY_LOOKOUTS,
  surveyDone,
  normalizeDesertSurvey,
  surveyBearing,
  surveyAngularError,
  surveyDoorMatches,
  surveyVisible,
} from "./desert-survey-rules.js";
import { currentFieldTask } from "./expeditions.js";
import { finishFieldTask } from "./field-world.js";
import { torchHandsBusy } from "./torch.js";

export function buildDesertSurvey(game) {
  game.desertSurvey = null;
  if (!game.map.desertSurvey) return;
  const root = new THREE.Group();
  root.name = "Survey of the buried threshold";
  game.world.add(root);
  const saved = normalizeDesertSurvey(
    game.progress.desertSurvey,
    game.progress,
  );
  game.progress.desertSurvey = saved;
  const h = (game.desertSurvey = {
    root,
    saved,
    decks: [],
    solids: [],
    controls: [],
    monuments: [],
    doors: [],
    sources: [],
    focus: null,
    ready: -1,
  });
  buildDesertSurveyArt(game, h);
  for (const c of h.controls) {
    const p = c.group.position.clone();
    p.y += 1.57;
    const bearing = surveyBearing(p, h.monuments[c.index]);
    h.saved.angles[c.index] ||= [bearing.yaw + 0.18, 0];
  }
  updateDesertSurvey(game, 0);
}
function reachable(game, c) {
  const p = game.player?.position,
    q = c.group.position;
  return (
    p &&
    game.grounded &&
    !game.swimming &&
    !game.diving &&
    Math.abs(p.y - q.y) < 0.25 &&
    Math.hypot(p.x - q.x, p.z - q.z) < 3.2
  );
}
export function leaveSurveyScope(game) {
  const h = game.desertSurvey,
    op = h?.focus;
  if (!op) return;
  h.saved.angles[op.control.index] = [game.yaw, game.pitch];
  op.control.yawRoot.visible = true;
  game.avatar.visible = op.avatarVisible;
  game.yaw = op.yaw;
  game.pitch = op.pitch;
  h.focus = null;
  game.keys.delete("Space");
  game.touchMove = { x: 0, z: 0 };
  game.moveVelocity = { x: 0, z: 0 };
}
function enterScope(game, c) {
  const h = game.desertSurvey;
  if (
    !reachable(game, c) ||
    game.paused ||
    game.health <= 0 ||
    game.crouching ||
    torchHandsBusy(game)
  )
    return false;
  h.focus = {
    control: c,
    position: game.player.position.clone(),
    yaw: game.yaw,
    pitch: game.pitch,
    avatarVisible: game.avatar.visible,
  };
  [game.yaw, game.pitch] = h.saved.angles[c.index];
  game.keys.clear();
  game.moveVelocity = { x: 0, z: 0 };
  game.velocityY = 0;
  game.avatar.visible = false;
  c.yawRoot.visible = false;
  return true;
}
export function controlSurveyScope(game, dt, x, z) {
  const h = game.desertSurvey,
    op = h?.focus;
  if (!op) return false;
  if (
    game.paused ||
    game.health <= 0 ||
    !reachable(game, op.control) ||
    game.player.position.distanceTo(op.position) > 0.2 ||
    game.keys.has("Space")
  ) {
    leaveSurveyScope(game);
    return true;
  }
  game.yaw -= x * dt * 0.22;
  game.pitch = THREE.MathUtils.clamp(game.pitch + z * dt * 0.15, -0.12, 0.65);
  h.saved.angles[op.control.index] = [game.yaw, game.pitch];
  game.avatar.visible = false;
  return true;
}
export function frameSurveyScope(game) {
  const op = game.desertSurvey?.focus;
  if (!op) return false;
  const c = op.control;
  c.yawRoot.rotation.y = game.yaw;
  c.pitchRoot.rotation.x = -game.pitch;
  c.eye.getWorldPosition(game.camera.position);
  const direction = new THREE.Vector3(
    -Math.sin(game.yaw) * Math.cos(game.pitch),
    -Math.sin(game.pitch),
    -Math.cos(game.yaw) * Math.cos(game.pitch),
  );
  game.camera.lookAt(game.camera.position.clone().add(direction));
  game.camera.fov = 28;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  game.camera.updateMatrixWorld();
  return true;
}
export function surveySightedMonument(game) {
  const h = game.desertSurvey,
    op = h?.focus;
  if (!op) return -1;
  const origin = op.control.group.position.clone();
  origin.y += 1.57;
  return h.monuments.findIndex(
    (m) =>
      surveyAngularError(game.yaw, game.pitch, origin, m) < 0.008 &&
      surveyVisible(game, origin, m),
  );
}
export function surveyFieldAction(game, f) {
  const h = game.desertSurvey;
  if (h?.ready === f.step) {
    h.ready = -1;
    return true;
  }
  if (f.step < 2 && h) enterScope(game, h.controls[f.step]);
  else
    game.cb.toast?.(
      "Compare the door seals with the two signs in your survey chart.",
    );
  return false;
}
export function surveyInteract(game) {
  const h = game.desertSurvey;
  if (!h || game.paused || game.health <= 0) return false;
  if (h.focus) {
    const index = h.focus.control.index,
      seen = surveySightedMonument(game);
    if (seen !== index) {
      game.cb.toast?.(
        seen < 0
          ? "Center a carved sign in the crosshair before recording."
          : "That sign does not match the inscription on this instrument.",
      );
      return true;
    }
    const feature = game.items.find((f) => f.id === `field-0-${index}`);
    if (currentFieldTask(game.level, game.progress)?.id !== feature.id) {
      game.cb.toast?.(
        "This bearing is already in your chart. Follow the next survey mark.",
      );
      return true;
    }
    // Store the calibrated bearing, so aim tolerance never shifts the map's
    // search court. Completion is still earned by the player's observation.
    const origin = h.focus.control.group.position.clone();
    origin.y += 1.57;
    const b = surveyBearing(origin, h.monuments[index]);
    game.yaw = b.yaw;
    game.pitch = b.pitch;
    leaveSurveyScope(game);
    h.ready = index;
    finishFieldTask(game, feature);
    h.saved.recorded[index] = surveyDone(game.progress, index);
    return true;
  }
  const c = h.controls.find((c) => reachable(game, c));
  if (c) {
    if (c.index === 1 && !surveyDone(game.progress, 0))
      game.cb.toast?.("Record the split crown from the eastern lookout first.");
    else if (!enterScope(game, c))
      game.cb.toast?.("Stand beside the instrument with both hands free.");
    return true;
  }
  const p = game.player.position,
    index = h.doors.findIndex(
      (d) =>
        game.grounded &&
        Math.abs(p.y - d.y) < 0.3 &&
        Math.abs(p.x - d.x) < 1.5 &&
        p.z > d.z + 0.4 &&
        p.z < d.z + 3.2,
    );
  if (index < 0) return false;
  if (!surveyDone(game.progress, 1))
    game.cb.toast?.(
      "Record both lookout bearings before opening a survey threshold.",
    );
  else if (!surveyDoorMatches(index))
    game.cb.toast?.(
      "These seals do not match your recorded signs, from left to right.",
    );
  else if (!surveyDone(game.progress, 2)) {
    h.ready = 2;
    finishFieldTask(
      game,
      game.items.find((f) => f.id === "field-0-2"),
    );
  } else
    game.cb.toast?.(
      "The threshold is open. Continue to the sanctuary's counterweight chamber.",
    );
  return true;
}
export function updateDesertSurvey(game, dt) {
  const h = game.desertSurvey;
  if (!h) return;
  dt = game.paused ? 0 : Math.max(0, Math.min(dt || 0, 0.1));
  for (const c of h.controls) {
    const angles =
      h.focus?.control === c ? [game.yaw, game.pitch] : h.saved.angles[c.index];
    const before = c.soundAngles?.[0] ?? c.yawRoot.rotation.y,
      oldPitch = c.soundAngles?.[1] ?? c.pitchRoot.rotation.x;
    if (angles) {
      c.yawRoot.rotation.y = angles[0];
      c.pitchRoot.rotation.x = -angles[1];
    }
    c.soundAngles = [c.yawRoot.rotation.y, c.pitchRoot.rotation.x];
    h.sources[c.index].activity =
      dt &&
      Math.abs(before - c.yawRoot.rotation.y) +
        Math.abs(oldPitch - c.pitchRoot.rotation.x) >
        0.00001
        ? 0.35
        : 0;
  }
  for (const [i, d] of h.doors.entries()) {
    const before = d.open;
    if (i === 2 && surveyDone(game.progress, 2))
      d.open = Math.min(1, d.open + dt / 2.5);
    d.leaf.position.y = d.open * 3.7;
    for (const cable of d.cables) {
      const bottom = 3.4 + d.open * 3.7;
      cable.scale.y = 7.25 - bottom;
      cable.position.y = (7.25 + bottom) / 2;
    }
    d.barrier.bottom = d.y + d.open * 3.7;
    d.barrier.top = d.barrier.bottom + 3.4;
    if (i === 2) h.sources[2].activity = dt && d.open !== before ? 0.7 : 0;
  }
}
export function surveyHint(game) {
  const h = game.desertSurvey;
  if (!h) return null;
  if (h.focus)
    return { key: "E", label: "Record bearing · Jump leaves the instrument" };
  if (h.controls.some((c) => reachable(game, c)))
    return { key: "E", label: "Look through survey instrument" };
  const p = game.player.position;
  if (
    h.doors.some(
      (d) =>
        Math.abs(p.x - d.x) < 1.5 &&
        Math.abs(p.z - d.z - 1.8) < 1.4 &&
        Math.abs(p.y - d.y) < 0.3,
    )
  )
    return { key: "E", label: "Inspect the paired door seals" };
  return null;
}
export function surveyObjective(game) {
  const h = game.desertSurvey;
  const p = game.player?.position;
  if (
    !h ||
    (!h.focus &&
      (game.progress.stage !== 0 ||
        surveyDone(game.progress, 2) ||
        !p ||
        p.x < 270 ||
        p.z < 205 ||
        p.z > 301))
  )
    return null;
  return {
    focus: h.focus
      ? {
          label: SURVEY_LOOKOUTS[h.focus.control.index].label,
          bearing: ((-THREE.MathUtils.radToDeg(game.yaw) % 360) + 360) % 360,
          elevation: -THREE.MathUtils.radToDeg(game.pitch),
        }
      : null,
    recorded: h.saved.recorded,
    text: surveyDone(game.progress, 2)
      ? "Threshold open · follow the sanctuary marker"
      : !surveyDone(game.progress, 0)
        ? "Climb the eastern lookout · sight THE SPLIT CROWN"
        : !surveyDone(game.progress, 1)
          ? "Climb the western lookout · sight THE PIERCED SUN"
          : "Follow the intersecting bearings · match the two signs to a door seal",
  };
}
