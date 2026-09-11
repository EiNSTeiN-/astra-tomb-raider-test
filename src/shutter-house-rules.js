import { boxEntry } from "./camera-collision.js";

export const SHUTTER_SITE = { x: 175, z: 238 };
export const SHUTTER_STATIONS = [
  { x: 12, z: 4, height: 3.6, label: "WEST WIND" },
  { x: -12, z: -8, height: 6.6, label: "RIDGE WIND" },
  { x: 12, z: -20, height: 9.6, label: "CHAMBER WIND" },
];
export const SHUTTER_SPANS = [
  { z: 4, height: 3.6, gap: 0, direction: 1 },
  { z: -8, height: 6.6, gap: 3.5, direction: -1 },
  { z: -20, height: 9.6, gap: -3.5, direction: 1 },
];
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function shutterFoundationDistance(x, z) {
  return Math.hypot(
    Math.max(157 - x, 0, x - 196),
    Math.max(213 - z, 0, z - 255),
  );
}
export const shutterFoundationWeight = (x, z) =>
  1 - smooth(0, 4, shutterFoundationDistance(x, z));
export function addShutterHouse(map, level) {
  if (level.id !== "frost") return map;
  map.shutterHouse = { ...SHUTTER_SITE };
  for (let z = 30; z <= 37; z++)
    for (let x = 22; x <= 28; x++) map.grid[z][x] = 1;
  SHUTTER_STATIONS.forEach((s, i) =>
    Object.assign(
      map.features.find((f) => f.id === `field-5-${i}`),
      {
        x: (SHUTTER_SITE.x + s.x) / 7,
        z: (SHUTTER_SITE.z + s.z) / 7,
        shutterHeight: s.height,
      },
    ),
  );
  return map;
}
export const shutterDone = (p, i) =>
  p.stage > 5 || !!p.field?.includes(`field-5-${i}`);
