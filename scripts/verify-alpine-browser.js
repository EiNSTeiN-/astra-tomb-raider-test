import * as THREE from "three";
import { verifyCalderaDepth } from "./verify-caldera-browser.js";

// The fitted foreland and both ranges must share depth ordering. Each reference
// retains its actual material, so snow/rock blending and fog are also compared.
export function verifyAlpineDepth(game) {
  return verifyCalderaDepth(game, {
    name: "Alpine foreland and ranges",
    names: ["Alpine foreland", "Alpine range 0", "Alpine range 1"],
    clipHeight: 10,
    clipCameraHeight: -30,
    createReference(source) {
      const view = Object.create(source.material);
      view.userData = {};
      const material = new THREE.MeshStandardMaterial().copy(view);
      material.defines = { ...source.material.defines };
      material.onBeforeCompile = source.material.onBeforeCompile;
      return material;
    },
  });
}
