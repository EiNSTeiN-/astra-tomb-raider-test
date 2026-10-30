import * as THREE from "three";
import { stationAssemblySolid } from "./field-station-solids.js";
import { NATURE_BODY_RADIUS } from "./nature-rock-solids.js";

// Keep the actual closed pieces before material batching releases them. The
// tablet is tilted, so bake every transform before the upright triangle kernel
// reads it. Transparent lettering is decoration, not a standing surface.
export function pressureFittedSolid(game, id, meshes) {
  const parts = [];
  for (const mesh of meshes) {
    if (!mesh.isMesh || [mesh.material].flat().some((m) => m.transparent))
      continue;
    mesh.updateWorldMatrix(true, false);
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    parts.push(new THREE.Mesh(geometry, null));
  }
  try {
    return stationAssemblySolid(game, { id }, parts, {
      bodyPadding: 0.65,
      // The wider posed-body margin needs side clearance when the movement
      // disk leaves a bevel. The controller resolves that finite edge contact.
      supportRadius: NATURE_BODY_RADIUS,
      layeredSupport: true,
    });
  } finally {
    for (const mesh of parts) mesh.geometry.dispose();
  }
}

export function pressureFurnitureSolid(game, bound, group) {
  const meshes = [];
  group.traverse((mesh) => {
    if (mesh.isMesh) meshes.push(mesh);
  });
  bound.station = pressureFittedSolid(
    game,
    `pressure-furniture-${game.pressureRelay.art.furniture.length}`,
    meshes,
  );
  return bound;
}
