import { JUNGLE_PLANTING_BOUNDS } from "./jungle-planting-bounds.js";

const probes = JUNGLE_PLANTING_BOUNDS.map(({ footprint }) => {
  const points = new Set();
  for (let i = 0; i < 12; i++) {
    const x = Math.cos((i * Math.PI) / 6),
      z = Math.sin((i * Math.PI) / 6);
    points.add(
      footprint.reduce((best, p) =>
        p[0] * x + p[1] * z > best[0] * x + best[1] * z ? p : best,
      ),
    );
  }
  return [...points];
});

function clearPocket(map, waters, x, z, radius) {
  const margin = radius + 0.25,
    extent = map.size * 7;
  if (Math.min(x, z, extent - x, extent - z) < radius + 0.65) return false;
  for (
    let iz = Math.floor((z - margin + 3.5) / 7);
    iz <= Math.floor((z + margin + 3.5) / 7);
    iz++
  )
    for (
      let ix = Math.floor((x - margin + 3.5) / 7);
      ix <= Math.floor((x + margin + 3.5) / 7);
      ix++
    ) {
      if (!map.grid[iz]?.[ix]) continue;
      const dx = Math.max(0, Math.abs(x - ix * 7) - 3.5),
        dz = Math.max(0, Math.abs(z - iz * 7) - 3.5);
      if (Math.hypot(dx, dz) < margin) return false;
    }
  return (
    !(map.features || []).some(
      (f) => Math.hypot(f.x * 7 - x, f.z * 7 - z) < radius + 3,
    ) &&
    !(map.enemies || []).some(
      (e) => Math.hypot(e.x * 7 - x, e.z * 7 - z) < radius + 2.2,
    ) &&
    (!map.spawn ||
      Math.hypot(map.spawn.x * 7 - x, map.spawn.z * 7 - z) >= radius + 3) &&
    !waters.some(
      (w) =>
        Math.abs(w.x - x) < w.width / 2 + radius + 0.2 &&
        Math.abs(w.z - z) < w.length / 2 + radius + 0.2,
    )
  );
}

// Plan from the delivered root/apron hull, including its authored rotation.
// Final planting still checks every root against the completed terrain. Two
// nearby pockets retain an alternative when another trunk/prop uses the first.
export function planJungleTreeCaps(
  map,
  waters,
  anchors,
  referenceHeight,
  step,
) {
  const grid = new Map(),
    result = [],
    corner = (x, z) => {
      const key = `${x},${z}`;
      if (!grid.has(key))
        grid.set(key, Math.fround(referenceHeight(x * step, z * step)));
      return grid.get(key);
    },
    height = (x, z) => {
      const ix = Math.floor(x / step),
        iz = Math.floor(z / step),
        u = x / step - ix,
        v = z / step - iz,
        a = corner(ix, iz),
        b = corner(ix + 1, iz),
        c = corner(ix, iz + 1),
        d = corner(ix + 1, iz + 1),
        bilinear = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v,
        triangle =
          u + v <= 1
            ? a + u * (b - a) + v * (c - a)
            : d + (1 - u) * (c - d) + (1 - v) * (b - d);
      return Math.min(bilinear, triangle);
    };
  for (const [source, anchor] of anchors.entries()) {
    const variant = anchor.variant ?? 0,
      model = JUNGLE_PLANTING_BOUNDS[variant],
      radius = model.radius * anchor.scale,
      c = Math.cos(anchor.rotation),
      s = Math.sin(anchor.rotation),
      footprint = probes[variant].map(([x, z]) => [
        (c * x + s * z) * anchor.scale,
        (-s * x + c * z) * anchor.scale,
      ]),
      pockets = [];
    for (let candidate = 0; candidate < 17; candidate++) {
      const distance = candidate === 0 ? 0 : candidate <= 8 ? 2 : 4,
        angle = anchor.rotation + (((candidate - 1) % 8) * Math.PI) / 4,
        x = anchor.x + Math.cos(angle) * distance,
        z = anchor.z + Math.sin(angle) * distance;
      if (
        !clearPocket(map, waters, x, z, radius) ||
        pockets.some((p) => Math.hypot(x - p.x, z - p.z) < 2.5)
      )
        continue;
      const heights = [
        height(x, z),
        ...footprint.map(([dx, dz]) => height(x + dx, z + dz)),
      ];
      if (Math.max(...heights) - Math.min(...heights) > 1.8 * anchor.scale)
        continue;
      pockets.push({ x, z, radius: radius + 0.65, source });
      if (pockets.length === 2) break;
    }
    result.push(...pockets);
  }
  // The sampled reference field belongs only to this planning call.
  grid.clear();
  return result;
}
