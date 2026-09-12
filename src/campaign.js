import { addSunBridge } from "./sun-bridge-rules.js";
import { addArcadeLock } from "./arcade-lock-rules.js";
import { addShutterHouse } from "./shutter-house-rules.js";
import { addEchoCauseway } from "./echo-causeway-rules.js";
import { addAstralCrane } from "./astral-crane-rules.js";
import { addTemperingCart } from "./tempering-cart-rules.js";
import { addRainGarden } from "./rain-garden-rules.js";
import { addEasternReflector } from "./eastern-reflector-rules.js";
import { addFrozenStair } from "./frozen-stair-rules.js";
import { addSurveyorsCleft } from "./cleft-rules.js";
import { addPressureRelay } from "./pressure-rules.js";
import { addEchoGallery } from "./echo-gallery-rules.js";
import { addOrbitVault } from "./orbit-rules.js";
import { EXPEDITIONS } from "./expeditions.js";
import {
  encounterType,
  ENEMY_TYPES,
  guardianPatrolPlan,
} from "./encounters.js";
import { createSkyMap } from "./sky-layout.js";
import { addBellHoist } from "./bell-hoist-rules.js";
import { addFireVault } from "./fire-vault-rules.js";

export const LEVELS = [
  {
    id: "verdant",
    title: "The Verdant Veil",
    location: "SIEM REAP, CAMBODIA",
    biome: "jungle",
    tag: "Into the unknown",
    type: "Exploration · Ancient mechanisms",
    description:
      "Beyond the last mapped river, a temple breathes beneath a thousand years of green. Follow your mother’s final coordinates into the heart of the jungle.",
    goal: "Restore the ancient sun gates",
    artifact: "The Verdant Compass",
    color: "#92ab76",
    sky: 0xa7bcb0,
    fog: 0x8eac9b,
    ground: 0x617451,
    stone: 0x898b6d,
    water: 0x457e70,
    seed: 814,
    layout: "branch",
    mechanisms: 8,
    symbols: ["SUN", "ROOT", "RAIN", "MOON"],
    intro:
      "My mother disappeared looking for this place. Twenty years later, her compass is moving again.",
    objectiveNames: [
      "Wake the outer sanctuary",
      "Open the rootbound gate",
      "Trace the rain channels",
      "Decipher the keeper’s dial",
      "Restore the eastern altar",
      "Raise the sun bridge",
      "Illuminate the inner sanctum",
      "Unseal the heart of the temple",
    ],
  },
  {
    id: "sands",
    title: "Beneath the Sands",
    location: "RUB’ AL KHALI, OMAN",
    biome: "desert",
    tag: "What the desert keeps",
    type: "Navigation · Mirror puzzles",
    description:
      "An impossible doorway in the dunes leads to a city buried by its own ambition. Bend the light, read the stars, and outwit the guardians of the sun.",
    goal: "Reconnect the solar mirrors",
    artifact: "The Eye of Noon",
    color: "#d9b181",
    sky: 0xd7ba91,
    fog: 0xc9ac83,
    ground: 0xb69a6b,
    stone: 0xc8ae7d,
    water: 0x759e9b,
    seed: 1204,
    layout: "radial",
    mechanisms: 9,
    symbols: ["DAWN", "NOON", "DUSK", "NIGHT"],
    intro:
      "The people who built this city worshipped the sun. So why did they bury it?",
    objectiveNames: [
      "Find the buried entrance",
      "Turn the dawn mirror",
      "Open the western aqueduct",
      "Align the noon reflector",
      "Read the desert ephemeris",
      "Restore the eastern reflector",
      "Rekindle the light well",
      "Complete the solar circuit",
      "Enter the gilded sepulcher",
    ],
  },
  {
    id: "frost",
    title: "A Silence of Snow",
    location: "THE HIMALAYAS, NEPAL",
    biome: "snow",
    tag: "Above the world",
    type: "Climbing · Bell sequences",
    description:
      "On a knife-edge ridge, the bells of an abandoned monastery are ringing. Ascend the broken pilgrim trail and give a forgotten promise its voice.",
    goal: "Awaken the monastery’s bells",
    artifact: "The Winter Chime",
    color: "#bad0d6",
    sky: 0xb9cbd6,
    fog: 0xb1c5d0,
    ground: 0xd6dfdd,
    stone: 0x84979e,
    water: 0x78b4d0,
    seed: 3241,
    layout: "switchback",
    mechanisms: 8,
    symbols: ["WIND", "BELL", "ICE", "STAR"],
    intro:
      "There are no footprints in the snow. But someone has been lighting the lanterns.",
    objectiveNames: [
      "Cross the pilgrim’s pass",
      "Ring the valley bell",
      "Decode the prayer stones",
      "Restore the frozen stair",
      "Sound the bell of memory",
      "Open the wind chamber",
      "Ring the summit bell",
      "Unseal the silent library",
    ],
  },
  {
    id: "tides",
    title: "The Drowned Kingdom",
    location: "THE AEGEAN SEA, GREECE",
    biome: "water",
    tag: "The deep remembers",
    type: "Waterways · Hydraulic puzzles",
    description:
      "The tide is falling for the first time in centuries. Enter the flooded courts of a vanished kingdom and restore the machinery beneath the sea.",
    goal: "Drain the royal vault",
    artifact: "The Pearl of Tides",
    color: "#8fbbbe",
    sky: 0x879fa9,
    fog: 0x819fa6,
    ground: 0x627c7a,
    stone: 0x8ea39e,
    water: 0x287f8a,
    seed: 4242,
    layout: "islands",
    mechanisms: 9,
    symbols: ["TIDE", "SHELL", "WAVE", "DEEP"],
    intro:
      "A whole civilization erased from every map. The ocean is finally ready to tell its story.",
    objectiveNames: [
      "Reach the exposed causeway",
      "Release the harbor sluice",
      "Restore the coral pump",
      "Decipher the tidal calendar",
      "Drain the lower court",
      "Cross the sunken arcade",
      "Release the royal sluice",
      "Balance the pressure gates",
      "Open the abyssal vault",
    ],
  },
  {
    id: "embers",
    title: "A Heart of Embers",
    location: "THE RIFT VALLEY, ETHIOPIA",
    biome: "volcano",
    tag: "Forged in fire",
    type: "Survival · Forge mechanisms",
    description:
      "Below an active caldera lies a forge that should never have been built. Cross rivers of fire and reignite the engine of an ancient world.",
    goal: "Temper the obsidian key",
    artifact: "The Ember Heart",
    color: "#d69874",
    sky: 0x604b48,
    fog: 0x72534b,
    ground: 0x4b4742,
    stone: 0x655852,
    water: 0xff6726,
    seed: 5184,
    layout: "spiral",
    mechanisms: 8,
    symbols: ["ASH", "FIRE", "IRON", "SMOKE"],
    intro:
      "The ground is warm. The walls are humming. This place isn’t a tomb. It’s a machine.",
    objectiveNames: [
      "Find the cooling conduit",
      "Open the first furnace",
      "Restore the pressure relief",
      "Turn the obsidian gears",
      "Align the smelting channels",
      "Light the eternal forge",
      "Temper the ancient key",
      "Unlock the heart engine",
    ],
  },
  {
    id: "sky",
    title: "Where Eagles Sleep",
    location: "THE ANDES, PERU",
    biome: "sky",
    tag: "The edge of everything",
    type: "Traversal · Wind puzzles",
    description:
      "A city hangs between mountains, held together by rope, stone, and a forgotten understanding of the wind. Watch the bridge streamers: crouch to brace against gusts, then stand and steer into the wind for gap jumps. Find a way across the sky.",
    goal: "Rebuild the skyward passage",
    artifact: "The Feather of Stone",
    color: "#bbc5a4",
    sky: 0xabc1cf,
    fog: 0xc1cecc,
    ground: 0x82906a,
    stone: 0x9a9b82,
    water: 0x7eabbc,
    seed: 6488,
    layout: "bridges",
    mechanisms: 9,
    symbols: ["EAGLE", "WIND", "PEAK", "SKY"],
    intro:
      "My mother’s journal has one word for this place: impossible. She underlined it twice.",
    objectiveNames: [
      "Enter the cloud forest",
      "Restore the lower wind vane",
      "Unfold the first sky bridge",
      "Decipher the eagle’s path",
      "Align the mountain observatory",
      "Open the western crossing",
      "Restore the upper wind vane",
      "Unfold the summit bridge",
      "Reach the skyward altar",
    ],
  },
  {
    id: "crystal",
    title: "The Night Below",
    location: "THE CARPATHIANS, ROMANIA",
    biome: "crystal",
    tag: "A light in the dark",
    type: "Discovery · Resonance puzzles",
    description:
      "Under the roots of a ruined citadel, a forest of crystals glows in perfect silence. Find the frequency that can wake a sleeping memory.",
    goal: "Harmonize the crystal network",
    artifact: "The Memory Prism",
    color: "#b2a5db",
    sky: 0x292d47,
    fog: 0x38334f,
    ground: 0x4a475e,
    stone: 0x68637a,
    water: 0x765bb6,
    seed: 7731,
    layout: "caverns",
    mechanisms: 8,
    symbols: ["ECHO", "LIGHT", "DREAM", "VOID"],
    intro: "The crystals respond to my voice. I think they remember hers, too.",
    objectiveNames: [
      "Descend into the hollow",
      "Tune the first resonator",
      "Read the luminous archive",
      "Restore the echo chamber",
      "Harmonize the violet array",
      "Decode the sleeping memory",
      "Tune the heart resonator",
      "Open the prism reliquary",
    ],
  },
  {
    id: "eclipse",
    title: "The Last Meridian",
    location: "LOCATION UNKNOWN",
    biome: "eclipse",
    tag: "All roads end here",
    type: "Mastery · The final alignment",
    description:
      "All seven relics point to a place beyond the known world. Beneath an eclipsed sun, the oldest observatory on Earth waits for its last visitor.",
    goal: "Complete the celestial alignment",
    artifact: "The Atlas of Dawn",
    color: "#c7b681",
    sky: 0x535568,
    fog: 0x646273,
    ground: 0x6c6b68,
    stone: 0x979280,
    water: 0xab9149,
    seed: 8881,
    layout: "citadel",
    mechanisms: 10,
    symbols: ["EARTH", "SUN", "MOON", "STAR"],
    intro:
      "She didn’t disappear. She found the way through. And she left it open for me.",
    objectiveNames: [
      "Enter the meridian court",
      "Restore the earthly axis",
      "Align the lunar orrery",
      "Decipher the sevenfold archive",
      "Restore the solar axis",
      "Open the western horizon",
      "Align the astral orrery",
      "Complete the celestial circuit",
      "Release the hollow earth",
      "Follow the final meridian",
    ],
  },
];

