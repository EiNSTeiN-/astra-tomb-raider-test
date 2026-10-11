// Match the float32 heights and diagonal used by the delivered terrain mesh.
// The original bilinear field remains useful for terrain generation and masks;
// walking support must follow the two actual planes inside each sample cell.
export function createTerrainSurfaceSampler(profile) {
  const { width, step } = profile,
    heights = new Float32Array(width * width);
  for (let z = 0; z < width; z++)
    for (let x = 0; x < width; x++)
      heights[z * width + x] = profile.height(x * step, z * step);
  return (x, z) => {
    const fx = Math.max(0, Math.min(width - 1, x / step)),
      fz = Math.max(0, Math.min(width - 1, z / step)),
      ix = Math.min(width - 2, Math.floor(fx)),
      iz = Math.min(width - 2, Math.floor(fz)),
      u = fx - ix,
      v = fz - iz,
      a = heights[iz * width + ix],
      b = heights[iz * width + ix + 1],
      c = heights[(iz + 1) * width + ix],
      d = heights[(iz + 1) * width + ix + 1];
    return u + v <= 1
      ? a + u * (b - a) + v * (c - a)
      : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  };
}
