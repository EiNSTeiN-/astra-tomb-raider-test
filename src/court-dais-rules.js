// These shallow chamber steps are walking surfaces, separate from the taller
// instruments and ledges that require the explorer's mantle action.
export function courtDaisFloor(game, x, z, maxY = Infinity) {
  let height = game.groundHeight(x, z),
    surface = null;
  for (const dais of game.courtDaises || []) {
    for (const step of dais.steps) {
      if (
        Math.abs(x - step.x) < step.w &&
        Math.abs(z - step.z) < step.d &&
        step.top > height &&
        step.top <= maxY + 0.200001
      ) {
        height = step.top;
        surface = step;
      }
    }
  }
  return { height, surface };
}

export function courtWalkingHeight(game, x, z) {
  return courtDaisFloor(game, x, z).height;
}
