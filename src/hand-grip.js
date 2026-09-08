import * as THREE from "three";
import { poseHands } from "./pose.js";

const FINGERS = ["Index", "Middle", "Ring", "Pinky", "Thumb"];
// Metres, calibrated against the delivered hand surface and 38 mm grips.
export const CABLE_GRIP = Object.freeze({
  knuckleHeight: 0.032,
  palmOffset: -0.028,
  palmTilt: 0.75,
  fingerRadius: 0.0363,
  thumbHeight: -0.031,
  thumbForward: 0.025,
});
const PAD_OFFSET = {
  Index: 0.0005,
  Middle: 0.0015,
  Ring: -0.0015,
  Pinky: -0.0043,
};

export function restoreCableGrip(game) {
  if (!game.rig?.gripBaseActive) return;
  for (const { bone, rotation } of game.rig.gripBase)
    bone.quaternion.copy(rotation);
  game.rig.gripBaseActive = false;
}

function worldRotation(bone, rotation) {
  bone.quaternion.copy(
    bone.parent
      .getWorldQuaternion(new THREE.Quaternion())
      .invert()
      .multiply(rotation),
  );
  bone.updateWorldMatrix(false, true);
}

function point(bone, localEnd, target, center, axis) {
  const origin = bone.getWorldPosition(new THREE.Vector3());
  if (center) {
    const localY = localEnd.clone().normalize(),
      localX = new THREE.Vector3(1, 0, 0);
    localX.addScaledVector(localY, -localX.dot(localY)).normalize();
    const localZ = localX.clone().cross(localY);
    const y = target.clone().sub(origin).normalize();
    const x = origin.clone().add(target).multiplyScalar(0.5).sub(center);
    x.addScaledVector(axis, -x.dot(axis));
    x.addScaledVector(y, -x.dot(y)).normalize();
    const z = x.clone().cross(y);
    const rotation = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(x, y, z),
    );
    rotation.multiply(
      new THREE.Quaternion()
        .setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(localX, localY, localZ),
        )
        .invert(),
    );
    worldRotation(bone, rotation);
    return;
  }
  const direction = bone.localToWorld(localEnd.clone()).sub(origin).normalize();
  const rotation = bone.getWorldQuaternion(new THREE.Quaternion());
  rotation.premultiply(
    new THREE.Quaternion().setFromUnitVectors(
      direction,
      target.clone().sub(origin).normalize(),
    ),
  );
  worldRotation(bone, rotation);
}

function gripHands(model) {
  const nodes = [];
  model.traverse((n) => {
    if (n.isBone) nodes.push(n);
  });
  return ["Left", "Right"].map((side, index) => {
    const hand = nodes.find((n) => n.name.endsWith(side + "Hand"));
    if (!hand) return null;
    const fingers = FINGERS.map((name) => ({
      name,
      bones: [1, 2, 3].map((i) =>
        nodes.find((n) => n.name.endsWith(side + "Hand" + name + i)),
      ),
      tip: new THREE.Vector3(0, name === "Pinky" ? 0.02 : 0.024, 0),
    }));
    if (fingers.some((f) => f.bones.some((b) => !b))) return null;
    const across = fingers[3].bones[0].position
      .clone()
      .sub(fingers[0].bones[0].position)
      .multiplyScalar(index ? -1 : 1)
      .normalize();
    const distal = fingers[1].bones[0].position.clone();
    distal.addScaledVector(across, -distal.dot(across)).normalize();
    const palm = across.clone().cross(distal).normalize();
    const localFrame = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(across, distal, palm),
    );
    return {
      hand,
      fingers,
      across,
      distal,
      palm,
      localFrame,
      sign: index ? -1 : 1,
    };
  });
}

function curlFingers(grip, center, axis, distal, palm) {
  for (const finger of grip.fingers.slice(0, 4)) {
    const root = finger.bones[0].getWorldPosition(new THREE.Vector3());
    const relative = root.clone().sub(center);
    const along = relative.dot(axis);
    const rootRadius = Math.hypot(relative.dot(distal), relative.dot(palm));
    const radius = CABLE_GRIP.fingerRadius + PAD_OFFSET[finger.name];
    let angle = Math.atan2(relative.dot(palm), relative.dot(distal));
    for (const [i, bone] of finger.bones.entries()) {
      const end = i < 2 ? finger.bones[i + 1].position : finger.tip;
      angle +=
        i === 0
          ? Math.acos(
              THREE.MathUtils.clamp(
                (rootRadius * rootRadius + radius * radius - end.lengthSq()) /
                  (2 * rootRadius * radius),
                -1,
                1,
              ),
            )
          : 2 * Math.asin(Math.min(0.98, end.length() / (2 * radius)));
      const target = center
        .clone()
        .addScaledVector(axis, along)
        .addScaledVector(distal, Math.cos(angle) * radius)
        .addScaledVector(palm, Math.sin(angle) * radius);
      point(bone, end, target, center, axis);
    }
  }
  const thumb = grip.fingers[4],
    [base, middle, end] = thumb.bones;
  const targetTip = center
    .clone()
    .addScaledVector(axis, -0.01 * grip.sign)
    .addScaledVector(distal, CABLE_GRIP.thumbHeight)
    .addScaledVector(palm, CABLE_GRIP.thumbForward);
  const target = targetTip
    .clone()
    .addScaledVector(axis, -thumb.tip.length() * grip.sign);
  const root = base.getWorldPosition(new THREE.Vector3());
  const direction = target.clone().sub(root);
  const a = middle.position.length(),
    b = end.position.length();
  const distance = THREE.MathUtils.clamp(
    direction.length(),
    0.001,
    (a + b) * 0.995,
  );
  direction.normalize();
  const along = (a * a - b * b + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, a * a - along * along));
  const pole = distal.clone().negate().addScaledVector(palm, -0.4);
  pole.addScaledVector(direction, -pole.dot(direction)).normalize();
  const bend = root
    .clone()
    .addScaledVector(direction, along)
    .addScaledVector(pole, height);
  point(base, middle.position, bend);
  point(middle, end.position, target);
  point(end, thumb.tip, targetTip);
}

