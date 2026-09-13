import { random } from "./campaign.js";

export const YARD_STYLES = Object.freeze({
  jungle: {
    name: "Waterkeeper's court",
    fixture: "channel",
    crown: "lotus",
    paving: 0xe1e5d6,
  },
  desert: {
    name: "Survey court",
    fixture: "bench",
    crown: "solar",
    paving: 0xf3e5ca,
  },
  snow: {
    name: "Pilgrim's rest",
    fixture: "bench",
    crown: "roof",
    paving: 0xcbd6da,
  },
  water: {
    name: "Tidal service court",
    fixture: "channel",
    crown: "shell",
    paving: 0xd5d4be,
  },
  volcano: {
    name: "Foundry workyard",
    fixture: "bin",
    crown: "iron",
    paving: 0xa6aaab,
  },
  sky: {
    name: "Windward terrace",
    fixture: "bench",
    crown: "wing",
    paving: 0xd6dbd2,
  },
  crystal: {
    name: "Harmonic archive",
    fixture: "register",
    crown: "prism",
    paving: 0xc5c9d2,
  },
  eclipse: {
    name: "Meridian memorial",
    fixture: "register",
    crown: "orbital",
    paving: 0xd1d1cc,
  },
});

// Keep the original route centerlines and a generous walking lane. The field
// courts are wider than their joining trails, so their corners can hold ruins
// while arrivals and departures retain their existing path through the court.
export function yardRouteClear(map, box, margin = 1.65) {
  const minX = box.x - box.w / 2 - margin,
    maxX = box.x + box.w / 2 + margin;
  const minZ = box.z - box.d / 2 - margin,
    maxZ = box.z + box.d / 2 + margin;
  for (const path of map.paths)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      if (
        Math.max(a.x, b.x) * 7 < minX ||
        Math.min(a.x, b.x) * 7 > maxX ||
        Math.max(a.z, b.z) * 7 < minZ ||
        Math.min(a.z, b.z) * 7 > maxZ
      )
        continue;
      // Campaign paths are axis aligned; the same slab test also handles the
      // cloud-city map's straight diagonal connections.
      let lo = 0,
        hi = 1;
      for (const [start, delta, min, max] of [
        [a.x * 7, (b.x - a.x) * 7, minX, maxX],
        [a.z * 7, (b.z - a.z) * 7, minZ, maxZ],
      ]) {
        if (Math.abs(delta) < 1e-9) {
          if (start < min || start > max) {
            lo = 2;
            break;
          }
        } else {
          const t0 = (min - start) / delta,
            t1 = (max - start) / delta;
          lo = Math.max(lo, Math.min(t0, t1));
          hi = Math.min(hi, Math.max(t0, t1));
        }
      }
      if (lo <= hi) return false;
    }
  return true;
}

export function yardTraversalClear(courses, box) {
  // A neighboring station can sit beside a descending cable or a rope span.
  // Reserve their complete ground projection, including the landing widths,
  // so even a low ruin cannot intersect a rider near the end of the descent.
  return yardRouteClear(
    {
      paths: courses.map((c) =>
        [c.entry, ...c.ledges, c.launch, c.exit].map((p) => ({
          x: p.x / 7,
          z: p.z / 7,
        })),
      ),
    },
    box,
    3.1,
  );
}

export function stationYardPlan(level, feature) {
  const rng = random(
    level.seed + feature.stage * 173 + feature.step * 61 + 4301,
  );
  const style = YARD_STYLES[level.biome],
    start = (feature.stage + feature.step) % 4;
  const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ],
    modules = [];
  for (let i = 0; i < 4; i++) {
    const [sx, sz] = corners[(start + i) % 4],
      x = sx * 10.5,
      z = sz * 10.5;
    const broken = (feature.stage + feature.step + i) % 3;
    modules.push({
      corner: [sx, sz],
      pieces: [
        {
          kind: "pier",
          x,
          z,
          w: 1.05,
          d: 1.05,
          h: broken === 2 ? 1.3 : 2.25 + rng() * 0.45,
        },
        {
          kind: "wall",
          x: x - sx * 2,
          z,
          w: 3.95,
          d: 0.72,
          h: broken === 0 ? 0.58 : 1.05,
        },
        {
          kind: "wall",
          x,
          z: z - sz * 2,
          w: 0.72,
          d: 3.95,
          h: broken === 1 ? 0.58 : 1.05,
        },
        {
          kind: style.fixture,
          x: x - sx * 2,
          z: z - sz * 2,
          w: 2.45,
          d: 1.1,
          h: style.fixture === "register" ? 1.15 : 0.62,
        },
      ],
    });
  }
  const paving = [];
  // Interrupted borders and offset courses give the working pad a worn floor,
  // leaving the surrounding terrain visible in missing and broken sections.
  for (let iz = -4; iz <= 4; iz++)
    for (let ix = -4; ix <= 4; ix++) {
      if (Math.abs(ix) < 3 && Math.abs(iz) < 3) continue;
      if (rng() < 0.22) continue;
      const border = Math.abs(ix) === 4 || Math.abs(iz) === 4;
      paving.push({
        x: ix * 1.35 + (iz % 2) * 0.06,
        z: iz * 1.35,
        w: 1.24 - rng() * 0.12,
        d: 1.2 - rng() * 0.13,
        accent: border && (ix + iz) % 2 === 0,
        chip: rng() * 0.22,
      });
    }
  return {
    style,
    modules,
    paving,
    target: 2 + ((feature.stage + feature.step) % 3 === 1 ? 1 : 0),
  };
}
