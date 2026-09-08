// Development-only encounter fixtures. Positions and sight alignment are supplied;
// native controls can then test firing. Use disposable progress, with the loop stopped.
import * as THREE from "three";
import { animateExplorer } from "../src/explorer.js";
import { animateGuardian } from "../src/guardian-art.js";
import {
  clearAim,
  aimShoulder,
  setAim,
  sightline,
  aimState,
  updateShotTraces,
} from "../src/aiming.js";

export function stepAim(game, frames = 1) {
  for (let i = 0; i < frames; i++) {
    game.elapsed += 1 / 60;
    game.updatePlayer(1 / 60);
    game.updateCamera(1 / 60);
    for (const enemy of game.enemies)
      if (enemy.hp > 0) animateGuardian(game, enemy, 1 / 60);
    game.attackCooldown = Math.max(0, game.attackCooldown - 1 / 60);
    updateShotTraces(game, 1 / 60);
  }
  game.renderScene(0);
  game.cb.update(game.state());
}

export function aimAtGuardian(game, enemy) {
  const point = enemy.core.getWorldPosition(new THREE.Vector3());
  // Account for the lateral shoulder shift, then settle the real follow camera.
  for (let pass = 0; pass < 5; pass++) {
    const from = game.player.position
      .clone()
      .add(
        new THREE.Vector3(
          Math.cos(game.yaw) * aimShoulder(game.camera),
          1.48,
          -Math.sin(game.yaw) * aimShoulder(game.camera),
        ),
      );
    const d = point.clone().sub(from);
    game.yaw = Math.atan2(-d.x, -d.z);
    game.pitch = Math.atan2(-d.y, Math.hypot(d.x, d.z));
    game.updateCamera(1);
  }
  animateGuardian(game, enemy, 0);
  game.aimYaw = game.yaw;
  game.aimPoint = point;
  animateExplorer(game, 1 / 60, false, false);
  game.renderScene(0);
  game.cb.update(game.state());
  return sightline(game).target?.id;
}

export function prepareAimEncounter(game, index = 0, radius = 4) {
  const enemy = game.enemies[index];
  if (!enemy) throw new Error("Missing encounter");
  clearAim(game);
  game.keys.clear();
  game.setPaused(false);
  game.health = 100;
  game.grounded = true;
  game.jumpY = 0;
  game.swimming = false;
  game.moveVelocity = { x: 0, z: 0 };
  game.attackCooldown = 0;
  for (let ring = 0; ring < 5; ring++)
    for (let i = 0; i < 32; i++) {
      const angle = (i * Math.PI) / 16,
        r = radius + ring * 3;
      const x = enemy.group.position.x + Math.sin(angle) * r,
        z = enemy.group.position.z + Math.cos(angle) * r;
      if (!game.canMove(x, z, 0)) continue;
      game.player.position.set(x, game.groundHeight(x, z), z);
      if (!game.lineOfSight(game.player.position, enemy.group.position))
        continue;
      game.yaw = angle;
      game.pitch = 0;
      setAim(game, "toggle", true);
      game.aimBlend = 1;
      enemy.group.rotation.y = angle;
      animateGuardian(game, enemy, 0);
      if (aimAtGuardian(game, enemy) !== enemy.id) continue;
      const aimed = {
        position: game.player.position.toArray(),
        yaw: game.yaw,
        pitch: game.pitch,
      };
      clearAim(game);
      game.aimBlend = 0;
      game.updateCamera(1);
      animateExplorer(game, 0, false, false);
      game.renderScene(0);
      document.activeElement?.blur();
      return { enemy: enemy.id, kind: enemy.kind, hp: enemy.hp, ...aimed };
    }
  throw new Error(`No clear encounter stance for ${enemy.id}`);
}

export function inspectAim(game) {
  const before = performance.now();
  const samples = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    aimState(game);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return {
    state: aimState(game),
    position: game.player.position.toArray(),
    camera: game.camera.position.toArray(),
    fov: game.camera.fov,
    programs: game.renderer.info.programs.map((p) => ({
      linked: game.renderer
        .getContext()
        .getProgramParameter(p.program, game.renderer.getContext().LINK_STATUS),
    })),
    query: {
      samples: 20,
      median: samples[10],
      maximum: samples.at(-1),
      total: performance.now() - before,
    },
  };
}
