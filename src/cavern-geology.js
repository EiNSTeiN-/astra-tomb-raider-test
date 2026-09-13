import { desertNoise as rockNoise } from "./desert-geology.js";
import { causewayFoundationDistance } from "./echo-causeway-rules.js";

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
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
const rectangleDistance = (x, z, left, right, near, far) =>
  Math.hypot(Math.max(left - x, 0, x - right), Math.max(near - z, 0, z - far));

// Carve only the enclosing banks. Walking-cell boundaries coincide with sample
// vertices, so the entire bilinear floor inside each open cell stays unchanged.
// Mineral beds, extended machinery and water have their own wider foundations.
export function refineCavernTerrain(profile, map, seed) {
  const { width, step } = profile,
    heights = profile.heights.slice(),
    exposure = new Float32Array(heights.length);
  const minerals = map.rooms.flatMap((r) =>
    [
      [14, -12],
      [-17, -11],
      [17, 13],
      [-17, 14],
      [0, 20],
      [21, 0],
      [-21, 0],
    ].map(([x, z]) => ({ x: r.x * 7 + x, z: r.z * 7 + z })),
  );
  const features = map.features.map((f) => ({
    x: f.x * 7,
    z: f.z * 7,
    r: f.kind === "climb" ? 16 : 5,
  }));
  for (let iz = 0; iz < width; iz++)
    for (let ix = 0; ix < width; ix++) {
      const x = ix * step,
        z = iz * step,
        index = iz * width + ix,
        distance = bankDistance(map, x, z);
      let mask = smooth(0.4, 3.5, distance);
      if (!mask) continue;
      if (map.echoCauseway)
        mask *= smooth(4, 9, causewayFoundationDistance(x, z));
      if (map.echoGallery)
        mask *= smooth(7, 12, rectangleDistance(x, z, 7, 42, 28, 84));
      for (const f of features)
        mask *= smooth(f.r, f.r + 4, Math.hypot(x - f.x, z - f.z));
      for (const m of minerals)
        mask *= smooth(6, 9, Math.hypot(x - m.x, z - m.z));
      for (const r of map.rooms)
        mask *= smooth(
          4,
          9,
          rectangleDistance(
            x,
            z,
            r.x * 7 - 12,
            r.x * 7 + 12,
            r.z * 7 + 9,
            r.z * 7 + 23,
          ),
        );
      for (const w of profile.waters)
        mask *= smooth(
          4,
          9,
          rectangleDistance(
            x,
            z,
            w.x - (w.bedWidth ?? w.width) / 2,
            w.x + (w.bedWidth ?? w.width) / 2,
            w.z - (w.bedLength ?? w.length) / 2,
            w.z + (w.bedLength ?? w.length) / 2,
          ),
        );
      exposure[index] = mask;
      if (!mask) continue;
      const oldRise =
        (1 - Math.exp(-distance * 0.72)) *
          (5.5 +
            Math.sin(x * 0.087 + z * 0.071) * 1.6 +
            Math.sin(x * 0.22 - z * 0.16) * 0.5) +
        Math.max(0, distance - 5) * 0.35;
      const broad = rockNoise(x * 0.036, z * 0.044, seed + 731),
        breakage = rockNoise(x * 0.14 + broad * 2, z * 0.12, seed + 917),
        toe = 1 - Math.exp(-Math.pow(distance / (2.8 + broad * 3.7), 1.4)),
        rise =
          toe * (5 + broad * 8.2 + (breakage - 0.5) * 2.2) +
          Math.max(0, distance - 10) * 0.2,
        base = heights[index] - oldRise,
        bed = (base + rise + x * 0.035 + z * 0.018) / 1.9,
        shelf =
          (Math.floor(bed) + smooth(0.2, 0.84, bed - Math.floor(bed))) * 1.9 -
          x * 0.035 -
          z * 0.018;
      heights[index] +=
        (shelf + (breakage - 0.5) * 0.65 * toe - heights[index]) * mask;
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
    cavern: {
      originalHeight: profile.height,
      exposure,
      rock: (x, z) => sample(exposure, x, z),
    },
  };
}
