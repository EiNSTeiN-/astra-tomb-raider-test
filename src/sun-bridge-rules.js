import { boxEntry } from "./camera-collision.js";

export const SUN_SITE = { x: 126, z: 245 };
export const SUN_PIVOTS = [
  { x: -10, z: 0 },
  { x: 16, z: 0 },
];
export const SUN_FIELDS = [
  { x: -24, z: 0, height: 6, label: "GARDEN CABLE" },
  { x: -17, z: -24, height: 9.2, label: "COUNTERWEIGHT" },
  { x: 16, z: -14, height: 6, label: "SUN CROSSING" },
];
export const SUN_LANDINGS = [
  { x: -24, z: 0, w: 5, d: 6, height: 6, name: "Entry" },
  { x: -10, z: -14, w: 5, d: 4, height: 6, name: "Garden gallery" },
  { x: -16.2, z: -14, w: 3.6, d: 4, height: 7.2, name: "Broken stair" },
  { x: -16.2, z: -19, w: 3.6, d: 3, height: 8.2, name: "Upper stair" },
  { x: -17, z: -24, w: 5.2, d: 4, height: 9.2, name: "Weight gallery" },
  { x: 16, z: -14, w: 5, d: 4, height: 6, name: "Sun gallery" },
];
export const sunDone = (progress, step) =>
  progress.stage > 5 || !!progress.field?.includes(`field-5-${step}`);
