import * as THREE from "three";
import { buildGuardianArt, animateGuardian } from "./guardian-art.js";
import { clearSegment, searchRoute } from "./navigation.js";
import {
  guardianFooting,
  resetGuardianPatrol,
  watchGuardianPatrol,
  updateGuardianPatrol,
} from "./guardian-patrols.js";

import { ENEMY_TYPES } from "./encounters.js";
import { perceivePlayer, playerNoise, guardianEngaged } from "./stealth.js";
export {
  ENEMY_TYPES,
  ENCOUNTER_PALETTES,
  encounterType,
} from "./encounters.js";

export function buildGuardian(game, spawn) {
  const kind = spawn.kind || "warden";
  const spec = ENEMY_TYPES[kind],
    group = new THREE.Group();
  group.userData.actor = true;
  const { body, arms, shield, core, glow, scale, art } = buildGuardianArt(
    game,
    kind,
    spec.color,
  );
  group.add(body);
  const warning = new THREE.Mesh(
    new THREE.RingGeometry(0.88, 1, 48),
    new THREE.MeshBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  warning.rotation.x = -Math.PI / 2;
  warning.visible = false;
  game.world.add(warning);
  const bar = new THREE.Group();
  bar.position.y = 3.9 * scale;
  group.add(bar);
  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(1.45, 0.09),
    new THREE.MeshBasicMaterial({ color: 0x191d1b, depthTest: false }),
  );
  bar.add(background);
  const health = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.055),
    new THREE.MeshBasicMaterial({ color: spec.color, depthTest: false }),
  );
  health.position.z = 0.01;
  bar.add(health);
  bar.visible = false;
  group.position.set(
    spawn.x * 7,
    game.groundHeight(spawn.x * 7, spawn.z * 7),
    spawn.z * 7,
  );
  game.world.add(group);
  group.rotation.y = spawn.yaw || 0;
  return {
    ...spawn,
    kind: spawn.kind || "warden",
    spec,
    hp: spawn.hp || spec.hp,
    maxHp: spawn.hp || spec.hp,
    group,
    body,
    art,
    arms,
    shield,
    core,
    glow,
    warning,
    bar,
    healthBar: health,
    home: group.position.clone(),
    homeYaw: group.rotation.y,
    state: "idle",
    timer: 0,
    cooldown: 0.8,
    phase: game.rng() * 6,
    aim: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    flash: 0,
    awareness: 0,
    lastSeen: -Infinity,
    lastKnown: group.position.clone(),
    route: [],
    routeCooldown: 0,
  };
}

function move(
  game,
  enemy,
  direction,
  distance,
  canStand = (x, z) => guardianFooting(game, enemy, x, z),
) {
  const p = enemy.group.position,
    steps = Math.max(1, Math.ceil(distance / 0.35)),
    amount = distance / steps;
  let moved = 0;
  for (let i = 0; i < steps; i++) {
    const x = p.x + direction.x * amount,
      z = p.z + direction.z * amount;
    if (!canStand(x, z)) break;
    if (
      game.enemies.some(
        (other) =>
          other !== enemy &&
          other.hp > 0 &&
          Math.hypot(other.group.position.x - x, other.group.position.z - z) <
            1.4,
      )
    )
      break;
    p.x = x;
    p.z = z;
    moved += amount;
  }
  p.y = game.groundHeight(p.x, p.z);
  return moved;
}
function recover(enemy) {
  enemy.state = "recover";
  enemy.timer = enemy.spec.recovery;
  enemy.warning.visible = false;
}

