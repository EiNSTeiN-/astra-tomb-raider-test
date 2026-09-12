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
import { stationBlocked } from "./field-station-solids.js";
import { buildRegionalStation } from "./field-station-art.js";
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
  if (hasTraversalCourse(game.level, f)) buildTraversalCourse(game, f, group);
  buildRegionalStation(game, f, group);
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
