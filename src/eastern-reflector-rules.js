import { boxEntry } from "./camera-collision.js";

export const REFLECTOR_SITE = { x: 23, z: 18 };
export const REFLECTOR_LENGTH = 8;
export const REFLECTOR_HINGE = { y: 4.2, z: -4 };
export const REFLECTOR_CLOSED = Math.acos(-4.35 / REFLECTOR_LENGTH);
export const REFLECTOR_BACK = 0.2;
export const REFLECTOR_FIELDS = [
  { x: 7, z: 7, height: 0 },
  { x: 0, z: -7, height: 4.5 },
  { x: 0, z: -7, height: 0 },
];

export function addEasternReflector(map, level) {
  if (level.id !== "sands") return map;
  map.easternReflector = { ...REFLECTOR_SITE };
  for (const [step, p] of REFLECTOR_FIELDS.entries()) {
    const f = map.features.find((f) => f.id === `field-5-${step}`);
    Object.assign(f, {
      x: REFLECTOR_SITE.x + p.x / 7,
      z: REFLECTOR_SITE.z + p.z / 7,
      reflectorHeight: p.height,
    });
  }
  return map;
}

export function reflectorReleased(progress) {
  return (
    progress.stage > 5 ||
    ["field-5-0", "field-5-1"].every((id) => progress.field?.includes(id))
  );
}

export function normalizeEasternReflector(value, progress) {
  return {
    raised:
      progress.stage > 5 ||
      !!progress.field?.includes("field-5-2") ||
      (reflectorReleased(progress) && value?.raised === true),
  };
}

export function reflectorRampHeight(reflector, z) {
  const sine = Math.sin(REFLECTOR_CLOSED),
    cosine = Math.cos(REFLECTOR_CLOSED),
    startZ = reflector.z + REFLECTOR_HINGE.z - REFLECTOR_BACK * cosine,
    along = (z - startZ) / sine;
  if (along < 0 || along > REFLECTOR_LENGTH) return null;
  return (
    reflector.y + REFLECTOR_HINGE.y + REFLECTOR_BACK * sine + along * cosine
  );
}

export function reflectorDeckAt(game, x, z, maxY = Infinity) {
  const r = game.easternReflector;
  if (!r || Math.abs(x - r.x) > 13 || Math.abs(z - r.z) > 13) return null;
  let best = null;
  if (!r.saved.raised && !r.motion && Math.abs(x - r.x) < 4.3) {
    const height = reflectorRampHeight(r, z);
    if (height !== null && height <= maxY + 0.2)
      best = { height, surface: r.rampSurface };
  }
  for (const d of r.decks) {
    if (
      Math.abs(x - d.x) < d.w &&
      Math.abs(z - d.z) < d.d &&
      d.y <= maxY + 0.2 &&
      (!best || d.y > best.height)
    )
      best = { height: d.y, surface: d };
  }
  return best;
}

export function reflectorBlocked(game, x, z, y, clearance = 1.8) {
  const r = game.easternReflector;
  if (!r || Math.abs(x - r.x) > 13 || Math.abs(z - r.z) > 13) return false;
  if (
    r.motion &&
    Math.abs(x - r.x) < 4.8 &&
    z > r.z - 4.5 &&
    z < r.z + 4.6 &&
    y < r.y + 13
  )
    return true;
  if (!r.saved.raised && !r.motion && Math.abs(x - r.x) < 4.55) {
    const top = reflectorRampHeight(r, z);
    if (top !== null && y < top - 0.2 && y + clearance > top - 0.48)
      return true;
  }
  if (
    r.saved.raised &&
    Math.abs(x - r.x) < 4.8 &&
    Math.abs(z - r.z + 4) < 0.5 &&
    y < r.y + 12.3 &&
    y + clearance > r.y + 4.05
  )
    return true;
  return (
    r.solids.some(
      (s) =>
        Math.abs(x - s.x) < s.w + 0.2 &&
        Math.abs(z - s.z) < s.d + 0.2 &&
        y < s.top &&
        y + clearance > s.bottom,
    ) ||
    r.decks.some(
      (d) =>
        Math.abs(x - d.x) < d.w + 0.15 &&
        Math.abs(z - d.z) < d.d + 0.1 &&
        y < d.y - 0.2 &&
        y + clearance > d.y - d.thickness,
    )
  );
}

export function reflectorOccludes(game, from, to) {
  const r = game.easternReflector;
  if (!r) return false;
  const hits = (s, bottom, top) =>
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
  if (
    r.solids.some((s) => hits(s, s.bottom, s.top)) ||
    r.decks.some((d) => hits(d, d.y - d.thickness, d.y))
  )
    return true;
  const angle = (1 - r.open) * REFLECTOR_CLOSED,
    cosine = Math.cos(angle),
    sine = Math.sin(angle),
    local = (p) => {
      const dy = p.y - r.y - REFLECTOR_HINGE.y,
        dz = p.z - r.z - REFLECTOR_HINGE.z;
      return {
        x: p.x - r.x,
        y: dy * cosine + dz * sine,
        z: -dy * sine + dz * cosine,
      };
    };
  return (
    boxEntry(
      local(from),
      local(to),
      { min: { x: -4.55, y: 0, z: -0.25 }, max: { x: 4.55, y: 8, z: 0.25 } },
      0,
      true,
    ) !== null
  );
}