export function navigateGuardian(
  game,
  enemy,
  target,
  dt,
  pace = 1,
  canStand = (x, z) => guardianFooting(game, enemy, x, z),
) {
  const p = enemy.group.position;
  enemy.routeCooldown = Math.max(0, (enemy.routeCooldown || 0) - dt);
  if (
    enemy.routeTarget &&
    Math.hypot(target.x - enemy.routeTarget.x, target.z - enemy.routeTarget.z) >
      3
  ) {
    enemy.route = [];
    enemy.routeSearch = null;
  }
  if (!enemy.route.length && !enemy.routeSearch && enemy.routeCooldown <= 0) {
    if (clearSegment(canStand, p, target))
      enemy.route = [{ x: target.x, z: target.z }];
    else {
      enemy.routeSearch = searchRoute(
        canStand,
        { x: p.x, z: p.z },
        { x: target.x, z: target.z },
      );
      enemy.routeStatus = "searching";
      game.navigationStats ||= { plans: 0, expanded: 0, maxExpanded: 0 };
      game.navigationStats.plans++;
    }
    enemy.routeTarget = { x: target.x, z: target.z };
    enemy.routeCooldown = 0.65 + (enemy.phase || 0) * 0.03;
  }
  if (enemy.routeSearch && (game.navPlansThisFrame || 0) < 2) {
    game.navPlansThisFrame = (game.navPlansThisFrame || 0) + 1;
    const step = enemy.routeSearch.next();
    if (step.done) {
      const result = step.value;
      enemy.route = result.points;
      enemy.routeStatus = result.status;
      enemy.routeSearch = null;
      game.navigationStats.expanded += result.visited;
      game.navigationStats.maxExpanded = Math.max(
        game.navigationStats.maxExpanded,
        result.visited,
      );
    }
  }
  while (
    enemy.route.length &&
    Math.hypot(enemy.route[0].x - p.x, enemy.route[0].z - p.z) < 0.4
  )
    enemy.route.shift();
  const waypoint = enemy.route[0];
  if (!waypoint) return;
  const direction = new THREE.Vector3(waypoint.x - p.x, 0, waypoint.z - p.z),
    distance = Math.min(enemy.spec.speed * dt * pace, direction.length());
  direction.normalize();
  let moved = move(game, enemy, direction, distance, canStand);
  if (moved < distance * 0.3) {
    // Short side steps let a pair pass one another without rebuilding both paths.
    for (const sign of [1, -1]) {
      const side = direction
        .clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), sign * 0.8);
      moved = move(game, enemy, side, distance * 0.8, canStand);
      if (moved > 0) break;
    }
    if (moved === 0 && enemy.routeCooldown <= 0) enemy.route = [];
  }
  enemy.group.rotation.y = Math.atan2(direction.x, direction.z);
}
function beginAttack(game, enemy) {
  enemy.state = "windup";
  enemy.timer = enemy.spec.windup;
  enemy.aim.copy(game.player.position);
  enemy.velocity
    .subVectors(enemy.aim, enemy.group.position)
    .setY(0)
    .normalize();
  enemy.group.rotation.y = Math.atan2(enemy.velocity.x, enemy.velocity.z);
  const marker = enemy.warning;
  marker.position.set(
    enemy.aim.x,
    game.groundHeight(enemy.aim.x, enemy.aim.z) + 0.08,
    enemy.aim.z,
  );
  const radius =
    enemy.kind === "hunter"
      ? 1.4
      : enemy.kind === "sentry"
        ? 1.05
        : enemy.spec.reach;
  if (!["hunter", "sentry"].includes(enemy.kind))
    marker.position
      .copy(enemy.group.position)
      .add(new THREE.Vector3(0, 0.08, 0));
  marker.scale.setScalar(radius);
  marker.visible = true;
  game.audio.noiseHit?.(
    0.022,
    0.32,
    enemy.kind === "sentry" ? 2500 : 700,
    enemy.group.position,
  );
}

export function spawnBolt(game, enemy) {
  game.projectiles ||= [];
  enemy.group.updateWorldMatrix?.(true, true);
  const position = enemy.art?.muzzle
    ? enemy.art.muzzle.getWorldPosition(new THREE.Vector3())
    : enemy.group.position.clone().add(new THREE.Vector3(0, 2.35, 0));
  const direction = enemy.aim
    .clone()
    .add(new THREE.Vector3(0, 1.1, 0))
    .sub(position)
    .normalize();
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.22, 0),
    new THREE.MeshBasicMaterial({ color: enemy.spec.color }),
  );
  mesh.position.copy(position);
  game.world.add(mesh);
  const trail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.16, 1.6, 5),
    new THREE.MeshBasicMaterial({
      color: enemy.spec.color,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  );
  trail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  mesh.add(trail);
  game.projectiles.push({
    mesh,
    direction,
    life: 4.5,
    damage: enemy.spec.damage,
    speed: 15,
  });
  game.audio.noiseHit?.(0.04, 0.18, 1800, position);
}