export function normalizeShutterHouse(value, progress) {
  const turns = SHUTTER_STATIONS.map((_, i) => {
    if (shutterDone(progress, i)) return 3;
    if (progress.stage !== 5 || (i > 0 && !shutterDone(progress, i - 1)))
      return 0;
    const v = value?.turns?.[i];
    return Number.isFinite(v) ? Math.max(0, Math.min(2, Math.floor(v))) : 0;
  });
  return { turns };
}
export function shutterGust(index, time, turns = 0) {
  const t = (Math.max(0, time) + index * 1.7) % 10.5;
  const envelope = smooth(2, 3.1, t) * (1 - smooth(5.7, 7.3, t));
  const warning = t < 2 ? smooth(0.7, 2, t) : 0;
  const direction =
    index === 2 && Math.floor((Math.max(0, time) + index * 1.7) / 10.5) % 2
      ? -1
      : SHUTTER_SPANS[index].direction;
  const remaining = Math.max(0, 1 - turns / 3);
  return {
    force: direction * 2.7 * envelope * remaining,
    warning: warning * remaining,
    strength: envelope * remaining,
    direction,
    activity: (0.13 + 0.87 * envelope) * remaining,
  };
}
export function shutterDeckAt(game, x, z, maxY = Infinity) {
  const h = game.shutterHouse;
  if (!h || shutterFoundationDistance(x, z) > 1) return null;
  let best = null;
  for (const d of h.decks)
    if (
      d.enabled !== false &&
      Math.abs(x - d.x) < d.w &&
      Math.abs(z - d.z) < d.d &&
      d.y <= maxY + 0.22 &&
      (!best || d.y > best.height)
    )
      best = { height: d.y, surface: d };
  return best;
}
export function shutterBlocked(game, x, z, y, clearance = 1.8) {
  const h = game.shutterHouse;
  if (!h || shutterFoundationDistance(x, z) > 1) return false;
  return (
    h.solids.some(
      (s) =>
        s.enabled !== false &&
        Math.abs(x - s.x) < s.w + 0.16 &&
        Math.abs(z - s.z) < s.d + 0.16 &&
        y < s.top - 0.18 &&
        y + clearance > s.bottom,
    ) ||
    h.decks.some(
      (d) =>
        d.enabled !== false &&
        Math.abs(x - d.x) < d.w + 0.1 &&
        Math.abs(z - d.z) < d.d + 0.1 &&
        y < d.y - 0.22 &&
        y + clearance > d.y - d.thickness,
    )
  );
}
// Stop rising before the standing capsule crosses a beam, roof or deck.
// Downward motion still uses the ordinary support/landing controller.
export function shutterCeiling(game, x, z, from, to, clearance = 1.8) {
  const h = game.shutterHouse;
  if (!h || to <= from || shutterFoundationDistance(x, z) > 1) return to;
  let limit = to;
  const check = (s, bottom) => {
    if (
      s.enabled !== false &&
      Math.abs(x - s.x) < s.w + 0.16 &&
      Math.abs(z - s.z) < s.d + 0.16 &&
      bottom >= from + clearance - 0.025 &&
      bottom < limit + clearance
    )
      limit = Math.max(from, bottom - clearance - 0.005);
  };
  for (const s of h.solids) check(s, s.bottom);
  for (const d of h.decks) check(d, d.y - d.thickness);
  return limit;
}
export function shutterOccludes(game, from, to) {
  const h = game.shutterHouse;
  if (!h) return false;
  const hit = (s, bottom, top) =>
    s.enabled !== false &&
    boxEntry(
      from,
      to,
      {
        min: { x: s.x - s.w, y: bottom, z: s.z - s.d },
        max: { x: s.x + s.w, y: top, z: s.z + s.d },
      },
      0,
      true,
    ) !== null;
  return (
    h.solids.some((s) => hit(s, s.bottom, s.top)) ||
    h.decks.some((d) => hit(d, d.y - d.thickness, d.y))
  );
}
export function shutterWindVelocity(game, velocity) {
  const h = game.shutterHouse,
    p = game.player?.position;
  game.shutterWind = null;
  if (
    !h ||
    !p ||
    game.paused ||
    game.swimming ||
    game.climb ||
    game.ropeRide ||
    game.zipRide ||
    game.dodge ||
    game.blockGrip
  )
    return velocity;
  for (const [i, s] of SHUTTER_SPANS.entries()) {
    const x = p.x - h.x,
      z = p.z - h.z;
    if (
      Math.abs(x) > 10 ||
      Math.abs(z - s.z) > 2.6 ||
      p.y < h.y + s.height - 0.35 ||
      p.y > h.y + s.height + 3
    )
      continue;
    const gust = shutterGust(i, h.time, h.saved.turns[i]);
    const force = gust.force * smooth(10, 7, Math.abs(x));
    const braced = !!game.crouching && !!game.grounded;
    const drift = force * (braced ? 0.035 : game.grounded ? 1 : 1.1);
    game.shutterWind = { gust, force, braced, index: i };
    return { x: velocity.x, z: velocity.z + drift };
  }
  return velocity;
}
export function shutterAnchor(game) {
  const h = game.shutterHouse;
  for (let i = 2; i >= 0; i--)
    if (shutterDone(game.progress, i)) {
      const s = SHUTTER_STATIONS[i];
      return { x: h.x + s.x, z: h.z + s.z + 1, y: h.y + s.height };
    }
  return { x: h.x - 12, z: h.z + 15, y: game.groundHeight(h.x - 12, h.z + 15) };
}
export function shutterSavePosition(game) {
  const h = game.shutterHouse,
    p = game.player?.position;
  if (!h || !p || shutterFoundationDistance(p.x, p.z) > 0) return null;
  const d = shutterDeckAt(game, p.x, p.z, p.y);
  if (game.grounded && d && Math.abs(d.height - p.y) < 0.25) return null;
  if (game.grounded && p.y < game.groundHeight(p.x, p.z) + 0.3) return null;
  return shutterAnchor(game);
}
export function restoreShutterArrival(game) {
  const h = game.shutterHouse,
    p = game.player?.position;
  if (!h || !p || shutterFoundationDistance(p.x, p.z) > 0) return;
  const saved = game.progress.position;
  let a;
  // General traversal recovery can discard an unsupported old height before
  // this chapter hook runs. Validate the saved elevation, not just that floor.
  if (
    saved &&
    Math.hypot(saved.x - p.x, saved.z - p.z) < 0.1 &&
    saved.height > 0.3
  ) {
    const floor = game.groundHeight(p.x, p.z),
      desired = floor + saved.height;
    const deck = shutterDeckAt(game, p.x, p.z, desired);
    if (
      deck &&
      Math.abs(deck.height - desired) < 0.25 &&
      game.canMove(p.x, p.z, deck.height - floor)
    ) {
      p.y = deck.height;
      game.jumpY = deck.height - floor;
      game.grounded = true;
      game.velocityY = 0;
      return;
    }
    a = shutterAnchor(game);
  } else a = shutterSavePosition(game);
  if (!a) return;
  game.player.position.set(a.x, a.y, a.z);
  game.grounded = true;
  game.velocityY = 0;
  game.jumpY = a.y - game.groundHeight(a.x, a.z);
}
