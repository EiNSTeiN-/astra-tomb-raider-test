import * as THREE from "three";
import { TriangleSolids } from "./triangle-solids.js";

export const NATURE_BODY_RADIUS = 0.55;

// The immutable authored matrices stay independent of packed LOD buffers.
export class NatureRockSolids extends TriangleSolids {
  constructor(patches, worldMatrix = new THREE.Matrix4()) {
    super(
      patches
        .filter((patch) => ["rock", "gravel"].includes(patch.kind))
        .map((patch) => ({
          geometry: patch.tiers[0][0].geometry,
          matrices: patch.matrices.map((matrix) =>
            worldMatrix.clone().multiply(matrix),
          ),
        })),
    );
    for (const solid of this.solids) solid.natureRock = true;
  }
}
