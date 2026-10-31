import { surveyDeckAt, surveyCeiling } from "./desert-survey-rules.js";
import { arcadeDeckAt, arcadeCeiling } from "./arcade-lock-rules.js";
import { sunDeckAt, sunCeiling } from "./sun-bridge-rules.js";
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
import { stationSupport, stationBlocked } from "./field-station-solids.js";
import { NATURE_BODY_RADIUS } from "./nature-rock-solids.js";
import {
  terrainBodyClear,
  clearTerrainDescent,
} from "./terrain-body-clearance.js";
import {
  clearCampVerticalContact,
  campEscapeVelocity,
} from "./camp-contact.js";

// Vertical motion is in world coordinates: walking off a ledge must lose
// support, and crossing uneven ground in the air must not lift the jump arc.
export function supportAt(game, x, z, maxY = Infinity, rockRadius = 0) {
  let height = game.groundHeight(x, z),
    surface = null;
  for (const solids of [game.natureRockSolids, game.jungleTreeSolids]) {
    const contact = solids?.support(x, z, maxY, rockRadius);
    if (contact && contact.height > height) {
      height = contact.height;
      surface = contact.surface;
    }
  }
  for (const o of game.obstacles) {
    if (o.fieldStation) {
      const top = stationSupport(o, x, z, maxY, rockRadius);
      if (top !== null && top > height) {
        height = top;
        surface = o;
      }
      continue;
    }
    if (
      (!o.climbable && !o.stepSupport) ||
      Math.abs(x - o.x) >= o.w ||
      Math.abs(z - o.z) >= o.d
    )
      continue;
    const top = game.groundHeight(o.x, o.z) + o.h;
    if (top <= maxY + 0.2 + (o.stepSupport ? 1e-6 : 0) && top > height) {
      height = top;
      surface = o;
    }
  }
  const surveyDeck = surveyDeckAt(game, x, z, maxY);
  if (surveyDeck && surveyDeck.height > height) return surveyDeck;
  const arcadeDeck = arcadeDeckAt(game, x, z, maxY);
  if (arcadeDeck && arcadeDeck.height > height) return arcadeDeck;
  const sunDeck = sunDeckAt(game, x, z, maxY);
  if (sunDeck && sunDeck.height > height) return sunDeck;
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

// A taper or overhead cap can enter the body during vertical motion after its
// horizontal move was clear. Resolve an edge contact sideways; a broad ceiling
// stops upward motion. Neither contact creates a floor on a steep side.
function narrowSupport(o) {
  return (
    o?.fieldStation &&
    Number.isFinite(o.supportRadius) &&
    o.supportRadius < (o.bodyPadding ?? 0.4)
  );
}
function clearStationVerticalMotion(game, before) {
  if (clearCampVerticalContact(game, before)) return;
  const p = game.player.position;
  const contacts = game.obstacles.filter(
    (o) =>
      o.fieldStation &&
      stationBlocked(o, p.x, p.y, p.z) &&
      !stationBlocked(o, p.x, before, p.z),
  );
  if (!contacts.length) return;
  // Broad authored roofs stop a rising body without nudging an otherwise
  // stationary jump sideways along their slope.
  if (p.y > before && contacts.some((o) => o.ceiling)) {
    p.y = before;
    game.velocityY = 0;
    return;
  }
  // A descending body can meet a neighboring part after leaving a cap.
  // Clear the same margin used by its side collision before settling beside it.
  const limit = Math.max(
    0.2,
    ...contacts.map((o) => {
      if (!o.triangles || p.y >= before) return 0.2;
      return (o.bodyPadding ?? 0.4) + 0.02;
    }),
  );
  for (let radius = 0.02; radius <= limit + 1e-6; radius += 0.02) {
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI) / 8,
        x = p.x + Math.cos(angle) * radius,
        z = p.z + Math.sin(angle) * radius,
        ground = game.groundHeight(x, z);
      if (ground > p.y + 0.45 || !game.canMove(x, z, p.y - ground)) continue;
      p.x = x;
      p.z = z;
      return;
    }
  }
  if (p.y > before) {
    p.y = before;
    game.velocityY = 0;
  }
}

