// Authored pairs give each court a different foreground: processional walls,
// open reliquary gardens, broken enclosures and short terraced resting places.
const COURTS = [
  [
    [-1, "garden", 13, 0.8],
    [1, "rest", 16, 0.65],
  ],
  [
    [-1, "procession", 15, 1.1],
    [1, "reliquary", 13, 0.95],
  ],
  [
    [-1, "reliquary", 12, 1.05],
    [1, "broken", 16, 0.8],
  ],
  [
    [-1, "rest", 15, 0.7],
    [1, "garden", 13, 1.2],
  ],
  [
    [-1, "broken", 13, 1.1],
    [1, "procession", 16, 0.85],
  ],
  [
    [-1, "garden", 16, 0.9],
    [1, "reliquary", 12, 1.15],
  ],
  [
    [-1, "procession", 12, 1.2],
    [1, "rest", 16, 0.8],
  ],
  [
    [-1, "reliquary", 15, 0.8],
    [1, "garden", 12, 1.05],
  ],
  [
    [-1, "garden", 14, 1.3],
    [1, "broken", 20, 0.7],
  ],
];

export function monasteryGardenPlan(room) {
  return COURTS[room.index % COURTS.length].map(([side, kind, z, height]) => {
    z += 14;
    const x = side * 13,
      walls = [
        { x: x - 2.65, z: z - 3.4, w: 2.7, d: 0.7, height },
        { x: x + 2.65, z: z - 3.4, w: 2.7, d: 0.7, height },
        { x: x - 4, z: z - 1.8, w: 0.7, d: 2.5, height: height * 0.85 },
        { x: x + 4, z: z - 1.8, w: 0.7, d: 2.5, height: height * 0.85 },
        { x: x - 4, z: z + 2.1, w: 0.7, d: 1.6, height: height * 0.65 },
        { x: x + 4, z: z + 2.1, w: 0.7, d: 1.6, height: height * 0.65 },
      ];
    if (kind === "broken") walls.splice(side < 0 ? 2 : 3, 2);
    if (kind === "procession") {
      walls.splice(4);
      walls[0].height *= 1.35;
      walls[1].height *= 1.35;
    }
    if (kind === "rest") walls.splice(0, 2);
    const gallery = ["rest", "procession"].includes(kind)
      ? {
          x,
          z: z - 2,
          width: 8.1,
          depth: 4.5,
          rise: 0.85,
          damage: kind === "rest" ? 1 : 0,
        }
      : null;
    return { side, kind, x, z, height, walls, gallery };
  });
}

// Carve connected foreground annexes after objectives and side missions are
// authored. Existing feature IDs, room centres, paths and randomness stay intact.
export function addMonasteryGardenMap(map, level) {
  if (level.biome !== "snow") return map;
  map.monasteryGardenAnnexes = map.rooms.flatMap((room) =>
    monasteryGardenPlan(room).map((plan) => {
      const x = room.x * 7 + plan.x,
        z = room.z * 7 + plan.z,
        cells = [];
      const minX = Math.floor((x - 5) / 7),
        maxX = Math.ceil((x + 5) / 7),
        minZ = room.z + 2,
        maxZ = Math.ceil((z + 5) / 7);
      for (let gz = minZ; gz <= maxZ; gz++)
        for (let gx = minX; gx <= maxX; gx++)
          if (gx > 0 && gz > 0 && gx < map.size - 1 && gz < map.size - 1) {
            map.grid[gz][gx] = 1;
            cells.push([gx, gz]);
          }
      return { room: room.index, ...plan, worldX: x, worldZ: z, cells };
    }),
  );
  return map;
}
