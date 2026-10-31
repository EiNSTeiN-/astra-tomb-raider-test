import { NATURE_BODY_RADIUS } from "./nature-rock-solids.js";

// Match the existing body disk and map-corner margin. Centre-only height tests
// let a steep bank enter the legs while the player origin remains on its floor.
const offsets = Array.from({ length: 16 }, (_, i) => {
  const angle = (i * Math.PI) / 8;
  return [
    Math.cos(angle) * NATURE_BODY_RADIUS,
    Math.sin(angle) * NATURE_BODY_RADIUS,
  ];
});
for (const x of [-0.45, 0.45])
  for (const z of [-0.45, 0.45]) offsets.push([x, z]);
const descentTurns = [
  0,
  Math.PI / 8,
  -Math.PI / 8,
  Math.PI / 4,
  -Math.PI / 4,
  (3 * Math.PI) / 8,
  (-3 * Math.PI) / 8,
  Math.PI / 2,
  -Math.PI / 2,
  (5 * Math.PI) / 8,
  (-5 * Math.PI) / 8,
  (3 * Math.PI) / 4,
  (-3 * Math.PI) / 4,
  (7 * Math.PI) / 8,
  (-7 * Math.PI) / 8,
  Math.PI,
];

export function terrainBodyClear(game, x, y, z) {
  // A planted leg can accommodate an uphill foothold; a bank rising above
  // this allowance inside the body margin must stop horizontal movement.
  return offsets.every(
    ([dx, dz]) => game.groundHeight(x + dx, z + dz) <= y + 0.6,
  );
}

// An airborne body can approach a steep face above its toe, then descend into
// its side without another horizontal move. Slide clear at the current height;
// the face must not become an invented standing platform for repeated jumps.
export function clearTerrainDescent(game, previousY) {
  const p = game.player.position;
  if (p.y > previousY || terrainBodyClear(game, p.x, p.y, p.z)) return false;
  let uphillX = 0,
    uphillZ = 0;
  for (const [dx, dz] of offsets) {
    const overlap = Math.max(
      0,
      game.groundHeight(p.x + dx, p.z + dz) - p.y - 0.6,
    );
    uphillX += dx * overlap;
    uphillZ += dz * overlap;
  }
  const downhill = Math.atan2(-uphillZ, -uphillX);
  const slide = (angle, distance) => {
    const x = p.x + Math.cos(angle) * distance,
      z = p.z + Math.sin(angle) * distance,
      ground = game.groundHeight(x, z);
    // Reject terrain first, before querying the more expensive scan kernels.
    // An escape must not put the feet below a higher patch of soil.
    if (
      ground > p.y + 1e-6 ||
      !terrainBodyClear(game, x, p.y, z) ||
      !game.canMove(x, z, p.y - ground)
    )
      return false;
    p.x = x;
    p.z = z;
    game.grounded = false;
    game.coyote = 0;
    game.velocityY = Math.min(game.velocityY, 0);
    return true;
  };
  const distances = [
    0.002, 0.005, 0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.55, 0.85,
  ];
  for (const distance of distances)
    for (const turn of descentTurns)
      if (slide(downhill + turn, distance)) return true;
  // Terrain and a nearby trunk can leave a narrow diagonal exit. Refine only
  // after the ordinary directions fail, instead of retaining a midair pose
  // when a small, physically clear displacement exists between those samples.
  for (const distance of distances)
    for (let i = 0; i < 128; i++)
      if (slide((i * Math.PI) / 64, distance)) return true;
  // Retain a clear preceding height if a confined contact has no local escape.
  const ground = game.groundHeight(p.x, p.z);
  if (previousY >= ground && game.canMove(p.x, p.z, previousY - ground)) {
    p.y = previousY;
    game.grounded = false;
    game.coyote = game.velocityY = 0;
    return true;
  }
  return false;
}
