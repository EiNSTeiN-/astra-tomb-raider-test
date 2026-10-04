import { yardRouteClear, yardTraversalClear } from "./station-yard-plan.js";
import { surveyReservedDistance } from "./desert-survey-rules.js";
import { arcadeFoundationDistance } from "./arcade-lock-rules.js";
import { sunFoundationDistance } from "./sun-bridge-rules.js";
import { shutterFoundationDistance } from "./shutter-house-rules.js";
import { causewayFoundationDistance } from "./echo-causeway-rules.js";
import { craneFoundationDistance } from "./astral-crane-rules.js";
import { temperingFoundationDistance } from "./tempering-cart-rules.js";
import { inEchoGallery } from "./echo-gallery-rules.js";
import { inOrbitVault } from "./orbit-rules.js";

export const DISCOVERY_SETTINGS = Object.freeze({
  jungle: { name: "Waterkeeper's wayside archive", fixture: "basin" },
  desert: { name: "Surveyor's roadside annex", fixture: "storage" },
  snow: { name: "Pilgrim's scripture rest", fixture: "bench" },
  water: { name: "Harbor record store", fixture: "storage" },
  volcano: { name: "Foundry record yard", fixture: "basin" },
  sky: { name: "Courier's chart stop", fixture: "storage" },
  crystal: { name: "Harmonic archive fragment", fixture: "bench" },
  eclipse: { name: "Meridian memorial fragment", fixture: "bench" },
});

// Nearby discoveries share their surroundings. Bound every pair, rather than
// chaining neighbors into an arbitrarily long cluster along a route.
export function discoveryClusters(items) {
  const clusters = [];
  for (const f of items.filter((f) => f.discovery)) {
    const cluster = clusters.find((c) =>
      c.every(
        (other) =>
          Math.hypot(
            f.discovery.x - other.discovery.x,
            f.discovery.z - other.discovery.z,
          ) <= 16,
      ),
    );
    if (cluster) cluster.push(f);
    else clusters.push([f]);
  }
  return clusters;
}

function specialReserved(map, x, z, radius) {
  return (
    (map.desertSurvey && surveyReservedDistance(x, z) < radius + 1) ||
    (map.arcadeLock && arcadeFoundationDistance(x, z) < radius + 1) ||
    (map.sunBridge && sunFoundationDistance(x, z) < radius + 1) ||
    (map.shutterHouse && shutterFoundationDistance(x, z) < radius + 1) ||
    (map.echoCauseway && causewayFoundationDistance(x, z) < radius + 1) ||
    (map.astralCrane && craneFoundationDistance(x, z) < radius + 0.5) ||
    (map.temperingCart && temperingFoundationDistance(x, z) < radius + 0.5) ||
    inEchoGallery(map, x, z, radius + 1) ||
    inOrbitVault(map, x, z, radius + 1)
  );
}

