import { boxEntry } from "./camera-collision.js";

export const CRANE_SITE = { x: 182, z: 217 };
export const CRANE_RADIUS = 14;
export const CRANE_DECK = 4.2;
export const CRANE_FIELDS = [
  { x: 182, z: 231, height: 0.6 },
  { x: 168, z: 214, height: CRANE_DECK },
  { x: 196, z: 217, height: CRANE_DECK },
];
export const craneRecovered = (p) =>
  p.stage > 6 || p.field?.includes("field-6-0") || craneSurveyed(p);
export const craneSurveyed = (p) =>
  p.stage > 6 ||
  p.field?.includes("field-6-1") ||
  p.field?.includes("field-6-2");
export const craneInstalled = (p) =>
  p.stage > 6 || p.field?.includes("field-6-2");

export function craneClearance(angle, height) {
  if (angle >= 0.44 && angle <= 0.66 && (height < 4.9 || height > 6))
    return "Inspection fork · keep the spindle base between 4.9 and 6.0 m";
  if (angle >= 0.9 && angle <= 1.12 && height < 8.4)
    return "Counterweight wall · raise the spindle base above 8.4 m";
  return null;
}
export function normalizeAstralCrane(value, progress) {
  const complete = craneInstalled(progress),
    recovered = craneRecovered(progress),
    surveyed = craneSurveyed(progress);
  let angle =
      recovered && Number.isFinite(value?.angle)
        ? Math.max(0, Math.min(Math.PI / 2, value.angle))
        : 0,
    height =
      recovered && Number.isFinite(value?.height)
        ? Math.max(0.6, Math.min(10.2, value.height))
        : 0.6;
  if (craneClearance(angle, height)) {
    angle = 0;
    height = 0.6;
  }
  const seated = !!(
    complete ||
    (surveyed &&
      value?.seated === true &&
      angle > Math.PI / 2 - 0.025 &&
      Math.abs(height - CRANE_DECK) < 0.12)
  );
  return {
    angle: seated ? Math.PI / 2 : angle,
    height: seated ? CRANE_DECK : height,
    seated,
  };
}
export function cranePayload(saved) {
  return {
    x: CRANE_SITE.x + Math.sin(saved.angle) * CRANE_RADIUS,
    z: CRANE_SITE.z + Math.cos(saved.angle) * CRANE_RADIUS,
    y: saved.height,
  };
}

// Geared drives brake when input is released. Substeps prevent a long frame
// from moving cargo through either clearance restriction.
export function stepAstralCrane(saved, dt, swing, lift) {
  if (saved.seated || !Number.isFinite(dt) || dt <= 0) return null;
  swing = Number.isFinite(swing) ? Math.max(-1, Math.min(1, swing)) : 0;
  lift = Number.isFinite(lift) ? Math.max(-1, Math.min(1, lift)) : 0;
  const count = Math.max(1, Math.ceil(Math.min(dt, 1) * 60)),
    step = Math.min(dt, 1) / count;
  let blocked = null;
  for (let i = 0; i < count; i++) {
    const height = Math.max(
      0.6,
      Math.min(10.2, saved.height + lift * step * 1.8),
    );
    const vertical = craneClearance(saved.angle, height);
    if (!vertical) saved.height = height;
    else if (lift) blocked = vertical;
    const angle = Math.max(
      0,
      Math.min(Math.PI / 2, saved.angle + swing * step * 0.16),
    );
    const lateral = craneClearance(angle, saved.height);
    if (!lateral) saved.angle = angle;
    else if (swing) blocked = lateral;
    if (
      lift < 0 &&
      saved.angle > Math.PI / 2 - 0.025 &&
      Math.abs(saved.height - CRANE_DECK) < 0.1
    ) {
      saved.angle = Math.PI / 2;
      saved.height = CRANE_DECK;
      saved.seated = true;
      break;
    }
  }
  return blocked;
}

export function addAstralCrane(map, level) {
  if (level.id !== "eclipse") return map;
  map.astralCrane = { x: 26, z: 31 };
  for (let z = 28; z <= 35; z++)
    for (let x = 23; x <= 29; x++) map.grid[z][x] = 1;
  const path = [];
  for (let z = 27; z <= 34; z++) {
    map.grid[z][26] = 1;
    path.push({ x: 26, z });
  }
  map.paths.push(path);
  for (const [step, p] of CRANE_FIELDS.entries())
    Object.assign(
      map.features.find((f) => f.id === `field-6-${step}`),
      {
        x: p.x / 7,
        z: p.z / 7,
        craneHeight: p.height,
      },
    );
  return map;
}
export function craneFoundationDistance(x, z) {
  return Math.hypot(
    Math.max(161 - x, 0, x - 203),
    Math.max(195 - z, 0, z - 239),
  );
}
export function craneFoundationWeight(x, z) {
  const t = Math.max(0, Math.min(1, craneFoundationDistance(x, z) / 4));
  return 1 - t * t * (3 - 2 * t);
}
export function craneDeckAt(game, x, z, maxY = Infinity) {
  let best = null;
  for (const d of game.astralCrane?.decks || [])
    if (
      Math.abs(x - d.x) < d.w &&
      Math.abs(z - d.z) < d.d &&
      d.y <= maxY + 0.22 &&
      (!best || d.y > best.height)
    )
      best = { height: d.y, surface: d };
  return best;
}
const local = (s, p) => {
  const x = p.x - s.x,
    z = p.z - s.z,
    c = Math.cos(s.angle || 0),
    t = Math.sin(s.angle || 0);
  return { x: x * c - z * t, y: p.y, z: x * t + z * c };
};
function craneSolids(game) {
  const h = game.astralCrane;
  if (!h) return [];
  const payload = cranePayload(h.saved);
  return [
    ...h.solids,
    ...h.decks.map((d) => ({ ...d, bottom: d.y - d.thickness, top: d.y })),
    ...(craneRecovered(game.progress)
      ? [
          {
            x: payload.x,
            z: payload.z,
            w: 0.65,
            d: 0.65,
            bottom: h.base + payload.y,
            top: h.base + payload.y + 1.65,
          },
        ]
      : []),
  ];
}
export function craneBlocked(game, x, z, y, clearance = 1.8) {
  const h = game.astralCrane;
  if (!h || Math.abs(x - CRANE_SITE.x) > 24 || Math.abs(z - CRANE_SITE.z) > 25)
    return false;
  return craneSolids(game).some((s) => {
    const p = local(s, { x, y, z });
    return (
      Math.abs(p.x) < s.w + 0.15 &&
      Math.abs(p.z) < s.d + 0.15 &&
      y < s.top - 0.22 &&
      y + clearance > s.bottom
    );
  });
}
export function craneOccludes(game, from, to) {
  return craneSolids(game).some(
    (s) =>
      boxEntry(
        local(s, from),
        local(s, to),
        {
          min: { x: -s.w, y: s.bottom, z: -s.d },
          max: { x: s.w, y: s.top, z: s.d },
        },
        0,
        true,
      ) !== null,
  );
}
