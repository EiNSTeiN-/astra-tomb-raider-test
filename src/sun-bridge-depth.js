import * as THREE from "three";

const cameraPosition = new THREE.Vector3();

export function updateSunBridgeDepth(game) {
  const h = game.sunBridge;
  if (!h) return;
  game.camera.getWorldPosition(cameraPosition);
  const near =
    (cameraPosition.x - h.x) ** 2 +
      (cameraPosition.y - h.y - 6) ** 2 +
      (cameraPosition.z - h.z) ** 2 <=
    40 ** 2;
  for (const depth of h.depthDraws) depth.visible = near;
}

// The fitted paving, core blocks and truss members overlap. Draw their exact
// depth first so hidden fragments do not run the textured lighting shaders.
export function addSunBridgeDepth(game) {
  const kit = game.world.userData.sunConstructionMaterials,
    roots = [
      game.sunBridge.root,
      ...game.items
        .filter((f) => f.sunHeight !== undefined)
        .map((f) => f.group),
    ],
    sources = [];
  for (const root of roots)
    root.traverse((mesh) => {
      if (
        mesh.isMesh &&
        (mesh.material === kit.stone || mesh.material === kit.wood)
      )
        sources.push(mesh);
    });
  const material = new THREE.MeshDepthMaterial({ colorWrite: false });
  material.name = "Hanging garden stone and timber depth";
  return sources.map((source) => {
    const depth = new THREE.Mesh(source.geometry, material);
    depth.name = "Hanging garden depth prepass";
    depth.layers.mask = source.layers.mask;
    depth.renderOrder = -1;
    depth.castShadow = depth.receiveShadow = false;
    depth.userData.sunDepth = true;
    depth.userData.excludeContact = true;
    depth.raycast = () => {};
    // Identity under the color mesh follows its current transform and visibility,
    // including the rotating spans, rising return walk and counterweight.
    depth.matrixAutoUpdate = false;
    source.add(depth);
    return depth;
  });
}
