export const TAU = Math.PI * 2;
export const ORBIT_BRIDGE = Object.freeze({
  start: -22,
  length: 5,
  leaves: 4,
  width: 2.5,
  top: 0.18,
  duration: 6,
  folded: Math.PI / 2 - 0.08,
});
export const ORBIT_RINGS = [
  {
    inner: 15,
    outer: 18,
    speed: 0.08,
    arcs: [[0, (Math.PI * 4) / 3]],
    name: "Earth",
  },
  {
    inner: 10,
    outer: 13,
    speed: -0.11,
    arcs: [
      [0, Math.PI / 2],
      [Math.PI, Math.PI * 1.5],
    ],
    name: "Moon",
  },
  {
    inner: 5,
    outer: 8,
    speed: -0.14,
    arcs: [
      [0, Math.PI / 3],
      [(Math.PI * 2) / 3, Math.PI],
      [(Math.PI * 4) / 3, (Math.PI * 5) / 3],
    ],
    name: "Star",
  },
];
export const ORBIT_RESTS = [
  { x: -22, z: 0, w: 2, d: 3, name: "The western landing" },
  { x: 0, z: -13.7, w: 1.8, d: 1.8, name: "The earthly bearing" },
  { x: -8.7, z: 0, w: 1.8, d: 1.8, name: "The lunar bearing" },
  { x: 0, z: 3.7, w: 1.8, d: 1.8, name: "The astral bearing" },
];
export const ORBIT_RECORD = {
  title: "The map that brought them home",
  text: "The cartographers did not build this instrument to predict an eclipse. They used it to follow the night caravans through three moving skies. Each traveller could set a bearing for the next. The central chart records no conquered territories: only wells, shelters, and the names of people who would open their doors. Elara circled the last inscription: a map is a promise that someone can return.",
};
export const orbitAngle = (a) => ((a % TAU) + TAU) % TAU;
export function normalizeOrbit(value) {
  const visited = value?.visited === true,
    started = visited && value?.started === true,
    aligned =
      started && Number.isInteger(value?.aligned)
        ? Math.max(0, Math.min(3, value.aligned))
        : 0,
    rest =
      started && Number.isInteger(value?.rest)
        ? Math.max(0, Math.min(3, aligned + 1, value.rest))
        : 0;
  return {
    visited,
    started,
    aligned,
    rest,
    recovered: aligned === 3 && value?.recovered === true,
    angles: Array.from({ length: 3 }, (_, i) =>
      Number.isFinite(value?.angles?.[i]) ? orbitAngle(value.angles[i]) : 0,
    ),
  };
}
export function inOrbitVault(map, x, z, padding = 0) {
  return (
    !!map.orbitVault &&
    Math.hypot(x - map.orbitVault.x * 7, z - map.orbitVault.z * 7) <
      25 + padding
  );
}
export function addOrbitVault(map, level) {
  if (level.id !== "eclipse") return map;
  map.orbitVault = { x: 39, z: 31 };
  for (let z = 27; z <= 35; z++)
    for (let x = 35; x <= 43; x++) map.grid[z][x] = 1;
  map.paths.push(Array.from({ length: 5 }, (_, i) => ({ x: 35 + i, z: 31 })));
  return map;
}
export function orbitRingAt(ring, angle, x, z, padding = 0) {
  const r = Math.hypot(x, z);
  if (r < ring.inner + padding || r > ring.outer - padding) return false;
  const a = orbitAngle(Math.atan2(z, x) - angle),
    margin = Math.max(0, padding) / Math.max(r, 1);
  return ring.arcs.some(([from, to]) => a >= from + margin && a <= to - margin);
}
export function orbitDeckAt(game, x, z, maxY = Infinity) {
  const h = game.orbitVault;
  if (!h || h.y > maxY + 0.2) return null;
  const dx = x - h.x,
    dz = z - h.z,
    r = Math.hypot(dx, dz);
  if (
    (h.bridge ? h.bridge.progress >= 1 : h.saved.recovered) &&
    dx >= -22 &&
    dx <= -2 &&
    Math.abs(dz) < 1.25 &&
    h.y + ORBIT_BRIDGE.top <= maxY + 0.2
  )
    return { height: h.y + ORBIT_BRIDGE.top, surface: h.returnDeck };
  if (r >= 20 && r <= 24) return { height: h.y, surface: h.bank };
  for (const d of h.rests)
    if (Math.abs(x - d.x) <= d.w && Math.abs(z - d.z) <= d.d)
      return { height: h.y, surface: d };
  if (r <= 2.5) return { height: h.y, surface: h.hub };
  for (const ring of h.rings)
    if (orbitRingAt(ring, ring.angle, dx, dz))
      return { height: h.y, surface: ring };
  return null;
}
export function orbitAnchor(h) {
  const index = h.anchor ?? h.saved.rest,
    d = ORBIT_RESTS[index];
  return { x: h.x + d.x, y: h.y, z: h.z + d.z + (index === 0 ? -2.4 : 0) };
}
export function orbitSavePosition(game) {
  const h = game.orbitVault,
    p = game.player?.position;
  if (!h || !p || !inOrbitVault(game.map, p.x, p.z)) return null;
  h.saved.angles = h.rings.map((r) => r.angle);
  if (
    Math.hypot(p.x - h.x, p.z - h.z) >= 20 &&
    Math.abs(p.y - game.groundHeight(p.x, p.z)) < 0.3
  )
    return null;
  const support = orbitDeckAt(game, p.x, p.z, p.y);
  if (
    support &&
    !support.surface.orbitRing &&
    Math.abs(support.height - p.y) < 0.25
  )
    return null;
  return orbitAnchor(h);
}
export function restoreOrbitArrival(game) {
  const h = game.orbitVault,
    p = game.player?.position;
  // A player's body can overlap the outer colonnade while their centre is
  // just outside the deck radius. Clear ground in this margin remains valid.
  if (!h || !p || !inOrbitVault(game.map, p.x, p.z, 1)) return;
  if (
    Math.hypot(p.x - h.x, p.z - h.z) >= 20 &&
    Math.abs(p.y - game.groundHeight(p.x, p.z)) < 0.3 &&
    game.canMove(p.x, p.z, p.y - game.groundHeight(p.x, p.z))
  )
    return;
  const support = orbitDeckAt(game, p.x, p.z, p.y);
  if (
    support &&
    Math.abs(support.height - p.y) < 0.25 &&
    game.canMove(p.x, p.z, p.y - game.groundHeight(p.x, p.z))
  )
    return;
  const a = orbitAnchor(h);
  p.set(a.x, a.y, a.z);
  game.jumpY = a.y - game.groundHeight(a.x, a.z);
  game.grounded = true;
  game.velocityY = 0;
}
