// Shared by the character animator and the post-animation handwheel pose.
// Facing must be chosen before fitting the boots to their world-space support.
import * as THREE from "three";
import { poseCylinderGrip } from "./hand-grip.js";
import { torchHandsBusy } from "./torch.js";

export function windHandsFree(game) {
  return (
    !game.paused &&
    game.health > 0 &&
    game.grounded &&
    !game.swimming &&
    !game.diving &&
    !game.crouching &&
    (game.rig?.crouchBlend || 0) < 0.05 &&
    !game.carrying &&
    !torchHandsBusy(game)
  );
}

export function activeWindGrip(game) {
  const grip = game.windGrip,
    site = game.windSites?.[grip?.stage];
  return !!(
    grip &&
    site &&
    windHandsFree(game) &&
    site.visualTime <= grip.until &&
    game.player.position.distanceTo(grip.position) <= 0.025
  );
}

export function poseWindGrip(game) {
  if (!game.rig || !activeWindGrip(game)) return false;
  const grip = game.windGrip,
    node = game.windSites[grip.stage].nodes[grip.index];
  node.wheel.updateWorldMatrix(true, true);
  return poseCylinderGrip(
    game,
    (grip.order || [0, 1]).map((index) =>
      node.handles[index].getWorldPosition(new THREE.Vector3()),
    ),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 1, 0),
  );
}
