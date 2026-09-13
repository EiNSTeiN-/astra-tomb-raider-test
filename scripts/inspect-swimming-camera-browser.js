// Assisted camera review with ordinary player motion and disposable progress.
// Enemy AI is not stepped. Pair these paths with native input/save checks.
import * as THREE from "three";
import { waterAt } from "../src/hydrology.js";
import { restoreWaterArrival } from "../src/water-motion.js";

export function prepareSwimmingCamera(game, index, quality = "high") {
  const water = game.waterMeshes.filter((w) => w.userData.shore)[index];
  const x = water.position.x,
    z = water.position.z - 8;
  if (!game.canMove(x, z, 0)) throw new Error("Pool approach is obstructed");
  game.player.position.set(x, game.groundHeight(x, z), z);
  Object.assign(game, {
    yaw: 0,
    pitch: 0.2,
    jumpY: 0,
    velocityY: 0,
    grounded: true,
    swimming: false,
    diving: false,
    airVelocity: { x: 0, z: 0 },
    moveVelocity: null,
    motionLanding: null,
    jumpBuffer: 0,
    coyote: 0,
    fallPeak: game.player.position.y,
    cameraFollowTarget: null,
  });
  game.keys.clear();
  game.store.data.settings.quality = quality;
  game.applySettings();
  restoreWaterArrival(game);
  game.updateCamera(10);
  return {
    site: water.userData.id,
    position: game.player.position.toArray(),
    waterY: water.position.y,
  };
}

export function advanceSwimmingCamera(game, frame) {
  game.keys.clear();
  if (frame < 155) game.keys.add("KeyS");
  else if (frame >= 175 && frame < 220) game.keys.add("KeyA");
  else if (frame >= 220 && frame < 350) game.keys.add("KeyW");
  game.elapsed += 1 / 60;
  game.updatePlayer(1 / 60);
  game.updateCamera(1 / 60);
  game.updateDecorations(1 / 60);
  const target = game.player.position.clone().add(new THREE.Vector3(0, 1.3, 0)),
    delta = target.clone().sub(game.camera.position),
    arm = delta.length(),
    expected = new THREE.Vector3(
      0,
      -Math.sin(game.pitch) * 5.3 - 0.2,
      -Math.cos(game.pitch) * 5.3,
    ).normalize();
  const ray = new THREE.Raycaster(
    game.camera.position,
    delta.normalize(),
    0.12,
    Math.max(0.12, arm - 0.03),
  );
  game.world.updateMatrixWorld(true);
  const crystals = game.resonanceSites.flatMap((s) =>
      s.nodes.map((n) => n.crystal),
    ),
    hits =
      arm > 0.15
        ? ray
            .intersectObjects(crystals, false)
            .map((h) => ({ distance: h.distance, point: h.point.toArray() }))
        : [];
  return {
    frame,
    player: game.player.position.toArray(),
    camera: game.camera.position.toArray(),
    arm,
    headingDot: game.camera
      .getWorldDirection(new THREE.Vector3())
      .dot(expected),
    coverage: game.rig.visibility.uniform.value,
    yaw: game.yaw,
    pitch: game.pitch,
    swimming: game.swimming,
    depth:
      waterAt(game, game.player.position.x, game.player.position.z)?.depth || 0,
    entry: game.cameraSurfaces.entry(target, game.camera.position, 0),
    hits,
    health: game.health,
  };
}
