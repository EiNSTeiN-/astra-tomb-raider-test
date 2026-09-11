import * as THREE from "three";
import { buildCausewayArt } from "./echo-causeway-art.js";
import {
  CAUSEWAY_LANDINGS,
  CAUSEWAY_FIELDS,
  causewayRelayDone,
  causewayStonePhase,
  normalizeEchoCauseway,
  causewayAnchor,
  causewayFoundationDistance,
  causewayChannelDepth,
} from "./echo-causeway-rules.js";

export function buildEchoCauseway(game) {
  game.echoCauseway = null;
  if (!game.map.echoCauseway) return;
  const root = new THREE.Group();
  root.name = "The echo causeway";
  root.position.y = game.terrainProfile.causewayY;
  game.world.add(root);
  const saved = normalizeEchoCauseway(
    game.progress.echoCauseway,
    game.progress,
  );
  game.progress.echoCauseway = saved;
  const h = (game.echoCauseway = {
    root,
    base: root.position.y,
    saved,
    decks: [],
    solids: [],
    landings: [],
    stones: [],
    rings: [],
    sources: [],
    pulses: [null, null],
    strikes: [10, 10, 10],
    time: 0,
  });
  buildCausewayArt(game, h);
  updateEchoCauseway(game, 0);
}
export function soundCausewayRelay(game, index) {
  const h = game.echoCauseway;
  if (
    !h ||
    game.paused ||
    game.health <= 0 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > 2 ||
    !causewayRelayDone(game.progress, index)
  )
    return false;
  h.strikes[index] = 0;
  if (index < 2 && !causewayRelayDone(game.progress, index + 1))
    h.pulses[index] = 0;
  h.saved.anchor = index;
  updateEchoCauseway(game, 0);
  return true;
}
export function updateEchoCauseway(game, dt) {
  const h = game.echoCauseway;
  if (!h) return;
  dt = game.paused || !Number.isFinite(dt) ? 0 : Math.max(0, Math.min(1, dt));
  h.time += dt;
  for (let i = 0; i < 2; i++) if (h.pulses[i] !== null) h.pulses[i] += dt;
  for (let i = 0; i < 3; i++) h.strikes[i] += dt;
  const p = game.player?.position;
  for (const s of h.stones) {
    const phase = causewayStonePhase(
      h.pulses[s.chain],
      s.index,
      causewayRelayDone(game.progress, s.chain + 1),
    );
    // A newly secured gallery recalls any stones that have already descended.
    // Restored saves start held; live recalls rise smoothly with their support.
    if (phase.phase === "held" && s.phase && s.phase.amount < 1) {
      s.latchFrom ??= s.phase.amount;
      s.latchTime = Math.min(1, (s.latchTime || 0) + dt);
      const t = s.latchTime;
      phase.amount = s.latchFrom + (1 - s.latchFrom) * t * t * (3 - 2 * t);
    }
    const previous = s.deck.y,
      top = -2.2 + (s.height + 2.2) * phase.amount;
    s.phase = phase;
    s.root.position.y = top;
    s.deck.y = h.base + top;
    s.shaft.bottom = h.base + top - 9.4;
    s.shaft.top = h.base + top - 0.4;
    if (
      dt &&
      game.grounded &&
      !game.climb &&
      p &&
      Math.abs(p.y - previous) < 0.24 &&
      Math.abs(p.x - s.x) < s.deck.w &&
      Math.abs(p.z - s.z) < s.deck.d
    ) {
      p.y += s.deck.y - previous;
      game.jumpY = p.y - game.groundHeight(p.x, p.z);
      game.fallPeak = p.y;
    }
    const lit =
      phase.amount *
      (phase.warning ? 0.45 + 0.55 * Math.sin(h.time * 16) ** 2 : 1);
    s.glow.color.set(phase.warning ? 0xd9ad65 : 0x7599ad);
    s.glow.emissive.set(phase.warning ? 0xeaa64f : 0x72c0db);
    s.glow.emissiveIntensity = 0.1 + lit * 2;
    s.source.y = s.deck.y + 0.14;
    s.source.activity = game.paused
      ? 0
      : phase.phase === "held"
        ? 0.045
        : lit * 0.6 +
          (phase.phase === "rising" || phase.phase === "falling" ? 0.3 : 0);
  }
  for (let i = 0; i < 2; i++) {
    const r = h.rings[i],
      t = h.pulses[i],
      a = CAUSEWAY_LANDINGS[i],
      b = CAUSEWAY_LANDINGS[i + 1];
    r.visible =
      t !== null && t < 5.6 && !causewayRelayDone(game.progress, i + 1);
    if (!r.visible) continue;
    const progress = Math.min(1, t / 5.6);
    r.position.set(
      a.x + (b.x - a.x) * progress,
      a.height + (b.height - a.height) * progress + 0.75,
      a.z + (b.z - a.z) * progress,
    );
    r.rotation.y = i ? 0 : Math.PI / 2;
    r.scale.setScalar(0.8 + 0.25 * Math.sin(progress * Math.PI));
  }
  const fields =
    game.items?.filter((f) => f.causewayHeight !== undefined) || [];
  for (const f of fields)
    if (f.causewayLight)
      f.causewayLight.value =
        0.15 +
        (causewayRelayDone(game.progress, f.step) ? 0.35 : 0) +
        Math.exp(-h.strikes[f.step] * 3) * 0.7;
  for (let i = 0; i < 3; i++) {
    const source = h.sources.find((s) => s.id === `echo-causeway-relay-${i}`);
    if (source)
      source.activity = game.paused
        ? 0
        : Math.exp(-h.strikes[i] * 2) +
          (causewayRelayDone(game.progress, i) ? 0.04 : 0);
  }
}
function nearbyRelay(game) {
  const h = game.echoCauseway,
    p = game.player?.position;
  if (!h || !p || !game.grounded || game.swimming) return -1;
  return CAUSEWAY_FIELDS.findIndex(
    (a) =>
      Math.abs(p.y - h.base - a.height) < 0.65 &&
      Math.hypot(p.x - a.x, p.z - a.z) < 2.5,
  );
}
export function causewayHint(game) {
  const index = nearbyRelay(game);
  if (index < 0 || !causewayRelayDone(game.progress, index)) return null;
  return {
    key: "E",
    label:
      index === 2 || causewayRelayDone(game.progress, index + 1)
        ? "The crossing is held · return over the stone galleries"
        : "Sound the relay again · jump with the rising stones",
  };
}
export function causewayInteract(game) {
  if (game.paused || game.health <= 0) return false;
  const index = nearbyRelay(game);
  if (index < 0 || !causewayRelayDone(game.progress, index)) return false;
  if (index < 2 && !causewayRelayDone(game.progress, index + 1)) {
    soundCausewayRelay(game, index);
    game.audio.tone("field");
    game.save();
  } else game.cb.toast?.(causewayHint(game).label);
  return true;
}
export function recoverCausewayFall(game) {
  const h = game.echoCauseway,
    p = game.player?.position;
  if (
    !h ||
    !p ||
    causewayFoundationDistance(p.x, p.z) > 0 ||
    causewayChannelDepth(p.x, p.z) < 0.2 ||
    p.y >= h.base - 1.5
  )
    return false;
  const a = causewayAnchor(game);
  p.set(a.x, a.y, a.z);
  game.grounded = true;
  game.velocityY = 0;
  game.jumpY = a.y - game.groundHeight(a.x, a.z);
  game.fallPeak = a.y;
  game.airVelocity = null;
  game.moveVelocity = { x: 0, z: 0 };
  game.damage?.(8);
  game.save();
  game.cb.toast?.(
    "The echo fades. Returned to your last relay gallery · sound it again for another crossing.",
    5500,
  );
  return true;
}
export function causewayObjective(game) {
  const h = game.echoCauseway,
    p = game.player?.position;
  if (
    !h ||
    !p ||
    game.progress.stage !== 3 ||
    causewayFoundationDistance(p.x, p.z) > 7
  )
    return null;
  return {
    text: causewayRelayDone(game.progress, 2)
      ? "The crossings are held. Return down the galleries to the resonance court."
      : !causewayRelayDone(game.progress, 0)
        ? "Climb the southern stair and sound the outer relay."
        : !causewayRelayDone(game.progress, 1)
          ? "Follow the first echo across four rising stones to the gallery relay."
          : "Climb with the second echo to the chamber relay. The first crossing is held.",
  };
}
