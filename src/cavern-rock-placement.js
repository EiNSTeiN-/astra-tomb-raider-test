import { placeNatureRock } from "./nature-rocks.js";
import { inResonanceCourt } from "./resonance-rules.js";

const turns = [
  0,
  Math.PI / 8,
  -Math.PI / 8,
  Math.PI / 4,
  -Math.PI / 4,
  Math.PI / 2,
  -Math.PI / 2,
  Math.PI,
  (3 * Math.PI) / 4,
  (-3 * Math.PI) / 4,
];

// Fit the complete scan underside. Prefer its authored centre and heading;
// narrow stones on a bank may fit along the contour instead. If necessary,
// search a small neighboring area, retaining all normal world reservations.
export function placeCavernRock(game, shape, placement) {
  const at = (x, z, shifted = false) => {
    const radius =
      Math.hypot(
        Math.max(Math.abs(shape.bounds.min.x), Math.abs(shape.bounds.max.x)),
        Math.max(Math.abs(shape.bounds.min.z), Math.abs(shape.bounds.max.z)),
      ) * placement.size;
    if (shifted && inResonanceCourt(game.map, x, z, radius + 1)) return null;
    for (const turn of turns) {
      const fitted = placeNatureRock(game, shape, {
        ...placement,
        x,
        z,
        yaw: placement.yaw + turn,
      });
      if (!fitted.reason) return fitted;
      // The circumscribed footprint has the same reservation at every turn.
      if (fitted.reason === "reserved") return null;
    }
    return null;
  };
  const first = placeNatureRock(game, shape, placement);
  if (first.reason !== "unsupported") return first;
  const centred = at(placement.x, placement.z);
  if (centred) return centred;
  for (const distance of [0.7, 1.4, 2.1])
    for (let i = 0; i < 8; i++) {
      const angle = placement.yaw + (i * Math.PI) / 4;
      const fitted = at(
        placement.x + Math.sin(angle) * distance,
        placement.z + Math.cos(angle) * distance,
        true,
      );
      if (fitted) return fitted;
    }
  return { reason: "unsupported" };
}
