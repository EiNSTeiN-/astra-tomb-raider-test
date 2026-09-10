const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function desertNoise(x, z, seed = 0) {
  const hash = (x, z) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const ix = Math.floor(x),
    iz = Math.floor(z),
    u = smooth(0, 1, x - ix),
    v = smooth(0, 1, z - iz);
  return (
    (hash(ix, iz) * (1 - u) + hash(ix + 1, iz) * u) * (1 - v) +
    (hash(ix, iz + 1) * (1 - u) + hash(ix + 1, iz + 1) * u) * v
  );
}
// Broad wind-shaped shoulders replace the generic, nearly vertical grid banks.
// The route distance vanishes on every walking-cell edge, so its floor remains
// unchanged. Domain warping varies both crest height and the width of the rise.
export function desertBankRise(x, z, distance, seed) {
  const warp = (desertNoise(x * 0.017, z * 0.017, seed + 119) - 0.5) * 22,
    along = x * 0.83 + z * 0.56 + warp,
    across = z * 0.83 - x * 0.56,
    crest = desertNoise(along * 0.028, across * 0.047, seed + 307),
    shoulder = desertNoise(along * 0.018, across * 0.035, seed + 503),
    // A rounded toe eases out of the route floor. A linear exponent made the
    // first off-route sample do most of the climb, leaving a straight cliff
    // even after the higher crest was smoothed.
    rise = 1 - Math.exp(-Math.pow(distance / (10 + shoulder * 9), 1.6));
  return rise * (5 + crest * 11) + Math.max(0, distance - 12) * 0.15;
}
export function desertRouteDistance(map, x, z) {
  const gx = Math.round(x / 7),
    gz = Math.round(z / 7);
  let distance = 35;
  for (let dz = -5; dz <= 5; dz++)
    for (let dx = -5; dx <= 5; dx++) {
      if (!map.grid[gz + dz]?.[gx + dx]) continue;
      distance = Math.min(
        distance,
        Math.hypot(
          Math.max(0, Math.abs(x - (gx + dx) * 7) - 3.5),
          Math.max(0, Math.abs(z - (gz + dz) * 7) - 3.5),
        ),
      );
    }
  return distance;
}
function sample(data, width, step, x, z) {
  const fx = Math.max(0, Math.min(width - 1.001, x / step)),
    fz = Math.max(0, Math.min(width - 1.001, z / step));
  const ix = Math.floor(fx),
    iz = Math.floor(fz),
    u = fx - ix,
    v = fz - iz;
  return (
    (data[iz * width + ix] * (1 - u) + data[iz * width + ix + 1] * u) *
      (1 - v) +
    (data[(iz + 1) * width + ix] * (1 - u) +
      data[(iz + 1) * width + ix + 1] * u) *
      v
  );
}
export function refineDesertTerrain(profile, map, seed) {
  const { width, step } = profile,
    heights = profile.heights.slice(),
    exposure = new Float32Array(width * width);
  for (let iz = 0; iz < width; iz++)
    for (let ix = 0; ix < width; ix++) {
      const x = ix * step,
        z = iz * step,
        index = iz * width + ix,
        distance = desertRouteDistance(map, x, z);
      // More than one complete sample cell beyond every walkable boundary stays
      // untouched, so bilinear interpolation cannot alter a path or foundation.
      let mask = smooth(2 * step, 9, distance);
      for (const water of profile.waters) {
        const r = Math.hypot(water.width, water.length) / 2;
        mask *= smooth(r + 5, r + 12, Math.hypot(x - water.x, z - water.z));
      }
      if (!mask) continue;
      const broad = desertNoise(x * 0.036, z * 0.036, seed),
        ribs = desertNoise(x * 0.2 + z * 0.035, z * 0.095, seed + 61);
      const bed = Math.tanh(
        Math.sin(heights[index] * 1.25 + x * 0.023 - z * 0.017) * 2.4,
      );
      const erosion = (broad - 0.5) * 5 + (ribs - 0.6) * 3.6 + bed * 0.4;
      heights[index] += mask * erosion;
      exposure[index] = mask;
    }
  // Relax the high shoulders after erosion. Adjacent grid corridors otherwise
  // meet in sharp, stair-stepped crests. Separate source/destination samples
  // make each pass independent of iteration direction; the protected margin
  // and water mask also apply to this smoothing.
  for (let pass = 0; pass < 3; pass++) {
    const previous = heights.slice();
    for (let iz = 1; iz < width - 1; iz++)
      for (let ix = 1; ix < width - 1; ix++) {
        const index = iz * width + ix,
          blend = exposure[index] * 0.85;
        if (!blend) continue;
        let sum = 0;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++)
            sum +=
              previous[index + dz * width + dx] *
              (dx === 0 ? 2 : 1) *
              (dz === 0 ? 2 : 1);
        heights[index] += (sum / 16 - previous[index]) * blend;
      }
  }
  return {
    ...profile,
    heights,
    height: (x, z) => sample(heights, width, step, x, z),
    desert: {
      originalHeight: profile.height,
      exposure,
      rock: (x, z) => sample(exposure, width, step, x, z),
    },
  };
}
