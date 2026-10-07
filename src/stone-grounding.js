import * as THREE from "three";

// A scan's underside, rather than its origin, determines how it meets soil.
// Cache these samples per shape; placement only performs terrain height queries.
export function stoneShape(source, matrix = new THREE.Matrix4()) {
  const geometry = source.clone().applyMatrix4(matrix);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox,
    size = box.getSize(new THREE.Vector3()),
    center = box.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -box.min.y, -center.z);
  geometry.scale(...new Array(3).fill(1 / Math.max(size.x, size.y, size.z)));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return stoneFootprint(geometry);
}

// The caller retains geometry ownership; probes allocate no lasting render resources.
export function stoneFootprint(geometry, { edgeProbes = false } = {}) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox,
    probe = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    ),
    ray = new THREE.Raycaster(),
    underside = [],
    origin = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0);
  const sample = (x, z) => {
    ray.set(origin.set(x, bounds.min.y - 1, z), up);
    const hit = ray.intersectObject(probe, false)[0];
    if (hit) underside.push(hit.point.clone());
  };
  for (let iz = 1; iz <= 7; iz++)
    for (let ix = 1; ix <= 7; ix++) {
      const x = THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, ix / 8),
        z = THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, iz / 8);
      sample(x, z);
    }
  if (edgeProbes) {
    // Narrow scan edges can fall between every grid ray on a cliff. Project
    // vertices and downward-facing triangles onto the bottom profile as well.
    // Always take the first upward hit: an upper concavity is not a soil root.
    const position = geometry.attributes.position,
      index = geometry.index,
      a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3(),
      normal = new THREE.Vector3(),
      point = new THREE.Vector3(),
      seen = new Set();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      const key = `${point.x.toFixed(6)},${point.z.toFixed(6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sample(point.x, point.z);
    }
    const count = index?.count ?? position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      a.fromBufferAttribute(position, index ? index.getX(i) : i);
      b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1);
      c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2);
      normal.copy(b).sub(a).cross(point.copy(c).sub(a)).normalize();
      if (normal.y >= -0.15) continue;
      point
        .copy(a)
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3);
      sample(point.x, point.z);
    }
  }
  probe.material.dispose();
  if (!underside.length) throw new Error("Stone has no supported footprint");
  return { geometry, underside, bounds: bounds.clone() };
}

export function seatStone(profile, shape, { x, z, size, yaw, squash = 1 }) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(x, 0, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3(size, size * squash, size),
  );
  let base = Infinity,
    low = Infinity,
    high = -Infinity;
  const p = new THREE.Vector3();
  for (const point of shape.underside) {
    p.copy(point).applyMatrix4(matrix);
    const ground = profile.height(p.x, p.z);
    base = Math.min(base, ground - p.y);
    low = Math.min(low, ground);
    high = Math.max(high, ground);
  }
  const height = shape.bounds.max.y * size * squash;
  // Avoid bridging sharp banks or hiding almost the whole stone in a ridge.
  if (high - low > height * 0.7 + 0.08) return null;
  base -= Math.min(0.06, size * 0.04);
  const exposed = base + height - profile.height(x, z);
  if (exposed < Math.min(0.12, height * 0.22)) return null;
  matrix.elements[13] = base;
  return { matrix, position: new THREE.Vector3(x, base, z), exposed };
}
