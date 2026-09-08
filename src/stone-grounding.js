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
export function stoneFootprint(geometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox,
    probe = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    ),
    ray = new THREE.Raycaster(),
    underside = [];
  for (let iz = 1; iz <= 7; iz++)
    for (let ix = 1; ix <= 7; ix++) {
      const x = THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, ix / 8),
        z = THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, iz / 8);
      ray.set(new THREE.Vector3(x, -1, z), new THREE.Vector3(0, 1, 0));
      const hit = ray.intersectObject(probe)[0];
      if (hit) underside.push(hit.point.clone());
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
