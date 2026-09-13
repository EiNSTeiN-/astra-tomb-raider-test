const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Fixed pads can overlap at different elevations. Selecting only the strongest
// terrace switches height abruptly along their equal-weight line. Relax that
// shared surface while keeping the actual working centres and special floors.
export function courtTerrain(width, step, terraces, raw, waters = []) {
  const heights = new Float32Array(width * width),
    exposure = new Float32Array(heights.length);
  for (let iz = 0; iz < width; iz++)
    for (let ix = 0; ix < width; ix++) {
      const x = ix * step,
        z = iz * step,
        index = iz * width + ix,
        base = raw(x, z);
      let height = base,
        strongest = 0,
        vicinity = 0,
        free = 1;
      for (const terrace of terraces) {
        const distance = Math.max(
            Math.abs(x - terrace.x),
            Math.abs(z - terrace.z),
          ),
          weight =
            1 -
            smooth(
              terrace.radius * (terrace.flat ? 1 : 0.9),
              terrace.radius + 6,
              distance,
            );
        if (weight > strongest) {
          height = base * (1 - weight) + terrace.y * weight;
          strongest = weight;
        }
        // Main instruments and field working pads retain their original floor.
        // Discoveries need a smaller core, leaving room for a graded approach.
        const core = terrace.flat
          ? terrace.radius + 1.75
          : terrace.main || terrace.field
            ? 10.5
            : 4.2;
        free = Math.min(free, smooth(core, core + 4, distance));
        vicinity = Math.max(
          vicinity,
          1 - smooth(terrace.radius + 6, terrace.radius + 16, distance),
        );
      }
      // Water levels and analytic excavation depths depend on the original
      // bed, including the outer cell interpolated into each buried border.
      // Protect that footprint before grading the surrounding approach.
      for (const water of waters) {
        const distance = Math.max(
          0,
          Math.abs(x - water.x) - water.width / 2,
          Math.abs(z - water.z) - water.length / 2,
        );
        free = Math.min(free, smooth(step * 2, step * 2 + 5, distance));
      }
      heights[index] = height;
      exposure[index] = free * vicinity;
    }
  for (let pass = 0; pass < 24; pass++) {
    const previous = heights.slice();
    for (let z = 1; z < width - 1; z++)
      for (let x = 1; x < width - 1; x++) {
        const i = z * width + x,
          blend = exposure[i] * 0.7;
        if (!blend) continue;
        let sum = 0;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) sum += previous[i + dz * width + dx];
        heights[i] += (sum / 9 - previous[i]) * blend;
      }
  }
  return heights;
}
