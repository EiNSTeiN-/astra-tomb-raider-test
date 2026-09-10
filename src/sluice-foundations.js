import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";

// The coastal terrain is bilinear on a regular grid. Include grid crossings as
// well as footprint corners: its lowest point can sit between the end samples.
function samples(lo, hi, step) {
  const values = [lo, hi];
  for (let n = Math.ceil(lo / step); n * step < hi; n++) values.push(n * step);
  return values;
}

export function buildSluiceFoundation(game, root, material, rect, seed) {
  const { x, z, width, depth } = rect,
    step = game.terrainProfile?.step || 1.75,
    ox = root.position.x,
    oy = root.position.y,
    oz = root.position.z;
  let bottom = 0;
  for (const px of samples(ox + x - width / 2, ox + x + width / 2, step))
    for (const pz of samples(oz + z - depth / 2, oz + z + depth / 2, step))
      bottom = Math.min(bottom, game.groundHeight(px, pz) - oy - 0.14);
  const top = 0.13,
    height = top - bottom;
  const add = (geometry, px, py, pz) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(px, py, pz);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  // A recessed core backs the narrow joints; the coursed faces remain visible
  // when a well drains. The bottom is buried across the whole stone footprint.
  add(new THREE.BoxGeometry(width, 0.12, depth), x, bottom + 0.06, z);
  add(
    new THREE.BoxGeometry(width - 0.1, height, depth - 0.1),
    x,
    (bottom + top) / 2,
    z,
  );
  const alongX = width >= depth,
    length = alongX ? width : depth,
    count = Math.ceil(length / 1.85),
    span = length / count,
    rows = Math.ceil(height / 0.62);
  for (let row = 0; row < rows; row++) {
    const hi = top - row * 0.62,
      lo = Math.max(bottom, hi - 0.62),
      offset = row % 2 ? span / 2 : 0;
    for (let a = -length / 2 - offset; a < length / 2; a += span) {
      const left = Math.max(-length / 2, a),
        right = Math.min(length / 2, a + span);
      if (right - left < 0.02) continue;
      add(
        stoneBlockGeometry(
          alongX ? right - left - 0.012 : width,
          hi - lo - Math.min(0.012, (hi - lo) / 4),
          alongX ? depth : right - left - 0.012,
          ++seed,
          0.022,
        ),
        x + (alongX ? (left + right) / 2 : 0),
        (lo + hi) / 2,
        z + (alongX ? 0 : (left + right) / 2),
      );
    }
  }
  const proxy = add(
    new THREE.BoxGeometry(width, height, depth),
    x,
    (bottom + top) / 2,
    z,
  );
  game.cameraSurfaces?.capture(proxy);
  root.remove(proxy);
  proxy.geometry.dispose();
  return { ...rect, bottom, top };
}
