// Along a ray, the delivered terrain is piecewise linear. Its plane changes
// only at grid edges and x+z diagonals, so inspect those crossings rather than
// treating a clear centre arm as visibility of the explorer's whole body.
export function terrainCameraClear(game, start, end) {
  if (!game?.groundHeight) return true;
  const cuts = new Set([0, 1]),
    step = game.terrainProfile?.step;
  if (Number.isFinite(step) && step > 0) {
    for (const [a, b] of [
      [start.x, end.x],
      [start.z, end.z],
      [start.x + start.z, end.x + end.z],
    ]) {
      if (Math.abs(b - a) < 1e-9) continue;
      for (
        let i = Math.floor(Math.min(a, b) / step) + 1;
        i * step < Math.max(a, b);
        i++
      )
        cuts.add((i * step - a) / (b - a));
    }
  } else {
    const count = Math.max(
      1,
      Math.ceil(Math.hypot(end.x - start.x, end.z - start.z) / 0.2),
    );
    for (let i = 1; i < count; i++) cuts.add(i / count);
  }
  let outside = false,
    previousTime,
    previousGap,
    removedEntry = false;
  for (const t of [...cuts].sort((a, b) => a - b)) {
    const x = start.x + (end.x - start.x) * t,
      y = start.y + (end.y - start.y) * t,
      z = start.z + (end.z - start.z) * t,
      gap = y - game.groundHeight(x, z);
    if (previousGap >= 0 && gap < 0) {
      // Height is linear between these grid/diagonal crossings. Inspect its
      // actual entry point, rather than treating the whole space below it as
      // solid. Gallery construction removes terrain only inside these volumes;
      // the courtyard above the ceiling and banks beside the opening remain.
      const entry =
          previousTime +
          ((t - previousTime) * previousGap) / (previousGap - gap),
        px = start.x + (end.x - start.x) * entry,
        py = start.y + (end.y - start.y) * entry,
        pz = start.z + (end.z - start.z) * entry;
      removedEntry = !!game.terrainProfile?.gallery?.volumes?.some(
        (v) =>
          px > v.min.x &&
          px < v.max.x &&
          py > v.min.y &&
          py < v.max.y &&
          pz > v.min.z &&
          pz < v.max.z,
      );
    }
    // A screen-facing joint margin can start just inside an uphill bank even
    // when the delivered clothes clear it. Allow that margin to leave its
    // initial surface; any later terrain entry is still an obstruction.
    if (gap > 0.002) {
      outside = true;
      removedEntry = false;
    } else if (outside && gap < -0.002 && !removedEntry) return false;
    previousTime = t;
    previousGap = gap;
  }
  return true;
}
