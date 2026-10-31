import * as THREE from "three";
import { TriangleSolids } from "./triangle-solids.js";

// The delivered trunk is identical in all three detail tiers. Keep its authored
// transforms independent of the renderer's changing, packed instance buffers.
// Leaf cards and the separate fine-branch mesh remain soft scenery.
export class JungleTreeSolids extends TriangleSolids {
  constructor(patches, worldMatrix = new THREE.Matrix4()) {
    super(
      patches.flatMap((patch) =>
        patch.tiers[0]
          .filter((mesh) => /^island_tree_\d+$/.test(mesh.material.name))
          .map((mesh) => ({
            geometry: mesh.geometry,
            matrices: patch.matrices.map((matrix) =>
              worldMatrix.clone().multiply(matrix),
            ),
          })),
      ),
      { layeredSupport: true },
    );
    for (const solid of this.solids) solid.jungleTrunk = true;
  }
}
