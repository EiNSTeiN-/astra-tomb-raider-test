import { boxEntry } from "./camera-collision.js";

export const PRESSURE_DECKS = [
  { x: 14, z: 10, y: 0.18, w: 6, d: 4, name: "The intake gallery" },
  { x: -7, z: 5, y: 8.2, w: 2.6, d: 3.8, name: "The lower bypass" },
  { x: -7, z: -16, y: 16.2, w: 3.8, d: 2.6, name: "The upper bypass" },
  { x: 14, z: -16, y: 24.2, w: 3.8, d: 3, name: "The dispatch gallery" },
];
export const PRESSURE_PISTONS = [
  { x: 7, z: 5, low: 0.18, high: 4.2, bank: 0, phase: 0 },
  { x: 0, z: 5, low: 4.2, high: 8.2, bank: 0, phase: 6 },
  { x: -7, z: -2, low: 8.2, high: 12.2, bank: 1, phase: 0 },
  { x: -7, z: -9, low: 12.2, high: 16.2, bank: 1, phase: 6 },
  { x: 0, z: -16, low: 16.2, high: 20.2, bank: 2, phase: 0 },
  { x: 7, z: -16, low: 20.2, high: 24.2, bank: 2, phase: 6 },
];
export const PRESSURE_RECORD = {
  title: "The last delivery",
  text: "The dispatch ledger records the forge's final shift. While the city sent orders for more metal, the platform crews diverted their last pressure reserve to the refuge pumps. The last cargo listed here is not an ingot or a weapon: six sealed water jars, two sacks of grain, and a child asleep between them. Beside the delivery mark, the dispatcher wrote: let the furnaces go cold.",
  note: "Elara’s annotation: This machine kept its promise only when someone refused the orders it was built to obey.",
};

export function normalizePressure(value) {
  const visited = value?.visited === true;
  const opened =
    visited && Number.isInteger(value?.opened)
      ? Math.max(0, Math.min(3, value.opened))
      : 0;
  const rest =
    visited && Number.isInteger(value?.rest)
      ? Math.max(0, Math.min(opened, value.rest))
      : 0;
  const recovered = rest === 3 && value?.recovered === true;
  return {
    visited,
    opened,
    rest,
    recovered,
    lift: recovered && value?.lift === 0 ? 0 : 1,
  };
}

export function addPressureRelay(map, level) {
  if (level.id !== "embers") return map;
  map.pressureRelay = { x: 10, z: 7, r: 3.7, pressureRelay: true };
  for (let z = 3; z <= 11; z++)
    for (let x = 6; x <= 14; x++) map.grid[z][x] = 1;
  const path = [];
  for (let x = 14; x <= 19; x++) {
    map.grid[9][x] = 1;
    path.push({ x, z: 9 });
  }
  map.paths.push(path);
  return map;
}

export function pistonHeight(index, time, opened) {
  const p = PRESSURE_PISTONS[index];
  if (opened <= p.bank) return p.low;
  const phase = (((time + p.phase) % 12) + 12) % 12;
  const t =
    phase < 2
      ? 0
      : phase < 5
        ? (phase - 2) / 3
        : phase < 7
          ? 1
          : phase < 10
            ? (10 - phase) / 3
            : 0;
  const ease = t * t * (3 - 2 * t);
  return p.low + (p.high - p.low) * ease;
}

export function insidePressure(game) {
  const h = game.pressureRelay,
    p = game.player?.position;
  return !!h && !!p && Math.abs(p.x - h.x) < 25 && Math.abs(p.z - h.z) < 26;
}

export function pressureDeckAt(game, x, z, maxY = Infinity) {
  const h = game.pressureRelay;
  if (!h) return null;
  let result = null;
  for (const d of h.decks) {
    if (Math.abs(x - d.x) > d.w || Math.abs(z - d.z) > d.d || d.y > maxY + 0.2)
      continue;
    if (!result || d.y > result.height) result = { height: d.y, surface: d };
  }
  return result;
}

export function pressureBlocked(game, x, z, y, clearance = 1.8) {
  const h = game.pressureRelay;
  if (!h) return false;
  return (
    h.solids.some(
      (o) =>
        Math.abs(x - o.x) < o.w + 0.2 &&
        Math.abs(z - o.z) < o.d + 0.2 &&
        y < o.top - 0.01 &&
        y + clearance > o.bottom,
    ) ||
    h.decks.some(
      (d) =>
        Math.abs(x - d.x) < d.w + 0.12 &&
        Math.abs(z - d.z) < d.d + 0.12 &&
        y < d.y - 0.2 &&
        y + clearance > d.y - 0.35,
    )
  );
}

export function pressureOccludes(game, from, to) {
  const h = game.pressureRelay;
  if (!h) return false;
  return [
    ...h.solids,
    ...h.decks.map((d) => ({ ...d, bottom: d.y - 0.35, top: d.y })),
  ].some(
    (o) =>
      boxEntry(
        from,
        to,
        {
          min: { x: o.x - o.w, y: o.bottom, z: o.z - o.d },
          max: { x: o.x + o.w, y: o.top, z: o.z + o.d },
        },
        0,
        true,
      ) !== null,
  );
}

export function pressureAnchor(h) {
  const d = PRESSURE_DECKS[h.anchor ?? h.saved.rest];
  return { x: h.x + d.x, y: h.y + d.y, z: h.z + d.z };
}

export function pressureSavePosition(game) {
  const h = game.pressureRelay,
    p = game.player?.position;
  if (!insidePressure(game) || !p || !h) return null;
  const stable = h.rests.some(
    (d) =>
      Math.abs(p.x - d.x) < d.w &&
      Math.abs(p.z - d.z) < d.d &&
      Math.abs(p.y - d.y) < 0.25,
  );
  if (stable || (p.y < h.y + 0.5 && p.x > h.x + 11 && p.z > h.z - 11))
    return null;
  return pressureAnchor(h);
}
