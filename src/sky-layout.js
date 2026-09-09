import { addCourierFerry } from "./courier-rules.js";
import { EXPEDITIONS } from "./expeditions.js";
import {
  encounterType,
  ENEMY_TYPES,
  guardianPatrolPlan,
} from "./encounters.js";

export const SKY_ROUTE_VERSION = 1;

// Alternating cliff courts ascend across a valley. The three stations of each
// sector occupy real intermediate islands on its crossing, not unrelated spurs.
export function createSkyMap(level, rng) {
  const size = 61,
    grid = Array.from({ length: size }, () => Array(size).fill(0));
  const paths = [],
    rooms = [],
    sideRooms = [],
    fieldSites = [],
    features = [],
    bridges = [];
  const carve = (x, z, radius = 0) => {
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++)
        if (
          grid[z + dz]?.[x + dx] !== undefined &&
          x + dx > 0 &&
          z + dz > 0 &&
          x + dx < size - 1 &&
          z + dz < size - 1
        )
          grid[z + dz][x + dx] = 1;
  };
  const connect = (a, b) => {
    const distance = Math.hypot(b.x - a.x, b.z - a.z),
      points = [];
    for (let i = 0; i <= Math.ceil(distance * 4); i++) {
      const t = i / Math.ceil(distance * 4),
        x = Math.round(a.x + (b.x - a.x) * t),
        z = Math.round(a.z + (b.z - a.z) * t);
      carve(x, z);
      if (!points.length || points.at(-1).x !== x || points.at(-1).z !== z)
        points.push({ x, z });
    }
    // Fill diagonal elbows for the map's four-neighbor connectivity and a full
    // character footprint at bank approaches. Physical decks remain narrower.
    for (let i = 1; i < points.length; i++) carve(points[i].x, points[i - 1].z);
    paths.push(points);
  };
  for (let i = 0; i <= level.mechanisms; i++) {
    const room = {
      x: 12 + (i % 2) * 35,
      z: 6 + i * 5,
      r: i === level.mechanisms ? 4 : 3,
      index: i,
    };
    rooms.push(room);
    carve(room.x, room.z, room.r);
    if (i)
      features.push({
        id: `mechanism-${i - 1}`,
        type: "mechanism",
        x: room.x,
        z: room.z,
        stage: i - 1,
        puzzle: (i - 1) % 3,
        answer: Array.from({ length: i > 5 ? 4 : 3 }, () =>
          Math.floor(rng() * 4),
        ),
      });
  }
  features.push({ id: "camp-0", type: "camp", x: rooms[0].x, z: rooms[0].z });
  for (const r of rooms.filter((r) => r.index > 0 && r.index % 3 === 0))
    features.push({
      id: `camp-${r.index / 3}`,
      type: "camp",
      x: r.x - 2,
      z: r.z - 2,
    });
  for (let i = 0; i < 18; i++) {
    const bank = rooms[Math.floor(i / 2)],
      room = {
        x: bank.x + (bank.x < 30 ? -7 : 7),
        z: bank.z + (i % 2 ? 2 : -2),
        r: 1,
        index: i,
      };
    sideRooms.push(room);
    carve(room.x, room.z, room.r);
    connect(bank, room);
    features.push({
      id: `${i < 12 ? "note" : "treasure"}-${i}`,
      type: i < 12 ? "note" : "treasure",
      x: room.x,
      z: room.z,
      note: i % 12,
    });
  }
  for (const [stage, mission] of EXPEDITIONS[level.id].entries()) {
    const a = rooms[stage],
      b = rooms[stage + 1],
      nodes = [a];
    for (const task of mission.tasks) {
      const fraction = [0.14, 0.46, 0.77][task.step];
      const site = {
        x: Math.round(a.x + (b.x - a.x) * fraction),
        z: Math.round(a.z + (b.z - a.z) * fraction),
        r: 2,
      };
      fieldSites.push(site);
      nodes.push(site);
      carve(site.x, site.z, site.r);
      features.push({
        ...task,
        type: "field",
        x: site.x,
        z: site.z,
        place: mission.place,
      });
    }
    nodes.push(b);
    for (let section = 0; section < nodes.length - 1; section++) {
      const from = nodes[section],
        to = nodes[section + 1];
      connect(from, to);
      // The last station and next sector's departure share the cliff bank.
      // Keep that approach as a causeway; suspended decks cross the two actual
      // ravines between intermediate islands instead of cutting into a bank.
      if (section === 3) continue;
      const dx = (to.x - from.x) * 7,
        dz = (to.z - from.z) * 7,
        length = Math.hypot(dx, dz);
      const trimA = from.r * 7 + 4,
        trimB = to.r * 7 + 4;
      if (length - trimA - trimB < 7) continue;
      const task = mission.tasks[section - 1];
      bridges.push({
        id: `sky-span-${stage}-${section}`,
        stage,
        section,
        ax: from.x * 7 + (dx / length) * trimA,
        az: from.z * 7 + (dz / length) * trimA,
        bx: to.x * 7 - (dx / length) * trimB,
        bz: to.z * 7 - (dz / length) * trimB,
        width: 4.6,
        depth: 24,
        requires:
          task && ["winch", "climb"].includes(task.kind) ? task.id : null,
        damaged: stage > 0,
        gapCount: stage >= 5 && section < 3 ? 2 : 1,
      });
    }
  }
  const end = rooms.at(-1);
  features.push({ id: "relic", type: "relic", x: end.x + 2, z: end.z + 2 });
  const enemies = rooms.slice(2).flatMap((r, i) =>
    [0, 1].map((slot) => {
      const kind = encounterType(level.biome, i, slot);
      return {
        id: `guardian-${i}${slot ? "-1" : ""}`,
        kind,
        x: r.x + (slot ? -2 : 2),
        z: r.z + (slot ? 2 : -2),
        yaw: Math.atan2(
          rooms[i + 1].x - r.x - (slot ? -2 : 2),
          rooms[i + 1].z - r.z - (slot ? 2 : -2),
        ),
        hp: ENEMY_TYPES[kind].hp,
        patrolPlan: guardianPatrolPlan(level.biome, r, slot, i),
      };
    }),
  );
  return addCourierFerry({
    size,
    grid,
    rooms,
    sideRooms,
    fieldSites,
    paths,
    features,
    enemies,
    bridges,
    routeVersion: SKY_ROUTE_VERSION,
    spawn: { x: rooms[0].x, z: rooms[0].z + 2 },
  });
}

// Preserve discoveries and objective completion when an older sky layout is
// loaded, but put its obsolete location at the bank of the current sector.
export function migrateSkyRoute(progress, map) {
  if (!map.routeVersion || progress.routeVersion === map.routeVersion)
    return false;
  const room = map.rooms[Math.min(progress.stage, map.rooms.length - 1)];
  progress.position = { x: room.x * 7, z: (room.z + 2) * 7, height: 0 };
  progress.checkpoint = { x: progress.position.x, z: progress.position.z };
  progress.traversal = null;
  progress.routeVersion = map.routeVersion;
  return true;
}