export function advanceCharacter(game, velocity, dt, jump = false) {
  const p = game.player.position;
  game.jumpBuffer = jump ? 0.15 : Math.max(0, (game.jumpBuffer || 0) - dt);
  game.coyote = game.grounded ? 0.1 : Math.max(0, (game.coyote || 0) - dt);
  game.motionLanding = null;
  const count = Math.max(1, Math.ceil(dt / (1 / 60))),
    step = dt / count;
  for (let i = 0; i < count; i++) {
    const here = supportAt(game, p.x, p.z, p.y, NATURE_BODY_RADIUS);
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
      const ceiling = sunCeiling(
        game,
        p.x,
        p.z,
        before,
        shutterCeiling(
          game,
          p.x,
          p.z,
          before,
          arcadeCeiling(
            game,
            p.x,
            p.z,
            before,
            surveyCeiling(game, p.x, p.z, before, p.y),
          ),
        ),
      );
      if (ceiling < p.y) {
        p.y = ceiling;
        game.velocityY = 0;
      }
      // An overhead trunk fork can enter the head during a stationary jump.
      // Horizontal clearance alone cannot stop that vertical motion.
      if (
        p.y > before &&
        game.jungleTreeSolids?.blocked(p.x, p.y, p.z) &&
        !game.jungleTreeSolids.blocked(p.x, before, p.z)
      ) {
        let lo = before,
          hi = p.y;
        for (let j = 0; j < 12; j++) {
          const middle = (lo + hi) / 2;
          if (game.jungleTreeSolids.blocked(p.x, middle, p.z)) hi = middle;
          else lo = middle;
        }
        p.y = lo;
        game.velocityY = 0;
      }
    }
    const escape = campEscapeVelocity(game, step),
      motion = escape || velocity,
      momentum = escape ? null : game.airVelocity,
      hasMomentum = momentum && Math.hypot(momentum.x, momentum.z) > 0.1;
    const dx =
        (motion.x * (hasMomentum ? 0.35 : 1) + (hasMomentum ? momentum.x : 0)) *
        step,
      dz =
        (motion.z * (hasMomentum ? 0.35 : 1) + (hasMomentum ? momentum.z : 0)) *
        step;
    const free = (x, z) => {
      let y = p.y;
      if (game.grounded && (game.natureRockSolids || game.jungleTreeSolids)) {
        const support = supportAt(game, x, z, p.y + 0.25, NATURE_BODY_RADIUS);
        if (
          (support.surface?.natureRock || support.surface?.jungleTrunk) &&
          support.height <= p.y + 0.45
        )
          y = Math.max(y, support.height);
      }
      const footing = game.grounded
        ? supportAt(game, x, z, p.y + 0.25, NATURE_BODY_RADIUS).height
        : y;
      const settled =
        footing >= p.y - 0.42 && footing <= p.y + 0.45 ? footing : y;
      // Grounded feet can step up. Airborne feet must meet the slope before
      // crossing it, or a rising target floor can pass above their fall sweep.
      if (game.groundHeight(x, z) > y + (game.grounded ? 0.45 : 1e-6))
        return null;
      const clear = (height) =>
        terrainBodyClear(game, x, height, z) &&
        game.canMove(x, z, height - game.groundHeight(x, z));
      if (clear(settled)) return settled;
      // Leave an exact-footprint floor at the current height when snapping
      // down first would put the cylinder into its edge. The contact resolver
      // clears that margin before settling on the lower surface below.
      return game.grounded &&
        narrowSupport(here.surface) &&
        settled < y &&
        clear(y)
        ? y
        : null;
    };
    const xY = free(p.x + dx, p.z);
    if (xY !== null) {
      p.x += dx;
      p.y = xY;
    }
    const zY = free(p.x, p.z + dz);
    if (zY !== null) {
      p.z += dz;
      p.y = zY;
    }
    if (hasMomentum) {
      const decay = Math.exp(-0.9 * step);
      momentum.x *= decay;
      momentum.z *= decay;
    }
    // Deck queries include a 20 cm landing tolerance. A grounded step can rise
    // 45 cm, so search the remaining 25 cm before deciding support is missing.
    // Airborne feet retain the landing limit and cannot snap onto a deck above.
    const support = supportAt(
      game,
      p.x,
      p.z,
      Math.max(before, p.y) + (game.grounded ? 0.25 : 0),
      NATURE_BODY_RADIUS,
    );
    if (game.grounded) {
      if (
        support.height >= p.y - 0.42 &&
        support.height <= p.y + 0.45 &&
        game.canMove(p.x, p.z, support.height - game.groundHeight(p.x, p.z))
      )
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
    const leavingExactFloor =
      wasGrounded &&
      narrowSupport(here.surface) &&
      support.surface !== here.surface;
    if ((!wasGrounded || leavingExactFloor) && p.y !== before) {
      clearStationVerticalMotion(game, before);
      if (game.grounded) {
        const next = supportAt(game, p.x, p.z, p.y + 0.25, NATURE_BODY_RADIUS);
        if (
          next.height >= p.y - 0.42 &&
          next.height <= p.y + 0.45 &&
          game.canMove(p.x, p.z, next.height - game.groundHeight(p.x, p.z))
        )
          p.y = next.height;
        else game.grounded = false;
      }
    }
    // The newly open jungle includes the foot of real, steep valley faces.
    // Descending there must clear the legs sideways before accepting support.
    if (game.terrainProfile?.jungleRim) clearTerrainDescent(game, before);
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
  // Try the saved elevation first: a newly solid pedestal on a climbing
  // landing must not send an earned elevated arrival back to the ground.
  for (const elevated of [true, false])
    for (let radius = 0.75; radius <= 15; radius += 0.75) {
      const count = Math.ceil((radius * Math.PI * 2) / 0.65);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2,
          x = position.x + Math.cos(angle) * radius,
          z = position.z + Math.sin(angle) * radius,
          y = elevated
            ? supportAt(game, x, z, position.y, NATURE_BODY_RADIUS).height
            : game.groundHeight(x, z);
        if (elevated && Math.abs(y - position.y) > 0.3) continue;
        if (clear(x, y, z)) return { x, y, z };
      }
    }
  return null;
}
