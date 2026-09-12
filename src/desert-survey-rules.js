import { boxEntry } from "./camera-collision.js";

// Instruments and sighted monuments are deliberately separated from the three
// door seals. Their ground bearings cross at the search court, not its answer.
export const SURVEY_LOOKOUTS = [
  { x: 385, z: 252, height: 4, target: 0, label: "THE SPLIT CROWN" },
  { x: 322, z: 238, height: 4, target: 1, label: "THE PIERCED SUN" },
];
export const SURVEY_COURT = { x: 300, z: 280 };
export const SURVEY_MONUMENTS = [
  { x: 215, z: 308, height: 12, sign: "crown", name: "Split crown" },
  { x: 278, z: 322, height: 12, sign: "sun", name: "Pierced sun" },
  { x: 249, z: 312, height: 10, sign: "wing", name: "Folded wing" },
];
export const SURVEY_DOORS = [
  { x: 289, z: 280, signs: ["crown", "wing"] },
  { x: 300, z: 280, signs: ["wing", "sun"] },
  { x: 311, z: 280, signs: ["crown", "sun"] },
];
export const SURVEY_FOUNDATIONS = [
  ...SURVEY_LOOKOUTS.map((p) => ({ ...p, w: 6, d: 15 })),
  { ...SURVEY_COURT, w: 18, d: 10 },
];
export function surveyDone(progress, step) {
  return progress.stage > 0 || !!progress.field?.includes(`field-0-${step}`);
}
export function normalizeDesertSurvey(value, progress) {
  return {
    angles: SURVEY_LOOKOUTS.map((_, i) => {
      const p = value?.angles?.[i];
      return Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)
        ? [
            Math.atan2(Math.sin(p[0]), Math.cos(p[0])),
            Math.max(-0.12, Math.min(0.65, p[1])),
          ]
        : null;
    }),
    // Only the ordered field actions prove that a bearing was recorded.
    recorded: SURVEY_LOOKOUTS.map((_, i) => surveyDone(progress, i)),
  };
}
export function surveyFoundationDistance(x, z) {
  return Math.min(
    ...SURVEY_FOUNDATIONS.map((p) =>
      Math.hypot(
        Math.max(0, Math.abs(x - p.x) - p.w),
        Math.max(0, Math.abs(z - p.z) - p.d),
      ),
    ),
  );
}
export function surveyFoundationAt(x, z) {
  for (const p of SURVEY_FOUNDATIONS) {
    const distance = Math.hypot(
      Math.max(0, Math.abs(x - p.x) - p.w),
      Math.max(0, Math.abs(z - p.z) - p.d),
    );
    if (distance < 3) {
      const t = distance / 3;
      return { ...p, weight: 1 - t * t * (3 - 2 * t) };
    }
  }
  return null;
}
export function addDesertSurvey(map, level) {
  if (level.id !== "sands") return map;
  map.desertSurvey = true;
  for (const p of SURVEY_FOUNDATIONS)
    for (
      let z = Math.floor((p.z - p.d) / 7);
      z <= Math.ceil((p.z + p.d) / 7);
      z++
    )
      for (
        let x = Math.floor((p.x - p.w) / 7);
        x <= Math.ceil((p.x + p.w) / 7);
        x++
      )
        map.grid[z][x] = 1;
  // Follow the existing eastern approach, then open a walk through the inner
  // dunes. Neither passage crosses the sanctuary wall or neighboring objectives.
  for (const [a, b] of [
    [
      { x: 371, z: 224 },
      { x: 385, z: 264 },
    ],
    [
      { x: 385, z: 264 },
      { x: 343, z: 259 },
    ],
    [
      { x: 343, z: 259 },
      { x: 322, z: 251 },
    ],
    [
      { x: 322, z: 251 },
      { x: 317, z: 291 },
    ],
    [
      { x: 317, z: 291 },
      { x: 343, z: 294 },
    ],
  ]) {
    const path = [],
      length = Math.hypot(b.x - a.x, b.z - a.z),
      steps = Math.ceil(length / 3);
    for (let i = 0; i <= steps; i++) {
      const x = Math.round((a.x + ((b.x - a.x) * i) / steps) / 7),
        z = Math.round((a.z + ((b.z - a.z) * i) / steps) / 7);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) map.grid[z + dz][x + dx] = 1;
      if (!path.some((p) => p.x === x && p.z === z)) path.push({ x, z });
    }
    map.paths.push(path);
  }
  for (const [i, p] of [
    ...SURVEY_LOOKOUTS,
    { ...SURVEY_COURT, height: 0 },
  ].entries())
    Object.assign(
      map.features.find((f) => f.id === `field-0-${i}`),
      { x: p.x / 7, z: p.z / 7, surveyHeight: p.height },
    );
  return map;
}
export function surveyDeckAt(game, x, z, maxY = Infinity) {
  let result = null;
  for (const d of game.desertSurvey?.decks || [])
    if (
      Math.abs(x - d.x) < d.w &&
      Math.abs(z - d.z) < d.d &&
      d.y <= maxY + 0.205 &&
      (!result || d.y > result.height)
    )
      result = { height: d.y, surface: d };
  return result;
}
export function surveyBlocked(game, x, z, y, clearance = 1.8) {
  return !!game.desertSurvey?.solids.some(
    (s) =>
      s.enabled !== false &&
      Math.abs(x - s.x) < s.w + 0.18 &&
      Math.abs(z - s.z) < s.d + 0.18 &&
      y < s.top - (s.step ? 0.205 : 0.035) &&
      y + clearance > s.bottom + 0.035,
  );
}
export function surveyOccludes(game, from, to) {
  return !!game.desertSurvey?.solids.some((s) => {
    if (s.enabled === false) return false;
    const hit = boxEntry(from, to, {
      min: { x: s.x - s.w, y: s.bottom, z: s.z - s.d },
      max: { x: s.x + s.w, y: s.top, z: s.z + s.d },
    });
    return hit !== null && hit < 1;
  });
}
export function surveyBearing(origin, target) {
  const dx = target.x - origin.x,
    dz = target.z - origin.z;
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: -Math.atan2(target.y - origin.y, Math.hypot(dx, dz)),
  };
}
export function surveyAngularError(yaw, pitch, origin, target) {
  const b = surveyBearing(origin, target),
    dyaw = Math.atan2(Math.sin(yaw - b.yaw), Math.cos(yaw - b.yaw));
  return Math.hypot(dyaw * Math.cos(pitch), pitch - b.pitch);
}
export function surveyDoorMatches(index) {
  const signs = SURVEY_DOORS[index]?.signs;
  return (
    !!signs &&
    signs[0] === SURVEY_MONUMENTS[0].sign &&
    signs[1] === SURVEY_MONUMENTS[1].sign
  );
}
export function surveyRayCrossing(a, b) {
  const p = SURVEY_LOOKOUTS[0],
    q = SURVEY_LOOKOUTS[1],
    u = { x: -Math.sin(a), z: -Math.cos(a) },
    v = { x: -Math.sin(b), z: -Math.cos(b) },
    determinant = u.x * v.z - u.z * v.x;
  if (Math.abs(determinant) < 1e-6) return null;
  const t = ((q.x - p.x) * v.z - (q.z - p.z) * v.x) / determinant;
  const s = ((q.x - p.x) * u.z - (q.z - p.z) * u.x) / determinant;
  return t >= 0 && s >= 0 ? { x: p.x + t * u.x, z: p.z + t * u.z } : null;
}
export function surveyReservedDistance(x, z) {
  return Math.min(
    surveyFoundationDistance(x, z),
    ...SURVEY_MONUMENTS.map((p) => Math.hypot(x - p.x, z - p.z) - 3),
  );
}
export function surveyVisible(game, origin, target) {
  // Optical rays can cross inaccessible dunes. Ordinary walking/guardian LOS
  // rejects those cells, which is inappropriate for a long-distance instrument.
  if (surveyOccludes(game, origin, target)) return false;
  const length = Math.hypot(
    target.x - origin.x,
    target.y - origin.y,
    target.z - origin.z,
  );
  for (let i = 1; i < Math.ceil(length); i++) {
    const t = i / Math.ceil(length),
      x = origin.x + (target.x - origin.x) * t,
      z = origin.z + (target.z - origin.z) * t,
      y = origin.y + (target.y - origin.y) * t;
    if (y < game.groundHeight(x, z) + 0.1) return false;
  }
  // Stop short of the monument's own carved head.
  const t = Math.max(0, 1 - 3 / length),
    end = {
      x: origin.x + (target.x - origin.x) * t,
      y: origin.y + (target.y - origin.y) * t,
      z: origin.z + (target.z - origin.z) * t,
    };
  return (
    !game.cameraSurfaces || game.cameraSurfaces.entry(origin, end, 0) > 0.999
  );
}
export function surveyCeiling(game, x, z, before, next) {
  if (next <= before) return next;
  for (const s of game.desertSurvey?.solids || [])
    if (
      s.enabled !== false &&
      Math.abs(x - s.x) < s.w + 0.18 &&
      Math.abs(z - s.z) < s.d + 0.18 &&
      before + 1.8 <= s.bottom + 0.05 &&
      next + 1.8 > s.bottom
    )
      next = Math.min(next, s.bottom - 1.8);
  return next;
}
function surveySafeLanding(game) {
  const p = game.player.position;
  const i =
    Math.hypot(p.x - 385, p.z - 252) < Math.hypot(p.x - 322, p.z - 238) ? 0 : 1;
  const a = SURVEY_LOOKOUTS[i];
  return {
    x: a.x,
    z: a.z + 2.8,
    y: game.terrainProfile.surveyBases[i] + a.height,
  };
}
export function surveySavePosition(game) {
  if (
    !game.desertSurvey ||
    !game.player ||
    surveyFoundationDistance(game.player.position.x, game.player.position.z) >
      2 ||
    game.grounded
  )
    return null;
  return surveySafeLanding(game);
}
export function restoreSurveyArrival(game) {
  const p = game.player.position;
  if (!game.desertSurvey || surveyFoundationDistance(p.x, p.z) > 2) return;
  const deck = surveyDeckAt(game, p.x, p.z, p.y),
    ground = game.groundHeight(p.x, p.z);
  if (
    (Math.abs(p.y - ground) < 0.25 ||
      (deck && Math.abs(p.y - deck.height) < 0.25)) &&
    !surveyBlocked(game, p.x, p.z, p.y)
  )
    return;
  const a = surveySafeLanding(game);
  p.set(a.x, a.y, a.z);
  game.jumpY = p.y - game.groundHeight(p.x, p.z);
  game.grounded = true;
  game.swimming = game.diving = false;
  game.velocityY = 0;
  game.airVelocity = null;
  game.fallPeak = p.y;
}
