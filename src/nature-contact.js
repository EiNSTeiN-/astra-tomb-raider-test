import { terrainBodyClear } from "./terrain-body-clearance.js";

// Steep scan faces reject standing support but still stop the body. A falling
// cylinder slides out of their sides instead of gaining an invented floor or
// passing through the wood/stone below its previous clear height.
export function clearNaturalDescent(game, previousY) {
  const p = game.player.position;
  if (p.y > previousY) return false;
  const scans = [game.natureRockSolids, game.jungleTreeSolids].filter(Boolean);
  if (!scans.some((s) => s.blocked(p.x, p.y, p.z))) return false;
  const startX = p.x,
    startZ = p.z,
    endY = p.y;
  const clear = (x, y, z) =>
    game.groundHeight(x, z) <= y + 1e-6 &&
    terrainBodyClear(game, x, y, z) &&
    game.canMove(x, z, y - game.groundHeight(x, z));
  const accept = (x, y, z) => {
    p.set(x, y, z);
    game.grounded = false;
    game.motionLanding = null;
    game.velocityY = Math.min(game.velocityY, 0);
    return true;
  };
  let direction = 0;
  for (const fraction of [1, 0.5, 0.25]) {
    const y = previousY + (endY - previousY) * fraction;
    let x = startX,
      z = startZ;
    for (let pass = 0; pass < 8; pass++) {
      const pushes = scans.map((s) => s.separation(x, y, z)).filter(Boolean);
      if (!pushes.length) break;
      const push = pushes.reduce((a, b) =>
        a.lengthSq() > b.lengthSq() ? a : b,
      );
      direction = Math.atan2(push.z, push.x);
      x += push.x;
      z += push.z;
      if (Math.hypot(x - startX, z - startZ) > 0.85) break;
      if (clear(x, y, z)) return accept(x, y, z);
    }
    // Another solid or the bank can constrain the normal projection. Prefer
    // short neighboring exits, with every candidate checked against the world.
    for (const distance of [
      0.005, 0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.55, 0.85,
    ])
      for (let i = 0; i < 16; i++) {
        const angle = direction + (i * Math.PI) / 8,
          x = startX + Math.cos(angle) * distance,
          z = startZ + Math.sin(angle) * distance;
        if (clear(x, y, z)) return accept(x, y, z);
      }
  }
  // Clear sideways at the preceding height when the full downward step is
  // confined. Keep falling velocity so this is a detour, not a standing ledge.
  for (const distance of [0.01, 0.02, 0.04, 0.08, 0.16]) {
    const x = startX + Math.cos(direction) * distance,
      z = startZ + Math.sin(direction) * distance;
    if (clear(x, previousY, z)) return accept(x, previousY, z);
  }
  if (clear(startX, previousY, startZ))
    return accept(startX, previousY, startZ);
  return false;
}
