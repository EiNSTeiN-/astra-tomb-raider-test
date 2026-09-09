// The north courier line is independent of the sanctuary route. Coordinates are
// world metres; all fixed landings share the entrance court's elevation.
export const COURIER_STOPS = [126, 189, 252, 315];
export const COURIER_Z = 14;
export const COURIER_FRAGMENTS = [
  "First post: They asked us to carry the king’s tribute. We loaded seed grain instead. The mountain villages had gone two seasons without a harvest.",
  "Second post: The wind changed before dawn. We waited together on the middle landing, passing a single cup of tea. Every name in this book belongs to someone who reached the far bank.",
  "Third post: The last basket held no gold: just letters, medicine, and a child’s small wooden bird. Take this register home. A road is only useful if people can return.",
];
export const COURIER_RECORD = {
  title: "The things they chose to carry",
  text: "Three dispatches restore the city’s forgotten route. Its couriers crossed the clouds with food, medicine and letters while the palace counted tribute below. Vesper copies the village names into her mother’s journal. Beside the last one, someone has drawn a bird with its wings folded: the mark for a traveller safely home.",
};
export function normalizeCourier(value) {
  const visited = value?.visited === true;
  const post =
    visited && Number.isInteger(value?.post)
      ? Math.max(0, Math.min(3, value.post))
      : 0;
  return {
    visited,
    post,
    dock:
      visited && Number.isInteger(value?.dock)
        ? Math.max(0, Math.min(3, value.dock))
        : 0,
    recovered: post === 3 && value?.recovered === true,
  };
}
export function addCourierFerry(map) {
  map.courierFerry = { stops: COURIER_STOPS, z: COURIER_Z };
  for (let x = 12; x <= 18; x++) map.grid[2][x] = 1;
  map.grid[3][12] = 1;
  for (const stop of COURIER_STOPS)
    for (let x = stop / 7 - 1; x <= stop / 7 + 1; x++)
      for (const z of [3, 4]) map.grid[z][x] = 1;
  map.paths.push(Array.from({ length: 7 }, (_, i) => ({ x: 12 + i, z: 2 })));
  return map;
}
export function courierCorridor(map, x, z) {
  return (
    !!map.courierFerry &&
    ((x >= 80 && x <= 129 && z >= 10 && z <= 26) ||
      (x >= 119 && x <= 325 && z >= 9 && z <= 31))
  );
}
// Only the landings and entrance are flattened. The cable spans retain the
// excavated chasm, so the map cannot accidentally become a walkable shortcut.
export function courierFoundationWeight(x, z) {
  const rect = (a, b, c, d) =>
    Math.hypot(Math.max(a - x, 0, x - b), Math.max(c - z, 0, z - d));
  let distance = Math.min(rect(81, 128, 12, 18), rect(81, 87, 14, 27));
  for (const stop of COURIER_STOPS)
    distance = Math.min(distance, rect(stop - 9, stop + 9, 18, 29));
  const t = Math.min(1, distance / 2);
  return 1 - t * t * (3 - 2 * t);
}
export function courierPlatforms(y) {
  const platforms = COURIER_STOPS.map((x, dock) => ({
    x,
    z: 21,
    y,
    w: 7,
    d: 4,
    bottom: y - 0.6,
    dock,
  }));
  for (let dock = 1; dock < 4; dock++) {
    for (let i = 0; i < 12; i++) {
      if (i >= 5 && i < 5 + dock) continue;
      platforms.push({
        x: COURIER_STOPS[dock] - 5 + i * 0.7,
        z: 25,
        y: y + 0.35 * (i + 1),
        w: 0.36,
        d: 1.05,
        bottom: y - 0.3,
        stair: true,
      });
    }
    platforms.push({
      x: COURIER_STOPS[dock] + 4.8,
      z: 25,
      y: y + 4.2,
      w: 2.1,
      d: 1.05,
      bottom: y - 0.3,
      post: dock,
    });
  }
  return platforms;
}
export function courierWind(x, time) {
  const smooth = (v) => {
    const t = Math.max(0, Math.min(1, v));
    return t * t * (3 - 2 * t);
  };
  const calm = 0.8 + 0.15 * Math.sin(time * 0.35),
    middle = Math.sin(time * 0.17 + 1),
    outer = Math.sin(time * 0.27 + 2) * 1.2;
  const first = calm + (middle - calm) * smooth((x - 183) / 12);
  return first + (outer - first) * smooth((x - 246) / 12);
}
export function stepCourier(h, dt) {
  const before = h.x;
  const count = Math.max(1, Math.ceil(dt * 60));
  for (let i = 0; i < count; i++) {
    const step = dt / count;
    h.time += step;
    h.wind = courierWind(h.x, h.time);
    if (h.recall != null) {
      const delta = COURIER_STOPS[h.recall] - h.x;
      h.x += Math.sign(delta) * Math.min(Math.abs(delta), 3.2 * step);
      h.velocity = 0;
      if (Math.abs(delta) < 0.01) {
        h.docked = h.recall;
        h.recall = null;
      }
    } else {
      if (Math.abs(h.trim) > 0.02) h.docked = null;
      if (h.docked != null) continue;
      const braking = Math.abs(h.trim) < 0.02;
      h.velocity +=
        (h.trim * h.wind * 3.3 - h.velocity * (braking ? 3.8 : 0.85)) * step;
      h.velocity = Math.max(-3.8, Math.min(3.8, h.velocity));
      h.x = Math.max(
        COURIER_STOPS[0],
        Math.min(COURIER_STOPS[3], h.x + h.velocity * step),
      );
      if (
        (h.x === COURIER_STOPS[0] && h.velocity < 0) ||
        (h.x === COURIER_STOPS[3] && h.velocity > 0)
      )
        h.velocity = 0;
      if (braking && Math.abs(h.velocity) < 0.6) {
        const dock = COURIER_STOPS.findIndex((x) => Math.abs(x - h.x) < 3.8);
        if (dock >= 0) {
          h.x = COURIER_STOPS[dock];
          h.velocity = 0;
          h.docked = dock;
        }
      }
    }
  }
  return h.x - before;
}
export function onCourier(h, p) {
  return (
    Math.abs(p.x - h.x) <= 3.1 &&
    Math.abs(p.z - COURIER_Z) <= 2.7 &&
    Math.abs(p.y - h.y) < 0.26
  );
}
export function courierDeckAt(game, x, z, maxY = Infinity) {
  if (x < 118 || x > 324 || z < 10 || z > 27) return null;
  const h = game.courierFerry;
  if (!h) return null;
  let result = null;
  for (const p of [
    ...h.platforms,
    { x: h.x, z: COURIER_Z, y: h.y, w: 3.1, d: 2.7, courier: true },
  ])
    if (
      Math.abs(x - p.x) <= p.w &&
      Math.abs(z - p.z) <= p.d &&
      p.y <= maxY + (game.grounded ? 0.45 : 0.2) &&
      (!result || p.y > result.height)
    )
      result = { height: p.y, surface: p };
  return result;
}
export function courierCarSolids(h) {
  return [
    { x: h.x - 3, z: 14, w: 0.045, d: 2.55, y: h.y, h: 1.1 },
    { x: h.x + 3, z: 14, w: 0.045, d: 2.55, y: h.y, h: 1.1 },
    { x: h.x, z: 11.5, w: 3, d: 0.045, y: h.y, h: 1.1 },
    { x: h.x + 1.4, z: 13.3, w: 0.08, d: 0.08, y: h.y, h: 6.2 },
    { x: h.x, z: 14.6, w: 0.08, d: 0.08, y: h.y, h: 1.25, padding: 0.2 },
  ];
}
export function courierBlocked(game, x, z, feet) {
  if (x < 116 || x > 326 || z < 10 || z > 29) return false;
  const h = game.courierFerry;
  if (!h) return false;
  return (
    h.platforms.some(
      (p) =>
        feet < p.y - (game.grounded ? 0.45 : 0.05) &&
        feet + 1.8 > p.bottom &&
        Math.abs(x - p.x) < p.w + 0.4 &&
        Math.abs(z - p.z) < p.d + 0.4,
    ) ||
    courierCarSolids(h).some(
      (p) =>
        feet < p.y + p.h &&
        feet + 1.8 > p.y &&
        Math.abs(x - p.x) < p.w + (p.padding ?? 0.35) &&
        Math.abs(z - p.z) < p.d + (p.padding ?? 0.35),
    ) ||
    h.solids.some(
      (p) =>
        feet < p.y + p.h &&
        feet + 1.8 > p.y &&
        Math.abs(x - p.x) < p.w + 0.4 &&
        Math.abs(z - p.z) < p.d + 0.4,
    )
  );
}
export function courierAnchor(h) {
  return { x: COURIER_STOPS[h.saved.dock], y: h.y, z: 21 };
}
export function courierSavePosition(game) {
  const h = game.courierFerry,
    p = game.player?.position;
  if (!h || !p || !courierCorridor(game.map, p.x, p.z)) return null;
  const support = courierDeckAt(game, p.x, p.z, p.y);
  if (
    game.grounded &&
    support &&
    !support.surface.courier &&
    Math.abs(support.height - p.y) < 0.25
  )
    return { x: p.x, y: p.y, z: p.z };
  if (
    game.grounded &&
    p.x < 119 &&
    Math.abs(p.y - game.groundHeight(p.x, p.z)) < 0.3
  )
    return null;
  return courierAnchor(h);
}
export function restoreCourierArrival(game) {
  const h = game.courierFerry,
    p = game.player?.position;
  if (!h || !p || !courierCorridor(game.map, p.x, p.z)) return;
  const height = game.progress.position?.height || 0;
  p.y = game.groundHeight(p.x, p.z) + height;
  const support = courierDeckAt(game, p.x, p.z, p.y);
  if (p.x < 119 && Math.abs(height) < 0.3 && game.canMove(p.x, p.z, height))
    return;
  if (
    support &&
    !support.surface.courier &&
    Math.abs(support.height - p.y) < 0.25 &&
    game.canMove(p.x, p.z, height)
  ) {
    game.jumpY = height;
    return;
  }
  const a = courierAnchor(h);
  p.set(a.x, a.y, a.z);
  game.jumpY = a.y - game.groundHeight(a.x, a.z);
  game.grounded = true;
  game.velocityY = 0;
}
