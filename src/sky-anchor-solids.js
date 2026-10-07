// Bridge posts rotate with their spans. Cache the built column and trim bands
// before their meshes are merged, and retain a body-sized margin in that frame.
export function skyAnchorSolid(
  game,
  parts,
  { x, z, localX, localZ, baseY, ux, uz },
) {
  const bands = parts.map((mesh) => {
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox;
    return {
      minX: b.min.x + mesh.position.x - localX,
      maxX: b.max.x + mesh.position.x - localX,
      minZ: b.min.z + mesh.position.z - localZ,
      maxZ: b.max.z + mesh.position.z - localZ,
      minY: b.min.y + mesh.position.y + baseY,
      maxY: b.max.y + mesh.position.y + baseY,
    };
  });
  const w = Math.max(
      ...bands.flatMap((b) => [Math.abs(b.minX), Math.abs(b.maxX)]),
    ),
    d = Math.max(...bands.flatMap((b) => [Math.abs(b.minZ), Math.abs(b.maxZ)])),
    top = Math.max(...bands.map((b) => b.maxY));
  return {
    x,
    z,
    w: Math.abs(uz) * w + Math.abs(ux) * d,
    d: Math.abs(ux) * w + Math.abs(uz) * d,
    h: top - game.groundHeight(x, z),
    bottom: Math.min(...bands.map((b) => b.minY)),
    skyAnchor: true,
    ux,
    uz,
    bands,
  };
}

export function skyAnchorBlocked(solid, x, y, z, clearance = 1.8) {
  const padding = 0.4,
    dx = x - solid.x,
    dz = z - solid.z;
  if (Math.abs(dx) >= solid.w + padding || Math.abs(dz) >= solid.d + padding)
    return false;
  const localX = dx * solid.uz - dz * solid.ux,
    localZ = dx * solid.ux + dz * solid.uz;
  for (const b of solid.bands) {
    if (y >= b.maxY - 0.015 || y + clearance <= b.minY + 0.015) continue;
    const across = Math.max(b.minX - localX, 0, localX - b.maxX),
      along = Math.max(b.minZ - localZ, 0, localZ - b.maxZ);
    if (across * across + along * along < padding * padding) return true;
  }
  return false;
}
