import { skyRockNoise } from "./sky-geology.js";
import { spanCoordinates } from "./sky-bridge-rules.js";

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// A continuous upper shelf gives the island a natural outline instead of
// starting every cliff at the rectangular route grid. Broad lobes lead into
// smaller weathered returns; the range stays between 1.25 and 9.75 metres.
export function skyBankExtension(x, z, seed) {
  return (
    1.25 +
    8.5 *
      (0.35 * skyRockNoise(x * 0.058, z * 0.058, seed + 401) +
        0.65 * skyRockNoise(x * 0.137, z * 0.131, seed + 647))
  );
}

// Keep the delivered receiving shores and bridge excavations with their
// approach aprons. New lobes meet those foundations through a smooth fringe.
export function createSkyShoulders(map, waters, seed) {
  const courier = map.courierFerry,
    // The cable course is navigable outside map.grid too. Preserve its full
    // entrance/landing/chasm envelope, with three metres for terrain sampling.
    northCourse = courier
      ? {
          minX: map.rooms[0].x * 7 - 7,
          maxX: courier.stops.at(-1) + 13,
          minZ: courier.z - 8,
          maxZ: courier.z + 20,
        }
      : null;
  return {
    extension(x, z) {
      let weight = 1;
      for (const water of waters) {
        const distance = Math.hypot(
          Math.max(0, Math.abs(x - water.x) - water.width / 2 - 3),
          Math.max(0, Math.abs(z - water.z) - water.length / 2 - 3),
        );
        weight = Math.min(weight, smooth(0, 6, distance));
      }
      if (northCourse) {
        const distance = Math.hypot(
          Math.max(0, northCourse.minX - x, x - northCourse.maxX),
          Math.max(0, northCourse.minZ - z, z - northCourse.maxZ),
        );
        weight = Math.min(weight, smooth(0, 6, distance));
      }
      for (const bridge of map.bridges || []) {
        const p = spanCoordinates(bridge, x, z),
          distance = Math.hypot(
            Math.max(0, -4 - p.along, p.along - p.length - 4),
            Math.max(0, Math.abs(p.across) - 12),
          );
        weight = Math.min(weight, smooth(0, 6, distance));
      }
      return skyBankExtension(x, z, seed) * weight;
    },
  };
}

function originalDrop(x, z, distance, seed) {
  const breadth = 7.5 + skyRockNoise(x * 0.043, z * 0.047, seed + 191) * 3.5;
  const shoulder =
    24 * (1 - Math.exp(-Math.pow(distance / breadth, 1.7))) +
    Math.min(40, distance * 2) * smooth(2, 20, distance);
  const ravine =
    (1 - Math.exp(-distance * 0.72)) * (24 + Math.min(40, distance * 2));
  const deep = smooth(18, 26, distance);
  return shoulder * (1 - deep) + ravine * deep;
}

// Extend only the upper shoulder, retaining the shipped deep ravine beyond
// 26 metres. Both profiles increase monotonically; the blend cannot raise a
// ridge above the original foundation or lower the protected walking surface.
export function skyBankDrop(
  x,
  z,
  distance,
  seed,
  extension = skyBankExtension(x, z, seed),
) {
  const old = originalDrop(x, z, distance, seed),
    shifted = originalDrop(x, z, Math.max(0, distance - extension), seed),
    deep = smooth(16, 26, distance);
  return shifted * (1 - deep) + old * deep;
}

// The outer excavation fringe can overlap a parallel walking cell. Keep that
// path and a small foot margin on its original cap; retain the complete ravine
// inside the bridge's crossing corridor and outside the walking footprint.
export function skyBridgePathWeight(bridge, x, z, walkingDistance) {
  const across = Math.abs(spanCoordinates(bridge, x, z).across),
    path = 1 - smooth(0.75, 2.5, walkingDistance);
  return 1 - smooth(4.5, 6.5, across) * path;
}
