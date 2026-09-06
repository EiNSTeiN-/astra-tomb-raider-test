// Each chapter has its own material, silhouette, door construction and drive.
export const GATE_DESIGNS = {
  jungle: {
    name: "Root-carved stone shutters",
    motion: "sink",
    crown: "corbel",
    panel: "relief",
    wall: "temple",
    tint: 0xb4b797,
    trim: "temple",
    trimTint: 0x8a9278,
  },
  desert: {
    name: "Solar bronze shutters",
    motion: "sink",
    crown: "arch",
    panel: "sun",
    wall: "sandstone-wall",
    tint: 0xc0ac88,
    trim: "sandstone",
    trimTint: 0xc9b390,
  },
  snow: {
    name: "Timber bellkeeper doors",
    motion: "hinge",
    crown: "roof",
    panel: "timber",
    wall: "monastery-plaster",
    tint: 0xd2d2c7,
    trim: "temple",
    trimTint: 0x8b9293,
  },
  water: {
    name: "Aegean sluice doors",
    motion: "hinge",
    crown: "arch",
    panel: "sluice",
    wall: "palace-stone",
    tint: 0xbcc3be,
    trim: "palace-stone",
    trimTint: 0xd2d2bf,
  },
  volcano: {
    name: "Furnace pressure shutters",
    motion: "sink",
    crown: "forge",
    panel: "forge",
    wall: "forge-rock",
    tint: 0x969b96,
    trim: "forge-paving",
    trimTint: 0x96928a,
  },
  sky: {
    name: "Citadel wind-screen doors",
    motion: "hinge",
    crown: "wind",
    panel: "lattice",
    wall: "rock",
    tint: 0xc3c9c4,
    trim: "temple",
    trimTint: 0xacaea1,
  },
  crystal: {
    name: "Veined archive shutters",
    motion: "sink",
    crown: "angular",
    panel: "crystal",
    wall: "rock",
    tint: 0x8f9ca3,
    trim: "rock",
    trimTint: 0x707e89,
  },
  eclipse: {
    name: "Celestial bronze doors",
    motion: "hinge",
    crown: "arch",
    panel: "orrery",
    wall: "temple",
    tint: 0xafb8b9,
    trim: "palace-stone",
    trimTint: 0x899397,
  },
};

export const gateEase = (amount) => {
  const t = Math.max(0, Math.min(1, amount));
  return t * t * (3 - 2 * t);
};

// The full door leaf fits inside the original side-wall collision when open.
export function gateLeafBounds(side, amount) {
  const angle = (gateEase(amount) * Math.PI) / 2;
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return {
    x: side * (6.2 - 3.1 * c),
    z: 6.5 - 3.1 * s,
    w: 3.1 * c + 0.3 * s,
    d: 3.1 * s + 0.3 * c,
    angle: -side * angle,
  };
}
