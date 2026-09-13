import { desertNoise as noise } from "./desert-geology.js";

// A path leaves a shallow apron before climbing into a broad, uneven ridge.
// Zero rise at the boundary preserves the complete walking-cell surface. The
// old exponential climbed several metres at the first 1.75m terrain sample.
export function regionalBankRise(x, z, distance, seed, biome) {
  const warp = (noise(x * 0.018, z * 0.023, seed + 157) - 0.5) * 14,
    crest = noise(x * 0.032 + warp * 0.06, z * 0.045, seed + 379),
    shoulder = noise(x * 0.025, z * 0.033 + warp * 0.04, seed + 613),
    breadth = biome === "jungle" || biome === "snow" ? 12 : 9,
    toe = 1 - Math.exp(-Math.pow(distance / (breadth + shoulder * 8), 1.8));
  return toe * (5 + crest * 9) + Math.max(0, distance - 15) * 0.17;
}

// Round the meeting points of neighbouring banks without moving protected
// walking vertices, working foundations or water margins. Each pass reads a
// separate field so the result does not depend on traversal direction.
export function relaxBankCrests(heights, width, exposure) {
  for (let pass = 0; pass < 3; pass++) {
    const previous = heights.slice();
    for (let z = 1; z < width - 1; z++)
      for (let x = 1; x < width - 1; x++) {
        const index = z * width + x,
          blend = exposure[index] * 0.7;
        if (!blend) continue;
        let sum = 0;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++)
            sum += previous[index + dz * width + dx];
        heights[index] += (sum / 9 - previous[index]) * blend;
      }
  }
}
