import { boxEntry } from "./camera-collision.js";

export const CART_LENGTH = 70;
export const CART_FLOOR = 1.2;
export const CART_STOPS = [
  { x: 84, z: 406 },
  { x: 154, z: 406 },
  { x: 154, z: 336 },
];
export const CART_ANCHORS = [
  { x: 82, z: 400 },
  { x: 153, z: 400 },
  { x: 147, z: 338 },
];

export function cartInspected(progress) {
  return (
    progress.stage > 6 ||
    progress.field?.includes("field-6-1") ||
    progress.field?.includes("field-6-2")
  );
}
export function normalizeTemperingCart(value, progress) {
  const complete = progress.stage > 6 || progress.field?.includes("field-6-2");
  const inspected = cartInspected(progress);
  const lifted = inspected || progress.field?.includes("field-6-0");
  const stop =
    lifted &&
    Number.isInteger(value?.stop) &&
    value.stop >= 0 &&
    value.stop <= (inspected ? 2 : 1)
      ? value.stop
      : complete
        ? 2
        : inspected
          ? 1
          : 0;
  return {
    loaded: !!(inspected || (lifted && value?.loaded === true)),
    stop,
    turned: !!(
      stop === 2 ||
      (stop === 1 && inspected && value?.turned === true)
    ),
  };
}

export function addTemperingCart(map, level) {
  if (level.id !== "embers") return map;
  map.temperingCart = { x: 17, z: 56 };
  const rectangles = [
    [10, 14, 55, 59],
    [20, 23, 55, 59],
    [20, 23, 47, 49],
    [11, 23, 57, 59],
    [21, 23, 48, 58],
    [20, 22, 55, 57],
  ];
  for (const [x0, x1, z0, z1] of rectangles)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) map.grid[z][x] = 1;
  const entry = [];
  for (let z = 53; z <= 58; z++) {
    map.grid[z][12] = 1;
    entry.push({ x: 12, z });
  }
  map.paths.push(entry);
  for (const [step, [x, z, height]] of [
    [12, 57, CART_FLOOR],
    [21, 56, CART_FLOOR + 4.2],
    [21, 48, CART_FLOOR],
  ].entries())
    Object.assign(
      map.features.find((f) => f.id === `field-6-${step}`),
      { x, z, cartHeight: height },
    );
  return map;
}

// This narrow foundation cuts the existing banks into a service track. Earlier
// field sites retain their terrain seeds and the surrounding caldera is intact.
export function temperingFoundationDistance(x, z) {
  const rect = (a, b, c, d) =>
    Math.hypot(Math.max(a - x, 0, x - b), Math.max(c - z, 0, z - d));
  return Math.min(
    rect(76, 90, 393, 409),
    rect(80, 158, 402, 410),
    rect(150, 158, 332, 409),
    rect(143, 156, 389, 409),
    rect(136, 158, 330, 345),
    rect(159, 165, 396, 401),
  );
}
export function temperingFoundationWeight(x, z) {
  const distance = temperingFoundationDistance(x, z);
  const t = Math.max(0, Math.min(1, distance / 4));
  return 1 - t * t * (3 - 2 * t);
}

