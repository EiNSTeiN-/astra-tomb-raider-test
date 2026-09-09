import * as THREE from "three";
import { poseHands } from "./pose.js";
import { handSkeleton, aimHandBone, setHandRotation } from "./hand-grip.js";

export function restoreCrouchHands(game) {
  const state = game.rig?.crouchHands;
  if (!state?.active) return;
  for (const { bone, rotation } of state.base) bone.quaternion.copy(rotation);
  state.active = false;
}

function handState(rig) {
  const hands = handSkeleton(rig.model);
  if (hands.some((h) => !h)) return null;
  return {
    hands,
    swing: 0,
    active: false,
    base: hands
      .flatMap((h) => [
        h.hand.parent.parent,
        h.hand.parent,
        h.hand,
        ...h.fingers.flatMap((f) => f.bones),
      ])
      .map((bone) => ({ bone, rotation: new THREE.Quaternion() })),
  };
}

export function poseCrouchHands(game, dt, walking) {
  const rig = game.rig,
    weight = rig?.crouchBlend || 0;
  if (weight <= 0.001) return;
  const state = (rig.crouchHands ??= handState(rig));
  if (!state) return;
  for (const { bone, rotation } of state.base) rotation.copy(bone.quaternion);
  state.active = true;
  state.swing = THREE.MathUtils.damp(state.swing, walking ? 1 : 0, 10, dt);
  const walk = rig.actions.Walk;
  // Clip phase stops advancing with the walking action; elapsed world time does not.
  const phase = (walk.time / walk.getClip().duration) * Math.PI * 2;
  const rotation = game.avatar.getWorldQuaternion(new THREE.Quaternion());
  rig.model.updateWorldMatrix(true, true);
  const targets = state.hands.map((h, i) => {
    const side = i ? -1 : 1,
      stride = Math.sin(phase + i * Math.PI) * state.swing;
    const p = new THREE.Vector3(side * 0.27, 0, 0.43 + stride * 0.055)
      .applyQuaternion(rotation)
      .add(game.player.position);
    p.y =
      h.hand.parent.parent.getWorldPosition(new THREE.Vector3()).y -
      0.25 +
      stride * 0.012;
    return p;
  });
  poseHands(game, targets, [
    new THREE.Vector3(0.3, -1, -0.5),
    new THREE.Vector3(-0.3, -1, -0.5),
  ]);
  for (const [i, h] of state.hands.entries()) {
    const side = i ? -1 : 1;
    const distal = new THREE.Vector3(0, -0.65, 0.76)
      .normalize()
      .applyQuaternion(rotation);
    const palm = new THREE.Vector3(-side, 0, 0).applyQuaternion(rotation);
    const across = distal.clone().cross(palm).normalize();
    const desired = new THREE.Quaternion()
      .setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(across, distal, palm),
      )
      .multiply(h.localFrame.clone().invert());
    // Share axial rotation with the forearm to avoid winding the wrist skin.
    const forearm = h.hand.parent;
    const axis = h.hand
      .getWorldPosition(new THREE.Vector3())
      .sub(forearm.getWorldPosition(new THREE.Vector3()))
      .normalize();
    const current = forearm.getWorldQuaternion(new THREE.Quaternion());
    const wanted = desired.clone().multiply(h.hand.quaternion.clone().invert());
    const from = new THREE.Vector3(1, 0, 0).applyQuaternion(current);
    const to = new THREE.Vector3(1, 0, 0).applyQuaternion(wanted);
    from.addScaledVector(axis, -from.dot(axis)).normalize();
    to.addScaledVector(axis, -to.dot(axis)).normalize();
    const twist = THREE.MathUtils.clamp(
      Math.atan2(axis.dot(from.clone().cross(to)), from.dot(to)),
      -1.35,
      1.35,
    );
    setHandRotation(
      forearm,
      current.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, twist)),
    );
    setHandRotation(h.hand, desired);
    for (const [f, finger] of h.fingers.slice(0, 4).entries()) {
      let curl = 0;
      for (const [joint, bone] of finger.bones.entries()) {
        curl += [0.24 + f * 0.045, 0.42 + f * 0.025, 0.24][joint];
        const end = joint < 2 ? finger.bones[joint + 1].position : finger.tip;
        const target = bone
          .getWorldPosition(new THREE.Vector3())
          .addScaledVector(distal, Math.cos(curl) * end.length())
          .addScaledVector(palm, Math.sin(curl) * end.length());
        aimHandBone(bone, end, target);
      }
    }
    // Rest the thumb beside the index finger instead of retaining the clip's fan.
    const thumb = h.fingers[4];
    for (const [joint, bone] of thumb.bones.entries()) {
      const end = joint < 2 ? thumb.bones[joint + 1].position : thumb.tip;
      const direction = distal
        .clone()
        .addScaledVector(palm, 0.28 + joint * 0.16)
        .addScaledVector(across, side * (0.4 - joint * 0.12))
        .normalize();
      aimHandBone(
        bone,
        end,
        bone
          .getWorldPosition(new THREE.Vector3())
          .addScaledVector(direction, end.length()),
      );
    }
  }
  // Blend every joint, including wrists and fingers, into and out of the overlay.
  for (const { bone, rotation } of state.base)
    bone.quaternion.slerp(rotation, 1 - weight);
  rig.model.updateWorldMatrix(true, true);
}