export function updateGuardians(game, dt) {
  if (game.paused || game.active === false || dt <= 0) return;
  game.navPlansThisFrame = 0;
  game.playerNoises = (game.playerNoises || []).filter(
    (n) => game.elapsed - n.time <= 0.6,
  );
  const player = game.player.position;
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0) continue;
    const p = enemy.group.position,
      spec = enemy.spec,
      distance = p.distanceTo(player);
    enemy.flash = Math.max(0, enemy.flash - dt);
    enemy.cooldown -= dt;
    enemy.staggerCooldown = Math.max(0, (enemy.staggerCooldown || 0) - dt);
    if (enemy.state === "idle" && !watchGuardianPatrol(game, enemy, dt))
      enemy.group.rotation.y =
        enemy.homeYaw + Math.sin(game.elapsed * 0.35 + enemy.phase) * 0.3;
    const canSee = perceivePlayer(game, enemy, dt);
    const away = p.distanceTo(enemy.home) > 48;
    if (["idle", "patrol"].includes(enemy.state) && enemy.patrol) {
      updateGuardianPatrol(game, enemy, dt, navigateGuardian);
    } else if (enemy.state === "pursue") {
      if (
        away ||
        (!canSee &&
          game.elapsed -
            Math.max(enemy.lastSeen, enemy.lastHeard ?? -Infinity) >
            8)
      ) {
        enemy.state = "return";
        enemy.route = [];
        enemy.routeSearch = null;
        enemy.warning.visible = false;
      } else if (!canSee && p.distanceTo(enemy.lastKnown) < 1.8) {
        enemy.state = "search";
        enemy.searchUntil = game.elapsed + 4;
      } else if (
        canSee &&
        distance < spec.reach &&
        enemy.cooldown <= 0 &&
        (enemy.kind !== "hunter" ||
          clearSegment((x, z) => guardianFooting(game, enemy, x, z), p, player))
      )
        beginAttack(game, enemy);
      else {
        if (
          distance > 2.4 &&
          (enemy.kind !== "sentry" || distance > 17 || !canSee)
        )
          navigateGuardian(game, enemy, enemy.lastKnown, dt);
      }
    } else if (enemy.state === "investigate") {
      if (
        away ||
        game.elapsed - Math.max(enemy.lastSeen, enemy.lastHeard ?? -Infinity) >
          10
      ) {
        enemy.state = "return";
        enemy.route = [];
        enemy.routeSearch = null;
      } else if (game.elapsed >= (enemy.noticeUntil || 0)) {
        if (p.distanceTo(enemy.lastKnown) < 1.8) {
          enemy.state = "search";
          enemy.searchUntil = game.elapsed + 4;
        } else navigateGuardian(game, enemy, enemy.lastKnown, dt, 0.65);
      }
    } else if (enemy.state === "search") {
      enemy.group.rotation.y += dt * 1.1;
      if (game.elapsed >= enemy.searchUntil && !canSee) {
        enemy.state = "return";
        enemy.route = [];
        enemy.routeSearch = null;
      }
    } else if (enemy.state === "windup") {
      enemy.timer -= dt;
      enemy.warning.material.opacity =
        0.3 + 0.55 * (1 - enemy.timer / spec.windup);
      if (enemy.timer <= 0) {
        if (enemy.kind === "sentry") {
          spawnBolt(game, enemy);
          recover(enemy);
        } else if (enemy.kind === "hunter") {
          enemy.state = "rush";
          enemy.timer = 0.75;
          enemy.rushHit = false;
          enemy.warning.visible = false;
        } else {
          const direction = player.clone().sub(p).setY(0);
          const inFront =
            direction.length() < 0.01 ||
            direction.normalize().dot(enemy.velocity) > 0.05;
          if (
            distance < spec.reach &&
            inFront &&
            Math.abs(player.y - p.y) < 2.6 &&
            game.lineOfSight(p, player)
          )
            game.damage(spec.damage);
          game.audio.noiseHit?.(0.09, 0.32, 400, p);
          recover(enemy);
        }
      }
    } else if (enemy.state === "rush") {
      enemy.timer -= dt;
      const moved = move(game, enemy, enemy.velocity, 13 * dt);
      if (
        !enemy.rushHit &&
        p.distanceTo(player) < 1.9 &&
        Math.abs(player.y - p.y) < 2.3
      ) {
        game.damage(spec.damage);
        enemy.rushHit = true;
      }
      if (enemy.timer <= 0 || moved < dt * 3) recover(enemy);
    } else if (["recover", "stagger"].includes(enemy.state)) {
      enemy.timer -= dt;
      if (enemy.timer <= 0) {
        enemy.state = "pursue";
        enemy.cooldown = 0.5;
      }
    } else if (enemy.state === "return") {
      if (p.distanceTo(enemy.home) < 0.8) {
        enemy.state = "idle";
        enemy.awareness = 0;
        enemy.route = [];
        enemy.routeSearch = null;
        resetGuardianPatrol(enemy);
      } else navigateGuardian(game, enemy, enemy.home, dt);
    }
    animateGuardian(game, enemy, dt);
    const engaged = guardianEngaged(enemy);
    enemy.bar.visible =
      distance < 26 &&
      (!["idle", "patrol"].includes(enemy.state) || enemy.awareness > 0.05) &&
      enemy.state !== "return" &&
      game.lineOfSight(player, p);
    if (enemy.bar.visible && game.camera)
      enemy.bar.lookAt(game.camera.position);
    enemy.healthBar.material.color.setHex(engaged ? spec.color : 0xf0c97e);
    enemy.healthBar.scale.x = Math.max(
      0.02,
      engaged ? enemy.hp / enemy.maxHp : enemy.awareness,
    );
    enemy.healthBar.position.x = -(1 - enemy.healthBar.scale.x) * 0.7;
  }
  updateProjectiles(game, dt);
}

