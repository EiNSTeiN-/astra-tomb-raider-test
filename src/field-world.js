import { buildSurveyStation } from "./desert-survey-art.js";
import { surveyFieldAction } from "./desert-survey.js";
import { buildArcadeStation } from "./arcade-lock-art.js";
import { arcadeFieldAction } from "./arcade-lock.js";
import { buildSunStation } from "./sun-bridge-art.js";
import { sunFieldAction } from "./sun-bridge.js";
import { buildShutterStation } from "./shutter-house-art.js";
import { startShutterTurn, shutterReachable } from "./shutter-house.js";
import { buildCausewayStation } from "./echo-causeway-art.js";
import { soundCausewayRelay } from "./echo-causeway.js";
import { causewayRelayReachable } from "./echo-causeway-rules.js";
import { buildCraneStation } from "./astral-crane-art.js";
import { buildCartStation } from "./tempering-cart-art.js";
import { buildGardenStation } from "./rain-garden.js";
import { traceGarden } from "./rain-garden-rules.js";
import { buildReflectorStation } from "./eastern-reflector.js";
import { buildCoralStation } from "./coral-pump-art.js";
import { PUMP_FIELD, PUMP_SETTLE_SECONDS } from "./coral-pump-rules.js";
import { buildFrozenStation } from "./frozen-stair.js";
import * as THREE from "three";
import { needsCarriedFlame, torchHandsBusy } from "./torch.js";
import { buildJungleShrine, updateJungleShrine } from "./jungle-shrines.js";
import {
  hasTraversalCourse,
  buildTraversalCourse,
} from "./traversal-courses.js";
import {
  gateMaterials,
  buildSanctuaryGate,
  updateSanctuaryGate,
} from "./sanctuary-gates.js";
import { fieldComplete, currentFieldTask, EXPEDITIONS } from "./expeditions.js";
import { stationSolid, stationBlocked } from "./field-station-solids.js";
import { safeArrival } from "./character-motion.js";

