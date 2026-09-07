import { spanCoordinates } from "./sky-bridge-rules.js";

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hash(x, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function skyRockNoise(x, z, seed = 0) {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const u = smooth(0, 1, x - ix),
    v = smooth(0, 1, z - iz);
  const a = hash(ix, iz, seed),
    b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed),
    d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

// Scattered plants and rocks need a supported footprint on the upper banks.
export function skyGroundSupported(profile, x, z, rock = false) {
  if (profile.trail?.(x, z) > (rock ? 0.1 : 0.5)) return false;
  for (const bridge of profile.bridges || []) {
    const p = spanCoordinates(bridge, x, z);
    if (p.along > -5 && p.along < p.length + 5 && Math.abs(p.across) < 5)
      return false;
  }
  if (profile.geology.depth(x, z) > (rock ? 8 : 3.5)) return false;
  const y = profile.height(x, z),
    radius = rock ? 1.2 : 0.8;
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [0.7, 0.7],
    [-0.7, 0.7],
    [0.7, -0.7],
    [-0.7, -0.7],
  ])
    if (
      Math.abs(profile.height(x + dx * radius, z + dz * radius) - y) >
      (rock ? 1.6 : 0.5)
    )
      return false;
  return true;
}

// Erosion starts below the original walking surface. It cannot raise a new
// ridge through a bank, reservoir or bridge landing, and is deterministic.
export function skyErosion(x, z, height, depth, seed = 0) {
  const exposed = smooth(4, 14, depth);
  if (!exposed) return 0;
  const broad = skyRockNoise(x * 0.041, z * 0.041, seed);
  const cross = x * 0.19 + z * 0.067 + broad * 2.7;
  const along = z * 0.17 - x * 0.055;
  const ribs = Math.pow(
    1 - Math.abs(skyRockNoise(cross, along, seed + 29) * 2 - 1),
    2,
  );
  const shelves = Math.tanh(
    Math.sin(height * 0.58 + x * 0.025 - z * 0.019 + broad * 2) * 2.8,
  );
  const chips = skyRockNoise(x * 0.55, z * 0.55, seed + 71) - 0.5;
  return (
    exposed * ((ribs - 1) * 3.2 + (shelves - 1) * 0.9 + (chips - 0.5) * 0.6)
  );
}

function sample(data, width, step, x, z) {
  const fx = Math.max(0, Math.min(width - 1.001, x / step));
  const fz = Math.max(0, Math.min(width - 1.001, z / step));
  const ix = Math.floor(fx),
    iz = Math.floor(fz),
    u = fx - ix,
    v = fz - iz;
  const a = data[iz * width + ix],
    b = data[iz * width + ix + 1];
  const c = data[(iz + 1) * width + ix],
    d = data[(iz + 1) * width + ix + 1];
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export function refineSkyTerrain(profile, referenceHeight, seed) {
  const width = (profile.width - 1) * 2 + 1,
    step = profile.step / 2;
  const heights = new Float32Array(width * width),
    courts = new Float32Array(width * width),
    offsets = new Float32Array(width * width);
  const originalHeight = profile.height;
  for (let iz = 0; iz < width; iz++)
    for (let ix = 0; ix < width; ix++) {
      const x = ix * step,
        z = iz * step;
      const base = originalHeight(x, z),
        depth = Math.max(0, referenceHeight(x, z) - base);
      offsets[iz * width + ix] = skyErosion(x, z, base, depth, seed);
      courts[iz * width + ix] = profile.court(x, z);
    }
  // Sample only the displacement so uncut foundations keep their exact height.
  // The second mask also prevents interpolation from eroding a protected bank.
  const height = (x, z) => {
    const base = originalHeight(x, z),
      exposed = smooth(4, 7, referenceHeight(x, z) - base);
    return base + sample(offsets, width, step, x, z) * exposed;
  };
  for (let iz = 0; iz < width; iz++)
    for (let ix = 0; ix < width; ix++)
      heights[iz * width + ix] = height(ix * step, iz * step);
  return {
    ...profile,
    width,
    step,
    heights,
    courts,
    height,
    court: (x, z) => sample(courts, width, step, x, z),
    geology: {
      originalHeight,
      referenceHeight,
      depth: (x, z) => Math.max(0, referenceHeight(x, z) - height(x, z)),
    },
  };
}
