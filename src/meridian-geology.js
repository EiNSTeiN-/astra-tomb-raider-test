import { desertNoise as rockNoise } from "./desert-geology.js";
import { craneFoundationDistance } from "./astral-crane-rules.js";

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Match the enclosing bank calculation in createTerrainProfile, including its
// search radius and cap. The grid's closed cell boundaries are sample vertices.
function bankDistance(map, x, z) {
  const gx = Math.round(x / 7),
    gz = Math.round(z / 7);
  let distance = 36;
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
}

// Change only vertices strictly outside every walkable cell. Since 3.5m cell
// boundaries align with the 1.75m samples, all bilinear walking heights retain
// their original values, including cell edges. Mechanical courts and water
// margins receive wider protection for structures that extend beyond the grid.
export function refineMeridianTerrain(profile, map, seed) {
  const { width, step } = profile,
    heights = profile.heights.slice(),
    exposure = new Float32Array(heights.length),
    observatories = map.rooms.map((room) => ({
      x: room.x * 7,
      z: room.z * 7 - 17,
      radius: 9.6 + (room.index % 3) * 0.3,
    }));
  for (let iz = 0; iz < width; iz++)
    for (let ix = 0; ix < width; ix++) {
      const x = ix * step,
        z = iz * step,
        index = iz * width + ix;
      const distance = bankDistance(map, x, z);
      let mask = smooth(0.7, 3.5, distance);
      if (map.astralCrane) mask *= smooth(4, 8, craneFoundationDistance(x, z));
      if (map.orbitVault)
        mask *= smooth(
          32,
          38,
          Math.hypot(x - map.orbitVault.x * 7, z - map.orbitVault.z * 7),
        );
      // The domes sample their perimeter and square column footings outside
      // room centers. Include a full interpolation cell beyond those footings.
      for (const dome of observatories)
        mask *= smooth(
          dome.radius + 4.5,
          dome.radius + 9,
          Math.hypot(x - dome.x, z - dome.z),
        );
      for (const water of profile.waters) {
        const d = Math.hypot(
          Math.max(
            0,
            Math.abs(x - water.x) - (water.bedWidth ?? water.width) / 2,
          ),
          Math.max(
            0,
            Math.abs(z - water.z) - (water.bedLength ?? water.length) / 2,
          ),
        );
        mask *= smooth(4, 10, d);
      }
      exposure[index] = mask;
      if (!mask) continue;
      const oldRise =
        (1 - Math.exp(-distance * 0.72)) *
          (5.5 +
            Math.sin(x * 0.087 + z * 0.071) * 1.6 +
            Math.sin(x * 0.22 - z * 0.16) * 0.5) +
        Math.max(0, distance - 5) * 0.35;
      const broad = rockNoise(x * 0.037, z * 0.052, seed + 41);
      const fracture = rockNoise(x * 0.19 + broad * 2, z * 0.11, seed + 97);
      const toe = 1 - Math.exp(-Math.pow(distance / (2.9 + broad * 2.8), 1.35));
      const rise =
        toe * (5.2 + broad * 9.4 + (fracture - 0.5) * 3.4) +
        Math.max(0, distance - 11) * 0.22;
      const base = heights[index] - oldRise;
      const tilted = (base + rise + x * 0.028 - z * 0.017) / 2.35;
      const shelf =
        (Math.floor(tilted) + smooth(0.24, 0.8, tilted - Math.floor(tilted))) *
          2.35 -
        x * 0.028 +
        z * 0.017;
      const target = shelf + (fracture - 0.5) * 0.85 * toe;
      heights[index] += (target - heights[index]) * mask;
    }
  const sample = (data, x, z) => {
    const fx = Math.max(0, Math.min(width - 1.001, x / step)),
      fz = Math.max(0, Math.min(width - 1.001, z / step)),
      ix = Math.floor(fx),
      iz = Math.floor(fz),
      tx = fx - ix,
      tz = fz - iz;
    return (
      (data[iz * width + ix] * (1 - tx) + data[iz * width + ix + 1] * tx) *
        (1 - tz) +
      (data[(iz + 1) * width + ix] * (1 - tx) +
        data[(iz + 1) * width + ix + 1] * tx) *
        tz
    );
  };
  return {
    ...profile,
    heights,
    height: (x, z) => sample(heights, x, z),
    meridian: {
      originalHeight: profile.height,
      exposure,
      rock: (x, z) => sample(exposure, x, z),
    },
  };
}
