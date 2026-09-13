import { galleryWaterAt } from "./sunken-gallery-layout.js";
import { ARCADE_SITE, ARCADE_POOL } from "./arcade-lock-rules.js";

const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function waterSites(map, level) {
  const sites = [];
  if (map.arcadeLock)
    sites.push({
      id: "arcade-lock",
      kind: "water",
      ...ARCADE_POOL,
      depth: 3.2,
      baseOffset: 0.6,
      arcade: true,
      room: { x: ARCADE_SITE.x / 7, z: ARCADE_SITE.z / 7 },
    });
  if (map.fireVault)
    sites.push({
      id: "rainkeeper-pool",
      kind: "water",
      x: map.fireVault.x * 7,
      z: map.fireVault.z * 7,
      width: 41.4,
      length: 47,
      depth: 0,
      baseOffset: 1.3,
      room: map.fireVault,
    });
  const kind =
    level.biome === "volcano"
      ? "lava"
      : level.biome === "snow"
        ? "ice"
        : "water";
  for (const [i, room] of map.rooms.entries())
    // Wind courts have occupied working pads here. Their supplied cascades use
    // the dedicated basins below; an additional broad excavation leaves only
    // disconnected strips of water around the protected controls.
    if (i % 2 === 1 && level.biome !== "sky")
      sites.push({
        id: `reservoir-${i}`,
        kind,
        x: (room.x - 1.2) * 7,
        z: (room.z + 1.4) * 7,
        width: 15,
        length: 15,
        depth:
          kind === "water"
            ? level.biome === "water"
              ? [5.8, 7.2, 6.4, 8, 9][Math.floor(i / 2)]
              : 1.65
            : 0,
        room,
        stage: i - 1,
      });
  if (["jungle", "water", "sky"].includes(level.biome))
    for (const index of [0, 3, map.rooms.length - 1]) {
      const room = map.rooms[index];
      sites.push({
        id: `basin-${index}`,
        kind: "water",
        // Keep the cascade west of the cipher drums and wind intake controls.
        x: room.x * 7 - 12,
        z: room.z * 7 + 9.4,
        width: 5,
        length: 6.2,
        depth: 0.85,
        room,
        fall: index,
      });
    }
  return sites.map((site) => {
    if (site.kind === "lava")
      return {
        ...site,
        bedWidth: site.width,
        bedLength: site.length,
        width: site.width + 3.5,
        length: site.length + 3.5,
        depth: 0.42,
        baseOffset: -0.08,
        slagBasin: true,
      };
    if (
      ["desert", "crystal", "eclipse"].includes(level.biome) &&
      site.id.startsWith("reservoir-")
    )
      return {
        ...site,
        bedWidth: site.width,
        bedLength: site.length,
        width: site.width + 3.5,
        length: site.length + 3.5,
        baseOffset: -0.18,
        shore: level.biome,
      };
    if (
      !["jungle", "water", "sky"].includes(level.biome) ||
      site.depth <= 0 ||
      site.baseOffset !== undefined
    )
      return site;
    // A coarse terrain cell blends the excavated bed beyond its analytic edge.
    // Continue the water across that entire cell, below the surrounding terrace,
    // so its visible shoreline is the ground intersection, not the mesh border.
    return {
      ...site,
      bedWidth: site.width,
      bedLength: site.length,
      width: site.width + 3.5,
      length: site.length + 3.5,
      // The lowest palace terrace must still drain its full 1.8 m without
      // dropping below the sea. Both offsets leave room for the wave crests.
      baseOffset: level.biome === "water" ? -0.08 : -0.18,
    };
  });
}
export function basinDepression(site, x, z) {
  const width = site.bedWidth ?? site.width,
    length = site.bedLength ?? site.length,
    dx = width / 2 - Math.abs(x - site.x),
    dz = length / 2 - Math.abs(z - site.z);
  if (site.slagBasin) {
    const px = (x - site.x) / (width / 2);
    const pz = (z - site.z) / (length / 2);
    const angle = Math.atan2(pz, px);
    const phase = (site.stage || 0) * 1.7;
    const radius = Math.hypot(px, pz);
    const edge =
      0.86 +
      Math.sin(angle * 3 + phase) * 0.055 +
      Math.cos(angle * 5 - phase) * 0.035;
    return site.depth * (1 - smooth(0.45, edge, radius));
  }
  const rectangular =
    site.depth * smooth(0, Math.min(2.8, width * 0.28), Math.min(dx, dz));
  if (!site.shore) return rectangular;
  const px = (x - site.x) / (width / 2),
    pz = (z - site.z) / (length / 2),
    phase = (site.stage || 0) * 0.73,
    angle = Math.atan2(pz, px);
  let radius = Math.hypot(px, pz),
    edge;
  if (site.shore === "desert") {
    // A broad sandy pocket with small, uneven lobes along its receiving bank.
    radius = Math.hypot(px * 0.92, pz * 1.1);
    edge =
      0.88 +
      Math.sin(angle * 3 + phase) * 0.055 +
      Math.cos(angle * 5 - phase) * 0.025;
  } else if (site.shore === "crystal") {
    // Fractured mineral shelves give each pool five, six or seven major faces.
    const sides = 5 + (Math.floor((site.stage || 0) / 2) % 3),
      sector = (Math.PI * 2) / sides,
      turn = ((((angle + phase) % sector) + sector) % sector) - sector / 2;
    edge = (0.94 * Math.cos(Math.PI / sides)) / Math.cos(turn);
  } else {
    // Rounded reflecting pools echo the observatory's orbital construction.
    radius = Math.hypot(px * 1.04, pz * 0.96);
    edge = 0.9 + Math.sin(angle * 4 + phase) * 0.025;
  }
  // Never excavate beyond the former basin. The enlarged render bounds only
  // cover interpolation at its edge, and remain buried beneath the dry terrace.
  return Math.min(rectangular, site.depth * (1 - smooth(0.38, edge, radius)));
}

// The visible terrain intersection defines the dangerous part of each pool.
// Its rectangular render bounds include buried margins and are not a hazard.
export function hotLavaAt(game, x, z) {
  for (const water of game.waterMeshes || []) {
    const site = water.userData;
    if (
      site.kind === "lava" &&
      !site.cooled &&
      Math.abs(x - water.position.x) < site.width / 2 &&
      Math.abs(z - water.position.z) < site.length / 2 &&
      water.position.y - game.groundHeight(x, z) > 0.008
    )
      return water;
  }
  return null;
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
export function waterAt(game, x, z, y = Infinity) {
  const interior = galleryWaterAt(game, x, z, y);
  if (interior) return interior;
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
