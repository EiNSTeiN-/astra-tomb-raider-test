import { causewayFoundationWeight } from "./echo-causeway-rules.js";
// A continuous inner roof closes against the existing terrain outside the map.
// Its triangle sampler is also used by movement, camera and sight checks.
export function createCavernProfile(map, terrain) {
  const { width, step, extent } = terrain;
  const heights = new Float32Array(width * width);
  const air = new Float32Array(width * width);
  const climbing = map.features.filter(
    (f) => f.type === "field" && f.kind === "climb",
  );
  for (let iz = 0; iz < width; iz++)
    for (let ix = 0; ix < width; ix++) {
      const x = ix * step,
        z = iz * step;
      const gx = Math.round(x / 7),
        gz = Math.round(z / 7);
      let distance = 10;
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          if (!map.grid[gz + dz]?.[gx + dx]) continue;
          distance = Math.min(
            distance,
            Math.hypot(
              Math.max(0, Math.abs(x - (gx + dx) * 7) - 3.5),
              Math.max(0, Math.abs(z - (gz + dz) * 7) - 3.5),
            ),
          );
        }
      let vault = 0;
      for (const room of map.rooms) {
        const rx = (x - room.x * 7) / (room.r * 7 + 14);
        const rz = (z - room.z * 7) / (room.r * 7 + 10);
        vault = Math.max(
          vault,
          Math.exp(-(rx * rx + rz * rz) * 1.4) *
            [11, 15, 9, 18, 13, 10, 17, 12, 22][room.index],
        );
      }
      // The suspended rope gantries rise above the player's jumping envelope.
      // Give these stations their own vault, including the entire crossbeam.
      for (const station of climbing) {
        const distance = Math.hypot(x - station.x * 7, z - station.z * 7);
        vault = Math.max(vault, 12 * Math.exp(-((distance / 30) ** 2)));
      }
      const layers =
        Math.sin(x * 0.13 + Math.sin(z * 0.057) * 2) * 1.35 +
        Math.sin(x * 0.35 - z * 0.28) * 0.6 +
        Math.sin(x * 0.82 + z * 0.64) * 0.2;
      const arch = Math.sqrt(Math.max(0, 1 - (distance / 8) ** 2));
      const edge = Math.max(
        0,
        Math.min(1, Math.min(x, z, extent - x, extent - z) / 3.5),
      );
      const seal = edge * edge * (3 - 2 * edge);
      const clearance =
        seal * arch * (17 + vault + layers) - (1 - seal * arch) * 1.2;
      heights[iz * width + ix] = terrain.height(x, z) + clearance;
      if (map.echoCauseway)
        heights[iz * width + ix] +=
          Math.max(0, terrain.causewayY + 26 - heights[iz * width + ix]) *
          causewayFoundationWeight(x, z);
      air[iz * width + ix] = heights[iz * width + ix] - terrain.height(x, z);
    }
  const height = (x, z) => {
    const fx = Math.max(0, Math.min(width - 1.001, x / step));
    const fz = Math.max(0, Math.min(width - 1.001, z / step));
    const ix = Math.floor(fx),
      iz = Math.floor(fz),
      tx = fx - ix,
      tz = fz - iz;
    const a = heights[iz * width + ix],
      b = heights[iz * width + ix + 1];
    const c = heights[(iz + 1) * width + ix],
      d = heights[(iz + 1) * width + ix + 1];
    return tx + tz <= 1
      ? a + (b - a) * tx + (c - a) * tz
      : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  };
  return { width, step, extent, heights, air, height };
}

export function cavernClear(game, x, y, z, radius = 0) {
  return !game.cavernProfile || y + radius < game.cavernProfile.height(x, z);
}

export function crystalRestoration(progress, room) {
  const stage = Math.max(0, room - 1);
  if (progress.completed || progress.stage > stage) return 1;
  return (
    [0, 1, 2].filter((step) =>
      progress.field?.includes(`field-${stage}-${step}`),
    ).length / 3
  );
}
