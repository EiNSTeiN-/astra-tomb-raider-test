// Run with a prepared development expedition. Counts describe rendering work,
// not frame rate; diagnostic cameras and routes do not measure human pacing.
export function inspectJungleFringe(game) {
  const fringe = game.jungleFringe;
  if (!fringe) return null;
  const gl = game.renderer.getContext();
  return {
    trees: fringe.trees.length,
    patches: fringe.patches.length,
    instances: fringe.patches.reduce((n, p) => n + p.positions.length, 0),
    active: fringe.patches.reduce(
      (n, p) => n.map((v, i) => v + p.counts[i]),
      [0, 0],
    ),
    transitioning: fringe.patches.reduce(
      (n, p) => n + (p.states || []).filter((s) => s.blend < 1).length,
      0,
    ),
    bankTriangles: fringe.root.children.reduce(
      (n, m) => n + m.geometry.index.count / 3,
      0,
    ),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}

// Temporarily hide only the added scenery for an identical-camera comparison.
// Restore this record before resuming play or updating the forest's LODs.
export function hideJungleFringe(game) {
  const f = game.jungleFringe;
  if (!f) return [];
  const record = [f.root, ...f.patches.flatMap((p) => p.tiers.flat())].map(
    (o) => [o, o.visible],
  );
  for (const [o] of record) o.visible = false;
  return record;
}
export function restoreJungleFringe(record) {
  for (const [o, visible] of record) o.visible = visible;
}
