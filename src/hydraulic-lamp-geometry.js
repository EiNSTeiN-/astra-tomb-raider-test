import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Local to the existing pump pedestal. Both inner arm ends seat in the casting;
// the socket hides the lower glass pole without moving the status-light center.
export function hydraulicLampSupportGeometry() {
  const parts = [];
  const beam = (a, b, width, depth) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.clone().sub(start),
      geometry = new THREE.BoxGeometry(width, delta.length(), depth);
    geometry.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.normalize(),
      ),
    );
    geometry.translate(...start.add(end).multiplyScalar(0.5).toArray());
    const expanded = geometry.toNonIndexed();
    geometry.dispose();
    parts.push(expanded);
  };
  beam([0.035, 1.18, -0.035], [0.55, 1.43, -0.12], 0.06, 0.07);
  beam([0.14, 0.92, -0.12], [0.55, 1.4, -0.12], 0.04, 0.05);
  beam([0.55, 1.4, -0.12], [0.55, 1.54, -0.12], 0.06, 0.07);
  beam([0.55, 1.52, -0.12], [0.55, 1.52, 0], 0.055, 0.055);
  const cup = new THREE.LatheGeometry(
    [
      [0, 1.5],
      [0.07, 1.5],
      [0.12, 1.56],
      [0.125, 1.6],
      [0.1, 1.6],
      [0.085, 1.57],
      [0, 1.57],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    32,
  );
  cup.translate(0.55, 0, 0);
  parts.push(cup.toNonIndexed());
  cup.dispose();
  const geometry = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  geometry.name = "Pump status-lamp bracket and socket";
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
