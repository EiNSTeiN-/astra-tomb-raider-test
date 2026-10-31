import { desertNoise as noise } from "./desert-geology.js";

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The valley ends at a wooded escarpment, beyond the existing courts and paths.
// Keep a complete terrain-cell collar around their footprints unchanged. The
// raised outer edge continues into the existing distant forest-floor meshes.
export function createJungleRim(map, seed) {
  const extent = map.size * 7;
  const walkingDistance = (x, z) => {
    let distance = 36;
    const gx = Math.round(x / 7),
      gz = Math.round(z / 7);
    for (let dz = -4; dz <= 4; dz++)
      for (let dx = -4; dx <= 4; dx++) {
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
  };
  return {
    rise(x, z) {
      const edges = [x, z, extent - x, extent - z],
        nearest = Math.min(...edges);
      if (nearest >= 28) return 0;
      // A soft minimum rounds the valley corners. Broad noise moves the toe
      // inward and outward, avoiding four straight retaining-wall silhouettes.
      const distance = Math.max(
          0,
          -4 * Math.log(edges.reduce((sum, d) => sum + Math.exp(-d / 4), 0)),
        ),
        depth = 12 + noise(x * 0.029, z * 0.027, seed + 773) * 10,
        height = 22 + noise(x * 0.021, z * 0.019, seed + 1091) * 12,
        face = 1 - smooth(depth - 4.5, depth, distance);
      if (!face) return 0;
      return height * face * smooth(1.75, 3.5, walkingDistance(x, z));
    },
  };
}