export const SYMBOLS = {
  SUN: "☀",
  ROOT: "♧",
  RAIN: "≋",
  MOON: "☾",
  DAWN: "◔",
  NOON: "☀",
  DUSK: "◕",
  NIGHT: "✦",
  WIND: "≋",
  BELL: "♧",
  ICE: "❄",
  STAR: "✦",
  TIDE: "◔",
  SHELL: "◈",
  WAVE: "≋",
  DEEP: "▽",
  ASH: "⋮",
  FIRE: "♨",
  IRON: "◆",
  SMOKE: "≋",
  EAGLE: "⋎",
  PEAK: "△",
  SKY: "☀",
  ECHO: "◎",
  LIGHT: "✦",
  DREAM: "☾",
  VOID: "◯",
  EARTH: "⊕",
};
export function random(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createMap(level) {
  if (level.biome === "sky") return createSkyMap(level, random(level.seed));
  const rng = random(level.seed),
    size = 61,
    grid = Array.from({ length: size }, () => Array(size).fill(0));
  const rooms = [],
    paths = [];
  const carve = (x, z, r = 1) => {
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (x + dx > 0 && z + dz > 0 && x + dx < size - 1 && z + dz < size - 1)
          grid[z + dz][x + dx] = 1;
      }
  };
  const connect = (a, b) => {
    let x = a.x,
      z = a.z;
    const points = [];
    while (x !== b.x || z !== b.z) {
      carve(x, z, 0);
      points.push({ x, z });
      if (x !== b.x && (rng() > 0.45 || z === b.z)) x += Math.sign(b.x - x);
      else z += Math.sign(b.z - z);
    }
    carve(x, z, 0);
    paths.push(points);
  };
  const count = level.mechanisms + 1;
  for (let i = 0; i < count; i++) {
    let x, z;
    const angle = (i / count) * Math.PI * 2;
    switch (level.layout) {
      case "radial":
        x = 30 + Math.round(Math.cos(angle) * 23);
        z = 30 + Math.round(Math.sin(angle) * 23);
        break;
      case "spiral": {
        const radius = 25 - i * 1.8;
        x = 30 + Math.round(Math.cos(angle * 1.7) * radius);
        z = 30 + Math.round(Math.sin(angle * 1.7) * radius);
        break;
      }
      case "switchback":
        x = i % 2 ? 48 : 12;
        z = 6 + i * 5;
        break;
      case "islands":
        x = 10 + (i % 3) * 20;
        z = 10 + Math.floor(i / 3) * 14;
        break;
      case "bridges":
        x = 12 + (i % 2) * 35;
        z = 6 + i * 5;
        break;
      case "citadel":
        x = 30 + Math.round(Math.cos(angle) * (i % 2 ? 15 : 25));
        z = 30 + Math.round(Math.sin(angle) * (i % 2 ? 15 : 25));
        break;
      default:
        x = 8 + (i % 3) * 21 + Math.floor(rng() * 4);
        z = 7 + Math.floor(i / 3) * 17 + Math.floor(rng() * 4);
        break;
    }
    x = Math.max(5, Math.min(size - 6, x));
    z = Math.max(5, Math.min(size - 6, z));
    const room = { x, z, r: i === count - 1 ? 5 : 3, index: i };
    rooms.push(room);
    carve(x, z, room.r);
    if (i) connect(rooms[i - 1], room);
  }
  // Loops, side shrines, and long optional routes make each expedition an explorable place.
  if (["radial", "citadel", "caverns", "branch"].includes(level.layout)) {
    connect(rooms[0], rooms.at(-1));
    for (let i = 2; i < rooms.length; i += 3) connect(rooms[i], rooms[i - 2]);
  }
  const sideRooms = [];
  for (let i = 0; i < 18; i++) {
    const base = rooms[i % rooms.length];
    const x = Math.max(
      3,
      Math.min(size - 4, base.x + Math.round((rng() - 0.5) * 25)),
    );
    const z = Math.max(
      3,
      Math.min(size - 4, base.z + Math.round((rng() - 0.5) * 25)),
    );
    carve(x, z, 2);
    const room = { x, z, r: 2, index: i };
    connect(base, room);
    sideRooms.push(room);
  }
  const features = [];
  rooms.slice(1).forEach((room, i) =>
    features.push({
      id: `mechanism-${i}`,
      type: "mechanism",
      x: room.x,
      z: room.z,
      stage: i,
      puzzle: i % 3,
      answer: Array.from({ length: 3 + (i > 4 ? 1 : 0) }, () =>
        Math.floor(rng() * 4),
      ),
    }),
  );
  features.push({ id: "camp-0", type: "camp", x: rooms[0].x, z: rooms[0].z });
  rooms
    .filter((_, i) => i > 0 && i % 3 === 0)
    .forEach((r, i) =>
      features.push({
        id: `camp-${i + 1}`,
        type: "camp",
        x: r.x - 2,
        z: r.z - 2,
      }),
    );
  sideRooms.forEach((r, i) =>
    features.push({
      id: `${i < 12 ? "note" : "treasure"}-${i}`,
      type: i < 12 ? "note" : "treasure",
      x: r.x,
      z: r.z,
      note: i % 12,
    }),
  );
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
  const fieldSites = [];
  for (const [stage, mission] of EXPEDITIONS[level.id].entries()) {
    let previous = rooms[stage];
    for (const task of mission.tasks) {
      const center = rooms[stage + 1];
      let chosen = null,
        best = -Infinity;
      // Select a separate courtyard while keeping the route in this sector.
      // Existing discoveries and mechanism enclosures must remain unobstructed.
      for (let attempt = 0; attempt < 90; attempt++) {
        const angle = rng() * Math.PI * 2,
          radius = 8 + rng() * 10;
        const x = Math.max(
          4,
          Math.min(size - 5, Math.round(center.x + Math.cos(angle) * radius)),
        );
        const z = Math.max(
          4,
          Math.min(size - 5, Math.round(center.z + Math.sin(angle) * radius)),
        );
        const clearance = Math.min(
          ...features.map((f) => Math.hypot(f.x - x, f.z - z)),
        );
        const score =
          Math.min(clearance, 6) -
          Math.abs(Math.hypot(previous.x - x, previous.z - z) - 15) * 0.08;
        if (clearance >= 4 && score > best) {
          chosen = { x, z, r: 2 };
          best = score;
        }
      }
      if (!chosen)
        throw new Error(`No field station space: ${level.id} ${task.id}`);
      carve(chosen.x, chosen.z, 2);
      connect(previous, chosen);
      fieldSites.push(chosen);
      features.push({
        ...task,
        type: "field",
        x: chosen.x,
        z: chosen.z,
        place: mission.place,
      });
      previous = chosen;
    }
    connect(previous, rooms[stage + 1]);
  }
  const map = addEasternReflector(
    addFrozenStair(
      addOrbitVault(
        addEchoGallery(
          addPressureRelay(
            addSurveyorsCleft(
              addBellHoist(
                addFireVault(
                  {
                    size,
                    grid,
                    rooms,
                    sideRooms,
                    fieldSites,
                    paths,
                    features,
                    enemies,
                    spawn: { x: rooms[0].x, z: rooms[0].z + 2 },
                  },
                  level,
                ),
                level,
              ),
              level,
            ),
            level,
          ),
          level,
        ),
        level,
      ),
      level,
    ),
    level,
  );
  return addArcadeLock(
    addSunBridge(
      addEchoCauseway(
        addShutterHouse(
          addAstralCrane(
            addTemperingCart(addRainGarden(map, level), level),
            level,
          ),
          level,
        ),
        level,
      ),
      level,
    ),
    level,
  );
}
