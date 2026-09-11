import {
  desertNoise as rockNoise,
  desertRouteDistance,
} from "./desert-geology.js";
import { temperingFoundationDistance } from "./tempering-cart-rules.js";

const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Break up the exposed crests while retaining two whole sample cells around
// walking boundaries. Bilinear movement and saved foundations therefore keep
// their exact previous heights; the new relief belongs to the enclosing banks.
export function refineVolcanicTerrain(profile, map, seed) {
  const { width, step } = profile,
    heights = profile.heights.slice();
  for (let iz = 0; iz < width; iz++)
    for (let ix = 0; ix < width; ix++) {
      const x = ix * step,
        z = iz * step,
        index = iz * width + ix;
      let mask = smooth(step * 2, 10, desertRouteDistance(map, x, z));
      if (map.temperingCart)
        mask *= smooth(4, 8, temperingFoundationDistance(x, z));
      for (const water of profile.waters) {
        const distance = Math.hypot(
          Math.max(0, Math.abs(x - water.x) - water.width / 2),
          Math.max(0, Math.abs(z - water.z) - water.length / 2),
        );
        mask *= smooth(4, 10, distance);
      }
      if (!mask) continue;
      const warp = (rockNoise(x * 0.025, z * 0.025, seed + 53) - 0.5) * 7;
      const broad = rockNoise(x * 0.065 + warp * 0.1, z * 0.09, seed + 17);
      const fracture = rockNoise(x * 0.38 + warp, z * 0.16, seed + 89);
      const ledge = Math.tanh(Math.sin(heights[index] * 1.55 + broad * 2) * 3);
      heights[index] +=
        mask * ((broad - 0.52) * 5.2 + (fracture - 0.5) * 1.6 + ledge * 0.3);
    }
  const sample = (x, z) => {
    const fx = Math.max(0, Math.min(width - 1.001, x / step)),
      fz = Math.max(0, Math.min(width - 1.001, z / step));
    const ix = Math.floor(fx),
      iz = Math.floor(fz),
      tx = fx - ix,
      tz = fz - iz;
    return (
      (heights[iz * width + ix] * (1 - tx) +
        heights[iz * width + ix + 1] * tx) *
        (1 - tz) +
      (heights[(iz + 1) * width + ix] * (1 - tx) +
        heights[(iz + 1) * width + ix + 1] * tx) *
        tz
    );
  };
  return {
    ...profile,
    heights,
    height: sample,
    volcanic: { originalHeight: profile.height },
  };
}
