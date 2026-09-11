import { boxEntry } from "./camera-collision.js";

export const CAUSEWAY_SITE = { x: 245, z: 245 };
export const CAUSEWAY_LANDINGS = [
  { x: 217, z: 259, height: 4.2, w: 3, d: 3 },
  { x: 252, z: 259, height: 4.2, w: 4, d: 4 },
  { x: 252, z: 224, height: 7.2, w: 4, d: 4 },
];
export const CAUSEWAY_FIELDS = [
  { x: 217, z: 259, height: 4.2 },
  { x: 252, z: 262, height: 4.2 },
  { x: 252, z: 224, height: 7.2 },
];
export const CAUSEWAY_STONES = [
  ...[225, 231, 237, 243].map((x, index) => ({
    x,
    z: 259,
    height: 4.2,
    chain: 0,
    index,
  })),
  ...[250, 244, 238, 232].map((z, index) => ({
    x: 252,
    z,
    height: 4.8 + index * 0.6,
    chain: 1,
    index,
  })),
];
export const CAUSEWAY_PULSE = {
  delay: 0.6,
  spacing: 0.9,
  rise: 1,
  hold: 5.2,
  fall: 1.2,
};
const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const causewayRelayDone = (p, index) =>
  !!(
    p.stage > 3 ||
    p.field?.includes("field-3-2") ||
    (index <= 1 && p.field?.includes("field-3-1")) ||
    (index === 0 && p.field?.includes("field-3-0"))
  );

export function normalizeEchoCauseway(value, progress) {
  const available = causewayRelayDone(progress, 2)
    ? 2
    : causewayRelayDone(progress, 1)
      ? 1
      : 0;
  return {
    anchor:
      Number.isInteger(value?.anchor) &&
      value.anchor >= 0 &&
      value.anchor <= available
        ? value.anchor
        : available,
  };
}

// A pulse reaches each stone in turn. It rises, waits, then settles back into
// its socket; reaching the next relay holds that entire crossing permanently.
export function causewayStonePhase(time, index, latched = false) {
  if (latched) return { amount: 1, phase: "held", warning: 0 };
  const c = CAUSEWAY_PULSE;
  if (!Number.isFinite(time) || time < c.delay + index * c.spacing)
    return { amount: 0, phase: "rest", warning: 0 };
  const t = time - c.delay - index * c.spacing;
  if (t < c.rise)
    return { amount: smooth(0, c.rise, t), phase: "rising", warning: 0 };
  if (t < c.rise + c.hold)
    return {
      amount: 1,
      phase: "charged",
      warning: smooth(c.rise + c.hold - 1.1, c.rise + c.hold, t),
    };
  if (t < c.rise + c.hold + c.fall)
    return {
      amount: 1 - smooth(c.rise + c.hold, c.rise + c.hold + c.fall, t),
      phase: "falling",
      warning: 1,
    };
  return { amount: 0, phase: "rest", warning: 0 };
}
export function causewayFoundationDistance(x, z) {
  return Math.hypot(
    Math.max(210 - x, 0, x - 266),
    Math.max(214 - z, 0, z - 279),
  );
}
export function causewayFoundationWeight(x, z) {
  return 1 - smooth(0, 4, causewayFoundationDistance(x, z));
}
export function causewayChannelDepth(x, z) {
  const trench = (left, right, near, far) =>
    smooth(-1.5, 1.5, Math.min(x - left, right - x, z - near, far - z));
  return (
    8 *
    Math.max(trench(221, 247.5, 254.5, 263.5), trench(247.5, 256.5, 229, 254.5))
  );
}
export function addEchoCauseway(map, level) {
  if (level.id !== "crystal") return map;
  map.echoCauseway = { ...CAUSEWAY_SITE };
  for (let z = 30; z <= 40; z++)
    for (let x = 30; x <= 38; x++) map.grid[z][x] = 1;
  for (const [step, p] of CAUSEWAY_FIELDS.entries())
    Object.assign(
      map.features.find((f) => f.id === `field-3-${step}`),
      {
        x: p.x / 7,
        z: p.z / 7,
        causewayHeight: p.height,
      },
    );
  map.paths.push(CAUSEWAY_FIELDS.map((p) => ({ x: p.x / 7, z: p.z / 7 })));
  return map;
}

