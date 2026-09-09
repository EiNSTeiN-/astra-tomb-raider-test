import * as THREE from "three";

export const CROUCH_DROP = 0.4;
const COMBAT = new Set(["pursue", "windup", "rush", "recover", "stagger"]);
export const guardianEngaged = (enemy) => COMBAT.has(enemy.state);

export function canCrouch(game) {
  return !(
    game.paused ||
    game.active === false ||
    !game.grounded ||
    game.swimming ||
    game.diving ||
    game.carrying ||
    game.blockGrip ||
    game.fireVault?.operation ||
    game.pressureRelay?.operation ||
    game.orbitVault?.operation ||
    game.courierFerry?.helm ||
    game.climb ||
    game.ropeRide ||
    game.zipRide ||
    game.dodge ||
    game.aiming ||
    game.aimUntil > game.elapsed ||
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

export function toggleCrouch(game) {
  if (game.paused || game.active === false) return false;
  game.crouching = !game.crouching && canCrouch(game);
  return game.crouching;
}

export function updateCrouch(game) {
  if (!canCrouch(game) || game.keys?.has("Space")) game.crouching = false;
}

// Simulation events are separate from audible voices: muting the mix must not
// disable hearing. Each event stores its origin, so unseen travel is not tracked.
export function playerNoise(
  game,
  radius,
  kind,
  position = game.player.position,
) {
  if (game.paused || game.active === false) return;
  const events = (game.playerNoises ||= []);
  events.push({
    id: (game.noiseSerial = (game.noiseSerial || 0) + 1),
    position: position.clone(),
    radius,
    kind,
    time: game.elapsed,
  });
  if (events.length > 16) events.splice(0, events.length - 16);
}

export function playerFootstep(game, surface, sprint, position) {
  game.audio?.footstep?.(surface, sprint, position, game.crouching ? 0.3 : 1);
  playerNoise(
    game,
    game.crouching ? 3 : sprint ? 20 : 11,
    "footstep",
    position,
  );
}

export function guardianSight(game, enemy) {
  const p = enemy.group.position,
    player = game.player.position;
  const dx = player.x - p.x,
    dz = player.z - p.z;
  const distance = Math.hypot(dx, dz);
  const torch = game.progress?.torch === true && !game.swimming;
  const range = torch ? 33 : game.crouching ? 22 : 29;
  if (p.distanceTo(player) > range) return 0;
  const facing =
    (dx * Math.sin(enemy.group.rotation.y) +
      dz * Math.cos(enemy.group.rotation.y)) /
    Math.max(0.001, distance);
  const close = distance < (game.crouching ? 1.5 : 2.4);
  const cone = guardianEngaged(enemy) ? -0.34 : 0.34;
  if (!close && facing < cone) return 0;
  if (
    !game.lineOfSight(
      p,
      player,
      2.85 * (enemy.art?.scale || 1),
      game.crouching ? 1.15 : 1.55,
    )
  )
    return 0;
  if (close) return 3.5;
  const falloff = THREE.MathUtils.lerp(
    2.8,
    0.75,
    Math.min(1, distance / range),
  );
  return falloff * (game.crouching && !torch ? 0.42 : 1);
}

function heardNoise(game, enemy) {
  let heard = null,
    strength = 0;
  for (const event of game.playerNoises || []) {
    if (event.id <= (enemy.heardSerial || 0)) continue;
    enemy.heardSerial = event.id;
    if (game.elapsed - event.time > 0.6) continue;
    const distance = enemy.group.position.distanceTo(event.position);
    if (distance >= event.radius) continue;
    const range =
      event.radius *
      (game.lineOfSight(enemy.group.position, event.position) ? 1 : 0.45);
    const value = 1 - distance / range;
    if (value > strength) {
      heard = event;
      strength = value;
    }
  }
  return heard;
}

function turnToward(enemy, target, amount) {
  const p = enemy.group.position;
  const yaw = Math.atan2(target.x - p.x, target.z - p.z);
  const delta = Math.atan2(
    Math.sin(yaw - enemy.group.rotation.y),
    Math.cos(yaw - enemy.group.rotation.y),
  );
  enemy.group.rotation.y += THREE.MathUtils.clamp(delta, -amount, amount);
}

// Returns actual visibility, not the remembered or heard position. Attacks use
// this result; investigating a noise alone can never authorize a strike.
export function perceivePlayer(game, enemy, dt) {
  const sight = guardianSight(game, enemy),
    heard = heardNoise(game, enemy);
  const quiet = !guardianEngaged(enemy);
  if (sight > 0) {
    enemy.lastSeen = game.elapsed;
    enemy.lastKnown.copy(game.player.position);
  } else if (
    heard &&
    (!guardianEngaged(enemy) || game.elapsed - enemy.lastSeen > 0.4)
  ) {
    enemy.lastKnown.copy(heard.position);
    enemy.lastHeard = game.elapsed;
    enemy.awareness = Math.max(
      enemy.awareness,
      heard.kind === "shot" ? 0.7 : 0.32,
    );
    enemy.searchUntil = null;
  }
  enemy.awareness = THREE.MathUtils.clamp(
    enemy.awareness + (sight ? sight * dt : -dt * 0.18),
    0,
    1,
  );
  if (quiet && enemy.awareness >= 1 && sight) {
    enemy.state = "pursue";
    enemy.route = [];
    enemy.routeSearch = null;
    if (game.elapsed - (enemy.alertCue ?? -Infinity) > 8) {
      game.audio.noiseHit?.(0.024, 0.24, 1100, enemy.group.position);
      enemy.alertCue = game.elapsed;
    }
  } else if (quiet && (heard || (sight && enemy.awareness > 0.12))) {
    if (["idle", "return"].includes(enemy.state)) {
      enemy.state = "investigate";
      enemy.route = [];
      enemy.routeSearch = null;
      enemy.noticeUntil = game.elapsed + 0.8;
      game.audio.noiseHit?.(0.009, 0.2, 1600, enemy.group.position);
    } else if (heard && enemy.state === "search") enemy.state = "investigate";
  }
  if (enemy.state === "investigate" && game.elapsed < enemy.noticeUntil)
    turnToward(enemy, enemy.lastKnown, dt * 1.5);
  return sight > 0;
}

export function stealthState(game) {
  let selected = null,
    score = -Infinity;
  for (const enemy of game.enemies || []) {
    const distance = enemy.group.position.distanceTo(game.player.position);
    if (
      enemy.hp <= 0 ||
      distance > 38 ||
      (enemy.state === "idle" && enemy.awareness < 0.05) ||
      enemy.state === "return"
    )
      continue;
    const priority =
      (guardianEngaged(enemy) ? 2 : 0) + enemy.awareness - distance / 100;
    if (priority > score) {
      selected = enemy;
      score = priority;
    }
  }
  if (!selected) return { crouching: !!game.crouching, active: false };
  const delta = selected.group.position.clone().sub(game.player.position);
  const bearing = Math.atan2(-delta.x, -delta.z) - (game.yaw || 0);
  return {
    crouching: !!game.crouching,
    active: true,
    awareness: selected.awareness,
    state: guardianEngaged(selected)
      ? "detected"
      : selected.state === "search"
        ? "searching"
        : "suspicious",
    bearing: -bearing,
  };
}
