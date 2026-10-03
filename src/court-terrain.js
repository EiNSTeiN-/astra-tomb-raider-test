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
        // Retain instrument and special floors. Discovery landings are fitted
        // below: their old protected cores could contain the very height switch
        // that needs repair, sometimes directly under a pickup.
        if (terrace.flat || terrace.main || terrace.field) {
          const core = terrace.flat ? terrace.radius + 1.75 : 10.5;
          free = Math.min(free, smooth(core, core + 4, distance));
        }
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
  fitDiscoveryLandings(heights, exposure, width, step, terraces);
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

function fitDiscoveryLandings(heights, exposure, width, step, terraces) {
  const floors = new Float32Array(heights.length),
    weights = new Float32Array(heights.length),
    anchors = new Float32Array(heights.length);
  for (const t of terraces) {
    if (t.flat || t.main || t.field) continue;
    // Sample the existing centre before changing any heights. Pickups keep
    // their original elevation even when a neighbouring terrace owns it.
    const fx = Math.max(0, Math.min(width - 1.001, t.x / step)),
      fz = Math.max(0, Math.min(width - 1.001, t.z / step)),
      ix = Math.floor(fx),
      iz = Math.floor(fz),
      tx = fx - ix,
      tz = fz - iz,
      floor =
        (heights[iz * width + ix] * (1 - tx) +
          heights[iz * width + ix + 1] * tx) *
          (1 - tz) +
        (heights[(iz + 1) * width + ix] * (1 - tx) +
          heights[(iz + 1) * width + ix + 1] * tx) *
          tz;
    // Discovery centres lie on the 7m map grid. A 5m apron stops before the
    // neighbouring landing's protected 1.75m core.
    for (
      let z = Math.max(0, Math.ceil((t.z - 5) / step));
      z <= Math.min(width - 1, Math.floor((t.z + 5) / step));
      z++
    )
      for (
        let x = Math.max(0, Math.ceil((t.x - 5) / step));
        x <= Math.min(width - 1, Math.floor((t.x + 5) / step));
        x++
      ) {
        const i = z * width + x,
          distance = Math.max(
            Math.abs(x * step - t.x),
            Math.abs(z * step - t.z),
          ),
          weight = 1 - smooth(1.75, 5, distance);
        floors[i] += floor * weight;
        weights[i] += weight;
        anchors[i] = Math.max(anchors[i], weight);
      }
  }
  for (let i = 0; i < heights.length; i++) {
    if (!weights[i]) continue;
    // Sum overlapping landings instead of choosing a winner, which would
    // introduce another seam. Existing instrument/water masks take priority.
    heights[i] +=
      (floors[i] / weights[i] - heights[i]) *
      Math.min(1, weights[i]) *
      exposure[i];
    exposure[i] *= 1 - anchors[i];
  }
}
