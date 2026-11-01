// Extruded faces have separate vertices, so each triangle can use a projection
// suited to its orientation. XY alone collapses the texture on depth returns.
// The dominant normal axis bounds scale distortion and preserves the old XY
// mapping on the broad fronts. One texture tile spans two metres.
export function projectStoneUVs(geometry) {
  if (geometry.index)
    throw new TypeError("Stone projection needs separate face vertices.");
  const p = geometry.attributes.position,
    uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i + 1) - p.getX(i),
      ay = p.getY(i + 1) - p.getY(i),
      az = p.getZ(i + 1) - p.getZ(i),
      bx = p.getX(i + 2) - p.getX(i),
      by = p.getY(i + 2) - p.getY(i),
      bz = p.getZ(i + 2) - p.getZ(i);
    const nx = Math.abs(ay * bz - az * by),
      ny = Math.abs(az * bx - ax * bz),
      nz = Math.abs(ax * by - ay * bx);
    const axis = nz >= nx && nz >= ny ? 2 : nx >= ny ? 0 : 1;
    for (let j = i; j < i + 3; j++)
      uv.setXY(
        j,
        (axis === 0 ? p.getZ(j) : p.getX(j)) / 2,
        (axis === 1 ? p.getZ(j) : p.getY(j)) / 2,
      );
  }
  return geometry;
}
