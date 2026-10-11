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

export function terrainBodyClear(game, x, y, z) {
  // A planted leg can accommodate an uphill foothold; a bank rising above
  // this allowance inside the body margin must stop horizontal movement.
  return offsets.every(
    ([dx, dz]) => game.groundHeight(x + dx, z + dz) <= y + 0.6,
  );
}
