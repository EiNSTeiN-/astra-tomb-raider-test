import { desertNoise as noise } from "./desert-geology.js";

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The valley ends at a wooded escarpment, beyond the existing courts and paths.
// Keep the authored walking surface, water margins and wooded banks. Grade
// the final boundary cell into a lower edge and carry its height outside.
export function createJungleRim(map, seed, waters = [], trees = []) {
  const extent = map.size * 7;
  const rimTrees = trees.filter(
    (t) => Math.min(t.x, t.z, extent - t.x, extent - t.z) < 36,
  );
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
    // Where a shipped path approaches the last grid row, the old rim rose
    // its full height in one cell. Grade that edge and carry the larger beds
    // into the outer forest floor, which shares this exact boundary.
    outerRise(x, z, distance) {
      if (distance <= 0) return 0;
      const cx = Math.max(0, Math.min(extent, x)),
        cz = Math.max(0, Math.min(extent, z)),
        strength = 1 - smooth(3.5, 12, walkingDistance(cx, cz)),
        t = Math.max(0, Math.min(1, distance / 48)),
        joint =
          1 - smooth(0.08, 0.32, Math.abs(Math.sin(
            (x + z) * 0.19 + noise(x * 0.037, z * 0.043, seed + 2617) * 4.2,
          ))),
        beds =
          0.26 * smooth(0, 0.25, t) +
          0.34 * smooth(0.3, 0.62, t) +
          0.4 * smooth(0.7, 1, t),
        channel = joint * Math.sin(t * Math.PI) ** 2 * 0.16,
        height = 22 + noise(x * 0.021, z * 0.019, seed + 1091) * 12;
      return height * Math.max(0, beds - channel) * strength;
    },
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
      const crest = 3 + noise(x * 0.067, z * 0.059, seed + 1427) * 2,
        toe = Math.min(26, depth + 7),
        t = Math.max(0, Math.min(1, (toe - distance) / (toe - crest))),
        // Three unequal beds make broad ledges between eroded risers. Their
        // warped toe follows the valley rather than forming a straight wall.
        beds =
          0.28 * smooth(0, 0.35, t) +
          0.3 * smooth(0.4, 0.68, t) +
          0.42 * smooth(0.72, 1, t),
        gully =
          Math.pow(noise(x * 0.12, z * 0.12, seed + 1843), 3) *
          Math.sin(t * Math.PI) ** 2 *
          0.18;
      const clearance = walkingDistance(x, z);
      const target = Math.max(0, beds - gully),
        edgeRemnant = 0.13 + noise(x * 0.091, z * 0.083, seed + 2417) * 0.09;
      // Added soil approaches need a wide path collar. Erosion can lower an
      // existing wall without making a new steep rise beside that collar.
      let free =
        (1 - smooth(24.5, 28, nearest)) *
        (target > face ? smooth(3.5, 12, clearance) : 1);
      for (const water of waters) {
        const distance = Math.max(
          0,
          Math.abs(x - water.x) - (water.bedWidth ?? water.width) / 2,
          Math.abs(z - water.z) - (water.bedLength ?? water.length) / 2,
        );
        free = Math.min(free, smooth(3.5, 8, distance));
      }
      // Keep soil caps beneath the seeded tree groups. Erosion between those
      // caps leaves wooded buttresses rather than stripping the valley rim.
      for (const tree of rimTrees)
        free = Math.min(
          free,
          smooth(6, 10, Math.hypot(x - tree.x, z - tree.z)),
        );
      return (
        height * (face + (target - face) * free) * smooth(1.75, 3.5, clearance) *
        (1 - (1 - edgeRemnant) * (1 - smooth(0, 3.5, nearest)) *
          (1 - smooth(3.5, 12, clearance)))
      );
    },
  };
}
