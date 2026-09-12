import { boxEntry } from "./camera-collision.js";

export const ARCADE_SITE = { x: 56, z: 217 };
export const ARCADE_POOL = { x: 68, z: 217, width: 11, length: 22 };
export const ARCADE_FIELDS = [
  { x: 84, z: 217, height: 1.2 },
  { x: 42, z: 202, height: 0.4 },
  { x: 28, z: 217, height: 8.8 },
];
export const ARCADE_ANCHORS = [
  { x: 84, z: 217.8, height: 1.2 },
  { x: 60, z: 217.8, height: 6.6 },
  { x: 28, z: 217.8, height: 8.8 },
];
export const ARCADE_RISE = 5.6;
export const ARCADE_FILL_SECONDS = 12;

export function arcadeDone(progress, step) {
  return progress.stage > 5 || !!progress.field?.includes(`field-5-${step}`);
}
export function normalizeArcadeLock(value, progress) {
  const complete = arcadeDone(progress, 2),
    ready = complete || arcadeDone(progress, 1),
    fraction = Number.isFinite(value?.level)
      ? Math.max(0, Math.min(1, value.level))
      : 0;
  return {
    level: complete ? 1 : ready ? fraction : 0,
    target: complete ? 1 : ready && value?.target === 1 ? 1 : 0,
    anchor:
      Number.isInteger(value?.anchor) &&
      value.anchor >= 0 &&
      value.anchor <= (complete ? 2 : ready ? 1 : 0)
        ? value.anchor
        : complete
          ? 2
          : 0,
  };
}
export function addArcadeLock(map, level) {
  if (level.id !== "tides") return map;
  map.arcadeLock = { ...ARCADE_SITE };
  for (let z = 28; z <= 35; z++)
    for (let x = 3; x <= 13; x++) map.grid[z][x] = 1;
  const path = [];
  for (let z = 31; z <= 36; z++) {
    map.grid[z][4] = 1;
    path.push({ x: 4, z });
  }
  for (let x = 4; x <= 8; x++) {
    map.grid[36][x] = 1;
    path.push({ x, z: 36 });
  }
  map.paths.push(path);
  for (const [step, p] of ARCADE_FIELDS.entries())
    Object.assign(
      map.features.find((f) => f.id === `field-5-${step}`),
      {
        x: p.x / 7,
        z: p.z / 7,
        arcadeHeight: p.height,
      },
    );
  return map;
}
export function arcadeFoundationDistance(x, z) {
  return Math.hypot(Math.max(20 - x, 0, x - 91), Math.max(197 - z, 0, z - 244));
}
export function arcadeFoundationWeight(x, z) {
  const t = Math.min(1, arcadeFoundationDistance(x, z) / 3);
  return 1 - t * t * (3 - 2 * t);
}
export function arcadeDeckAt(game, x, z, maxY = Infinity) {
  const h = game.arcadeLock;
  if (!h) return null;
  let best = null;
  for (const d of h.decks)
    if (
      d.enabled !== false &&
      Math.abs(x - d.x) < d.w &&
      Math.abs(z - d.z) < d.d &&
      d.y <= maxY + 0.205 &&
      (!best ||
        d.y > best.height ||
        (d.y === best.height && d.anchor !== undefined))
    )
      best = { height: d.y, surface: d };
  return best;
}
export function arcadeBlocked(game, x, z, y, clearance = 1.8) {
  const h = game.arcadeLock;
  if (!h) return false;
  return h.solids.some(
    (s) =>
      s.enabled !== false &&
      Math.abs(x - s.x) < s.w + 0.22 &&
      Math.abs(z - s.z) < s.d + 0.22 &&
      y < s.top - (s.step ? 0.205 : 0.035) &&
      y + clearance > s.bottom + 0.035,
  );
}
export function arcadeCeiling(game, x, z, before, next) {
  if (next <= before || !game.arcadeLock) return next;
  for (const s of game.arcadeLock.solids)
    if (
      s.enabled !== false &&
      Math.abs(x - s.x) < s.w + 0.22 &&
      Math.abs(z - s.z) < s.d + 0.22 &&
      before + 1.8 <= s.bottom + 0.05 &&
      next + 1.8 > s.bottom
    )
      next = Math.min(next, s.bottom - 1.8);
  return next;
}
export function arcadeOccludes(game, from, to) {
  return !!game.arcadeLock?.solids.some((s) => {
    if (s.enabled === false) return false;
    const hit = boxEntry(from, to, {
      min: { x: s.x - s.w, y: s.bottom, z: s.z - s.d },
      max: { x: s.x + s.w, y: s.top, z: s.z + s.d },
    });
    return hit !== null && hit < 1;
  });
}

export function onArcadePontoon(game) {
  const p = game.player?.position,
    d = game.arcadeLock?.pontoonDeck;
  return !!(
    p &&
    d &&
    game.grounded &&
    Math.abs(p.y - d.y) < 0.25 &&
    Math.abs(p.x - d.x) < d.w &&
    Math.abs(p.z - d.z) < d.d
  );
}
export function arcadeSavePosition(game) {
  const h = game.arcadeLock,
    p = game.player?.position;
  if (!h || !p || arcadeFoundationDistance(p.x, p.z) > 2) return null;
  const unstable =
    game.climb?.arcade ||
    game.diving ||
    game.swimming ||
    !game.grounded ||
    (onArcadePontoon(game) && Math.abs(h.saved.level - h.saved.target) > 0.002);
  if (!unstable) return null;
  const a = ARCADE_ANCHORS[h.saved.anchor];
  return {
    x: a.x,
    z: a.z,
    y: h.y + a.height,
  };
}
export function restoreArcadeArrival(game) {
  const h = game.arcadeLock,
    p = game.player.position;
  if (!h || arcadeFoundationDistance(p.x, p.z) > 2) return;
  const ground = game.groundHeight(p.x, p.z),
    d = arcadeDeckAt(game, p.x, p.z, p.y);
  const supported =
    Math.abs(p.y - ground) < 0.25 || (d && Math.abs(p.y - d.height) < 0.25);
  const submerged =
    Math.abs(p.x - ARCADE_POOL.x) < ARCADE_POOL.width / 2 &&
    Math.abs(p.z - ARCADE_POOL.z) < ARCADE_POOL.length / 2 &&
    p.y < h.y + 0.6 + ARCADE_RISE * h.saved.level - 0.35;
  if (supported && !submerged && !arcadeBlocked(game, p.x, p.z, p.y)) return;
  const a = ARCADE_ANCHORS[h.saved.anchor];
  p.set(a.x, h.y + a.height, a.z);
  game.jumpY = p.y - game.groundHeight(p.x, p.z);
  game.grounded = true;
  game.swimming = game.diving = false;
  game.velocityY = 0;
  game.airVelocity = null;
  game.fallPeak = p.y;
}