export function updateProjectiles(game, dt) {
  const player = game.player.position;
  for (const bolt of [...(game.projectiles || [])]) {
    bolt.life -= dt;
    let remove = bolt.life <= 0;
    const steps = Math.max(1, Math.ceil((bolt.speed * dt) / 0.35));
    for (let i = 0; i < steps && !remove; i++) {
      bolt.mesh.position.addScaledVector(
        bolt.direction,
        (bolt.speed * dt) / steps,
      );
      const p = bolt.mesh.position,
        height = p.y - game.groundHeight(p.x, p.z);
      if (height < 0.1 || !game.canMove(p.x, p.z, height)) remove = true;
      else if (
        Math.hypot(p.x - player.x, p.z - player.z) < 0.65 &&
        p.y > player.y + 0.15 &&
        p.y < player.y + 1.9
      ) {
        game.damage(bolt.damage);
        remove = true;
      }
    }
    if (remove) {
      game.world.remove(bolt.mesh);
      bolt.mesh.traverse((m) => {
        m.geometry?.dispose();
        m.material?.dispose();
      });
      game.projectiles.splice(game.projectiles.indexOf(bolt), 1);
    }
  }
}

export function hitGuardian(game, enemy) {
  enemy.lastSeen = game.elapsed;
  enemy.lastKnown.copy(game.player.position);
  const toPlayer = game.player.position
    .clone()
    .sub(enemy.group.position)
    .setY(0)
    .normalize();
  const facing = new THREE.Vector3(
    Math.sin(enemy.group.rotation.y),
    0,
    Math.cos(enemy.group.rotation.y),
  );
  const blocked =
    enemy.kind === "bulwark" &&
    !["recover", "stagger"].includes(enemy.state) &&
    toPlayer.dot(facing) > 0.15;
  enemy.awareness = 1;
  if (!guardianEngaged(enemy)) enemy.state = "pursue";
  enemy.flash = 0.15;
  if (blocked) {
    game.cb.toast?.(
      "Shielded · evade its strike, then fire while it recovers.",
      2200,
    );
    return false;
  }
  enemy.hp--;
  enemy.bar.visible = true;
  if (enemy.hp <= 0) {
    enemy.group.visible = false;
    enemy.warning.visible = false;
    if (!game.progress.defeated.includes(enemy.id))
      game.progress.defeated.push(enemy.id);
    game.cb.toast?.(`${enemy.spec.name} silenced`);
    game.save();
  } else if (
    enemy.kind !== "bulwark" &&
    ["idle", "pursue", "return"].includes(enemy.state) &&
    !enemy.staggerCooldown
  ) {
    enemy.state = "stagger";
    enemy.timer = 0.25;
    enemy.staggerCooldown = 2.6;
    enemy.warning.visible = false;
  }
  return true;
}

