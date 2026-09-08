import { boxEntry } from "./camera-collision.js";

export const HOIST_RISE = 5.6;
export const HOIST_DECK = 0.18;
export const HOIST_CARS = [
  [-7, -9],
  [7, 9],
];
export const HOIST_RECORD = {
  title: "The bell that called them home",
  text: "The bellkeepers used these cargo platforms to carry grain above the winter drifts. When the pass closed, the eastern bell called the scattered households into the upper refuge. The archive lists no rank and no tithe: only names, blankets, and the number of people still expected before nightfall.",
  note: "Elara's annotation: The bell was not an alarm. It told the people outside that someone was still waiting for them.",
};
export function normalizeBellHoist(value) {
  const clapper = value?.clapper === true;
  const bell = clapper && value?.bell === true;
  return {
    stop:
      Number.isInteger(value?.stop) && value.stop >= 0 && value.stop <= 2
        ? value.stop
        : 0,
    visited: value?.visited === true,
    clapper,
    bell,
    recovered: bell && value?.recovered === true,
  };
}
export function hoistHeight(stop, car) {
  return HOIST_DECK + (car ? 2 - stop : stop) * HOIST_RISE;
}
export function addBellHoist(map, level) {
  if (level.id !== "frost") return map;
  // This previously unoccupied shelf is appended after seeded campaign features.
  // The approach branches from the existing western journal path.
  map.bellHoist = { x: 26, z: 52, r: 4.5, bellHoist: true };
  for (let z = 48; z <= 56; z++)
    for (let x = 23; x <= 29; x++) map.grid[z][x] = 1;
  const path = [];
  for (let x = 19; x <= 26; x++) {
    map.grid[47][x] = 1;
    path.push({ x, z: 47 });
  }
  path.push({ x: 26, z: 48 });
  map.paths.push(path);
  return map;
}
export function insideBellHoist(game) {
  const h = game.bellHoist,
    p = game.player?.position;
  return !!h && !!p && Math.abs(p.x - h.x) < 23 && Math.abs(p.z - h.z) < 30;
}
export function hoistDeckAt(game, x, z, maxY = Infinity) {
  const h = game.bellHoist;
  if (!h) return null;
  let result = null;
  for (const deck of h.decks) {
    if (
      deck.enabled === false ||
      Math.abs(x - deck.x) > deck.w ||
      Math.abs(z - deck.z) > deck.d ||
      deck.y > maxY + 0.2
    )
      continue;
    if (!result || deck.y > result.height)
      result = { height: deck.y, surface: deck };
  }
  return result;
}
export function hoistBlocked(game, x, z, y, clearance = 1.8) {
  const h = game.bellHoist;
  if (!h) return false;
  for (const deck of h.decks) {
    if (deck.enabled === false) continue;
    if (
      Math.abs(x - deck.x) < deck.w + 0.2 &&
      Math.abs(z - deck.z) < deck.d + 0.2 &&
      y < deck.y - 0.2 &&
      y + clearance > deck.y - 0.38
    )
      return true;
  }
  return h.solids.some(
    (o) =>
      o.enabled !== false &&
      Math.abs(x - o.x) < o.w + 0.2 &&
      Math.abs(z - o.z) < o.d + 0.2 &&
      y < o.top &&
      y + clearance > o.bottom,
  );
}
export function hoistSavePosition(game) {
  const h = game.bellHoist,
    p = game.player?.position;
  if (!h?.motion || !p) return null;
  const index = h.cars.findIndex(
    (car) =>
      Math.abs(p.x - car.deck.x) < car.deck.w &&
      Math.abs(p.z - car.deck.z) < car.deck.d &&
      Math.abs(p.y - car.deck.y) < 0.3,
  );
  if (index < 0) return null;
  // Persist the last completed stop, with the rider on that same platform.
  return { x: p.x, y: h.y + hoistHeight(h.saved.stop, index), z: p.z };
}
// Thin grilles and overhead floors must occlude sight and sound even when a
// longer ray's terrain samples fall on either side of them.
export function hoistOccludes(game, from, to) {
  const h = game.bellHoist;
  if (!h) return false;
  const hits = (x, z, w, d, bottom, top) =>
    boxEntry(
      from,
      to,
      {
        min: { x: x - w, y: bottom, z: z - d },
        max: { x: x + w, y: top, z: z + d },
      },
      0,
      true,
    ) !== null;
  return (
    h.solids.some(
      (o) => o.enabled !== false && hits(o.x, o.z, o.w, o.d, o.bottom, o.top),
    ) ||
    h.decks.some(
      (d) => d.enabled !== false && hits(d.x, d.z, d.w, d.d, d.y - 0.38, d.y),
    )
  );
}
