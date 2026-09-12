import * as THREE from "three";

// Bury the whole end ring beneath the grid cells touched by its footprint.
// A single height sample leaves a blunt cut exposed on the downhill side.
export function createRuinRoot(points, radius, groundHeight, step = 1.75) {
  const fitted = points.map((p) => p.clone()),
    end = fitted[0];
  let lowest = groundHeight(end.x, end.z);
  for (
    let x = Math.floor((end.x - radius) / step) * step;
    x <= Math.ceil((end.x + radius) / step) * step + 1e-6;
    x += step
  )
    for (
      let z = Math.floor((end.z - radius) / step) * step;
      z <= Math.ceil((end.z + radius) / step) * step + 1e-6;
      z += step
    )
      lowest = Math.min(lowest, groundHeight(x, z));
  end.y = lowest - radius - 0.08;
  const curve = new THREE.CatmullRomCurve3(fitted),
    segments = 32,
    radial = 10,
    geometry = new THREE.TubeGeometry(curve, segments, radius, radial, false),
    source = geometry.attributes.position,
    positions = new Float32Array((source.count + 2) * 3);
  for (let row = 0; row <= segments; row++) {
    const t = row / segments,
      center = curve.getPointAt(t),
      taper = 0.25 + 0.75 * THREE.MathUtils.smoothstep(t, 0, 0.16);
    for (let side = 0; side <= radial; side++) {
      const i = row * (radial + 1) + side;
      positions[i * 3] = center.x + (source.getX(i) - center.x) * taper;
      positions[i * 3 + 1] = center.y + (source.getY(i) - center.y) * taper;
      positions[i * 3 + 2] = center.z + (source.getZ(i) - center.z) * taper;
    }
  }
  const indices = Array.from(geometry.index.array),
    uv = new Float32Array((source.count + 2) * 2);
  uv.set(geometry.attributes.uv.array);
  // Close both ends. The soil end is buried; the upper end can be visible
  // between broken capital stones and must not expose an empty tube.
  for (const last of [false, true]) {
    const centerIndex = source.count + Number(last),
      start = last ? segments * (radial + 1) : 0,
      center = curve.getPointAt(Number(last));
    positions.set(center.toArray(), centerIndex * 3);
    uv.set([Number(last), 0.5], centerIndex * 2);
    for (let side = 0; side < radial; side++)
      indices.push(
        centerIndex,
        start + side + Number(last),
        start + side + Number(!last),
      );
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.deleteAttribute("normal");
  geometry.computeVertexNormals();
  const ring = Array.from({ length: radial + 1 }, (_, i) =>
    Array.from(positions.slice(i * 3, i * 3 + 3)),
  );
  return { curve, geometry, ring };
}
