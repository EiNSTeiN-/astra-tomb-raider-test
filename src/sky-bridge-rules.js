const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function spanCoordinates(bridge, x, z) {
  const dx = bridge.bx - bridge.ax,
    dz = bridge.bz - bridge.az,
    length = Math.hypot(dx, dz),
    ux = dx / length,
    uz = dz / length;
  return {
    along: (x - bridge.ax) * ux + (z - bridge.az) * uz,
    across: (x - bridge.ax) * uz - (z - bridge.az) * ux,
    length,
    ux,
    uz,
  };
}
export function bridgeDeployed(progress, bridge) {
  return (
    !bridge.requires ||
    progress.completed ||
    bridge.stage < progress.stage ||
    !!progress.field?.includes(bridge.requires)
  );
}
export function bridgeDeckY(bridge, along) {
  const length = Math.hypot(bridge.bx - bridge.ax, bridge.bz - bridge.az),
    t = Math.max(0, Math.min(1, along / length));
  return (
    bridge.ay +
    (bridge.by - bridge.ay) * t -
    Math.min(1.15, length * 0.022) * Math.sin(Math.PI * t)
  );
}
export function bridgeGaps(bridge) {
  if (!bridge.damaged) return [];
  const length = Math.hypot(bridge.bx - bridge.ax, bridge.bz - bridge.az),
    count = Math.ceil(length / 0.8),
    step = length / count;
  const fractions =
    bridge.gapCount === 2 && length > 25 ? [0.35, 0.69] : [0.52];
  return fractions.map((f) => {
    const first = Math.floor(count * f);
    return { start: first * step, end: (first + 2) * step };
  });
}
export function bridgeHasGap(bridge, along) {
  return (bridge.gaps || bridgeGaps(bridge)).some(
    (g) => along >= g.start && along < g.end,
  );
}

export function bridgeCut(bridge, x, z) {
  const p = spanCoordinates(bridge, x, z);
  if (p.along < 0 || p.along > p.length || Math.abs(p.across) > 11) return 0;
  return (
    bridge.depth *
    smooth(2, 5, p.along) *
    smooth(2, 5, p.length - p.along) *
    (1 - smooth(5, 11, Math.abs(p.across)))
  );
}
export function skyDeckAt(game, x, z, maxY = Infinity) {
  let result = null;
  for (const bridge of game.skyBridges || []) {
    if (bridge.open < 0.995) continue;
    const p = spanCoordinates(bridge, x, z);
    if (
      p.along < 0 ||
      p.along > p.length ||
      Math.abs(p.across) > bridge.width / 2 ||
      bridgeHasGap(bridge, p.along)
    )
      continue;
    const height = bridgeDeckY(bridge, p.along);
    if (height > maxY + 0.2 || (result && result.height >= height)) continue;
    result = { height, surface: { skyBridge: bridge.id }, bridge };
  }
  return result;
}
export function skySpanCorridor(game, x, z) {
  return (game.skyBridges || []).some((b) => {
    const p = spanCoordinates(b, x, z);
    return p.along >= -2 && p.along <= p.length + 2 && Math.abs(p.across) < 4.5;
  });
}

export function skyBridgeBlocked(game, x, z, y) {
  return (game.skyBridges || []).some((b) => {
    if (b.open >= 0.995) return false;
    const p = spanCoordinates(b, x, z);
    if (
      Math.abs(p.across) > b.width / 2 + 0.25 ||
      p.along < 0 ||
      p.along > p.length
    )
      return false;
    const angle = (1 - b.open) * Math.PI * 0.47,
      half = p.along > p.length / 2;
    const distance = half ? p.length - p.along : p.along;
    if (distance > (Math.cos(angle) * p.length) / 2) return false;
    const height = (half ? b.by : b.ay) + distance * Math.tan(angle);
    return y < height + 0.2 && y + 1.8 > height - 0.2;
  });
}
