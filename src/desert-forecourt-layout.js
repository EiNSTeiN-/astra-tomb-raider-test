// The foreground spaces occupy the shoulders of the solar procession, away
// from its optics. Offset pairs give the ten courts different ground plans.
const COURTS = [
  [
    [-1, "gallery", 32, 8.6],
    [1, "cistern", 35, 8.0],
  ],
  [
    [-1, "broken", 34, 8.2],
    [1, "gallery", 32, 9.2],
  ],
  [
    [-1, "cistern", 32, 8.4],
    [1, "relief", 36, 7.8],
  ],
  [
    [-1, "gallery", 36, 8.0],
    [1, "broken", 32, 9.0],
  ],
  [
    [-1, "relief", 33, 9.0],
    [1, "cistern", 36, 8.4],
  ],
  [
    [-1, "cistern", 36, 8.0],
    [1, "gallery", 33, 8.6],
  ],
  [
    [-1, "broken", 32, 8.6],
    [1, "relief", 35, 9.0],
  ],
  [
    [-1, "gallery", 34, 9.0],
    [1, "cistern", 32, 8.0],
  ],
  [
    [-1, "relief", 36, 8.4],
    [1, "gallery", 32, 8.0],
  ],
  [
    [-1, "cistern", 33, 9.2],
    [1, "broken", 36, 8.6],
  ],
];

export function desertForecourtPlan(room) {
  return COURTS[room.index % COURTS.length].map(([side, kind, z, width]) => ({
    side,
    kind,
    x: side * 13.5,
    z,
    width,
    depth: 8.4,
    height: kind === "relief" ? 2.65 : kind === "broken" ? 0.65 : 1.05,
  }));
}

export function addDesertForecourtMap(map, level) {
  if (level.biome !== "desert") return map;
  map.desertForecourtAnnexes = map.rooms.flatMap((room) =>
    desertForecourtPlan(room).map((plan) => {
      const x = room.x * 7 + plan.x,
        z = room.z * 7 + plan.z,
        cells = [];
      for (
        let gz = room.z + 2;
        gz <= Math.ceil((z + plan.depth / 2 + 1) / 7);
        gz++
      )
        for (
          let gx = Math.floor((x - plan.width / 2 - 1) / 7);
          gx <= Math.ceil((x + plan.width / 2 + 1) / 7);
          gx++
        )
          if (gx > 0 && gz > 0 && gx < map.size - 1 && gz < map.size - 1) {
            map.grid[gz][gx] = 1;
            cells.push([gx, gz]);
          }
      return { room: room.index, ...plan, worldX: x, worldZ: z, cells };
    }),
  );
  return map;
}