export function buildFieldStation(game, f, group) {
  if (buildSurveyStation(game, f, group)) return;
  if (buildArcadeStation(game, f, group)) return;
  if (buildSunStation(game, f, group)) return;
  if (buildShutterStation(game, f, group)) return;
  if (buildCausewayStation(game, f, group)) return;
  if (buildCartStation(game, f, group)) return;
  if (buildGardenStation(game, f, group)) return;
  if (buildCraneStation(game, f, group)) return;
  if (buildReflectorStation(game, f, group)) return;
  if (buildCoralStation(game, f, group)) return;
  if (buildFrozenStation(game, f, group)) return;
  if (buildJungleShrine(game, f, group)) return;
  const { stoneMat: stone, darkMat: dark, goldMat: gold } = game;
  if (hasTraversalCourse(game.level, f)) buildTraversalCourse(game, f, group);
  const solid = (size, position, options) =>
    stationSolid(game, f, group, size, position, options);
  game.cylinder(0.85, 1.1, 0.7, dark, 0, 0.35, 0, group, 12);
  solid([2.2, 0.7, 2.2], [0, 0.35, 0], { radius: 1.1 });
  game.cylinder(0.94, 0.94, 0.14, gold, 0, 0.74, 0, group, 16);
  solid([1.88, 0.14, 1.88], [0, 0.74, 0], { radius: 0.94 });
  const core = new THREE.Group();
  group.add(core);
  f.core = core;
  if (["valve", "winch"].includes(f.kind)) {
    game.box(0.22, 1.2, 0.22, gold, 0, 1.3, 0, group);
    solid([0.22, 1.2, 0.22], [0, 1.3, 0]);
    solid([1.57, 1.57, 0.17], [0, 1.7, 0]);
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.085, 8, 28),
      gold,
    );
    core.add(wheel);
    core.position.y = 1.7;
    for (let i = 0; i < 6; i++) {
      const spoke = game.box(0.06, 1.4, 0.06, gold, 0, 0, 0, core);
      spoke.rotation.z = (i * Math.PI) / 3;
    }
    for (const side of [-1, 1]) {
      game.box(0.35, 1.5, 0.35, stone, side * 1.45, 0.75, 0, group);
      solid([0.35, 1.5, 0.35], [side * 1.45, 0.75, 0]);
    }
  } else if (f.kind === "brazier") {
    game.cylinder(0.7, 0.28, 0.6, gold, 0, 1.1, 0, group, 12);
    solid([1.4, 0.6, 1.4], [0, 1.1, 0], { radius: 0.7 });
    const fire = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 1.1, 7),
      new THREE.MeshBasicMaterial({ color: 0xffbb6a, toneMapped: false }),
    );
    fire.position.y = 1.95;
    group.add(fire);
    f.fire = fire;
    game.flames.push(fire);
  } else if (["lift", "delivery", "resonance"].includes(f.kind)) {
    const gem = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5, 1),
      f.kind === "resonance" ? game.glowMat : gold,
    );
    core.add(gem);
    core.position.y = 1.2;
    const done =
      f.stage < game.progress.stage || game.progress.field.includes(f.id);
    if (f.kind === "lift") core.visible = !done;
    if (f.kind === "delivery") core.visible = done;
    solid([1, 1, 1], [0, 1.2, 0], { node: core });
    if (f.kind === "delivery") {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.72, 0.06, 8, 24),
        gold,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.83;
      group.add(ring);
    }
  } else {
    const tablet = game.box(1.3, 1.05, 0.16, stone, 0, 1.3, 0, group);
    tablet.rotation.x = -0.25;
    solid([1.3, 1.06, 0.43], [0, 1.3, 0]);
    for (let i = 0; i < 4; i++)
      game.box(
        0.75 - i * 0.1,
        0.035,
        0.06,
        gold,
        0,
        1.1 + i * 0.14,
        0.12,
        group,
      );
  }
  // A raised control already sits in the course's masonry and cable frame.
  // The freestanding ground arch would overhang its five-meter landing and
  // obstruct the mantle and walking ring.
  if (f.yOffset === 8.4) return;
  const span = 2.7,
    frameZ = -1.5;
  for (const side of [-1, 1]) {
    game.box(0.65, 3.4, 0.7, stone, side * span, 1.7, frameZ, group);
    solid([0.65, 3.4, 0.7], [side * span, 1.7, frameZ]);
    game.box(0.82, 0.2, 0.9, gold, side * span, 3.45, frameZ, group);
    solid([0.82, 0.2, 0.9], [side * span, 3.45, frameZ]);
  }
  game.box(span * 2 + 0.8, 0.45, 0.8, stone, 0, 3.765, frameZ, group);
  solid([span * 2 + 0.8, 0.45, 0.8], [0, 3.765, frameZ]);
}

export function buildFieldGates(game) {
  game.fieldGates = [];
  game.gateSources = [];
  const materials = gateMaterials(game.level);
  for (const feature of game.items.filter((f) => f.type === "mechanism")) {
    const gate = buildSanctuaryGate(game, feature, materials);
    game.fieldGates.push(gate);
    game.gateSources.push(...gate.sources);
  }
}

export function updateFieldWorld(game, dt) {
  const current = currentFieldTask(game.level, game.progress);
  for (const f of game.items) {
    if (f.type !== "field") continue;
    const done =
      f.stage < game.progress.stage || game.progress.field.includes(f.id);
    f.group.visible = true;
    f.marker.visible =
      current?.id === f.id && !(f.surveyHeight !== undefined && f.step === 2);
    if (f.fire) f.fire.visible = done;
    if (f.frozenIce) f.frozenIce.visible = !done;
    updateJungleShrine(game, f, done);
    if (f.kind === "lift") f.core.visible = !done;
    if (f.kind === "delivery") f.core.visible = done;
    if (
      f.arcadeHeight === undefined &&
      f.sunHeight === undefined &&
      f.shutterHeight === undefined &&
      ["valve", "winch"].includes(f.kind)
    )
      f.core.rotation.z +=
        ((done ? Math.PI * 1.5 : 0) - f.core.rotation.z) * Math.min(1, dt * 3);
    if (f.kind === "resonance") f.core.rotation.y += dt * (done ? 1.2 : 0.2);
  }
  for (const gate of game.fieldGates) updateSanctuaryGate(game, gate, dt);
}

