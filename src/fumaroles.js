import * as THREE from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { random } from "./campaign.js";
import { natureRockAllowed } from "./nature-rocks.js";
import { discoveryFoliageClear } from "./discovery-setting-plan.js";
import { yardRouteClear, yardTraversalClear } from "./station-yard-plan.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { stationMeshSolid } from "./field-station-solids.js";
import { forgePlume } from "./forge-effects.js";

export function fumarolePlan(game) {
  if (game.level.biome !== "volcano") return [];
  const plans = [],
    ground = game.groundHeight.bind(game),
    step = game.terrainProfile.step;
  for (const room of game.map.rooms) {
    const seed = game.level.seed + room.index * 953 + 38177,
      rng = random(seed),
      radius = 1.4 + rng() * 0.65,
      height = 0.85 + rng() * 0.5,
      envelope = radius * 1.2;
    let plan;
    for (const distance of [30, 37, 44, 51]) {
      for (let i = 0; i < 24; i++) {
        const angle = (i * Math.PI) / 12 + room.index * 0.47,
          x = room.x * 7 + Math.sin(angle) * distance,
          z = room.z * 7 + Math.cos(angle) * distance;
        const box = { x, z, w: envelope * 2, d: envelope * 2 };
        if (!yardRouteClear(game.map, box, 5.8)) continue;
        const walkable = (x, z) =>
          game.walkable?.(x, z) ??
          !!game.map.grid[Math.round(z / 7)]?.[Math.round(x / 7)];
        if (!walkable(x, z)) continue;
        const collar = envelope + 1.1;
        if (
          Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4).some((a) => {
            const px = x + Math.sin(a) * collar,
              pz = z + Math.cos(a) * collar;
            return (
              !walkable(px, pz) || (game.canMove && !game.canMove(px, pz, 0))
            );
          })
        )
          continue;
        if (
          !natureRockAllowed(game, x, z, envelope + 1.5) ||
          !discoveryFoliageClear(game, x, z, envelope + 1.5) ||
          !yardTraversalClear(game.traversalCourses || [], {
            x,
            z,
            w: envelope * 2 + 3,
            d: envelope * 2 + 3,
          })
        )
          continue;
        // The regulator's working approach and both focused camera formats
        // extend well beyond the mechanism marker itself.
        if (
          game.map.features.some(
            (f) =>
              f.type === "mechanism" &&
              x + envelope + 2 > f.x * 7 &&
              x - envelope - 2 < f.x * 7 + 27 &&
              z + envelope + 2 > f.z * 7 + 9 &&
              z - envelope - 2 < f.z * 7 + 69,
          )
        )
          continue;
        if (
          plans.some(
            (p) => Math.hypot(p.x - x, p.z - z) < p.envelope + envelope + 16,
          )
        )
          continue;
        const low = footprintMinimum(
            ground,
            x,
            z,
            envelope * 2,
            envelope * 2,
            step,
          ),
          high = -footprintMinimum(
            (x, z) => -ground(x, z),
            x,
            z,
            envelope * 2,
            envelope * 2,
            step,
          );
        if (high - low > 0.7) continue;
        plan = {
          room: room.index,
          x,
          z,
          y: high - 0.16,
          bottom: low - high - 0.06,
          radius,
          envelope,
          height,
          seed,
          phase: rng(),
        };
        break;
      }
      if (plan) break;
    }
    if (plan) plans.push(plan);
  }
  return plans;
}

