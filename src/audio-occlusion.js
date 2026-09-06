// Both filters run continuously with fixed coefficients. Crossfading their
// correlated output avoids rapid cutoff automation as sight lines change.
export function createOcclusionFilter(ctx, source, destination, clearCutoff) {
  const branches = [clearCutoff, 1500].map((cutoff, index) => {
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = "lowpass";
    filter.frequency.value = Math.min(cutoff, ctx.sampleRate * 0.45);
    filter.Q.value = 0.5;
    gain.gain.value = index === 0 ? 1 : 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    return { filter, gain };
  });
  let blocked = false;
  return {
    nodes: branches.flatMap(({ filter, gain }) => [filter, gain]),
    setBlocked(next, time = ctx.currentTime) {
      if (blocked === next) return;
      blocked = next;
      branches.forEach(({ gain }, index) => {
        // Matching time constants keep the two branch gains summing to one,
        // including when a new transition interrupts the previous one.
        gain.gain.setTargetAtTime(Number(index === Number(next)), time, 0.1);
      });
    },
  };
}
