import { hasCounterweights, counterweightsReady } from "./counterweights.js";

// Feature groups sit at their authored standing height, including raised bell
// and wind platforms. Compare feet with that datum, not with terrain below it.
export function mechanismReachable(
  game,
  feature,
  player = game.player.position,
) {
  const height = feature.group.position.y;
  if (Math.abs(player.y - height) > 0.8) return false;
  const console =
    hasCounterweights(feature) && counterweightsReady(game, feature);
  return (
    Math.hypot(
      player.x - feature.x * 7,
      player.z - (feature.z * 7 + (console ? -5 : 0)),
    ) < (console ? 2.4 : 5)
  );
}
