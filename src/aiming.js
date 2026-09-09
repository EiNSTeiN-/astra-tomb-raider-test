import * as THREE from "three";
import { boxEntry } from "./camera-collision.js";
import { cavernClear } from "./cavern-profile.js";
import { guardianRaycast } from "./guardian-ray.js";

export const SHOT_RANGE = 45;
export const aimShoulder = (camera) => Math.min(0.7, camera.aspect * 0.64);

export function canAim(game) {
  return !(
    game.paused ||
    game.active === false ||
    game.health <= 0 ||
    !game.grounded ||
    game.swimming ||
    game.diving ||
    game.carrying ||
    game.blockGrip ||
    game.fireVault?.operation ||
    game.pressureRelay?.operation ||
    game.climb ||
    game.ropeRide ||
    game.zipRide ||
    game.dodge ||
    [
      "orreryFocus",
      "bellFocus",
      "hydraulicFocus",
      "thermalFocus",
      "resonanceFocus",
      "windFocus",
      "cipherFocus",
    ].some((k) => game[k] != null)
  );
}

export function clearAim(game) {
  game.aimSources?.clear();
  game.aiming = false;
  game.aimUntil = 0;
  game.aimPoint = null;
  game.aimFeedback = null;
}

export function setAim(game, source, enabled) {
  game.aimSources ||= new Set();
  if (!enabled) game.aimSources.delete(source);
  else if (canAim(game)) game.aimSources.add(source);
  game.aiming = canAim(game) && game.aimSources.size > 0;
  if (game.aiming) {
    game.crouching = false;
    game.aimYaw = game.yaw;
    game.aimUntil = game.elapsed + 0.15;
  }
  return game.aiming;
}

export function updateAim(game) {
  if (!canAim(game)) {
    clearAim(game);
    return;
  }
  game.aiming = (game.aimSources?.size || 0) > 0;
  if (game.aiming) {
    game.aimYaw = game.yaw;
    game.aimUntil = game.elapsed + 0.15;
  } else game.aimPoint = null;
}

// Swept world-space cover test. Unlike walking clearance, the shot has no
// character radius and is allowed above low walls and across open space.
export function shotCover(game, from, to) {
  let fraction = game.cameraSurfaces?.entry(from, to, 0) ?? 1;
  for (const o of game.obstacles || []) {
    if (o.h <= 0.2) continue;
    const y = game.groundHeight(o.x, o.z);
    const entry = boxEntry(
      from,
      to,
      {
        min: { x: o.x - o.w, y, z: o.z - o.d },
        max: { x: o.x + o.w, y: y + o.h, z: o.z + o.d },
      },
      0,
      true,
    );
    if (entry !== null) fraction = Math.min(fraction, entry);
  }
  const steps = Math.max(1, Math.ceil(from.distanceTo(to) / 0.2));
  for (let i = 0; i <= steps && i / steps <= fraction; i++) {
    const p = from.clone().lerp(to, i / steps);
    if (
      p.y < game.groundHeight(p.x, p.z) + 0.02 ||
      !cavernClear(game, p.x, p.y, p.z, 0)
    ) {
      fraction = Math.min(fraction, Math.max(0, (i - 1) / steps));
      break;
    }
  }
  return fraction;
}

// Intersect the posed guardian meshes, including their limbs and equipment.
// Their authored skin bounds reject distant misses before triangle work.
export function traceShot(game, from, to) {
  const cover = shotCover(game, from, to);
  const direction = to.clone().sub(from),
    length = direction.length();
  const ray = new THREE.Raycaster(
    from,
    direction.normalize(),
    0,
    length * cover,
  );
  let target = null,
    distance = ray.far,
    point = from.clone().lerp(to, cover);
  for (const enemy of game.enemies || []) {
    if (
      enemy.hp <= 0 ||
      enemy.group.position.distanceTo(game.player.position) > SHOT_RANGE
    )
      continue;
    enemy.group.updateWorldMatrix(true, true);
    // SkinnedMesh updates its attached bind inverse in updateMatrixWorld;
    // updateWorldMatrix alone leaves ray hits at the previous render's pose.
    enemy.group.updateMatrixWorld(true);
    const meshes = enemy.art?.skins || [enemy.body];
    for (const mesh of meshes) {
      const hit = guardianRaycast(mesh, ray);
      if (hit && hit.distance < distance) {
        target = enemy;
        distance = hit.distance;
        point = hit.point;
        ray.far = distance;
      }
    }
  }
  return { target, point, distance, cover: !target && cover < 1 };
}

export function sightline(game) {
  game.camera.updateMatrixWorld(true);
  const from = game.camera.position.clone();
  const direction = game.camera.getWorldDirection(new THREE.Vector3());
  return traceShot(
    game,
    from,
    from
      .clone()
      .addScaledVector(
        direction,
        SHOT_RANGE + from.distanceTo(game.player.position),
      ),
  );
}

export function aimedShot(game) {
  const sight = sightline(game);
  const muzzle =
    game.rig?.weapon?.muzzle.getWorldPosition(new THREE.Vector3()) ||
    game.player.position.clone().add(new THREE.Vector3(0, 1.4, 0));
  // Extend just past the sight's surface so the muzzle ray reaches that face.
  const end = sight.point
    .clone()
    .addScaledVector(sight.point.clone().sub(muzzle).normalize(), 0.03);
  const shot = traceShot(game, muzzle, end);
  const body = game.player.position.clone().add(new THREE.Vector3(0, 1.35, 0));
  // A muzzle that clips through a wall must not fire from its other side.
  const bodyCover = shotCover(game, body, muzzle);
  if (bodyCover < 1) {
    shot.target = null;
    shot.point = body.clone().lerp(muzzle, bodyCover);
    shot.cover = true;
  }
  return {
    ...shot,
    muzzle,
    obstructed: shot.cover && shot.point.distanceTo(sight.point) > 0.12,
  };
}

export function aimState(game) {
  const feedback =
    game.aimFeedback && game.elapsed - game.aimFeedback.time < 0.35
      ? game.aimFeedback.kind
      : null;
  if (!game.aiming) return { active: false, feedback };
  const shot = aimedShot(game);
  return {
    active: true,
    target: !!shot.target,
    obstructed: shot.obstructed,
    feedback,
  };
}

export function addShotTrace(game, from, to, kind) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([from, to]),
    new THREE.LineBasicMaterial({
      color: kind === "shield" ? 0xa9d6f0 : 0xffd9a0,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  game.world.add(line);
  (game.shotTraces ||= []).push({ line, time: 0.1 });
  game.aimFeedback = { kind, time: game.elapsed };
}

export function updateShotTraces(game, dt) {
  for (const trace of [...(game.shotTraces || [])]) {
    trace.time -= dt;
    trace.line.material.opacity = Math.max(0, trace.time / 0.1) * 0.85;
    if (trace.time > 0) continue;
    trace.line.removeFromParent();
    trace.line.geometry.dispose();
    trace.line.material.dispose();
    game.shotTraces.splice(game.shotTraces.indexOf(trace), 1);
  }
}
