import * as THREE from "three";
import { waterAt, hotLavaAt } from "./hydrology.js";
import { clearSegment } from "./navigation.js";

// Guardians can walk on dry, gently sloping ground. They cannot jump a stair,
// swim a basin or use the explorer's suspended traversal equipment.
export function guardianFooting(game, enemy, x, z) {
  if (!game.canMove(x, z, 0, 3.5 * (enemy.art?.scale || 1))) return false;
  const y = game.groundHeight(x, z);
  if (!Number.isFinite(y) || (waterAt(game, x, z)?.depth || 0) > 0.4)
    return false;
  if (hotLavaAt(game, x, z)) return false;
  for (const [dx, dz] of [
    [0.4, 0],
    [-0.4, 0],
    [0, 0.4],
    [0, -0.4],
  ])
    if (Math.abs(game.groundHeight(x + dx, z + dz) - y) > 0.3) return false;
  return true;
}

function footingNear(game, enemy, point) {
  const clear = (x, z) =>
    clearSegment(
      (px, pz) => guardianFooting(game, enemy, px, pz),
      { x, z },
      { x, z },
    );
  if (clear(point.x, point.z))
    return { ...point, y: game.groundHeight(point.x, point.z) };
  for (const radius of [1.5, 3, 4.5, 6])
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2,
        x = point.x + Math.sin(angle) * radius,
        z = point.z + Math.cos(angle) * radius;
      if (clear(x, z)) return { ...point, x, z, y: game.groundHeight(x, z) };
    }
  return null;
}

export function resetGuardianPatrol(enemy) {
  const p = enemy.patrol;
  if (!p) return;
  p.index = 0;
  p.wait = enemy.patrolPlan.initialWait;
  p.look = enemy.homeYaw;
  p.target = null;
  p.blocked = 0;
}

// Called once after all architecture and water have been built, before play.
// A displaced footing is resolved here, never by teleporting a live patrol.
export function prepareGuardianPatrols(game) {
  for (const enemy of game.enemies) {
    if (!enemy.patrolPlan) continue;
    const start = footingNear(game, enemy, enemy.home);
    if (start) {
      enemy.home.set(start.x, start.y, start.z);
      enemy.group.position.copy(enemy.home);
      enemy.lastKnown.copy(enemy.home);
    }
    enemy.patrol = {
      stops: enemy.patrolPlan.stops.map((point, i) =>
        i === 0
          ? { ...point, x: enemy.home.x, z: enemy.home.z, y: enemy.home.y }
          : footingNear(game, enemy, point),
      ),
      visited: [],
      laps: 0,
      skipped: 0,
    };
    resetGuardianPatrol(enemy);
  }
}

const turn = (enemy, yaw, dt) => {
  const delta = Math.atan2(
    Math.sin(yaw - enemy.group.rotation.y),
    Math.cos(yaw - enemy.group.rotation.y),
  );
  enemy.group.rotation.y += THREE.MathUtils.clamp(delta, -dt * 1.3, dt * 1.3);
};

export function watchGuardianPatrol(game, enemy, dt) {
  const p = enemy.patrol;
  if (!p) return false;
  turn(enemy, p.look + Math.sin(game.elapsed * 0.45 + enemy.phase) * 0.24, dt);
  return true;
}

export function updateGuardianPatrol(game, enemy, dt, navigate) {
  const p = enemy.patrol;
  if (!p) return;
  if (enemy.state === "idle") {
    p.wait -= dt;
    if (p.wait > 0) return;
    p.index = (p.index + 1) % p.stops.length;
    const desired = p.stops[p.index] || enemy.patrolPlan.stops[p.index];
    p.target = footingNear(game, enemy, desired);
    p.stops[p.index] = p.target;
    if (!p.target) {
      p.skipped++;
      p.wait = 3;
      return;
    }
    enemy.state = "patrol";
    enemy.route = [];
    enemy.routeSearch = null;
    enemy.routeCooldown = 0;
    p.blocked = 0;
  }
  const position = enemy.group.position;
  if (Math.hypot(position.x - p.target.x, position.z - p.target.z) < 0.45) {
    enemy.state = "idle";
    p.look = p.index === 0 ? enemy.homeYaw : p.target.yaw;
    p.wait = p.target.wait;
    p.visited.push(p.index);
    if (p.visited.length > 32) p.visited.shift();
    if (p.index === 0) p.laps++;
    enemy.route = [];
    enemy.routeSearch = null;
    return;
  }
  const x = position.x,
    z = position.z,
    yaw = enemy.group.rotation.y;
  navigate(game, enemy, p.target, dt, enemy.patrolPlan.pace, (px, pz) =>
    guardianFooting(game, enemy, px, pz),
  );
  const heading = enemy.group.rotation.y;
  enemy.group.rotation.y = yaw;
  turn(enemy, heading, dt);
  p.blocked =
    Math.hypot(position.x - x, position.z - z) < dt * 0.1 ? p.blocked + dt : 0;
  // A closed or flooded route is retried from the current footing. A failed
  // search can skip a stop, but it can never move through a barrier or warp.
  if (p.blocked > 5 && !enemy.routeSearch) {
    p.skipped++;
    enemy.state = "idle";
    enemy.route = [];
    p.wait = 2;
    p.blocked = 0;
  }
}
