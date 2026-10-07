import { skyRockNoise } from "./sky-geology.js";
import { spanCoordinates } from "./sky-bridge-rules.js";

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Outside the walking grid, turn the cap into a broad, uneven rock shoulder.
// The route itself is untouched. Farther out, retain the deep cloud ravine;
// reservoirs and bridge corridors are excavated separately by terrain.js.
export function skyBankDrop(x, z, distance, seed) {
  const breadth = 7.5 + skyRockNoise(x * 0.043, z * 0.047, seed + 191) * 3.5;
  const shoulder =
    24 * (1 - Math.exp(-Math.pow(distance / breadth, 1.7))) +
    Math.min(40, distance * 2) * smooth(2, 20, distance);
  const ravine =
    (1 - Math.exp(-distance * 0.72)) * (24 + Math.min(40, distance * 2));
  const deep = smooth(18, 26, distance);
  return shoulder * (1 - deep) + ravine * deep;
}

// The outer excavation fringe can overlap a parallel walking cell. Keep that
// path and a small foot margin on its original cap; retain the complete ravine
// inside the bridge's crossing corridor and outside the walking footprint.
export function skyBridgePathWeight(bridge, x, z, walkingDistance) {
  const across = Math.abs(spanCoordinates(bridge, x, z).across),
    path = 1 - smooth(0.75, 2.5, walkingDistance);
  return 1 - smooth(4.5, 6.5, across) * path;
}
