import * as THREE from "three";

// Lathe UVs collapse around the center of a flat cap. Use planar coordinates
// on horizontal faces and a cylindrical unwrap on the molded vertical faces.
// Separate face vertices allow a clean UV seam at the physical course edge.
export function stationLatheGeometry(profile, sides, textured = false) {
  const source = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    sides,
  );
  if (!textured) return source;
  const geometry = source.toNonIndexed();
  source.dispose();
  const p = geometry.attributes.position,
    uv = geometry.attributes.uv,
    circumference = Math.max(...profile.map(([r]) => r)) * Math.PI * 2,
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1).sub(a);
    c.fromBufferAttribute(p, i + 2).sub(a);
    const normal = b.cross(c).normalize();
    const planar =
      Math.abs(normal.y) > 0.7 ||
      (p.getY(i) === p.getY(i + 1) && p.getY(i) === p.getY(i + 2));
    for (let j = i; j < i + 3; j++)
      uv.setXY(
        j,
        planar ? p.getX(j) / 2 : (uv.getX(j) * circumference) / 2,
        planar ? p.getZ(j) / 2 : p.getY(j) / 2,
      );
  }
  return geometry;
}
