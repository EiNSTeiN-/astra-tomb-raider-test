import * as THREE from "three";
import { inspectExplorerCamera } from "./inspect-explorer-camera-browser.js";

// Independent rays against delivered posed armor, rather than the camera's
// bone bounds. Bake nearby visible rigid skins into disposable world meshes.
export function inspectGuardianCamera(game, columns = 16, rows = 24) {
  game.world.updateMatrixWorld(true);
  const geometry = [],
    meshes = [],
    material = new THREE.MeshBasicMaterial();
  const point = new THREE.Vector3();
  try {
    for (const enemy of game.enemies || []) {
      const rig = enemy.art;
      if (!rig || enemy.group.position.distanceTo(game.camera.position) > 14)
        continue;
      let visible = true;
      for (let node = rig.model; node; node = node.parent)
        visible &&= node.visible;
      if (!visible) continue;
      rig.skeleton.update();
      for (const skin of rig.skins) {
        const p = skin.geometry.attributes.position,
          positions = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) {
          skin.getVertexPosition(i, point).applyMatrix4(skin.matrixWorld);
          positions.set(point.toArray(), i * 3);
        }
        const g = new THREE.BufferGeometry();
        geometry.push(g);
        g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        if (skin.geometry.index) g.setIndex(skin.geometry.index.clone());
        g.computeBoundingBox();
        g.computeBoundingSphere();
        const mesh = new THREE.Mesh(g, material);
        mesh.name = `${enemy.id}/${skin.name}`;
        meshes.push(mesh);
      }
    }
    return {
      ...inspectExplorerCamera(game, meshes, columns, rows),
      guardianMeshes: meshes.length,
    };
  } finally {
    for (const g of geometry) g.dispose();
    material.dispose();
  }
}
