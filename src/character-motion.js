import { shutterDeckAt, shutterCeiling } from "./shutter-house-rules.js";
import { causewayDeckAt } from "./echo-causeway-rules.js";
import { craneDeckAt } from "./astral-crane-rules.js";
import { cartDeckAt } from "./tempering-cart-rules.js";
import { gardenDeckAt } from "./rain-garden-rules.js";
import { reflectorDeckAt } from "./eastern-reflector-rules.js";
import { frozenStairDeckAt } from "./frozen-stair-rules.js";
import { courierDeckAt } from "./courier-rules.js";
import { cleftDeckAt } from "./cleft-rules.js";
import { pressureDeckAt } from "./pressure-rules.js";
import { orbitDeckAt } from "./orbit-rules.js";
import { hoistDeckAt } from "./bell-hoist-rules.js";
import { skyDeckAt } from "./sky-bridge-rules.js";
import { vaultDeckAt } from "./fire-vault-rules.js";

// Vertical motion is in world coordinates: walking off a ledge must lose
// support, and crossing uneven ground in the air must not lift the jump arc.
export function supportAt(game, x, z, maxY = Infinity) {
  let height = game.groundHeight(x, z),
    surface = null;
  for (const o of game.obstacles) {
    if (!o.climbable || Math.abs(x - o.x) >= o.w || Math.abs(z - o.z) >= o.d)
      continue;
    const top = game.groundHeight(o.x, o.z) + o.h;
    if (top <= maxY + 0.2 && top > height) {
      height = top;
      surface = o;
    }
  }
  const shutterDeck = shutterDeckAt(game, x, z, maxY);
  if (shutterDeck && shutterDeck.height > height) return shutterDeck;
  const causewayDeck = causewayDeckAt(game, x, z, maxY);
  if (causewayDeck && causewayDeck.height > height) return causewayDeck;
  const craneDeck = craneDeckAt(game, x, z, maxY);
  if (craneDeck && craneDeck.height > height) return craneDeck;
  const cartDeck = cartDeckAt(game, x, z, maxY);
  if (cartDeck && cartDeck.height > height) return cartDeck;
  const gardenDeck = gardenDeckAt(game, x, z, maxY);
  if (gardenDeck && gardenDeck.height > height) return gardenDeck;
  const reflectorDeck = reflectorDeckAt(game, x, z, maxY);
  if (reflectorDeck && reflectorDeck.height > height) return reflectorDeck;
  const stairDeck = frozenStairDeckAt(game, x, z, maxY);
  if (stairDeck && stairDeck.height > height) return stairDeck;
  const deck = skyDeckAt(game, x, z, maxY);
  if (deck && deck.height > height) return deck;
  const vaultDeck = vaultDeckAt(game, x, z, maxY);
  if (vaultDeck && vaultDeck.height > height) return vaultDeck;
  const hoistDeck = hoistDeckAt(game, x, z, maxY);
  if (hoistDeck && hoistDeck.height > height) return hoistDeck;
  const cleftDeck = cleftDeckAt(game, x, z, maxY);
  if (cleftDeck && cleftDeck.height > height) return cleftDeck;
  const pressureDeck = pressureDeckAt(game, x, z, maxY);
  if (pressureDeck && pressureDeck.height > height) return pressureDeck;
  const orbitDeck = orbitDeckAt(game, x, z, maxY);
  if (orbitDeck && orbitDeck.height > height) return orbitDeck;
  const courierDeck = courierDeckAt(game, x, z, maxY);
  if (courierDeck && courierDeck.height > height) return courierDeck;
  return { height, surface };
}

export function advanceCharacter(game, velocity, dt, jump = false) {
  const p = game.player.position;
  game.jumpBuffer = jump ? 0.15 : Math.max(0, (game.jumpBuffer || 0) - dt);
  game.coyote = game.grounded ? 0.1 : Math.max(0, (game.coyote || 0) - dt);
  game.motionLanding = null;
  const count = Math.max(1, Math.ceil(dt / (1 / 60))),
    step = dt / count;
  for (let i = 0; i < count; i++) {
    const here = supportAt(game, p.x, p.z, p.y);
    if (game.grounded && Math.abs(p.y - here.height) > 0.25)
      game.grounded = false;
    if (game.jumpBuffer > 0 && (game.grounded || game.coyote > 0)) {
      game.velocityY = 7.8;
      game.grounded = false;
      game.coyote = 0;
      game.jumpBuffer = 0;
      game.audio.tone("jump");
    }
    const before = p.y,
      wasGrounded = game.grounded;
    if (!game.grounded) {
      game.velocityY -= 19 * step;
      p.y += game.velocityY * step;
      const ceiling = shutterCeiling(game, p.x, p.z, before, p.y);
      if (ceiling < p.y) {
        p.y = ceiling;
        game.velocityY = 0;
      }
    }
    const momentum = game.airVelocity,
      hasMomentum = momentum && Math.hypot(momentum.x, momentum.z) > 0.1;
    const dx =
        (velocity.x * (hasMomentum ? 0.35 : 1) +
          (hasMomentum ? momentum.x : 0)) *
        step,
      dz =
        (velocity.z * (hasMomentum ? 0.35 : 1) +
          (hasMomentum ? momentum.z : 0)) *
        step;
    const free = (x, z) =>
      game.groundHeight(x, z) <= p.y + 0.45 &&
      game.canMove(x, z, p.y - game.groundHeight(x, z));
    if (free(p.x + dx, p.z)) p.x += dx;
    if (free(p.x, p.z + dz)) p.z += dz;
    if (hasMomentum) {
      const decay = Math.exp(-0.9 * step);
      momentum.x *= decay;
      momentum.z *= decay;
    }
    const support = supportAt(game, p.x, p.z, Math.max(before, p.y));
    if (game.grounded) {
      if (support.height >= p.y - 0.42 && support.height <= p.y + 0.45)
        p.y = support.height;
      else {
        game.grounded = false;
        game.coyote = 0.1;
      }
    }
    if (
      !game.grounded &&
      game.velocityY <= 0 &&
      before >= support.height - 0.05 &&
      p.y <= support.height
    ) {
      p.y = support.height;
      game.velocityY = 0;
      game.grounded = true;
      game.motionLanding = {
        drop: Math.max(0, (game.fallPeak || before) - p.y),
        surface: support.surface,
      };
      if (momentum) {
        momentum.x = 0;
        momentum.z = 0;
      }
    }
    if (game.grounded) game.fallPeak = p.y;
    else game.fallPeak = Math.max(game.fallPeak || before, before, p.y);
    if (wasGrounded && !game.grounded && game.velocityY <= 0) game.coyote = 0.1;
  }
  game.jumpY = Math.max(0, p.y - game.groundHeight(p.x, p.z));
}

// A scenery update can put a new pier where an older save was made. Preserve a
// valid elevated arrival; otherwise choose nearby clear ground before play starts.
export function safeArrival(game, position) {
  const clear = (x, y, z) => game.canMove(x, z, y - game.groundHeight(x, z));
  if (clear(position.x, position.y, position.z))
    return { x: position.x, y: position.y, z: position.z };
  for (let radius = 0.75; radius <= 15; radius += 0.75) {
    const count = Math.ceil((radius * Math.PI * 2) / 0.65);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2,
        x = position.x + Math.cos(angle) * radius,
        z = position.z + Math.sin(angle) * radius,
        y = game.groundHeight(x, z);
      if (clear(x, y, z)) return { x, y, z };
    }
  }
  return null;
}