// The handle is a palm contact, not a wrist target. Preserve bone lengths and
// fit each finger's phalanges around the cylinder after the base animation.
export function poseCableGrip(game, centers) {
  const cable = game.zipRide?.course.zipRig;
  if (!cable) return false;
  return poseCylinderGrip(
    game,
    centers,
    new THREE.Vector3(1, 0, 0).applyQuaternion(cable.hanger.quaternion),
    new THREE.Vector3(0, 1, 0),
  );
}

// Reuse the calibrated 38 mm finger contact for a differently oriented handle.
// Weight blends the reach/release; full weight maintains surface contact.
export function poseCylinderGrip(game, centers, axis, distal, weight = 1) {
  const rig = game.rig;
  if (!rig || !centers || weight <= 0) return false;
  const hands = (rig.gripHands ??= gripHands(rig.model));
  if (hands.some((h) => !h)) return false;
  rig.gripBase ??= hands
    .flatMap((h) => [
      h.hand.parent.parent,
      h.hand.parent,
      h.hand,
      ...h.fingers.flatMap((f) => f.bones),
    ])
    .map((bone) => ({ bone, rotation: new THREE.Quaternion() }));
  for (const { bone, rotation } of rig.gripBase) rotation.copy(bone.quaternion);
  rig.gripBaseActive = true;
  const palm = axis.clone().cross(distal).normalize(),
    handDistal = distal
      .clone()
      .multiplyScalar(Math.cos(CABLE_GRIP.palmTilt))
      .addScaledVector(palm, Math.sin(CABLE_GRIP.palmTilt)),
    handPalm = axis.clone().cross(handDistal),
    frame = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(axis, handDistal, handPalm),
    );
  const rotations = hands.map((h) =>
    frame.clone().multiply(h.localFrame.clone().invert()),
  );
  const wrists = hands.map((h, i) => {
    if (!centers[i]) return null;
    const knuckle = h.fingers[1].bones[0].position
      .clone()
      .applyQuaternion(rotations[i]);
    return centers[i]
      .clone()
      .addScaledVector(distal, CABLE_GRIP.knuckleHeight)
      .addScaledVector(palm, CABLE_GRIP.palmOffset)
      .sub(knuckle);
  });
  poseHands(game, wrists);
  for (const [i, h] of hands.entries()) {
    if (!centers[i]) continue;
    // Carry palm rotation through the forearm's axial twist instead of forcing
    // the entire change into the wrist skin. The wrist position stays fixed.
    const forearm = h.hand.parent;
    const forearmAxis = h.hand
      .getWorldPosition(new THREE.Vector3())
      .sub(forearm.getWorldPosition(new THREE.Vector3()))
      .normalize();
    const current = forearm.getWorldQuaternion(new THREE.Quaternion());
    const desired = rotations[i]
      .clone()
      .multiply(h.hand.quaternion.clone().invert());
    const from = new THREE.Vector3(1, 0, 0).applyQuaternion(current);
    const to = new THREE.Vector3(1, 0, 0).applyQuaternion(desired);
    from.addScaledVector(forearmAxis, -from.dot(forearmAxis)).normalize();
    to.addScaledVector(forearmAxis, -to.dot(forearmAxis)).normalize();
    const twist = THREE.MathUtils.clamp(
      Math.atan2(forearmAxis.dot(from.clone().cross(to)), from.dot(to)),
      -1.35,
      1.35,
    );
    worldRotation(
      forearm,
      current.premultiply(
        new THREE.Quaternion().setFromAxisAngle(forearmAxis, twist),
      ),
    );
    worldRotation(h.hand, rotations[i]);
    curlFingers(h, centers[i], axis, distal, palm);
  }
  if (weight < 1) {
    for (const { bone, rotation } of rig.gripBase)
      bone.quaternion.slerp(rotation, 1 - weight);
    rig.model.updateWorldMatrix(true, true);
  }
  return true;
}