export function temperingPose(distance, turned) {
  if (distance < CART_LENGTH) return { x: 84 + distance, z: 406, angle: 0 };
  if (distance > CART_LENGTH)
    return { x: 154, z: 406 - (distance - CART_LENGTH), angle: Math.PI / 2 };
  return { x: 154, z: 406, angle: turned ? Math.PI / 2 : 0 };
}
export function cartLocal(h, x, z) {
  const dx = x - h.pose.x,
    dz = z - h.pose.z,
    c = Math.cos(h.pose.angle),
    s = Math.sin(h.pose.angle);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
export function onTemperingCart(h, p) {
  if (!h || !p || Math.abs(p.y - h.floor) > 0.28) return false;
  const q = cartLocal(h, p.x, p.z);
  return Math.abs(q.x) < 2.1 && Math.abs(q.z) < 1.4;
}

// Pump input follows the rail axis. Releasing the handle adds braking friction;
// a stopped cart snaps into nearby landing catches. The turntable separates the
// two runs, so driving cannot skip its inspection and quarter turn.
export function stepTemperingCart(h, dt, input) {
  const count = Math.max(1, Math.ceil(dt * 60));
  for (let i = 0; i < count; i++) {
    const step = dt / count;
    const low = h.saved.turned ? CART_LENGTH : 0,
      high = low + CART_LENGTH;
    h.velocity +=
      (input * 6 - h.velocity * (Math.abs(input) < 0.05 ? 5 : 1.05)) * step;
    h.velocity = Math.max(-6.2, Math.min(6.2, h.velocity));
    const next = Math.max(low, Math.min(high, h.distance + h.velocity * step));
    if ((next === low && h.velocity < 0) || (next === high && h.velocity > 0))
      h.velocity = 0;
    h.distance = next;
    h.docked = null;
    if (
      (Math.abs(input) < 0.05 || h.velocity === 0) &&
      Math.abs(h.velocity) < 0.5
    ) {
      const stop = Math.round(h.distance / CART_LENGTH);
      if (Math.abs(h.distance - stop * CART_LENGTH) < 1.4) {
        h.distance = stop * CART_LENGTH;
        h.velocity = 0;
        h.docked = stop;
      }
    }
  }
  h.pose = temperingPose(h.distance, h.saved.turned);
}

export function cartDeckAt(game, x, z, maxY = Infinity) {
  const h = game.temperingCart;
  if (!h) return null;
  let result = null;
  for (const d of h.decks)
    if (
      d.enabled !== false &&
      Math.abs(x - d.x) < d.w &&
      Math.abs(z - d.z) < d.d &&
      d.y <= maxY + 0.2 &&
      (!result || d.y > result.height)
    )
      result = { height: d.y, surface: d };
  const q = cartLocal(h, x, z);
  if (
    Math.abs(q.x) < 2.1 &&
    Math.abs(q.z) < 1.4 &&
    h.floor <= maxY + 0.2 &&
    (!result || h.floor > result.height)
  )
    result = { height: h.floor, surface: { cart: true } };
  return result;
}
export function cartBlocked(game, x, z, y, clearance = 1.8) {
  const h = game.temperingCart;
  if (!h) return false;
  const q = cartLocal(h, x, z);
  if (
    y < h.floor - 0.2 &&
    y + clearance > h.floor - 0.25 &&
    Math.abs(q.x) < 2.22 &&
    Math.abs(q.z) < 1.52
  )
    return true;
  return (
    (h.carSolids || []).some(
      (s) =>
        Math.abs(q.x - s.x) < s.w + 0.2 &&
        Math.abs(q.z - s.z) < s.d + 0.2 &&
        y < h.floor + s.top &&
        y + clearance > h.floor + s.bottom,
    ) ||
    h.solids.some(
      (s) =>
        Math.abs(x - s.x) < s.w + 0.2 &&
        Math.abs(z - s.z) < s.d + 0.2 &&
        y < s.top &&
        y + clearance > s.bottom,
    ) ||
    h.decks.some(
      (d) =>
        d.enabled !== false &&
        Math.abs(x - d.x) < d.w + 0.12 &&
        Math.abs(z - d.z) < d.d + 0.12 &&
        y < d.y - 0.22 &&
        y + clearance > d.y - d.thickness,
    )
  );
}
export function cartOccludes(game, from, to) {
  const h = game.temperingCart;
  if (!h) return false;
  const a = { ...cartLocal(h, from.x, from.z), y: from.y - h.floor },
    b = { ...cartLocal(h, to.x, to.z), y: to.y - h.floor };
  if (
    [
      { x: 0, z: 0, w: 2.1, d: 1.4, bottom: -0.25, top: 0 },
      ...(h.carSolids || []),
    ].some(
      (s) =>
        boxEntry(
          a,
          b,
          {
            min: { x: s.x - s.w, y: s.bottom, z: s.z - s.d },
            max: { x: s.x + s.w, y: s.top, z: s.z + s.d },
          },
          0,
          true,
        ) !== null,
    )
  )
    return true;
  return [
    ...h.solids,
    ...h.decks
      .filter((d) => d.enabled !== false)
      .map((d) => ({ ...d, bottom: d.y - d.thickness, top: d.y })),
  ].some(
    (s) =>
      boxEntry(
        from,
        to,
        {
          min: { x: s.x - s.w, y: s.bottom, z: s.z - s.d },
          max: { x: s.x + s.w, y: s.top, z: s.z + s.d },
        },
        0,
        true,
      ) !== null,
  );
}
export function cartSavePosition(game) {
  const h = game.temperingCart,
    p = game.player?.position;
  if (!h || !p || !onTemperingCart(h, p)) return null;
  return { ...CART_ANCHORS[h.saved.stop], y: h.floor };
}