export function sunFoundationDistance(x, z) {
  return Math.hypot(
    Math.max(98 - x, 0, x - 157),
    Math.max(217 - z, 0, z - 268),
  );
}
export function sunFoundationWeight(x, z) {
  const t = Math.min(1, sunFoundationDistance(x, z) / 5);
  return 1 - t * t * (3 - 2 * t);
}
export function addSunBridge(map, level) {
  if (level.id !== "verdant") return map;
  map.sunBridge = { ...SUN_SITE };
  for (let z = 30; z <= 39; z++)
    for (let x = 14; x <= 23; x++) map.grid[z][x] = 1;
  for (const [step, p] of SUN_FIELDS.entries())
    Object.assign(
      map.features.find((f) => f.id === `field-5-${step}`),
      {
        x: (SUN_SITE.x + p.x) / 7,
        z: (SUN_SITE.z + p.z) / 7,
        sunHeight: p.height,
      },
    );
  return map;
}
export function normalizeSunBridge(value, progress) {
  return {
    stops: [0, 1].map((i) =>
      sunDone(progress, i) && value?.stops?.[i] === 1 ? 1 : 0,
    ),
    anchor:
      Number.isInteger(value?.anchor) && value.anchor >= 0 && value.anchor <= 3
        ? Math.min(
            value.anchor,
            sunDone(progress, 1) ? 3 : sunDone(progress, 0) ? 2 : 0,
          )
        : 0,
  };
}
export function sunLocal(bridge, x, z) {
  const dx = x - bridge.x,
    dz = z - bridge.z,
    c = Math.cos(bridge.angle),
    s = Math.sin(bridge.angle);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
export function sunWorld(bridge, x, z) {
  const c = Math.cos(bridge.angle),
    s = Math.sin(bridge.angle);
  return { x: bridge.x + x * c + z * s, z: bridge.z - x * s + z * c };
}
export function sunDeckAt(game, x, z, maxY = Infinity) {
  const h = game.sunBridge;
  if (!h || sunFoundationDistance(x, z) > 1) return null;
  let best = null;
  for (const d of h.decks) {
    if (d.enabled === false) continue;
    const p = d.bridge ? sunLocal(d.bridge, x, z) : { x: x - d.x, z: z - d.z };
    if (
      Math.abs(p.x) < d.w &&
      Math.abs(p.z) < d.d &&
      d.y <= maxY + 0.2 &&
      (!best || d.y > best.height)
    )
      best = { height: d.y, surface: d };
  }
  return best;
}
function colliders(h) {
  return [
    ...h.solids,
    ...h.decks.map((d) => ({ ...d, bottom: d.y - d.thickness, top: d.y })),
  ];
}
function relative(s, x, z) {
  return s.bridge ? sunLocal(s.bridge, x, z) : { x: x - s.x, z: z - s.z };
}
export function sunBlocked(game, x, z, y, clearance = 1.8) {
  const h = game.sunBridge;
  if (!h || sunFoundationDistance(x, z) > 1) return false;
  return colliders(h).some((s) => {
    if (s.enabled === false) return false;
    const p = relative(s, x, z);
    return (
      Math.abs(p.x - (s.offsetX || 0)) < s.w + 0.12 &&
      Math.abs(p.z - (s.offsetZ || 0)) < s.d + 0.12 &&
      y < s.top - 0.2 &&
      y + clearance > s.bottom
    );
  });
}
export function sunCeiling(game, x, z, from, to, clearance = 1.8) {
  const h = game.sunBridge;
  if (!h || to <= from || sunFoundationDistance(x, z) > 1) return to;
  let limit = to;
  for (const s of colliders(h)) {
    const p = relative(s, x, z);
    if (
      s.enabled !== false &&
      Math.abs(p.x - (s.offsetX || 0)) < s.w + 0.12 &&
      Math.abs(p.z - (s.offsetZ || 0)) < s.d + 0.12 &&
      s.bottom >= from + clearance - 0.025 &&
      s.bottom < limit + clearance
    )
      limit = Math.max(from, s.bottom - clearance - 0.005);
  }
  return limit;
}
export function sunOccludes(game, from, to) {
  const h = game.sunBridge;
  if (!h) return false;
  return colliders(h).some((s) => {
    if (s.enabled === false) return false;
    const a = relative(s, from.x, from.z),
      b = relative(s, to.x, to.z),
      x = s.offsetX || 0,
      z = s.offsetZ || 0;
    return (
      boxEntry(
        { ...a, y: from.y },
        { ...b, y: to.y },
        {
          min: { x: x - s.w, y: s.bottom, z: z - s.d },
          max: { x: x + s.w, y: s.top, z: z + s.d },
        },
        0,
        true,
      ) !== null
    );
  });
}
export function sunAnchor(game) {
  const h = game.sunBridge;
  let p;
  if (h.saved.anchor === 3 && sunDone(game.progress, 1))
    p = { x: 16, z: 1.3, height: 6 };
  else if (h.saved.anchor === 2 && sunDone(game.progress, 0))
    p = { x: -10, z: -14, height: 6 };
  else if (h.saved.anchor === 1 && sunDone(game.progress, 0))
    p = { x: -10, z: 1.3, height: 6 };
  else p = { x: -24, z: 2, height: 6 };
  return { x: h.x + p.x, y: h.y + p.height, z: h.z + p.z };
}
export function sunSavePosition(game) {
  const h = game.sunBridge,
    p = game.player?.position;
  if (!h || !p || sunFoundationDistance(p.x, p.z) > 1) return null;
  const d = sunDeckAt(game, p.x, p.z, p.y);
  if (h.turn || d?.surface.bridge || (!game.grounded && p.y > h.y + 1))
    return sunAnchor(game);
  return null;
}
export function restoreSunArrival(game) {
  const h = game.sunBridge,
    p = game.player?.position;
  if (!h || !p || sunFoundationDistance(p.x, p.z) > 1) return;
  const saved = game.progress.position,
    desired = game.groundHeight(p.x, p.z) + (saved?.height || 0),
    d = sunDeckAt(game, p.x, p.z, desired);
  if (
    saved?.height > 0.3 &&
    d &&
    Math.abs(d.height - desired) < 0.25 &&
    !d.surface.bridge &&
    game.canMove(p.x, p.z, desired - game.groundHeight(p.x, p.z))
  ) {
    p.y = desired;
    game.jumpY = desired - game.groundHeight(p.x, p.z);
    return;
  }
  if (saved?.height > 0.3 || sunSavePosition(game)) {
    const a = sunAnchor(game);
    p.set(a.x, a.y, a.z);
    game.jumpY = a.y - game.groundHeight(a.x, a.z);
    game.grounded = true;
    game.velocityY = 0;
  }
}
