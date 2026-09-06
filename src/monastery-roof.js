import * as THREE from "three";

export function monasteryRoofHeight(x, z, width, depth, rise) {
  const u = Math.abs(x) / (width / 2),
    v = Math.abs(z) / (depth / 2);
  const hip = Math.max(v, Math.max(0, (u - 0.34) / 0.66));
  const edge = Math.max(u, v);
  const liftedEave = Math.exp(-Math.pow((1 - edge) * 7, 2)) * 0.32;
  const corner = Math.pow(Math.max(0, u * v), 5) * 0.32;
  return Math.max(0, 1 - hip) * rise + liftedEave + corner;
}

export function roofCellPresent(x, z, width, depth, damage = 0) {
  const u = x / width + 0.5,
    v = z / depth + 0.5;
  if (damage === 1 && u < 0.19 + Math.sin(v * 18) * 0.025 && v > 0.6)
    return false;
  if (damage === 2 && u > 0.76 + Math.sin(v * 23) * 0.025 && v < 0.3)
    return false;
  return true;
}

// A solid roof shell with side walls around both eaves and damaged cells. The
// snow shell uses the same world-space cutouts and follows the roof underneath.
export function monasteryRoofGeometry({
  width,
  depth,
  rise,
  snow = false,
  damage = 0,
  seed = 0,
}) {
  const nx = Math.ceil(width * (snow ? 3 : 2)),
    nz = Math.ceil(depth * (snow ? 3 : 2));
  const inset = snow ? 0.16 : 0,
    w = width - inset * 2,
    d = depth - inset * 2;
  const count = (nx + 1) * (nz + 1),
    positions = [],
    uv = [],
    indices = [],
    active = [];
  for (let layer = 0; layer < 2; layer++)
    for (let iz = 0; iz <= nz; iz++)
      for (let ix = 0; ix <= nx; ix++) {
        const x = (ix / nx - 0.5) * w,
          z = (iz / nz - 0.5) * d;
        let y = monasteryRoofHeight(x, z, width, depth, rise);
        if (snow) {
          const drift =
            0.19 +
            0.07 * Math.sin(x * 0.63 + seed) * Math.cos(z * 0.8 - seed) +
            0.12 * (x / width + 0.5);
          y += layer === 0 ? drift : 0.025;
        } else y -= layer === 0 ? 0 : 0.24;
        positions.push(x, y, z);
        uv.push(x / 2, z / 2);
      }
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++)
      active.push(
        roofCellPresent(
          ((ix + 0.5) / nx - 0.5) * w,
          ((iz + 0.5) / nz - 0.5) * d,
          width,
          depth,
          damage,
        ),
      );
  const present = (x, z) =>
    x >= 0 && z >= 0 && x < nx && z < nz && active[z * nx + x];
  const side = (a, b) => indices.push(a, a + count, b + count, a, b + count, b);
  let cells = 0;
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++) {
      if (!present(ix, iz)) continue;
      cells++;
      const a = iz * (nx + 1) + ix,
        b = a + 1,
        c = a + nx + 1,
        d = c + 1;
      indices.push(
        a,
        c,
        b,
        b,
        c,
        d,
        a + count,
        b + count,
        c + count,
        b + count,
        d + count,
        c + count,
      );
      if (!present(ix - 1, iz)) side(a, c);
      if (!present(ix, iz + 1)) side(c, d);
      if (!present(ix + 1, iz)) side(d, b);
      if (!present(ix, iz - 1)) side(b, a);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData = { cells, snow, width, depth, rise, damage, seed };
  return geometry;
}
