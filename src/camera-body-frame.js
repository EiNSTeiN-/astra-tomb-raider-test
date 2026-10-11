import { Vector3 } from "three";

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
  return rig.cameraBodyBones.map(({ bone, radius }) => ({
    position: bone.getWorldPosition(new Vector3()),
    radius,
  }));
}

export function cameraBodyVisibility(surfaces, camera, targets) {
  if (!targets.length || !surfaces) return 1;
  let clear = 0,
    count = 0;
  for (const { position, radius } of targets) {
    const right = new Vector3(camera.z - position.z, 0, position.x - camera.x)
      .normalize()
      .multiplyScalar(radius);
    for (const side of [-1, 0, 1]) {
      const point = position.clone().addScaledVector(right, side);
      count++;
      if (surfaces.entry(point, camera, 0.02) >= 0.999999) clear++;
    }
  }
  return clear / count;
}
