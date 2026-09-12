// Terrain is rendered on a regular grid. Sampling every vertex of the cells
// touched by a footing gives a conservative lower bound for their triangles,
// including diagonal slopes that a center or corner-only query can miss.
export function footprintMinimum(
  groundHeight,
  x,
  z,
  width,
  depth,
  gridStep = 1.75,
) {
  const center = groundHeight(x, z),
    minX = Math.floor((x - width / 2) / gridStep) * gridStep,
    maxX = Math.ceil((x + width / 2) / gridStep) * gridStep,
    minZ = Math.floor((z - depth / 2) / gridStep) * gridStep,
    maxZ = Math.ceil((z + depth / 2) / gridStep) * gridStep;
  let lowest = center;
  for (let px = minX; px <= maxX + 1e-6; px += gridStep)
    for (let pz = minZ; pz <= maxZ + 1e-6; pz += gridStep)
      lowest = Math.min(lowest, groundHeight(px, pz));
  return lowest;
}

export function masonryFoundation(
  groundHeight,
  x,
  z,
  width,
  depth,
  gridStep = 1.75,
) {
  const center = groundHeight(x, z),
    lowest = footprintMinimum(groundHeight, x, z, width, depth, gridStep);
  if (center - lowest < 0.08) return null;
  const bottom = lowest - 0.18,
    top = center + 0.035,
    count = Math.ceil((top - bottom) / 0.44),
    height = (top - bottom) / count;
  return {
    bottom,
    top,
    width: width * 0.96,
    depth: depth * 0.96,
    courses: Array.from({ length: count }, (_, i) => ({
      y: bottom + (i + 0.5) * height,
      height: height + 0.025,
    })),
  };
}
