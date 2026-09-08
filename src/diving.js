import * as THREE from "three";
import { waterAt } from "./hydrology.js";
import { galleryAt, galleryFloor } from "./sunken-gallery-layout.js";
import { advanceGalleryWheel } from "./gallery-wheel.js";

export const DIVE_AIR = 32;

export function resetDiving(game) {
  if (game.sunkenGallery) game.sunkenGallery.operation = null;
  game.diving = false;
  game.diveAir = DIVE_AIR;
  game.diveWarned = false;
  game.diveRecovery = false;
}

// Swimming coordinates refer to the torso. The existing surface stroke places
// its head just above water; underwater movement uses a compact body clearance.
export function advanceDiving(game, input, dt, water, rise) {
  if (game.level.biome !== "water") return false;
  const p = game.player.position;
  const down = game.keys.has("KeyX");
  game.diveAir ??= DIVE_AIR;
  if (!game.diving) {
    game.diveAir = Math.min(DIVE_AIR, game.diveAir + dt * 8);
    if (!game.swimming || !down || rise || water.depth < 2 || game.carrying)
      return false;
    if (game.diveAir < 10) return false;
    game.diving = true;
    game.diveWarned = false;
    game.diveRecovery = false;
  }
  game.swimming = true;
  game.grounded = false;
  game.motionLanding = null;
  game.velocityY = 0;
  game.airVelocity = null;
  game.jumpBuffer = game.coyote = 0;
  const interior = galleryAt(game, p.x, p.y, p.z);
  const vertical = rise || (game.diveRecovery && !interior) ? 1 : down ? -1 : 0;
  // Normalize all three axes so diagonal swimming cannot exceed the swim speed.
  const magnitude = Math.max(1, Math.hypot(input.x, input.z, vertical));
  const speed = 3.1 / magnitude;
  const steps = Math.max(1, Math.ceil(dt * 60));
  for (let i = 0; i < steps; i++) {
    const step = dt / steps;
    for (const axis of ["x", "z"]) {
      const x = p.x + (axis === "x" ? input.x * speed * step : 0);
      const z = p.z + (axis === "z" ? input.z * speed * step : 0);
      const ground = galleryFloor(game, x, z, p.y);
      const next = waterAt(game, x, z, p.y);
      if (
        next &&
        p.y >= ground + 0.35 &&
        game.canMove(x, z, p.y - game.groundHeight(x, z), 0.8)
      ) {
        p.x = x;
        p.z = z;
      }
    }
    const current = waterAt(game, p.x, p.z, p.y) || water;
    const ground = galleryFloor(game, p.x, p.z, p.y);
    const y = Math.max(
      ground + 0.4,
      Math.min(current.y - 0.38, p.y + vertical * speed * step),
    );
    if (game.canMove(p.x, p.z, y - game.groundHeight(p.x, p.z), 0.8)) p.y = y;
    if (current.depth < 1.1 || (vertical > 0 && p.y >= current.y - 0.4)) {
      p.y = Math.max(ground, current.y - 0.38);
      game.diving = false;
      game.keys.delete("Space");
      game.keys.delete("KeyX");
      break;
    }
  }
  game.jumpY = Math.max(0, p.y - game.groundHeight(p.x, p.z));
  game.fallPeak = p.y;
  if (game.diving) {
    game.diveAir = Math.max(0, game.diveAir - dt);
    if (game.diveAir < 10 && !game.diveWarned) {
      game.diveWarned = true;
      game.cb.toast?.(
        interior
          ? "Air running low · swim beneath a bronze air bell and rise inside."
          : "Air running low · hold Space / Rise to surface.",
        3500,
      );
    }
    if (game.diveAir === 0) {
      game.diveRecovery = true;
      game.damage(8);
    }
  }
  advanceGalleryWheel(game, dt, input, rise);
  return true;
}

export function divingHint(game) {
  if (game.diving)
    return {
      key: "X / Space",
      label: game.diveRecovery
        ? "Out of air · surfacing"
        : "Descend / rise · move to explore the well",
    };
  if (game.swimming && game.level.biome === "water")
    return {
      key: game.carrying ? "—" : "X",
      label: game.carrying
        ? "Deliver the carried component before diving"
        : game.diveAir < 10
          ? "Catch your breath before diving again"
          : (waterAt(game, game.player.position.x, game.player.position.z)
                ?.depth || 0) < 2
            ? "Swim into deeper water to dive"
            : "Hold to dive · Space to surface",
    };
  return null;
}

// Camera immersion controls the view; the explorer's immersion controls audio.
// Restore the exact chapter fog/background as soon as the lens leaves the water.
export function updateDiveView(game) {
  if (game.level.biome !== "water") return;
  const water = waterAt(
    game,
    game.camera.position.x,
    game.camera.position.z,
    game.camera.position.y,
  );
  const depth = water ? water.y - game.camera.position.y : 0;
  if (depth > 0.08) {
    game.diveView ??= {
      color: game.scene.fog.color.clone(),
      density: game.scene.fog.density,
      background: game.scene.background,
      waterColor: new THREE.Color(0x286369),
    };
    game.scene.fog.color.copy(game.diveView.waterColor);
    game.scene.fog.density = 0.065 + Math.min(0.025, depth * 0.003);
    game.scene.background = game.diveView.waterColor;
    if (game.daylightSky) game.daylightSky.visible = false;
  } else if (game.diveView) {
    game.scene.fog.color.copy(game.diveView.color);
    game.scene.fog.density = game.diveView.density;
    game.scene.background = game.diveView.background;
    if (game.daylightSky) game.daylightSky.visible = true;
    game.diveView = null;
  }
}
