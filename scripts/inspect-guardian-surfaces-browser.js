// Development-only inspection of posed guardians in actual chapter lighting.
// The caller loads a chapter and captures each returned viewpoint. Positioning
// is assisted; these views do not constitute a full chapter visual audit.
import * as THREE from "three";
import { animateGuardian } from "../src/guardian-art.js";
import { constrainCamera } from "../src/camera-collision.js";
import { updateAtmosphere } from "../src/atmosphere.js";

export function frameGuardianSurface(game, enemy, state = "windup") {
  const p = enemy.group.position,
    focus = p.clone().add(new THREE.Vector3(0, 1.85 * enemy.art.scale, 0));
  let eye = null,
    distance = 0;
  for (let i = 0; i < 24; i++) {
    const angle = (i * Math.PI) / 12,
      desired = focus
        .clone()
        .add(new THREE.Vector3(Math.sin(angle) * 6, 1, Math.cos(angle) * 6)),
      candidate = constrainCamera(
        focus,
        desired,
        game.cameraSurfaces,
        (v) =>
          v.y > game.groundHeight(v.x, v.z) + 0.3 &&
          game.canMove(v.x, v.z, v.y - game.groundHeight(v.x, v.z)),
      ),
      d = candidate.distanceTo(focus);
    if (d > distance) {
      eye = candidate;
      distance = d;
    }
    if (d > 6) break;
  }
  if (!eye || distance < 3)
    throw Error(`No clear guardian viewpoint: ${enemy.id}`);
  game.player.position.set(eye.x, game.groundHeight(eye.x, eye.z), eye.z);
  game.avatar.visible = false;
  enemy.group.rotation.y = Math.atan2(eye.x - p.x, eye.z - p.z);
  enemy.state = state;
  enemy.timer =
    state === "windup" ? enemy.spec.windup * 0.4 : enemy.spec.recovery * 0.5;
  game.camera.position.copy(eye);
  game.camera.lookAt(focus);
  game.camera.updateMatrixWorld();
  // Set the camera first: animation skips footing for distant, culled models.
  // This fixture turns a stationary enemy instantly, so start its feet in the
  // requested facing rather than carrying planted contacts across that turn.
  enemy.art.feet = null;
  enemy.art.step = null;
  animateGuardian(game, enemy, 1 / 60);
  updateAtmosphere(game, focus);
  return {
    enemy: enemy.id,
    kind: enemy.kind,
    eye: eye.toArray(),
    target: focus.toArray(),
    clearance: distance,
  };
}

export function guardianSurfaceState(game, enemy) {
  const gl = game.renderer.getContext();
  return {
    chapter: game.level.id,
    kind: enemy.kind,
    tier: enemy.art.tier,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    finiteBones: Array.from(enemy.art.skeleton.boneMatrices).every(
      Number.isFinite,
    ),
    draws: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    skins: enemy.art.skins.length,
    surfaceBytes: enemy.art.tiers
      .flat()
      .reduce(
        (sum, g) => sum + g.attributes.guardianSurface.array.byteLength,
        0,
      ),
  };
}
