import {
  temperingFoundationDistance,
  temperingFoundationWeight,
} from "./tempering-cart-rules.js";

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const TRACK_APPROACH_WIDTH = 20;

// Preserve the railway's authored floor and its existing narrow foundation.
// The wider apron joins the raised service track to the surrounding ground;
// neighboring working pads and complete water footprints keep priority.
export function temperingTerrainWeight(map, waters, x, z) {
  const distance = temperingFoundationDistance(x, z),
    original = temperingFoundationWeight(x, z),
    broad = 1 - smooth(0, TRACK_APPROACH_WIDTH, distance);
  if (broad <= original) return original;
  let free = 1;
  for (const r of [...map.rooms, ...(map.fieldSites || [])]) {
    const d = Math.max(Math.abs(x - r.x * 7), Math.abs(z - r.z * 7));
    free = Math.min(free, smooth(10.5, 18.5, d));
  }
  for (const r of map.sideRooms) {
    // This discovery occupied the old railway cut. Its new landing follows
    // the repaired ground; retaining the old height would cut another hole.
    if (r.index === 2) continue;
    const d = Math.max(Math.abs(x - r.x * 7), Math.abs(z - r.z * 7));
    free = Math.min(free, smooth(1.75, 5.75, d));
  }
  for (const water of waters) {
    const d = Math.max(
      0,
      Math.abs(x - water.x) - water.width / 2,
      Math.abs(z - water.z) - water.length / 2,
    );
    free = Math.min(free, smooth(3.5, 8.5, d));
  }
  return original + (broad - original) * free;
}