export function causewayDeckAt(game, x, z, maxY = Infinity) {
  let best = null;
  for (const d of game.echoCauseway?.decks || [])
    if (
      Math.abs(x - d.x) < d.w &&
      Math.abs(z - d.z) < d.d &&
      d.y <= maxY + 0.22 &&
      (!best || d.y > best.height)
    )
      best = { height: d.y, surface: d };
  return best;
}
export function causewayBlocked(game, x, z, y, clearance = 1.8) {
  const h = game.echoCauseway;
  if (!h || causewayFoundationDistance(x, z) > 1) return false;
  return (
    h.solids.some(
      (s) =>
        Math.abs(x - s.x) < s.w + 0.15 &&
        Math.abs(z - s.z) < s.d + 0.15 &&
        y < s.top - 0.22 &&
        y + clearance > s.bottom,
    ) ||
    h.decks.some(
      (d) =>
        Math.abs(x - d.x) < d.w + 0.12 &&
        Math.abs(z - d.z) < d.d + 0.12 &&
        y < d.y - 0.22 &&
        y + clearance > d.y - d.thickness,
    )
  );
}
export function causewayOccludes(game, from, to) {
  const h = game.echoCauseway;
  if (!h) return false;
  const hit = (s, bottom, top) =>
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
export function causewayAnchor(game) {
  const h = game.echoCauseway,
    a = CAUSEWAY_LANDINGS[h.saved.anchor];
  return { x: a.x, z: a.z + 1.8, y: h.base + a.height };
}
export function causewayRelayReachable(game, index) {
  const h = game.echoCauseway,
    p = game.player?.position,
    a = CAUSEWAY_LANDINGS[index];
  return !!(
    h &&
    p &&
    a &&
    game.grounded &&
    !game.swimming &&
    Math.abs(p.y - h.base - a.height) < 0.35 &&
    Math.abs(p.x - a.x) < a.w - 0.2 &&
    Math.abs(p.z - a.z) < a.d - 0.2
  );
}
export function causewaySavePosition(game) {
  const h = game.echoCauseway,
    p = game.player?.position;
  if (!h || !p || causewayFoundationDistance(p.x, p.z) > 0) return null;
  const d = causewayDeckAt(game, p.x, p.z, p.y);
  if (
    game.grounded &&
    d &&
    !d.surface.moving &&
    Math.abs(d.height - p.y) < 0.25
  )
    return null;
  if (causewayChannelDepth(p.x, p.z) < 0.1 && p.y < h.base + 0.3) return null;
  return causewayAnchor(game);
}
export function restoreCausewayArrival(game) {
  const h = game.echoCauseway,
    p = game.player?.position;
  if (!h || !p || causewayFoundationDistance(p.x, p.z) > 0) return;
  const d = causewayDeckAt(game, p.x, p.z, p.y);
  if (
    d &&
    !d.surface.moving &&
    Math.abs(d.height - p.y) < 0.25 &&
    game.canMove(p.x, p.z, p.y - game.groundHeight(p.x, p.z))
  )
    return;
  if (
    causewayChannelDepth(p.x, p.z) < 0.1 &&
    Math.abs(p.y - game.groundHeight(p.x, p.z)) < 0.3 &&
    game.canMove(p.x, p.z, 0)
  )
    return;
  const a = causewayAnchor(game);
  p.set(a.x, a.y, a.z);
  game.jumpY = a.y - game.groundHeight(a.x, a.z);
  game.grounded = true;
  game.velocityY = 0;
}
