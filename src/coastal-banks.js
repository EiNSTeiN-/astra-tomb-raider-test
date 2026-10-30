import { desertNoise as noise } from "./desert-geology.js";

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Ease the limestone shelf out of the complete walking-cell boundary. The
// former exponential fell most of its seven metres at the first terrain sample.
// Vary the shoulder along the coast, then retain the original distant seabed.
export function coastalBankDrop(x, z, distance, seed) {
  const breadth = 6.5 + noise(x * 0.055, z * 0.05, seed + 839) * 3.5,
    shoulder = 7 * (1 - Math.exp(-Math.pow(distance / breadth, 1.8))),
    seabed = 7 * (1 - Math.exp(-distance * 0.72)),
    deep = smooth(12, 18, distance);
  return shoulder * (1 - deep) + seabed * deep;
}
