import { Vector3 } from "three";
import { terrainCameraClear } from "./camera-terrain-sight.js";
import { lowerBodyProbes } from "./explorer-terrain-pose.js";
import { galleryCameraSight } from "./gallery-camera-sight.js";
import { explorerCameraProbes } from "./explorer-camera-probes.js";

const JOINTS = [
  ["Head", 0.14],
  ["Spine2", 0.18],
  ["Hips", 0.22],
  ...["Left", "Right"].flatMap((side) => [
    [side + "Arm", 0.09],
    [side + "ForeArm", 0.09],
    [side + "Hand", 0.08],
    [side + "Leg", 0.14],
    [side + "Foot", 0.1],
    [side + "ToeBase", 0.1],
  ]),
];
const CENTRE = [[0, 0]],
  HORIZONTAL = [
    [-1, 0],
    [0, 0],
    [1, 0],
  ],
  SILHOUETTE = [...HORIZONTAL, [0, -1], [0, 1]];

// Read posed joints once per camera update. Small screen-facing margins keep
// clothing and boot edges away from a column, rather than checking only chest.
// The references belong to the rig and leave with it on character replacement.
export function cameraBodyTargets(game) {
  const rig = game.rig;
  if (!rig?.model) return [];
  const wheelContact =
    !!game.sunkenGallery?.operation || rig.wheelBrace > 0.001;
  // Refresh attached-skin inverse bindings as well as bone world transforms.
  // updateWorldMatrix alone leaves those inverses at the last draw, displacing
  // CPU skin samples when the explorer moves between renders.
  rig.model.parent?.updateWorldMatrix(true, false);
  rig.model.updateMatrixWorld(true);
  rig.cameraBodyBones ??= JOINTS.map(([suffix, radius]) => {
    let bone;
    rig.model.traverse((node) => {
      if (node.isBone && node.name.endsWith(suffix)) bone = node;
    });
    return bone ? { bone, radius } : null;
  }).filter(Boolean);
  const targets = rig.cameraBodyBones.map(({ bone, radius }) => ({
    position: bone.getWorldPosition(new Vector3()),
    radius,
    wheelContact: wheelContact && /(?:Arm|ForeArm|Hand)$/.test(bone.name),
  }));
  // Fitted boots can extend downhill beyond their ankle joints. Their actual
  // posed perimeter must stay in view as well; a clear bone proxy can still
  // leave the visible outsole behind the foreground bank.
  for (const foot of rig.grounding?.active ? rig.grounding.feet : []) {
    foot.cameraIndices ??= (() => {
      const position = foot.shoe.geometry.attributes.position,
        cells = new Map();
      for (const i of foot.clearanceIndices || []) {
        const key = `${Math.floor(position.getX(i) / 0.05)},${Math.floor(position.getZ(i) / 0.05)}`,
          previous = cells.get(key);
        if (
          previous === undefined ||
          position.getY(i) < position.getY(previous)
        )
          cells.set(key, i);
      }
      return [...new Set([...foot.indices, ...cells.values()])];
    })();
    for (const index of foot.cameraIndices)
      targets.push({
        position: foot.shoe
          .getVertexPosition(index, new Vector3())
          .applyMatrix4(foot.shoe.matrixWorld),
        radius: 0,
      });
  }
  if (game.swimming || game.diving) {
    rig.cameraSwimmerProbes ??= explorerCameraProbes(rig.model);
    for (const { mesh, index } of rig.cameraSwimmerProbes)
      targets.push({
        position: mesh
          .getVertexPosition(index, new Vector3())
          .applyMatrix4(mesh.matrixWorld),
        radius: 0,
        galleryOnly: true,
        wheelContact,
      });
    return targets;
  }
  // These extra skin samples protect dry trousers from a foreground terrain
  // bank. A submerged body uses its posed joints and the gallery surfaces;
  // the outdoor terrain above that interior is not its visible floor.
  rig.cameraTerrainProbes ??= lowerBodyProbes(rig.model);
  for (const { mesh, index } of rig.cameraTerrainProbes)
    targets.push({
      position: mesh
        .getVertexPosition(index, new Vector3())
        .applyMatrix4(mesh.matrixWorld),
      radius: 0,
      terrainOnly: true,
    });
  return targets;
}

export function cameraBodyVisibility(
  surfaces,
  camera,
  targets,
  game,
  requireFull = false,
) {
  if (!targets.length) return 1;
  let sceneryClear = 0,
    sceneryCount = 0,
    terrainClear = 0,
    terrainCount = 0;
  for (const {
    position,
    radius,
    terrainOnly,
    galleryOnly,
    wheelContact,
  } of targets) {
    const right = new Vector3(camera.z - position.z, 0, position.x - camera.x)
        .normalize()
        .multiplyScalar(radius),
      vertical =
        radius && (game?.swimming || game?.diving)
          ? new Vector3()
              .subVectors(camera, position)
              .normalize()
              .cross(right)
              .normalize()
              .multiplyScalar(radius)
          : null,
      margins =
        radius === 0 ? CENTRE : vertical?.lengthSq() ? SILHOUETTE : HORIZONTAL;
    for (const [side, up] of margins) {
      const point = position.clone().addScaledVector(right, side);
      if (up) point.addScaledVector(vertical, up);
      if (!terrainOnly) {
        sceneryCount++;
        const clear =
          (surfaces?.entry(point, camera, 0.02) ?? 1) >= 0.999999 &&
          (game?.jungleTreeSolids?.entry(point, camera) ?? 1) >= 0.999999 &&
          galleryCameraSight(game, point, camera, wheelContact);
        if (requireFull && !clear) return 0;
        if (clear) sceneryClear++;
      }
      if (game?.groundHeight && !galleryOnly) {
        terrainCount++;
        const clear = terrainCameraClear(game, point, camera);
        if (requireFull && !clear) return 0;
        if (clear) terrainClear++;
      }
    }
  }
  return Math.min(
    sceneryCount ? sceneryClear / sceneryCount : 1,
    terrainCount ? terrainClear / terrainCount : 1,
  );
}
