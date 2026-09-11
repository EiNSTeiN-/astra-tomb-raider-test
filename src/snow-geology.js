import {
  desertNoise as rockNoise,
  desertRouteDistance,
} from "./desert-geology.js";
import { monasteryPlan } from "./monastery-architecture.js";
import { shutterFoundationDistance } from "./shutter-house-rules.js";

const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const rectangleDistance = (x, z, cx, cz, w, d) =>
  Math.hypot(
    Math.max(0, Math.abs(x - cx) - w),
    Math.max(0, Math.abs(z - cz) - d),
  );

// Open-cell edges lie on sample vertices. Keeping those vertices untouched
// preserves their entire bilinear walking surface while the banks can widen,
// break into shelves and gather uneven snow shoulders outside the route.
export function refineSnowTerrain(profile, map, seed) {
  const { width, step } = profile,
    heights = profile.heights.slice(),
    exposure = new Float32Array(heights.length);
  const posts = map.rooms.flatMap((r) =>
    monasteryPlan(r).posts.map((p) => ({
      x: r.x * 7 + p.x,
      z: r.z * 7 + p.z,
    })),
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
        distance = desertRouteDistance(map, x, z);
      let mask = smooth(0.35, 3.5, distance);
      if (!mask) continue;
      for (const p of posts)
        mask *= smooth(3.8, 6.5, Math.hypot(x - p.x, z - p.z));
      for (const f of features)
        mask *= smooth(f.r, f.r + 4, Math.hypot(x - f.x, z - f.z));
      for (const w of profile.waters)
        mask *= smooth(
          4,
          9,
          rectangleDistance(x, z, w.x, w.z, w.width / 2, w.length / 2),
        );
      if (map.shutterHouse)
        mask *= smooth(4, 9, shutterFoundationDistance(x, z));
      if (map.frozenStair)
        mask *= smooth(
          4,
          9,
          rectangleDistance(
            x,
            z,
            map.frozenStair.x * 7,
            map.frozenStair.z * 7,
            14,
            14,
          ),
        );
      if (map.bellHoist)
        mask *= smooth(
          4,
          9,
          rectangleDistance(
            x,
            z,
            map.bellHoist.x * 7,
            map.bellHoist.z * 7,
            23,
            30,
          ),
        );
      exposure[index] = mask;
      if (!mask) continue;
      // Remove the old uniform rise before sculpting the new shoulder. The
      // protected foundations above also cover terrain overrides and water cuts.
      const oldRise =
        (1 - Math.exp(-distance * 0.72)) *
          (5.5 +
            Math.sin(x * 0.087 + z * 0.071) * 1.6 +
            Math.sin(x * 0.22 - z * 0.16) * 0.5) +
        Math.max(0, distance - 5) * 0.35;
      const warp = (rockNoise(x * 0.022, z * 0.028, seed + 181) - 0.5) * 8,
        broad = rockNoise(x * 0.043 + warp * 0.08, z * 0.057, seed + 397),
        fracture = rockNoise(x * 0.18 + warp * 0.09, z * 0.13, seed + 733),
        toe = 1 - Math.exp(-Math.pow(distance / (2.8 + broad * 3.8), 1.5)),
        rise =
          toe * (4.8 + broad * 5.8 + (fracture - 0.5) * 2) +
          Math.max(0, distance - 11) * 0.22,
        base = heights[index] - oldRise,
        bed = (base + rise + x * 0.07 - z * 0.035) / 2.1,
        ledge =
          (Math.floor(bed) + smooth(0.12, 0.88, bed - Math.floor(bed))) * 2.1 -
          x * 0.07 +
          z * 0.035;
      heights[index] +=
        mask * (ledge + (fracture - 0.5) * 0.45 * toe - heights[index]);
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
    snow: {
      originalHeight: profile.height,
      exposure,
      rock: (x, z) => sample(exposure, x, z),
    },
  };
}
