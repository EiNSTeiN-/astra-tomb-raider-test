// Development diagnostics. Use disposable progress and stop the renderer loop.
// Prepared positions and accelerated simulation do not measure human pacing.
import * as THREE from "three";
import { findRoute } from "../src/navigation.js";
import {
  guardianFooting,
  resetGuardianPatrol,
} from "../src/guardian-patrols.js";
import { guardianSight, stealthState } from "../src/stealth.js";
import { waterAt } from "../src/hydrology.js";

export function inspectGuardianPatrol(game, index) {
  const e = game.enemies[index],
    p = e.patrol,
    foot = (x, z) => guardianFooting(game, e, x, z);
  return {
    id: e.id,
    kind: e.kind,
    home: e.home.toArray(),
    safe: foot(e.home.x, e.home.z),
    shift: Math.hypot(e.home.x - e.x * 7, e.home.z - e.z * 7),
    stops: structuredClone(p.stops),
    legs: p.stops.map((s, i) =>
      s && p.stops[(i + 1) % p.stops.length]
        ? findRoute(foot, s, p.stops[(i + 1) % p.stops.length])
        : { status: "missing" },
    ),
  };
}

export function advanceGuardianPatrols(game, seconds) {
  const moved = game.enemies.map(() => 0),
    issues = new Set();
  for (let tick = 0; tick < Math.round(seconds * 30); tick++) {
    const before = game.enemies.map((e) => e.group.position.clone());
    game.elapsed += 1 / 30;
    game.updateEnemies(1 / 30);
    for (const [i, e] of game.enemies.entries()) {
      moved[i] += e.group.position.distanceTo(before[i]);
      if (
        tick % 15 === 0 &&
        !guardianFooting(game, e, e.group.position.x, e.group.position.z)
      )
        issues.add(e.id + ":footing");
      if (
        Math.hypot(
          e.group.position.x - before[i].x,
          e.group.position.z - before[i].z,
        ) >
        (e.spec.speed / 30) * 1.1
      )
        issues.add(e.id + ":discontinuity");
    }
  }
  return {
    issues: [...issues],
    enemies: game.enemies.map((e, i) => ({
      id: e.id,
      state: e.state,
      position: e.group.position.toArray(),
      moved: moved[i],
      laps: e.patrol.laps,
      skipped: e.patrol.skipped,
      visited: [...e.patrol.visited],
      awareness: e.awareness,
    })),
  };
}

export function resetPatrolWatch(game) {
  game.playerNoises = [];
  game.keys.clear();
  game.elapsed = 0;
  game.crouching = false;
  game.health = 100;
  game.hitTimer = 0;
  game.grounded = true;
  game.swimming = false;
  game.jumpY = 0;
  game.dodge = null;
  game.moveVelocity = { x: 0, z: 0 };
  game.setPaused(false);
  for (const e of game.enemies) {
    e.group.position.copy(e.home);
    e.group.rotation.y = e.homeYaw;
    e.state = "idle";
    e.awareness = 0;
    e.lastSeen = e.lastHeard = -Infinity;
    e.lastKnown.copy(e.home);
    e.route = [];
    e.routeSearch = null;
    e.warning.visible = e.bar.visible = false;
    e.art.previous = e.art.feet = null;
    resetGuardianPatrol(e);
  }
  document.activeElement?.blur();
}

export function preparePatrolCrossing(game, phase = 5, choice = 0) {
  resetPatrolWatch(game);
  game.player.position.set(-10000, 0, -10000);
  advanceGuardianPatrols(game, phase);
  game.crouching = true;
  let candidate = 0;
  for (const enemy of game.enemies) {
    if (enemy.state !== "patrol") continue;
    const yaw = enemy.group.rotation.y + Math.PI,
      forward = new THREE.Vector3(
        Math.sin(enemy.group.rotation.y),
        0,
        Math.cos(enemy.group.rotation.y),
      ),
      right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    for (const radius of [10, 12, 14, 8]) {
      const center = enemy.group.position
          .clone()
          .addScaledVector(forward, -radius),
        start = center.clone().addScaledVector(right, -3.3);
      let clear = true,
        previous = null;
      for (let i = 0; i <= 22; i++) {
        const point = start.clone().addScaledVector(right, i * 0.3);
        point.y = game.groundHeight(point.x, point.z);
        game.player.position.copy(point);
        if (
          !game.canMove(point.x, point.z, 0) ||
          (waterAt(game, point.x, point.z)?.depth || 0) > 0.12 ||
          (previous && Math.abs(point.y - previous.y) > 0.14) ||
          game.enemies.some(
            (e) =>
              guardianSight(game, e) > 0 ||
              e.group.position.distanceTo(point) < 5,
          )
        ) {
          clear = false;
          break;
        }
        previous = point;
      }
      if (!clear || candidate++ < choice) continue;
      start.y = game.groundHeight(start.x, start.z);
      game.player.position.copy(start);
      game.yaw = yaw;
      game.pitch = 0.25;
      game.crouching = false;
      game.updateCamera(1);
      game.cb.update(game.state());
      return {
        enemy: enemy.id,
        phase,
        choice,
        yaw,
        radius,
        start: start.toArray(),
        guardian: enemy.group.position.toArray(),
      };
    }
  }
  throw Error(
    `No moving patrol crossing at phase ${phase}, choice ${choice} in ${game.level.id}`,
  );
}

export function stepPatrolCrossing(game, frames) {
  for (let i = 0; i < frames && !game.paused; i++) {
    game.elapsed += 1 / 60;
    game.hitTimer = Math.max(0, game.hitTimer - 1 / 60);
    game.updatePlayer(1 / 60);
    game.updateEnemies(1 / 60);
    game.updateCamera(1 / 60);
  }
  game.updateAudio();
  game.renderScene(0);
  game.cb.update(game.state());
  const gl = game.renderer.getContext();
  return {
    position: game.player.position.toArray(),
    health: game.health,
    stealth: stealthState(game),
    guardians: game.enemies.map((e) => ({
      id: e.id,
      state: e.state,
      position: e.group.position.toArray(),
      awareness: e.awareness,
    })),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}
