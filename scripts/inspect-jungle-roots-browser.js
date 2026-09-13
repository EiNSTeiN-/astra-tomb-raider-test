import * as THREE from "three";
import { rockGroundHeight } from "../src/nature-rocks.js";
import { jungleTreeAllowed } from "../src/jungle-grounding.js";

// Read the delivered, normalized patch geometry at every distance tier, including
// tiers currently hidden by LOD. Branch bottoms must not enter a root audit.
export function inspectJungleRoots(game) {
  const records = [],
    point = new THREE.Vector3();
  for (const [region, patches] of [
    ["woodland", game.forestPatches],
    ["fringe", game.jungleFringe.patches],
  ]) {
    const height =
      region === "woodland"
        ? (x, z) => rockGroundHeight(game.terrainProfile, x, z)
        : game.jungleFringe.height;
    for (const [patchIndex, patch] of patches.entries())
      for (const [tier, meshes] of patch.tiers.entries())
        for (const mesh of meshes) {
          if (!/^island_tree_\d+$/.test(mesh.material.name)) continue;
          mesh.geometry.computeBoundingBox();
          const p = mesh.geometry.attributes.position,
            bottom = mesh.geometry.boundingBox.min.y,
            roots = new Map();
          for (let i = 0; i < p.count; i++)
            if (p.getY(i) - bottom < 0.24) {
              const v = new THREE.Vector3().fromBufferAttribute(p, i);
              roots.set(v.toArray().join(), v);
            }
          for (const [instance, matrix] of patch.matrices.entries()) {
            let gap = -Infinity,
              missing = 0;
            for (const root of roots.values()) {
              point.copy(root).applyMatrix4(matrix);
              const ground = height(point.x, point.z);
              if (!Number.isFinite(ground)) missing++;
              gap = Math.max(gap, point.y - ground);
            }
            records.push({
              region,
              patch: patchIndex,
              tier,
              instance,
              material: mesh.material.name,
              samples: roots.size,
              gap,
              missing,
              position: [
                matrix.elements[12],
                matrix.elements[13],
                matrix.elements[14],
              ],
            });
          }
        }
  }
  return {
    woodland: game.woodland.length,
    fringe: game.jungleFringe.trees.length,
    records,
    reserved: game.woodland.filter(
      (tree) => !jungleTreeAllowed(game, tree.x, tree.z, tree.radius),
    ),
  };
}
