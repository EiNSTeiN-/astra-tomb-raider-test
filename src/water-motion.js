import { waterAt } from "./hydrology.js";
import { waterSplash } from "./water-surface.js";
import { advanceDiving, resetDiving } from "./diving.js";
import { galleryFloor } from "./sunken-gallery-layout.js";

export function restoreWaterArrival(game) {
  resetDiving(game);
  const p = game.player.position,
    water = waterAt(game, p.x, p.z, p.y);
  game.swimming = false;
  game.nextSwimStroke = 0;
  if (water?.depth > 1.15 && p.y < water.y - 0.35) {
    p.y = water.y - 0.38;
    game.swimming = true;
    game.grounded = false;
    game.velocityY = 0;
    game.jumpY = p.y - game.groundHeight(p.x, p.z);
  }
}
export function advanceSwimming(game, input, dt, jump) {
  const p = game.player.position,
    water = waterAt(game, p.x, p.z, p.y);
  if (!water || water.depth < 1.1 || p.y > water.y + 0.15) {
    game.swimming = false;
    game.diving = false;
    return false;
  }
  if (advanceDiving(game, input, dt, water, jump)) return true;
  if (!game.swimming && p.y > water.y - 0.3) return false;
  if (!game.swimming) {
    waterSplash(game, p, 1.6);
    game.nextSwimStroke = game.elapsed + 0.36;
    game.cb.toast?.(
      "Deep water · use movement controls to swim toward the bank.",
      3500,
    );
  }
  game.swimming = true;
  game.motionLanding = null;
  game.grounded = false;
  game.velocityY = 0;
  game.airVelocity = null;
  const moving = Math.hypot(input.x, input.z) > 0.05;
  const speed = game.carrying ? 2.5 : 3.4;
  for (const axis of ["x", "z"]) {
    const x = p.x + (axis === "x" ? input.x * speed * dt : 0),
      z = p.z + (axis === "z" ? input.z * speed * dt : 0);
    const ground = galleryFloor(game, x, z, p.y),
      nextWater = waterAt(game, x, z, p.y);
    const y = Math.max(ground, nextWater ? nextWater.y - 0.38 : p.y);
    if (y <= p.y + 0.5 && game.canMove(x, z, y - game.groundHeight(x, z))) {
      p.x = x;
      p.z = z;
      p.y = y;
    }
  }
  const current = waterAt(game, p.x, p.z, p.y),
    ground = galleryFloor(game, p.x, p.z, p.y);
  if (!current || current.depth < 1.1) {
    game.swimming = false;
    p.y = Math.max(ground, p.y);
    game.grounded = p.y - ground < 0.05;
  } else p.y += (current.y - 0.38 - p.y) * Math.min(1, dt * 6);
  game.jumpY = Math.max(0, p.y - ground);
  game.fallPeak = p.y;
  game.jumpBuffer = 0;
  game.coyote = 0;
  game.stamina = Math.min(100, game.stamina + dt * 5);
  if (moving) {
    game.avatar.rotation.y = Math.atan2(input.x, input.z);
    if ((game.nextSwimStroke || 0) < game.elapsed) {
      waterSplash(game, p, 0.7);
      game.nextSwimStroke = game.elapsed + 0.72;
    }
  }
  if (jump) {
    // A near ledge may be mantled out of the water; away from a ledge this gives
    // a small surface stroke without enabling a second airborne jump.
    const x = input.x * Math.cos(game.yaw) - input.z * Math.sin(game.yaw),
      z = input.x * Math.sin(game.yaw) + input.z * Math.cos(game.yaw);
    if (moving && game.tryClimb(x, z)) {
      game.swimming = false;
      return true;
    }
    waterSplash(game, p, 1);
    p.y += 0.08;
  }
  return true;
}
export function wadingDepth(game) {
  const p = game.player.position,
    water = waterAt(game, p.x, p.z, p.y);
  return water ? Math.max(0, water.y - p.y) : 0;
}
