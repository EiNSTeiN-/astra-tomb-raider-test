// Foregrounds follow the sequence of the foundry: receiving, air, fuel,
// pressure, gears, casting, pilot fires, quenching and the heart engine.
const COURTS = [
  [
    [-25, 21, 18, 18, "loading"],
    [25, 17, 10, 16, "terraces"],
  ],
  [
    [-24, 22, 18, 20, "gallery"],
    [36, 24, 14, 16, "channels"],
  ],
  [
    [-24, 24, 19, 18, "bins"],
    [23, -9, 10, 10, "broken"],
  ],
  [
    [-25, 22, 19, 18, "channels"],
    [38, 29, 14, 14, "terraces"],
  ],
  [
    [-25, 21, 20, 18, "ring"],
    [36, 22, 14, 17, "gallery"],
  ],
  [
    [-24, 22, 18, 18, "casting"],
    [36, 18, 14, 18, "bins"],
  ],
  [
    [-25, 21, 18, 20, "gallery"],
    [36, 20, 14, 18, "broken"],
  ],
  [
    [-25, 23, 19, 18, "basin"],
    [36, 31, 14, 14, "terraces"],
  ],
  [
    [-25, 22, 20, 22, "portal"],
    [36, 23, 15, 18, "casting"],
  ],
];

export function forgeForecourtPlan(room) {
  return COURTS[room.index].map(([x, z, width, depth, kind], index) => ({
    room: room.index,
    index,
    x,
    z,
    width,
    depth,
    kind,
    side: Math.sign(x),
  }));
}

// Extend the walking shoulders after objectives and optional routes have been
// authored, without moving their IDs, paths, positions or random sequence.
export function addForgeForecourtMap(map, level) {
  if (level.biome !== "volcano") return map;
  map.forgeForecourtAnnexes = map.rooms.flatMap((room) =>
    forgeForecourtPlan(room).map((plan) => {
      const x = room.x * 7 + plan.x,
        z = room.z * 7 + plan.z,
        cells = [];
      const inner = room.x * 7 + plan.side * 12;
      for (
        let gz = Math.floor(
          Math.min(z - plan.depth / 2 - 2, room.z * 7 + 12) / 7,
        );
        gz <= Math.ceil((z + plan.depth / 2 + 2) / 7);
        gz++
      )
        for (
          let gx = Math.floor(Math.min(inner, x - plan.width / 2 - 2) / 7);
          gx <= Math.ceil(Math.max(inner, x + plan.width / 2 + 2) / 7);
          gx++
        )
          if (gx > 0 && gz > 0 && gx < map.size - 1 && gz < map.size - 1) {
            map.grid[gz][gx] = 1;
            cells.push([gx, gz]);
          }
      return { ...plan, worldX: x, worldZ: z, cells };
    }),
  );
  return map;
}

export function forgeForecourtWalls(plan) {
  const { x, z, width: w, depth: d, side, kind } = plan,
    out = [];
  const wall = (dx, dz, width, depth, height = 1.05) =>
    out.push({ x: x + dx, z: z + dz, w: width, d: depth, height });
  const gap = 4.5;
  // Three independent entrances: from the hall, the front and the outer lane.
  for (const sign of [-1, 1]) {
    wall(
      (sign * (w + gap)) / 4,
      -d / 2,
      (w - gap) / 2,
      0.78,
      kind === "broken" ? 0.6 : 1.15,
    );
    wall(
      (side * w) / 2,
      (sign * (d + gap)) / 4,
      0.78,
      (d - gap) / 2,
      kind === "gallery" ? 2.45 : 1.3,
    );
    if (kind !== "broken") wall(sign * (w * 0.39), d / 2, w * 0.22, 0.78, 0.7);
  }
  if (kind === "terraces")
    for (let i = 0; i < 3; i++)
      wall(side * (w / 2 - 2 - i * 1.2), 0, 0.9, d - 7, 0.32 + i * 0.25);
  if (kind === "bins" || kind === "loading")
    for (let i = 0; i < 3; i++)
      wall(
        side * (w / 2 - 2),
        -d / 2 + 3 + i * 3.5,
        3.8,
        0.55,
        kind === "bins" ? 1.05 : 0.65,
      );
  if (kind === "ring") {
    wall(-w / 2 + 2, -d / 2 + 2, 3.3, 0.78, 1.65);
    wall(w / 2 - 2, -d / 2 + 2, 3.3, 0.78, 1.65);
    wall(-w / 2 + 2, d / 2 - 2, 0.78, 3.3, 1.1);
    wall(w / 2 - 2, d / 2 - 2, 0.78, 3.3, 1.1);
  }
  return out;
}