export function discoverySettingAllowed(game, box) {
  const { map } = game,
    radius = Math.hypot(box.w, box.d) / 2;
  if (
    specialReserved(map, box.x, box.z, radius) ||
    !yardRouteClear(map, box) ||
    !yardTraversalClear(game.traversalCourses || [], box)
  )
    return false;
  if (
    (game.fieldGates || []).some(
      (g) =>
        Math.abs(box.x - g.root.position.x) < 12.5 + box.w / 2 &&
        Math.abs(box.z - g.root.position.z) < 12.5 + box.d / 2,
    ) ||
    game.terrainProfile.waters.some(
      (w) =>
        Math.abs(box.x - w.x) < box.w / 2 + w.width / 2 + 1 &&
        Math.abs(box.z - w.z) < box.d / 2 + w.length / 2 + 1,
    )
  )
    return false;
  for (const f of game.items) {
    if (!f.discovery) {
      if (Math.hypot(box.x - f.x * 7, box.z - f.z * 7) < radius + 6)
        return false;
      continue;
    }
    const p = f.discovery,
      s = p.stance;
    if (Math.hypot(box.x - p.x, box.z - p.z) < radius + 1.75) return false;
    // Protect the whole approach from the occupied stand to 3.6 m out, plus
    // body clearance. This also preserves collection sight and side access.
    if (
      !yardRouteClear(
        {
          paths: [
            [
              { x: p.x / 7, z: p.z / 7 },
              {
                x: (p.x + (s.x - p.x) * 1.5) / 7,
                z: (p.z + (s.z - p.z) * 1.5) / 7,
              },
            ],
          ],
        },
        box,
        1.05,
      )
    )
      return false;
  }
  if (
    game.obstacles.some(
      (o) =>
        Math.abs(box.x - o.x) < box.w / 2 + o.w + 0.25 &&
        Math.abs(box.z - o.z) < box.d / 2 + o.d + 0.25 &&
        (o.bounds?.max.y ?? game.groundHeight(o.x, o.z) + o.h) >
          game.groundHeight(box.x, box.z) + 0.04,
    )
  )
    return false;
  let low = Infinity,
    high = -Infinity;
  for (const dx of [-box.w / 2, 0, box.w / 2])
    for (const dz of [-box.d / 2, 0, box.d / 2]) {
      const x = box.x + dx,
        z = box.z + dz;
      if (!game.canMove(x, z, 0)) return false;
      const y = game.groundHeight(x, z);
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
  return high - low <= 0.4;
}

// The understory is loaded after architecture. Reserve each plant's complete
// horizontal extent, including leaves, so it cannot grow through new shelves,
// cache walls or carved stone. Rocks already use the finite world obstacles.
export function discoveryFoliageClear(game, x, z, radius) {
  for (const setting of game.discoverySettings || [])
    for (const p of setting.modules)
      if (
        Math.abs(x - p.x) < p.w / 2 + radius + 0.18 &&
        Math.abs(z - p.z) < p.d / 2 + radius + 0.18
      )
        return false;
  return !game.items.some(
    (f) =>
      f.discovery &&
      Math.abs(x - f.discovery.x) < 0.95 + radius + 0.15 &&
      Math.abs(z - f.discovery.z) < 0.95 + radius + 0.15,
  );
}

export function discoverySettingPlan(level, members) {
  const index = Number(members[0].id.split("-")[1]),
    variant = (index + level.seed) % 4,
    style = DISCOVERY_SETTINGS[level.biome],
    candidates = [];
  const dimensions = {
    wall: [3.25, 1.15],
    rack: [2.55, 1.2],
    bench: [2.6, 1.2],
    storage: [2.65, 1.35],
    basin: [2.7, 1.4],
    column: [1.35, 1.35],
  };
  for (let i = 0; i < members.length; i++) {
    const p = members[i].discovery,
      side = (index + i) % 2 ? -1 : 1,
      slots = [
        {
          role: "backdrop",
          kind: variant % 2 ? "rack" : "wall",
          x: side * 4.6,
          z: -3.4,
        },
        { role: "fixture", kind: style.fixture, x: -side * 4.2, z: -1.7 },
        { role: "fragment", kind: "column", x: -side * 3.9, z: -4.8 },
      ];
    for (const slot of slots) {
      // Try coherent alternative positions around this stand if a bank or an
      // existing building occupies the first location. Never force a module.
      for (const offset of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
        const yaw = p.stance.yaw + offset,
          sin = Math.sin(yaw),
          cos = Math.cos(yaw),
          [w, d] = dimensions[slot.kind];
        candidates.push({
          ...slot,
          owner: members[i].id,
          x: p.x + slot.x * cos + slot.z * sin,
          z: p.z - slot.x * sin + slot.z * cos,
          yaw,
          w: Math.abs(w * cos) + Math.abs(d * sin),
          d: Math.abs(d * cos) + Math.abs(w * sin),
          localWidth: w,
          localDepth: d,
          variant,
        });
      }
    }
  }
  return { id: members.map((f) => f.id).join("+"), style, variant, candidates };
}
