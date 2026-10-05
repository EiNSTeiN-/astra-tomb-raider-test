// Shared by the character animator and the post-animation handwheel pose.
// Facing must be chosen before fitting the boots to their world-space support.
export function activeWindGrip(game) {
  const grip = game.windGrip,
    site = game.windSites?.[grip?.stage];
  return !!(
    grip &&
    site &&
    !game.paused &&
    site.visualTime <= grip.until &&
    game.grounded &&
    !game.swimming &&
    !game.blockGrip &&
    !game.climb &&
    !game.ropeRide &&
    !game.dodge &&
    game.player.position.distanceTo(grip.position) <= 0.25
  );
}
