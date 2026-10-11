import { Vector3 } from "three";
import { terrainCameraClear } from "./camera-terrain-sight.js";
import { lowerBodyProbes } from "./explorer-terrain-pose.js";

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

// Read posed joints once per camera update. Small screen-facing margins keep
// clothing and boot edges away from a column, rather than checking only chest.
// The references belong to the rig and leave with it on character replacement.
export function cameraBodyTargets(game) {
  const rig = game.rig;
  if (!rig?.model) return [];
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

export function cameraBodyVisibility(surfaces, camera, targets, game) {
  if (!targets.length) return 1;
  let sceneryClear = 0,
    sceneryCount = 0,
    terrainClear = 0,
    terrainCount = 0;
  for (const { position, radius, terrainOnly } of targets) {
    const right = new Vector3(camera.z - position.z, 0, position.x - camera.x)
      .normalize()
      .multiplyScalar(radius);
    for (const side of radius === 0 ? [0] : [-1, 0, 1]) {
      const point = position.clone().addScaledVector(right, side);
      if (!terrainOnly) {
        sceneryCount++;
        if ((surfaces?.entry(point, camera, 0.02) ?? 1) >= 0.999999)
          sceneryClear++;
      }
      if (game?.groundHeight) {
        terrainCount++;
        if (terrainCameraClear(game, point, camera)) terrainClear++;
      }
    }
  }
  return Math.min(
    sceneryCount ? sceneryClear / sceneryCount : 1,
    terrainCount ? terrainClear / terrainCount : 1,
  );
}
