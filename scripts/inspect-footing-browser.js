import * as THREE from "three";
import { animateExplorer } from "../src/explorer.js";
import { supportAt } from "../src/character-motion.js";

export function footingAnchor(game) {
  const candidates = game.map.paths
    .flat()
    .map((p) => ({ x: p.x * 7, z: p.z * 7 }));
  for (const p of candidates) {
    const gx =
        game.groundHeight(p.x + 0.5, p.z) - game.groundHeight(p.x - 0.5, p.z),
      gz =
        game.groundHeight(p.x, p.z + 0.5) - game.groundHeight(p.x, p.z - 0.5);
    const grade = Math.hypot(gx, gz);
    if (grade < 0.24 || grade > 0.4) continue;
    if (
      ![-1, 0, 1].every((dx) =>
        [-1, 0, 1].every((dz) => game.canMove(p.x + dx, p.z + dz, 0)),
      )
    )
      continue;
    if (
      game.map.features.some(
        (f) => Math.hypot(f.x * 7 - p.x, f.z * 7 - p.z) < 5,
      )
    )
      continue;
    return { ...p, yaw: Math.atan2(-gz, gx), grade };
  }
  throw Error("No clear review slope found");
}

export function inspectBoots(game) {
  const shoe = game.rig.model.getObjectByName("shoes04"),
    p = shoe.geometry.attributes.position,
    weights = shoe.geometry.attributes.skinWeight,
    indices = shoe.geometry.attributes.skinIndex,
    point = new THREE.Vector3();
  game.avatar.updateWorldMatrix(true, false);
  game.rig.model.updateMatrixWorld(true);
  const result = [
    { side: "Left", clearance: Infinity, samples: 0 },
    { side: "Right", clearance: Infinity, samples: 0 },
  ];
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0.035) continue;
    let joint = 0;
    for (let k = 1; k < 4; k++)
      if (weights.getComponent(i, k) > weights.getComponent(i, joint))
        joint = k;
    const side = shoe.skeleton.bones[
      indices.getComponent(i, joint)
    ].name.includes("Left")
      ? 0
      : 1;
    shoe.getVertexPosition(i, point).applyMatrix4(shoe.matrixWorld);
    const height = supportAt(
      game,
      point.x,
      point.z,
      game.player.position.y + 0.45,
    ).height;
    result[side].clearance = Math.min(result[side].clearance, point.y - height);
    result[side].samples++;
  }
  return result;
}

export function footingView(
  game,
  kind = "idle",
  anchor = footingAnchor(game),
  time = 0.3,
) {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  game.player.position.set(
    anchor.x,
    game.groundHeight(anchor.x, anchor.z),
    anchor.z,
  );
  game.avatar.rotation.y = anchor.yaw;
  Object.assign(game, {
    grounded: true,
    swimming: false,
    climb: null,
    ropeRide: null,
    zipRide: null,
    dodge: null,
    aimUntil: 0,
    elapsed: 10,
    jumpY: 0,
    velocityY: 0,
  });
  const clip = kind === "idle" ? "Idle" : kind === "run" ? "Run" : "Walk";
  game.rig.mixer.stopAllAction();
  game.rig.actions[clip].reset().play();
  game.rig.state = clip;
  game.rig.mixer.setTime(time);
  game.moveVelocity = {
    x: 0,
    z: kind === "idle" ? 0 : kind === "run" ? 6 : 2.4,
  };
  animateExplorer(game, 0, kind !== "idle", false);
  game.updateDecorations(0);
  const forward = new THREE.Vector3(
      Math.sin(anchor.yaw),
      0,
      Math.cos(anchor.yaw),
    ),
    side = new THREE.Vector3(forward.z, 0, -forward.x);
  game.camera.position
    .copy(game.player.position)
    .addScaledVector(forward, 3.3)
    .addScaledVector(side, 2.7).y += 1.5;
  game.camera.fov = 48;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  game.camera.lookAt(
    game.player.position.clone().add(new THREE.Vector3(0, 0.85, 0)),
  );
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    anchor,
    kind,
    boots: inspectBoots(game),
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}