// A closed annular rock: its irregular lip, inner bore and buried bottom
// surround a real opening. The terrain remains visible at the foot of the bore.
export function fumaroleGeometry(plan) {
  const segments = 32,
    { radius, height, bottom, seed } = plan,
    phase = (seed % 997) * 0.013,
    rings = [
      [1, bottom],
      [0.8, height * 0.12],
      [0.6, height * 0.65],
      [0.37, height * 1.1],
      [0.19, height * 1.065],
      [0.14, bottom],
    ],
    vertices = rings.map(([r, y], ring) =>
      Array.from({ length: segments }, (_, i) => {
        const a = (i * Math.PI * 2) / segments,
          wave =
            Math.sin(a * 3 + phase) * 0.095 + Math.cos(a * 5 - phase) * 0.055,
          h =
            ring === 0 || ring === 5
              ? y
              : y + height * Math.sin(a * 2 + phase) * 0.055;
        return new THREE.Vector3(
          Math.cos(a) * radius * r * (1 + wave),
          h,
          Math.sin(a) * radius * r * (1 + wave) * 0.86,
        );
      }),
    ),
    positions = [],
    uv = [],
    colors = [];
  const stone = new THREE.Color(0x96958b),
    mineral = new THREE.Color(0xd0bd70);
  const emit = (points) => {
    const n = new THREE.Triangle(...points).getNormal(new THREE.Vector3()),
      axes =
        Math.abs(n.y) > 0.6
          ? ["x", "z"]
          : Math.abs(n.x) > Math.abs(n.z)
            ? ["z", "y"]
            : ["x", "y"];
    for (const p of points) {
      positions.push(p.x, p.y, p.z);
      uv.push(p[axes[0]] * 0.8, p[axes[1]] * 0.8);
      const a = Math.atan2(p.z / 0.86, p.x),
        deposit = Math.max(
          0,
          Math.min(
            0.85,
            (p.y / height - 0.45) * 1.25 + Math.sin(a * 3 + phase) * 0.24,
          ),
        ),
        c = stone
          .clone()
          .lerp(mineral, deposit)
          .multiplyScalar(
            0.75 +
              0.25 *
                Math.min(
                  1,
                  Math.max(
                    0,
                    (Math.hypot(p.x, p.z / 0.86) / radius - 0.14) / 0.18,
                  ),
                ),
          );
      colors.push(c.r, c.g, c.b);
    }
  };
  for (let ring = 0; ring < rings.length; ring++)
    for (let i = 0; i < segments; i++) {
      const next = (ring + 1) % rings.length,
        j = (i + 1) % segments,
        a = vertices[ring][i],
        b = vertices[ring][j],
        c = vertices[next][j],
        d = vertices[next][i];
      emit([a, c, b]);
      emit([a, d, c]);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  toCreasedNormals(geometry, Math.PI / 3);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildFumaroles(game) {
  game.fumaroles = [];
  if (game.level.biome !== "volcano") return;
  const material = game.darkMat.clone();
  material.name = "Mineral-coated fumarole basalt";
  material.color.setHex(0xc3c1b7);
  material.vertexColors = true;
  material.roughness = 0.95;
  material.metalness = 0;
  for (const plan of fumarolePlan(game)) {
    const root = new THREE.Group();
    root.name = `Fumarole ${plan.room}`;
    root.position.set(plan.x, plan.y, plan.z);
    game.world.add(root);
    const rock = new THREE.Mesh(fumaroleGeometry(plan), material);
    rock.castShadow = rock.receiveShadow = true;
    root.add(rock);
    game.cameraSurfaces.capture(rock, { small: true, thin: true });
    const solid = stationMeshSolid(
      game,
      { id: `fumarole-${plan.room}` },
      rock,
      { bodyPadding: 0.7, supportRadius: 0.55, layeredSupport: true },
    );
    const plume = forgePlume(
      game.forgeTime,
      { value: 0.5 },
      true,
      plan.seed,
      28,
    );
    const ages = plume.geometry.attributes.position;
    for (let i = 0; i < ages.count; i++)
      ages.setX(i, (ages.getX(i) + plan.phase) % 1);
    plume.position.y = plan.height * 1.2;
    root.add(plume);
    const source = {
      id: `fumarole-${plan.room}`,
      kind: "steam",
      x: plan.x,
      y: plan.y + plan.height * 1.35,
      z: plan.z,
      range: 18,
      gain: 0.12,
      rate: 0.9 + plan.phase * 0.18,
    };
    game.soundSources.push(source);
    game.fumaroles.push({ plan, root, rock, solid, plume, source });
  }
  if (!game.fumaroles.length) material.dispose();
}
