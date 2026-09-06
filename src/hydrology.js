const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function waterSites(map, level) {
  const sites = [];
  const kind =
    level.biome === "volcano"
      ? "lava"
      : level.biome === "snow"
        ? "ice"
        : "water";
  for (const [i, room] of map.rooms.entries())
    if (i % 2 === 1)
      sites.push({
        id: `reservoir-${i}`,
        kind,
        x: (room.x - 1.2) * 7,
        z: (room.z + 1.4) * 7,
        width: 15,
        length: 15,
        depth: kind === "water" ? (level.biome === "water" ? 2.65 : 1.65) : 0,
        room,
        stage: i - 1,
      });
  if (["jungle", "water", "sky"].includes(level.biome))
    for (const index of [0, 3, map.rooms.length - 1]) {
      const room = map.rooms[index];
      sites.push({
        id: `basin-${index}`,
        kind: "water",
        x: room.x * 7 - 9,
        z: room.z * 7 + 9.4,
        width: 5,
        length: 6.2,
        depth: 0.62,
        room,
        fall: index,
      });
    }
  return sites;
}
export function basinDepression(site, x, z) {
  const dx = site.width / 2 - Math.abs(x - site.x),
    dz = site.length / 2 - Math.abs(z - site.z);
  return (
    site.depth * smooth(0, Math.min(2.8, site.width * 0.28), Math.min(dx, dz))
  );
}
export function protectedGround(map, x, z, biome) {
  let keep = 0;
  for (const site of map.fieldSites || []) {
    const distance = Math.max(
      Math.abs(x - site.x * 7),
      Math.abs(z - site.z * 7),
    );
    keep = Math.max(keep, 1 - smooth(13, 16, distance));
  }
  for (const f of map.features) {
    if (f.type === "field") continue;
    // The wind mechanisms extend into their forecourts. Keep their working
    // ground continuous; excavating a reservoir here strands handwheels below
    // the swimming surface. Blend back into the basin outside the walking lanes.
    if (biome === "sky" && f.type === "mechanism") {
      const outside = Math.max(
        0,
        Math.abs(x - f.x * 7) - 12,
        Math.abs(z - f.z * 7 - 14) - 9,
      );
      keep = Math.max(keep, 1 - smooth(0, 2, outside));
    }
    if (f.type === "mechanism" && f.stage === 0) {
      const distance = Math.max(Math.abs(x - f.x * 7), Math.abs(z - f.z * 7));
      keep = Math.max(keep, 1 - smooth(6, 7.5, distance));
    }
    const distance = Math.hypot(x - f.x * 7, z - f.z * 7);
    keep = Math.max(keep, 1 - smooth(3.5, 5, distance));
  }
  return keep;
}
export function waterAt(game, x, z) {
  let result = null;
  for (const water of game.waterMeshes || []) {
    const data = water.userData;
    if (data.kind !== "water") continue;
    if (
      Math.abs(x - water.position.x) > data.width / 2 ||
      Math.abs(z - water.position.z) > data.length / 2
    )
      continue;
    const depth = water.position.y - game.groundHeight(x, z);
    if (depth > 0.025 && (!result || water.position.y > result.y))
      result = { water, y: water.position.y, depth };
  }
  return result;
}
