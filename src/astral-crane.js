import * as THREE from "three";
import { poseHands } from "./pose.js";
import { buildCraneConstruction } from "./astral-crane-art.js";
import {
  CRANE_SITE,
  CRANE_DECK,
  craneRecovered,
  craneSurveyed,
  craneInstalled,
  normalizeAstralCrane,
  cranePayload,
  stepAstralCrane,
} from "./astral-crane-rules.js";

export function buildAstralCrane(game) {
  game.astralCrane = null;
  if (!game.map.astralCrane) return;
  const saved = normalizeAstralCrane(game.progress.astralCrane, game.progress);
  game.progress.astralCrane = saved;
  const root = new THREE.Group();
  root.name = "The astral spindle crane";
  root.position.set(CRANE_SITE.x, game.terrainProfile.craneY, CRANE_SITE.z);
  game.world.add(root);
  const h = (game.astralCrane = {
    root,
    saved,
    base: root.position.y,
    operating: false,
    swing: 0,
    lift: 0,
    blocked: null,
    time: 0,
    decks: [],
    solids: [],
    controlWheels: [],
    control: new THREE.Vector3(168, root.position.y + CRANE_DECK, 220),
  });
  buildCraneConstruction(game, h);
  updateAstralCrane(game, 0);
}
export function updateAstralCrane(game, dt) {
  const h = game.astralCrane;
  if (!h) return;
  if (!game.paused) h.time += dt;
  if (game.health <= 0 || craneInstalled(game.progress)) h.operating = false;
  if (!h.operating || game.paused) h.swing = h.lift = 0;
  const p = cranePayload(h.saved),
    visible = craneRecovered(game.progress) && !craneInstalled(game.progress);
  h.boom.rotation.y = h.saved.angle;
  h.cargo.position.set(p.x - CRANE_SITE.x, p.y, p.z - CRANE_SITE.z);
  h.cargo.rotation.y = h.saved.angle;
  h.cargo.visible = visible;
  h.sling.position.copy(h.cargo.position);
  h.sling.rotation.copy(h.cargo.rotation);
  h.sling.visible = visible;
  const hook = p.y + 2.05,
    length = 15.2 - hook;
  h.cable.position.y = hook + length / 2;
  h.cable.scale.y = length;
  h.sheave.rotation.z = -p.y / 0.45;
  h.controlWheels[0].rotation.x = h.saved.angle * 14;
  h.controlWheels[1].rotation.x = h.saved.height * 2;
  h.sources[0].activity = game.paused ? 0 : Math.abs(h.swing);
  Object.assign(h.sources[1], {
    x: p.x,
    y: h.base + p.y + 2.05,
    z: p.z,
    activity: game.paused ? 0 : Math.abs(h.lift),
  });
  h.sources[2].activity = game.paused ? 0 : 0.7;
}
function nearControls(game) {
  const h = game.astralCrane,
    p = game.player?.position;
  return (
    h &&
    p &&
    game.grounded &&
    !game.swimming &&
    Math.abs(p.y - h.control.y) < 0.55 &&
    Math.hypot(p.x - h.control.x, p.z - h.control.z) < 1.2
  );
}
export function controlAstralCrane(game, dt, swing, lift) {
  const h = game.astralCrane;
  if (!h?.operating) return false;
  if (game.paused || game.health <= 0) return false;
  const before = { ...h.saved };
  const blocked = stepAstralCrane(h.saved, dt, swing, lift);
  if (blocked && blocked !== h.blocked) game.cb.toast?.(blocked, 4500);
  h.blocked = blocked;
  h.swing = Math.abs(h.saved.angle - before.angle) > 1e-8 ? swing : 0;
  h.lift = Math.abs(h.saved.height - before.height) > 1e-8 ? lift : 0;
  game.jumpBuffer = 0;
  game.crouching = false;
  game.moveVelocity = { x: 0, z: 0 };
  game.velocityY = 0;
  game.grounded = true;
  game.player.position.copy(h.control);
  game.jumpY = h.control.y - game.groundHeight(h.control.x, h.control.z);
  game.fallPeak = h.control.y;
  if (h.saved.seated && !before.seated) {
    game.audio.tone("field");
    game.cb.toast?.(
      "Spindle seated · release the controls and cross the upper walkway to its socket.",
      6000,
    );
    game.save();
  }
  updateAstralCrane(game, 0);
  return true;
}
export function poseAstralCrane(game) {
  const h = game.astralCrane;
  if (!h?.operating || !game.avatar) return;
  game.avatar.rotation.y = Math.PI / 2;
  h.console.updateWorldMatrix(true, true);
  poseHands(
    game,
    h.handles.map((n) => n.getWorldPosition(new THREE.Vector3())),
  );
}
export function craneHint(game) {
  const h = game.astralCrane;
  if (!h || (!h.operating && !nearControls(game))) return null;
  return {
    key: "E",
    label: h.operating
      ? h.saved.seated
        ? "Spindle seated · release controls and cross to the socket"
        : h.blocked ||
          `Release controls · W/S raise/lower · A/D swing · ${h.saved.height.toFixed(1)} m · ${Math.round((h.saved.angle * 180) / Math.PI)}°`
      : craneInstalled(game.progress)
        ? "Astral spindle installed"
        : game.progress.stage !== 6
          ? "Return when the astral spindle is needed"
          : !craneRecovered(game.progress)
            ? "Recover the spindle at the loading cradle"
            : !craneSurveyed(game.progress)
              ? "Read the inspection gauges on the north gallery"
              : h.saved.seated
                ? "Spindle seated · cross the upper walkway"
                : "Take the crane controls",
  };
}
export function craneInteract(game) {
  const h = game.astralCrane;
  if (!h || game.paused) return false;
  if (h.operating) {
    h.operating = false;
    h.swing = h.lift = 0;
    h.blocked = null;
    updateAstralCrane(game, 0);
    game.save();
    return true;
  }
  if (!nearControls(game)) return false;
  if (
    game.progress.stage !== 6 ||
    !craneSurveyed(game.progress) ||
    h.saved.seated
  ) {
    game.cb.toast?.(craneHint(game).label);
    return true;
  }
  if (game.climb || game.dodge || game.blockGrip) return true;
  h.operating = true;
  game.yaw = -Math.PI / 2;
  game.pitch = 0.22;
  game.carrying = false;
  game.crouching = false;
  game.keys.delete("Space");
  controlAstralCrane(game, 0, 0, 0);
  return true;
}
export function craneObjective(game) {
  const h = game.astralCrane;
  if (
    !h ||
    game.progress.stage !== 6 ||
    !craneSurveyed(game.progress) ||
    h.saved.seated
  )
    return null;
  return {
    target: { x: h.control.x / 7, z: h.control.z / 7 },
    text: "Guide the spindle through the inspection fork, over the counterweight wall and into its socket.",
  };
}
