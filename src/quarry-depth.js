import * as THREE from "three";

// The quarry's opaque facing stones overlap their solid core. Populate depth
// with the same static triangles before shading their textured surfaces, so
// hidden fragments can be rejected before running the sandstone shader.
export function addQuarryDepth(root) {
  const material = new THREE.MeshDepthMaterial({ colorWrite: false });
  material.name = "Quarry masonry depth";
  for (const mesh of [...root.children]) {
    if (!mesh.isMesh) continue;
    const depth = new THREE.Mesh(mesh.geometry, material);
    depth.name = "Quarry masonry depth prepass";
    mesh.updateMatrix();
    depth.matrix.copy(mesh.matrix);
    depth.matrixAutoUpdate = false;
    depth.layers.mask = mesh.layers.mask;
    depth.renderOrder = -1;
    depth.castShadow = false;
    depth.receiveShadow = false;
    depth.userData.quarryDepth = true;
    // The original meshes supply their normals and shadows. A normal-material
    // override would otherwise turn these colorless draws into visible surfaces.
    depth.userData.excludeContact = true;
    depth.raycast = () => {};
    root.add(depth);
  }
}
