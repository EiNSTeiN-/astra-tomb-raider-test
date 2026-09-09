export const ENEMY_TYPES = {
  warden: {
    name: "Stone warden",
    hp: 5,
    speed: 2.8,
    reach: 3.6,
    windup: 0.9,
    recovery: 1.45,
    damage: 18,
    color: 0xe5a86b,
  },
  hunter: {
    name: "Ridge hunter",
    hp: 4,
    speed: 3.8,
    reach: 11,
    windup: 1.1,
    recovery: 1.65,
    damage: 16,
    color: 0xe6ce80,
  },
  sentry: {
    name: "Sanctuary sentry",
    hp: 4,
    speed: 1.8,
    reach: 23,
    windup: 1.25,
    recovery: 1.5,
    damage: 14,
    color: 0x79c7d3,
  },
  bulwark: {
    name: "Shield keeper",
    hp: 8,
    speed: 2,
    reach: 4.2,
    windup: 1.2,
    recovery: 2.1,
    damage: 24,
    color: 0xd59de3,
  },
};
export const ENCOUNTER_PALETTES = {
  jungle: ["warden", "hunter", "warden"],
  desert: ["sentry", "bulwark", "sentry"],
  snow: ["hunter", "sentry", "warden"],
  water: ["sentry", "warden", "bulwark"],
  volcano: ["bulwark", "hunter", "bulwark"],
  sky: ["hunter", "sentry", "hunter"],
  crystal: ["sentry", "sentry", "bulwark"],
  eclipse: ["bulwark", "sentry", "hunter"],
};
export function encounterType(biome, stage, slot = 0) {
  const palette = ENCOUNTER_PALETTES[biome];
  return palette[(stage + slot) % palette.length];
}

// Watch routes stay on the two outer flanks of each sanctuary. Their stops are
// authored in room cells; collision-aware navigation follows the built courts.
const WATCH_ROUTES = {
  jungle: [
    [2, -2],
    [2.6, -0.5],
    [0.5, -2.6],
  ],
  desert: [
    [2, -2],
    [2.7, -0.5],
    [2.7, 1.1],
  ],
  snow: [
    [2, -2],
    [0.4, -2.6],
    [2.7, -2.6],
  ],
  water: [
    [2, -2],
    [2.7, -2.1],
    [2.7, 0.6],
  ],
  volcano: [
    [2, -2],
    [2.65, -0.5],
    [1.05, -2.65],
    [2.65, -2.65],
  ],
  sky: [
    [2, -2],
    [2.65, -2.65],
    [2.65, 0.5],
  ],
  crystal: [
    [2, -2],
    [2.65, -1],
    [0.6, -2.65],
  ],
  eclipse: [
    [2, -2],
    [2.65, 1.2],
    [2.65, -2.65],
    [0.8, -2.65],
  ],
};
export function guardianPatrolPlan(biome, room, slot, stage) {
  const sign = slot ? -1 : 1;
  return {
    pace: biome === "snow" ? 0.43 : biome === "volcano" ? 0.6 : 0.52,
    initialWait: 2.5 + slot * 2.7 + (stage % 3) * 0.8,
    stops: WATCH_ROUTES[biome].map(([x, z], i) => ({
      x: (room.x + x * sign) * 7,
      z: (room.z + z * sign) * 7,
      wait: 2.2 + ((stage + i + slot) % 3) * 1.1,
      // Alternate looking across the forecourt and along the outside wall.
      yaw: Math.atan2(-x * sign, -z * sign) + (i % 2 ? sign * 0.65 : 0),
    })),
  };
}
