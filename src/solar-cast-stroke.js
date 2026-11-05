import * as THREE from "three";

// Rounded foundry fillets are embedded in the recess backing. TubeGeometry
// supplies the transported frames; explicit end caps seal each open stroke.
export function solarCastStroke(path, radius, face) {
  const z = face * (0.12 + radius * 0.45),
    points = path.map(([x, y]) => new THREE.Vector3(x, y, z)),
    curve = new THREE.CurvePath();
  for (let i = 1; i < points.length; i++)
    curve.add(new THREE.LineCurve3(points[i - 1], points[i]));
  const closed = points[0].distanceTo(points.at(-1)) < 1e-7,
    segments = Math.max(8, Math.min(128, Math.ceil(curve.getLength() * 8))),
    radial = 10,
    tube = new THREE.TubeGeometry(curve, segments, radius, radial, closed),
    expanded = tube.toNonIndexed(),
    positions = Array.from(expanded.attributes.position.array),
    normals = Array.from(expanded.attributes.normal.array),
    uvs = Array.from(expanded.attributes.uv.array);
  if (!closed)
    for (const [ring, center, outward] of [
      [0, points[0], curve.getTangentAt(0).negate()],
      [segments, points.at(-1), curve.getTangentAt(1)],
    ])
      for (let j = 0; j < radial; j++) {
        const a = new THREE.Vector3().fromBufferAttribute(
            tube.attributes.position,
            ring * (radial + 1) + j,
          ),
          b = new THREE.Vector3().fromBufferAttribute(
            tube.attributes.position,
            ring * (radial + 1) + j + 1,
          ),
          q = [center, a, b];
        if (
          new THREE.Triangle(...q).getNormal(new THREE.Vector3()).dot(outward) <
          0
        )
          [q[1], q[2]] = [q[2], q[1]];
        for (const p of q) {
          positions.push(...p.toArray());
          normals.push(...outward.toArray());
          uvs.push(p.x / 2, p.y / 2);
        }
      }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  tube.dispose();
  expanded.dispose();
  return geometry;
}
