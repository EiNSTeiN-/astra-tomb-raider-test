// Shore planting follows the delivered terrain triangles. The movement sampler
// blends all four corners and can sit well below a raised diagonal on a saddle.
export function coastalShoreHeight(profile, x, z) {
  const step = profile.step;
  if (!step) return profile.height(x, z);
  const left = Math.floor(x / step) * step,
    top = Math.floor(z / step) * step,
    tx = (x - left) / step,
    tz = (z - top) / step,
    a = profile.height(left, top),
    b = profile.height(left, top + step),
    c = profile.height(left + step, top + step),
    d = profile.height(left + step, top);
  return tx + tz <= 1
    ? a + (d - a) * tx + (b - a) * tz
    : c + (b - c) * (1 - tx) + (d - c) * (1 - tz);
}

// Exact distance to the union of seven-metre walking-cell footprints near the
// shore. Three neighbours per axis cover every point within five metres.
export function coastalShoreDistance(map, x, z) {
  const gx = Math.round(x / 7),
    gz = Math.round(z / 7);
  let distance = Infinity;
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++)
      if (map.grid[gz + dz]?.[gx + dx])
        distance = Math.min(
          distance,
          Math.hypot(
            Math.max(0, Math.abs(x - (gx + dx) * 7) - 3.5),
            Math.max(0, Math.abs(z - (gz + dz) * 7) - 3.5),
          ),
        );
  return distance;
}

export function coastalShoreShrubAllowed(map, profile, x, z, radius) {
  const distance = coastalShoreDistance(map, x, z);
  if (distance < radius + 0.2 || distance > 5) return false;
  let low = Infinity,
    high = -Infinity;
  for (const [dx, dz] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [Math.SQRT1_2, Math.SQRT1_2],
    [-Math.SQRT1_2, Math.SQRT1_2],
    [Math.SQRT1_2, -Math.SQRT1_2],
    [-Math.SQRT1_2, -Math.SQRT1_2],
  ]) {
    const height = coastalShoreHeight(
      profile,
      x + dx * radius,
      z + dz * radius,
    );
    if (!Number.isFinite(height) || height < -1.4) return false;
    low = Math.min(low, height);
    high = Math.max(high, height);
  }
  return high - low <= radius * 2 * 0.55;
}
