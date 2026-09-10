import { boxEntry } from "./camera-collision.js";

export const STAIR_SITE = { x: 18, z: 32 };
export const STAIR_RISE = 6;
export const STAIR_STEPS = 36;
export const STAIR_RUN = 12.6;
export const STAIR_FIELDS = [
  { x: 7, z: 7, height: 0 },
  { x: -7, z: -7, height: 2.8 },
  { x: 0, z: -7, height: STAIR_RISE },
];
export function addFrozenStair(map, level) {
  if (level.id !== "frost") return map;
  map.frozenStair = { ...STAIR_SITE };
  for (const [step, point] of STAIR_FIELDS.entries()) {
    const f = map.features.find((f) => f.id === `field-3-${step}`);
    Object.assign(f, {
      x: STAIR_SITE.x + point.x / 7,
      z: STAIR_SITE.z + point.z / 7,
      stairHeight: point.height,
    });
  }
  // This existing field clearing already has a level foundation and connected
  // trails. Keep the seeded terrain terraces and other chapter routes intact.
  return map;
}
export function stairLocksReleased(progress) {
  return (
    progress.stage > 3 ||
    ["field-3-0", "field-3-1"].every((id) => progress.field?.includes(id))
  );
}
export function normalizeFrozenStair(value, progress) {
  return {
    restored:
      progress.stage > 3 ||
      !!progress.field?.includes("field-3-2") ||
      (stairLocksReleased(progress) && value?.restored === true),
  };
}
export function frozenStairDeckAt(game, x, z, maxY = Infinity) {
  const stair = game.frozenStair;
  if (!stair || Math.abs(x - stair.x) > 14 || Math.abs(z - stair.z) > 14)
    return null;
  let best = null;
  for (const deck of stair.decks) {
    if (
      deck.enabled === false ||
      Math.abs(x - deck.x) >= deck.w ||
      Math.abs(z - deck.z) >= deck.d ||
      deck.y > maxY + 0.2
    )
      continue;
    if (!best || deck.y > best.height) best = { height: deck.y, surface: deck };
  }
  return best;
}
export function frozenStairBlocked(game, x, z, y, clearance = 1.8) {
  const stair = game.frozenStair;
  if (!stair || Math.abs(x - stair.x) > 14 || Math.abs(z - stair.z) > 14)
    return false;
  // The winch is outside the lowering flight's swept area. Keep its descent
  // clear until every tread is seated; the player can still leave this area.
  if (
    stair.motion &&
    Math.abs(x - stair.x) < 2.1 &&
    z > stair.z - 3.8 &&
    z < stair.z + 9.3 &&
    y < stair.y + 19
  )
    return true;
  for (const deck of stair.decks) {
    if (
      deck.enabled !== false &&
      Math.abs(x - deck.x) < deck.w + 0.15 &&
      Math.abs(z - deck.z) < deck.d + 0.1 &&
      y < deck.y - 0.2 &&
      y + clearance > deck.y - deck.thickness
    )
      return true;
  }
  return stair.solids.some(
    (s) =>
      s.enabled !== false &&
      Math.abs(x - s.x) < s.w + 0.2 &&
      Math.abs(z - s.z) < s.d + 0.2 &&
      y < s.top &&
      y + clearance > s.bottom,
  );
}
export function frozenStairOccludes(game, from, to) {
  const stair = game.frozenStair;
  if (!stair) return false;
  if (
    boxEntry(
      from,
      to,
      {
        min: { x: stair.x - 14, y: stair.y - 1, z: stair.z - 14 },
        max: { x: stair.x + 14, y: stair.y + 20, z: stair.z + 14 },
      },
      0,
      true,
    ) === null
  )
    return false;
  const hits = (s, bottom, top) =>
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
    stair.solids.some((s) => hits(s, s.bottom, s.top)) ||
    stair.decks.some((d) => hits(d, d.y - d.thickness, d.y))
  );
}