export function finishFieldTask(game, f) {
  if (currentFieldTask(game.level, game.progress)?.id !== f.id) {
    game.cb.toast?.(
      "Follow the gold marker. This station belongs to another part of the route.",
    );
    return false;
  }
  if (
    needsCarriedFlame(game.level, f) &&
    (!game.progress.torch ||
      game.swimming ||
      game.diving ||
      torchHandsBusy(game))
  ) {
    game.cb.toast?.(
      "This brazier needs a carried flame. Light your torch at a camp or a burning brazier with T / Torch.",
      5500,
    );
    return false;
  }
  if (
    f.gardenHeight !== undefined &&
    f.step === 1 &&
    (!game.rainGarden ||
      game.rainGarden.turn ||
      !traceGarden(game.rainGarden.saved.rotations).complete)
  ) {
    game.cb.toast?.(
      "Join the wet channel ends from the west inlet to the northeast outlet before opening the garden channel.",
      6000,
    );
    return false;
  }
  if (
    f.reflectorHeight !== undefined &&
    f.step === 2 &&
    !game.easternReflector?.saved.raised
  ) {
    game.cb.toast?.(
      "Brace the reflector, release its rear pin and use the hauling wheel first.",
    );
    return false;
  }
  if (
    f.stairHeight !== undefined &&
    f.step === 2 &&
    !game.frozenStair?.saved.restored
  ) {
    game.cb.toast?.(
      "Release both locks and use the hauling wheel before crossing the stair.",
    );
    return false;
  }
  if (
    game.level.id === "tides" &&
    f.id === PUMP_FIELD &&
    (!game.coralPump?.saved.installed ||
      game.coralPump.stable < PUMP_SETTLE_SECONDS)
  ) {
    game.cb.toast?.(
      "Install the impeller, then hold steady pump pressure between the gold ticks.",
    );
    return false;
  }
  if (
    f.cartHeight !== undefined &&
    f.step > 0 &&
    (!game.temperingCart?.saved.loaded ||
      game.temperingCart.turn ||
      game.temperingCart.docked !== f.step)
  ) {
    game.cb.toast?.(
      f.step === 1
        ? "Load the blank and bring the cart onto the inspection turntable first."
        : "Turn the rails at the gallery, then bring the loaded cart to the tempering landing.",
    );
    return false;
  }
  if (
    f.craneHeight !== undefined &&
    f.step === 2 &&
    !game.astralCrane?.saved.seated
  ) {
    game.cb.toast?.(
      "Use the west gallery crane controls to lower the spindle into this socket first.",
      5500,
    );
    return false;
  }
  if (f.causewayHeight !== undefined && !causewayRelayReachable(game, f.step)) {
    game.cb.toast?.("Reach the relay's stone gallery before sounding it.");
    return false;
  }
  if (f.shutterHeight !== undefined) {
    if (!shutterReachable(game, f.step)) return false;
    if (game.shutterHouse.saved.turns[f.step] < 3) {
      startShutterTurn(game, f.step);
      return false;
    }
  }
  if (f.surveyHeight !== undefined && !surveyFieldAction(game, f)) return false;
  if (f.arcadeHeight !== undefined && !arcadeFieldAction(game, f)) return false;
  if (f.sunHeight !== undefined && !sunFieldAction(game, f)) return false;
  if (f.kind === "delivery" && f.stationSolids) {
    // An explorer can jump onto an empty socket. Make room for its installed
    // component before recording the delivery, including the saved position.
    f.core.visible = true;
    const p = game.player.position;
    if (f.stationSolids.some((o) => stationBlocked(o, p.x, p.y, p.z))) {
      const arrival = safeArrival(game, p);
      if (!arrival) {
        f.core.visible = false;
        game.cb.toast?.("Step off the pedestal to place the component.");
        return false;
      }
      p.set(arrival.x, arrival.y, arrival.z);
      game.jumpY = p.y - game.groundHeight(p.x, p.z);
      game.velocityY = 0;
      game.airVelocity = null;
      game.grounded = true;
      game.fallPeak = p.y;
    }
  }
  game.progress.field.push(f.id);
  if (f.causewayHeight !== undefined) soundCausewayRelay(game, f.step);
  game.audio.tone("field");
  const mission = EXPEDITIONS[game.level.id][f.stage];
  const complete = fieldComplete(game.level, game.progress);
  game.cb.toast?.(
    complete
      ? mission.aftermath
      : `${f.label} · ${f.step + 1} / 3 field stations restored`,
    complete ? 6500 : 3500,
  );
  if (complete) game.audio.tone("gate");
  game.save();
  return true;
}