export function startDodge(game) {
  if (
    game.desertSurvey?.focus ||
    game.blockGrip ||
    game.dodge ||
    game.dodgeCooldown > 0 ||
    game.stamina < 28 ||
    !game.grounded ||
    game.climb ||
    game.ropeRide ||
    game.zipRide ||
    game.jumpY > 0.25 ||
    game.carrying ||
    game.swimming
  )
    return false;
  let x =
    (game.keys.has("KeyD") || game.keys.has("ArrowRight") ? 1 : 0) -
    (game.keys.has("KeyA") || game.keys.has("ArrowLeft") ? 1 : 0) +
    game.touchMove.x;
  let z =
    (game.keys.has("KeyS") || game.keys.has("ArrowDown") ? 1 : 0) -
    (game.keys.has("KeyW") || game.keys.has("ArrowUp") ? 1 : 0) +
    game.touchMove.z;
  if (Math.hypot(x, z) < 0.1) z = 1;
  const length = Math.hypot(x, z);
  x /= length;
  z /= length;
  game.dodge = {
    time: 0,
    duration: 0.62,
    x: x * Math.cos(game.yaw) + z * Math.sin(game.yaw),
    z: -x * Math.sin(game.yaw) + z * Math.cos(game.yaw),
  };
  game.stamina -= 28;
  game.crouching = false;
  playerNoise(game, 14, "dodge");
  game.dodgeCooldown = 1.1;
  game.nearest = null;
  game.audio.noiseHit?.(0.025, 0.24, 1400);
  return true;
}
export function isEvading(game) {
  return !!game.dodge && game.dodge.time >= 0.08 && game.dodge.time <= 0.43;
}
export function updateDodge(game, dt) {
  const dodge = game.dodge,
    p = game.player.position;
  dodge.time += dt;
  const speed =
    9.6 *
    Math.max(0.2, Math.sin(Math.min(1, dodge.time / dodge.duration) * Math.PI));
  for (let i = 0; i < 3; i++) {
    const x = p.x + (dodge.x * speed * dt) / 3,
      z = p.z + (dodge.z * speed * dt) / 3;
    if (game.canMove(x, z, 0)) {
      p.x = x;
      p.z = z;
    }
  }
  p.y = game.groundHeight(p.x, p.z);
  game.avatar.rotation.y = Math.atan2(dodge.x, dodge.z);
  game.avatar.position.y =
    -Math.sin(Math.min(1, dodge.time / dodge.duration) * Math.PI) * 0.45;
  game.avatar.rotation.x =
    -Math.sin(Math.min(1, dodge.time / dodge.duration) * Math.PI) * 0.45;
  if (dodge.time >= dodge.duration) {
    game.dodge = null;
    game.avatar.rotation.x = 0;
    game.avatar.position.y = 0;
  }
}
