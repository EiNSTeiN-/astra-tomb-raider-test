const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Material coordinates only: this plan never changes collision or ground height.
export function coastalLayout(map) {
  const rooms = map.rooms.map((r) => ({
    x: r.x * 7,
    z: r.z * 7,
    index: r.index,
    radius: Math.min(23, r.r * 7 + 1.5),
  }));
  const routes = new Set(
    map.paths.flatMap((path) => path.map((p) => `${p.x},${p.z}`)),
  );
  function nearest(x, z) {
    let room = rooms[0],
      best = Infinity;
    for (const candidate of rooms) {
      const d = (x - candidate.x) ** 2 + (z - candidate.z) ** 2;
      if (d < best) {
        room = candidate;
        best = d;
      }
    }
    return room;
  }
  function coverage(x, z) {
    const gx = Math.round(x / 7),
      gz = Math.round(z / 7);
    if (!map.grid[gz]?.[gx]) return 0;
    const room = nearest(x, z);
    const edge =
      room.radius - Math.max(Math.abs(x - room.x), Math.abs(z - room.z));
    let paving = smooth(-0.8, 2.2, edge);
    // Continuous paving follows the actual orthogonal causeway cells and turns.
    if (routes.has(`${gx},${gz}`)) {
      const dx = Math.abs(x - gx * 7),
        dz = Math.abs(z - gz * 7);
      const horizontal =
        routes.has(`${gx - 1},${gz}`) || routes.has(`${gx + 1},${gz}`);
      const vertical =
        routes.has(`${gx},${gz - 1}`) || routes.has(`${gx},${gz + 1}`);
      const distance = Math.min(
        horizontal ? dz : 9,
        vertical ? dx : 9,
        Math.hypot(dx, dz),
      );
      paving = Math.max(paving, 1 - smooth(2.2, 3.25, distance));
    }
    return paving;
  }
  return { rooms, routes, nearest, coverage };
}
