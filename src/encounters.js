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
