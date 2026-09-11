import * as THREE from "three";
import { buildShutterArt } from "./shutter-house-art.js";
import {
  prepareShutterTurn,
  syncShutterControls,
  shutterTurnPhase,
  SHUTTER_WHEEL,
} from "./shutter-motion.js";
import {
  SHUTTER_STATIONS,
  normalizeShutterHouse,
  shutterDone,
  shutterGust,
  shutterDeckAt,
  shutterAnchor,
  shutterFoundationDistance,
} from "./shutter-house-rules.js";
export function buildShutterHouse(game) {
  game.shutterHouse = null;
  game.shutterWind = null;
  if (!game.map.shutterHouse) return;
  const { x, z } = game.map.shutterHouse,
    y = game.groundHeight(x, z),
    root = new THREE.Group();
  root.name = "The room of wind";
  root.position.set(x, y, z);
  game.world.add(root);
  const saved = normalizeShutterHouse(
    game.progress.shutterHouse,
    game.progress,
  );
  game.progress.shutterHouse = saved;
  const h = (game.shutterHouse = {
    root,
    x,
    y,
    z,
    saved,
    louverAmount: saved.turns.map((n) => n / 3),
    wheelTurn: [0, 0, 0],
    decks: [],
    solids: [],
    sources: [],
    louvers: [],
    ribbons: [],
    time: 0,
    turn: null,
    fallFrom: null,
    returnOpen: shutterDone(game.progress, 2) ? 1 : 0,
  });
  buildShutterArt(game, h);
  updateShutterHouse(game, 0);
}
export function shutterReachable(game, index) {
  const h = game.shutterHouse,
    p = game.player?.position,
    s = SHUTTER_STATIONS[index];
  return !!(
    h &&
    p &&
    s &&
    game.grounded &&
    !game.swimming &&
    Math.hypot(p.x - h.x - s.x, p.z - h.z - s.z) < 2.2 &&
    Math.abs(p.y - h.y - s.height) < 0.35
  );
}
export function startShutterTurn(game, index) {
  const h = game.shutterHouse;
  if (
    !h ||
    game.paused ||
    game.health <= 0 ||
    h.turn ||
    game.progress.stage !== 5 ||
    !shutterReachable(game, index) ||
    shutterDone(game.progress, index) ||
    (index > 0 && !shutterDone(game.progress, index - 1))
  )
    return false;
  return prepareShutterTurn(game, index);
}
export function updateShutterHouse(game, dt) {
  const h = game.shutterHouse;
  if (!h) return;
  dt = game.paused || !Number.isFinite(dt) ? 0 : Math.max(0, Math.min(dt, 1));
  h.time += dt;
  syncShutterControls(game, dt);
  for (const r of h.ribbons) {
    const gust = shutterGust(r.index, h.time, h.saved.turns[r.index]),
      p = r.mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = r.rest[i * 3 + 1],
        t = -y / 1.5;
      p.setXYZ(
        i,
        r.rest[i * 3] +
          Math.sin(h.time * 7 + t * 9 + r.side) *
            0.055 *
            t *
            (0.2 + gust.strength),
        y * (1 - 0.5 * gust.strength),
        gust.direction * t * (gust.strength * 1.35 + gust.warning * 0.32) +
          Math.sin(h.time * 6 + t * 8) * 0.07 * t,
      );
    }
    p.needsUpdate = true;
    r.mesh.geometry.computeVertexNormals();
    r.mesh.geometry.computeBoundingSphere();
  }
  const done = shutterDone(game.progress, 2);
  if (done) h.returnOpen = Math.min(1, h.returnOpen + dt / 0.45);
  h.returnLeaf.rotation.z = ((1 - h.returnOpen) * Math.PI) / 2;
  h.returnDeck.enabled = h.returnOpen === 1;
  const p = game.player?.position;
  if (!dt) return;
  if (!p || shutterFoundationDistance(p.x, p.z) > 1) {
    h.fallFrom = null;
    return;
  }
  const support = shutterDeckAt(game, p.x, p.z, p.y);
  if (game.grounded && support && Math.abs(p.y - support.height) < 0.25)
    h.fallFrom = p.y;
  else if (h.fallFrom !== null && p.y < h.fallFrom - 1.6 && !game.climb) {
    const a = shutterAnchor(game);
    p.set(a.x, a.y, a.z);
    game.jumpY = a.y - game.groundHeight(a.x, a.z);
    game.velocityY = 0;
    game.grounded = true;
    game.airVelocity = null;
    h.fallFrom = null;
    game.damage?.(8);
    game.cb.toast?.("Returned to the last secured shutter.");
    game.save();
  }
}
export function shutterHint(game) {
  const h = game.shutterHouse;
  if (!h || game.progress.stage !== 5) return null;
  if (h.turn)
    return {
      key: "E",
      label:
        shutterTurnPhase(h.turn) < SHUTTER_WHEEL.turnStart
          ? "Reaching for the shutter grips · move to cancel"
          : h.turn.committed
            ? "Catch seated · releasing the shutter wheel"
            : "Turning the shutter catch · move to cancel",
    };
  for (let i = 0; i < 3; i++)
    if (shutterReachable(game, i) && !shutterDone(game.progress, i))
      return {
        key: "E",
        label:
          i > 0 && !shutterDone(game.progress, i - 1)
            ? "Close the previous shutter first"
            : game.crouching
              ? "Stand to use the shutter wheel"
              : `Close ${SHUTTER_STATIONS[i].label.toLowerCase()} · ${h.saved.turns[i]} / 3 catches`,
      };
  return null;
}
export function shutterObjective(game) {
  const h = game.shutterHouse,
    p = game.player?.position;
  if (!h || !p || shutterFoundationDistance(p.x, p.z) > 5) return null;
  return {
    text: game.shutterWind?.braced
      ? "Braced against the crosswind"
      : game.shutterWind?.gust.warning > 0.15
        ? "Ribbons rising · a gust is coming"
        : game.shutterWind?.gust.strength > 0.2
          ? "Crosswind · B to brace; stand before jumping"
          : null,
  };
}
