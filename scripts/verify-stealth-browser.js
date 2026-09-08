// Assisted fixtures in the real chapter geometry. Use disposable progress and
// stop the renderer loop before calling; movement and perception remain active.
import * as THREE from "three";
import { guardianSight, stealthState } from "../src/stealth.js";
import { clearAim, updateShotTraces } from "../src/aiming.js";

export function resetWatch(game) {
  clearAim(game);
  game.crouching = false;
  game.playerNoises = [];
  game.keys.clear();
  game.health = 100;
  game.hitTimer = 0;
  game.grounded = true;
  game.swimming = false;
  game.jumpY = 0;
  game.dodge = null;
  game.moveVelocity = { x: 0, z: 0 };
  game.setPaused(false);
  for (const enemy of game.enemies) {
    enemy.group.position.copy(enemy.home);
    enemy.group.rotation.y = enemy.homeYaw;
    enemy.state = "idle";
    enemy.awareness = 0;
    enemy.lastSeen = -Infinity;
    enemy.lastHeard = -Infinity;
    enemy.lastKnown.copy(enemy.home);
    enemy.route = [];
    enemy.routeSearch = null;
    enemy.warning.visible = false;
    enemy.bar.visible = false;
  }
  document.activeElement?.blur();
}

export function quietRoute(game) {
  resetWatch(game);
  game.crouching = true;
  for (const enemy of game.enemies) {
    const yaw = enemy.homeYaw + Math.PI;
    const forward = new THREE.Vector3(
      Math.sin(enemy.homeYaw),
      0,
      Math.cos(enemy.homeYaw),
    );
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    for (const radius of [8, 10, 12, 14]) {
      const center = enemy.home.clone().addScaledVector(forward, -radius);
      const start = center.clone().addScaledVector(right, -3.3);
      let clear = true,
        prior = null;
      for (let i = 0; i <= 22; i++) {
        const point = start.clone().addScaledVector(right, i * 0.3);
        point.y = game.groundHeight(point.x, point.z);
        game.player.position.copy(point);
        if (
          !game.canMove(point.x, point.z, 0) ||
          (prior && Math.abs(point.y - prior.y) > 0.14) ||
          game.enemies.some(
            (e) =>
              e.hp > 0 &&
              (guardianSight(game, e) > 0 ||
                e.group.position.distanceTo(point) < 4),
          )
        ) {
          clear = false;
          break;
        }
        prior = point;
      }
      if (!clear) continue;
      start.y = game.groundHeight(start.x, start.z);
      game.player.position.copy(start);
      game.yaw = yaw;
      game.pitch = 0.25;
      game.crouching = false;
      game.updateCamera(1);
      game.cb.update(game.state());
      return {
        enemy: enemy.id,
        kind: enemy.kind,
        start: start.toArray(),
        yaw,
        radius,
      };
    }
  }
  throw new Error(`No concealed six-metre walking route in ${game.level.id}`);
}

export function faceWatch(game, id) {
  resetWatch(game);
  const enemy = game.enemies.find((e) => e.id === id);
  for (const radius of [12, 10, 16])
    for (const angle of [0, -0.4, 0.4, -0.7, 0.7]) {
      const yaw = enemy.homeYaw + angle;
      game.player.position.set(
        enemy.home.x + Math.sin(yaw) * radius,
        0,
        enemy.home.z + Math.cos(yaw) * radius,
      );
      game.player.position.y = game.groundHeight(
        game.player.position.x,
        game.player.position.z,
      );
      if (
        !game.canMove(game.player.position.x, game.player.position.z, 0) ||
        !guardianSight(game, enemy)
      )
        continue;
      game.yaw = yaw;
      game.pitch = 0.12;
      game.updateCamera(1);
      return enemy.id;
    }
  throw new Error(`No visible approach to ${id}`);
}

export function stepStealth(game, frames) {
  for (let i = 0; i < frames; i++) {
    if (game.paused) break;
    game.elapsed += 1 / 60;
    game.hitTimer = Math.max(0, game.hitTimer - 1 / 60);
    game.attackCooldown = Math.max(0, game.attackCooldown - 1 / 60);
    game.updatePlayer(1 / 60);
    game.updateEnemies(1 / 60);
    game.updateCamera(1 / 60);
    updateShotTraces(game, 1 / 60);
  }
  game.updateAudio();
  game.renderScene(0);
  game.cb.update(game.state());
  return {
    position: game.player.position.toArray(),
    health: game.health,
    speed: Math.hypot(game.moveVelocity.x, game.moveVelocity.z),
    stealth: stealthState(game),
    guardians: game.enemies.map((e) => ({
      id: e.id,
      state: e.state,
      awareness: e.awareness,
    })),
    programs: game.renderer.info.programs.map((p) =>
      game.renderer
        .getContext()
        .getProgramParameter(p.program, game.renderer.getContext().LINK_STATUS),
    ),
  };
}
