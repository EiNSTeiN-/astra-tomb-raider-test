import * as THREE from "three";
import { courtWalkingHeight } from "./court-dais-rules.js";

const contacts = new WeakMap();
const up = new THREE.Vector3(0, 1, 0);

// Cache both delivered detail tiers in ankle space. Keep the real sole bevels
// and projecting metal fittings; a rectangle or ankle sample misses step edges.
export function guardianFootContactPoints(geometries, bone, inverse) {
  let cache = contacts.get(geometries[0]);
  if (!cache) contacts.set(geometries[0], (cache = new Map()));
  if (cache.has(bone)) return cache.get(bone);
  const unique = new Map();
  for (const geometry of geometries) {
    const { position, skinIndex } = geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      if (skinIndex.getX(i) !== bone) continue;
      const point = new THREE.Vector3()
        .fromBufferAttribute(position, i)
        .applyMatrix4(inverse);
      const key = point
        .toArray()
        .map((n) => n.toFixed(5))
        .join(",");
      if (!unique.has(key)) unique.set(key, point);
    }
  }
  const points = [...unique.values()];
  cache.set(bone, points);
  return points;
}

export function guardianFootHeight(game, position, rotation, points, scale) {
  const offset = new THREE.Vector3();
  let height = -Infinity;
  for (const point of points) {
    offset.copy(point).multiplyScalar(scale).applyQuaternion(rotation);
    height = Math.max(
      height,
      courtWalkingHeight(game, position.x + offset.x, position.z + offset.z) -
        offset.y,
    );
  }
  return height + 0.003;
}

export function fitGuardianFoot(game, position, heading, points, scale) {
  const radius = 0.24 * scale,
    floor = (dx, dz) =>
      courtWalkingHeight(game, position.x + dx, position.z + dz),
    slope = new THREE.Vector2(
      (floor(radius, 0) - floor(-radius, 0)) / (2 * radius),
      (floor(0, radius) - floor(0, -radius)) / (2 * radius),
    );
  // A discontinuous tread must not turn a mechanical ankle beyond 45 degrees.
  if (slope.length() > 1) slope.normalize();
  const normal = new THREE.Vector3(-slope.x, 1, -slope.y).normalize(),
    rotation = new THREE.Quaternion()
      .setFromUnitVectors(up, normal)
      .multiply(heading);
  position.y = guardianFootHeight(game, position, rotation, points, scale);
  return { position, rotation };
}
