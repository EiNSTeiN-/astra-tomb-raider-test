import * as THREE from "three";

// The carved square drum sweeps a circle while turning. Derive its full
// envelope from the delivered opaque vertices after batching, rather than
// retaining the empty corners of a box around the entire pillar assembly.
export function captureCipherRotor(game, body, rotor, material) {
  let radius = 0,
    low = Infinity,
    high = -Infinity;
  const point = new THREE.Vector3();
  for (const mesh of rotor.children) {
    if (!mesh.material.isMeshStandardMaterial || mesh.material.transparent)
      continue;
    mesh.updateMatrix();
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrix);
      radius = Math.max(radius, Math.hypot(point.x, point.z));
      low = Math.min(low, point.y);
      high = Math.max(high, point.y);
    }
  }
  const bounds = new THREE.Box3(
    new THREE.Vector3(-radius, low, -radius).add(rotor.position),
    new THREE.Vector3(radius, high, radius).add(rotor.position),
  );
  if (!game.cameraSurfaces) return bounds;
  const geometry = new THREE.CylinderGeometry(radius, radius, high - low, 16),
    proxy = new THREE.Mesh(geometry, material);
  proxy.position
    .copy(rotor.position)
    .add(new THREE.Vector3(0, (low + high) / 2, 0));
  body.add(proxy);
  game.cameraSurfaces.capture(proxy, { small: true, cylinderAxis: "y" });
  body.remove(proxy);
  geometry.dispose();
  return bounds;
}
