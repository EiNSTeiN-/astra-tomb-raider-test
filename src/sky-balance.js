import * as THREE from "three";
import { poseHands } from "./pose.js";
import { CROUCH_DROP } from "./stealth.js";

export function poseSkyBalance(game, dt) {
  const rig = game.rig;
  if (!rig) return;
  const wind = game.skyWind,
    available =
      wind &&
      game.grounded &&
      !game.carrying &&
      !game.aiming &&
      !(game.aimUntil > game.elapsed) &&
      !game.dodge &&
      !game.blockGrip &&
      !game.progress?.torch,
    target = available ? Math.min(1, Math.abs(wind.force) / 1.2) : 0;
  rig.skyBalance = THREE.MathUtils.damp(rig.skyBalance || 0, target, 9, dt);
  if (rig.skyBalance < 0.005 || !available) return;
  rig.skyBalanceHands ??= ["LeftHand", "RightHand"].map((name) => {
    let result;
    rig.model.traverse((b) => {
      if (b.isBone && b.name.endsWith(name)) result = b;
    });
    return result;
  });
  if (rig.skyBalanceHands.some((h) => !h)) return;
  const rotation = game.avatar.getWorldQuaternion(new THREE.Quaternion()),
    drop = CROUCH_DROP * (rig.crouchBlend || 0),
    targets = rig.skyBalanceHands.map((hand, i) => {
      const brace = new THREE.Vector3(i ? -0.47 : 0.47, 1.15 - drop, 0.17)
        .applyQuaternion(rotation)
        .add(game.player.position);
      return hand
        .getWorldPosition(new THREE.Vector3())
        .lerp(brace, rig.skyBalance);
    });
  poseHands(game, targets);
}
