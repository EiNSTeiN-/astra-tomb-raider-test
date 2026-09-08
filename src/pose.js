import * as THREE from "three";
// Solve the upper arm and forearm after the base animation. World-space targets
// keep the hands attached while the player turns or the rope swings.
function pointBone(bone, child, target) {
  const origin = bone.getWorldPosition(new THREE.Vector3());
  const from = child
    .getWorldPosition(new THREE.Vector3())
    .sub(origin)
    .normalize();
  const to = target.clone().sub(origin).normalize();
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  world.premultiply(new THREE.Quaternion().setFromUnitVectors(from, to));
  const parent = bone.parent
    .getWorldQuaternion(new THREE.Quaternion())
    .invert();
  bone.quaternion.copy(parent.multiply(world));
  bone.updateWorldMatrix(false, true);
}
export function poseHands(game, target) {
  const rig = game.rig;
  if (!rig) return;
  rig.model.updateWorldMatrix(true, true);
  rig.arms ??= ["Left", "Right"].map((side) => {
    const nodes = [];
    rig.model.traverse((n) => {
      if (n.isBone) nodes.push(n);
    });
    return ["Arm", "ForeArm", "Hand"].map((part) =>
      nodes.find((n) => n.name.endsWith(side + part)),
    );
  });
  for (const [index, chain] of rig.arms.entries()) {
    if (Array.isArray(target) && !target[index]) continue;
    const [upper, lower, hand] = chain;
    if (!hand || !upper || !lower) continue;
    const shoulder = upper.getWorldPosition(new THREE.Vector3()),
      elbow = lower.getWorldPosition(new THREE.Vector3()),
      wrist = hand.getWorldPosition(new THREE.Vector3());
    const end = (Array.isArray(target) ? target[index] : target).clone();
    if (!Array.isArray(target))
      end.add(
        new THREE.Vector3(index ? -0.055 : 0.055, 0, 0).applyQuaternion(
          game.avatar.getWorldQuaternion(new THREE.Quaternion()),
        ),
      );
    const a = shoulder.distanceTo(elbow),
      b = elbow.distanceTo(wrist),
      direction = end.clone().sub(shoulder);
    const distance = Math.max(
      0.001,
      Math.min(direction.length(), (a + b) * 0.995),
    );
    direction.normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance),
      height = Math.sqrt(Math.max(0, a * a - along * along));
    const pole = new THREE.Vector3(index ? -1 : 1, 0, 0.45).applyQuaternion(
      game.avatar.getWorldQuaternion(new THREE.Quaternion()),
    );
    pole.addScaledVector(direction, -pole.dot(direction)).normalize();
    const bend = shoulder
      .clone()
      .addScaledVector(direction, along)
      .addScaledVector(pole, height);
    pointBone(upper, lower, bend);
    pointBone(lower, hand, end);
  }
}

export function poseFeet(game, targets) {
  const rig = game.rig;
  if (!rig) return;
  rig.model.updateWorldMatrix(true, true);
  rig.legs ??= ["Left", "Right"].map((side) => {
    const nodes = [];
    rig.model.traverse((n) => {
      if (n.isBone) nodes.push(n);
    });
    return ["UpLeg", "Leg", "Foot"].map((part) =>
      nodes.find((n) => n.name.endsWith(side + part)),
    );
  });
  for (const [i, [upper, lower, foot]] of rig.legs.entries()) {
    if (!upper || !lower || !foot) continue;
    const hip = upper.getWorldPosition(new THREE.Vector3()),
      knee = lower.getWorldPosition(new THREE.Vector3()),
      ankle = foot.getWorldPosition(new THREE.Vector3());
    const a = hip.distanceTo(knee),
      b = knee.distanceTo(ankle),
      end = targets[i],
      direction = end.clone().sub(hip),
      distance = Math.max(0.001, Math.min(direction.length(), (a + b) * 0.995));
    direction.normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance),
      height = Math.sqrt(Math.max(0, a * a - along * along));
    const pole = new THREE.Vector3(0, 0, 1).applyQuaternion(
      game.avatar.getWorldQuaternion(new THREE.Quaternion()),
    );
    pole.addScaledVector(direction, -pole.dot(direction)).normalize();
    pointBone(
      upper,
      lower,
      hip
        .clone()
        .addScaledVector(direction, along)
        .addScaledVector(pole, height),
    );
    pointBone(lower, foot, end);
  }
}
