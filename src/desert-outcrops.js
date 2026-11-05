import * as THREE from "three";
import { random } from "./campaign.js";
import { desertNoise, desertRouteDistance } from "./desert-geology.js";
import { natureRockAllowed } from "./nature-rocks.js";
import { inSolarCourt } from "./solar-rules.js";
import { discoveryFoliageClear } from "./discovery-setting-plan.js";
import { yardTraversalClear } from "./station-yard-plan.js";
import { desertOutcropMaterial } from "./desert-outcrop-material.js";
import { stationMeshSolid } from "./field-station-solids.js";
import { RoofCamera } from "./roof-camera.js";

const TAU = Math.PI * 2;

const BEDS = [
  [
    [0, 1],
    [0.58, 0.98],
    [0.68, 0.73],
    [0.82, 0.68],
    [0.9, 0.24],
    [1, 0],
  ],
  [
    [0, 1],
    [0.3, 0.99],
    [0.4, 0.94],
    [0.46, 0.72],
    [0.56, 0.68],
    [0.64, 0.5],
    [0.75, 0.46],
    [0.84, 0.22],
    [1, 0],
  ],
  [
    [0, 1],
    [0.26, 0.99],
    [0.4, 0.75],
    [0.55, 0.68],
    [0.75, 0.3],
    [1, 0],
  ],
  [
    [0, 0.75],
    [0.4, 0.72],
    [0.6, 0.4],
    [0.7, 0.38],
    [1, 0],
  ],
];
function bedHeight(t, variant) {
  const beds = BEDS[variant];
  for (let i = 1; i < beds.length; i++) {
    const [a, h] = beds[i - 1],
      [b, k] = beds[i];
    if (t <= b) return h + ((k - h) * (t - a)) / (b - a);
  }
  return 0;
}

// Jittered districts, rather than identical ornaments on each ruin, let the
// stone rise intermittently along the paths between the archaeological sites.
export function desertOutcropCandidates(map, level) {
  if (level.biome !== "desert") return [];
  const rng = random(level.seed + 197231),
    candidates = [];
  for (let z = 14; z < map.size * 7 - 14; z += 12)
    for (let x = 14; x < map.size * 7 - 14; x += 12) {
      const p = {
        x: x + (rng() - 0.5) * 11,
        z: z + (rng() - 0.5) * 11,
        length: 3.2 + rng() * 5.4,
        width: 1.9 + rng() * 3.2,
        peak: 3.4 + rng() * 4.2,
        yaw: -0.7 + rng() * 1.4,
        seed: Math.floor(rng() * 1000000),
        priority: rng(),
      };
      p.radius = Math.hypot(p.length, p.width) * 1.08;
      const distance = desertRouteDistance(map, p.x, p.z);
      if (distance > p.radius + 1.3 && distance < p.radius + 12)
        candidates.push(p);
    }
  return candidates.sort((a, b) => a.priority - b.priority);
}

export function desertOutcropAllowed(game, plan) {
  const { x, z, radius } = plan,
    box = { x, z, w: radius * 2, d: radius * 2 };
  if (
    !natureRockAllowed(game, x, z, radius + 0.8) ||
    !discoveryFoliageClear(game, x, z, radius + 1.5) ||
    !yardTraversalClear(game.traversalCourses || [], box)
  )
    return false;
  if (
    (game.palmLayout || []).some(
      (p) => Math.hypot(p.x - x, p.z - z) < radius + 2.2 * p.scale,
    )
  )
    return false;
  for (const dx of [-radius, 0, radius])
    for (const dz of [-radius, 0, radius])
      if (inSolarCourt(game.map, x + dx, z + dz)) return false;
  // In addition to the optical field, leave the gate/threshold and the broad
  // foreground working space free even before its moving parts are opened.
  return !game.map.rooms.some(
    (r) =>
      Math.abs(r.x * 7 - x) < radius + 23 &&
      Math.abs(r.z * 7 + 8 - z) < radius + 24,
  );
}

// A closed, irregular height-field shell. Its complete perimeter and bottom
// enter the delivered terrain. Matching upper/lower XZ samples let camera and
// body readers keep the real eroded slopes, including the empty bounding corners.
export function sandstoneOutcropGeometry(plan, profile) {
  const { x, z, length, width, yaw, peak, seed, radius } = plan,
    sides = 40,
    rings = 24,
    positions = [],
    indices = [],
    c = Math.cos(yaw),
    s = Math.sin(yaw);
  let low = Infinity;
  for (
    let pz = Math.floor((z - radius) / profile.step) * profile.step;
    pz <= Math.ceil((z + radius) / profile.step) * profile.step;
    pz += profile.step
  )
    for (
      let px = Math.floor((x - radius) / profile.step) * profile.step;
      px <= Math.ceil((x + radius) / profile.step) * profile.step;
      px += profile.step
    )
      low = Math.min(low, profile.height(px, pz));
  const bottom = low - 0.9,
    centerGround = profile.surfaceHeight(x, z),
    variant = seed % 4,
    cutOffset = length * (0.1 + desertNoise(0, 0, seed + 11) * 0.32),
    cutWidth = length * (0.075 + desertNoise(0, 0, seed + 17) * 0.1),
    top = [];
  const height = (px, pz, t) => {
    const wx = x + px * c - pz * s,
      wz = z + px * s + pz * c,
      rib = desertNoise(px * 0.38, pz * 0.5, seed + 29),
      cleft = Math.exp(-(((px - cutOffset + pz * 0.24) / cutWidth) ** 2)),
      cross = Math.exp(
        -(((pz - width * 0.3 + px * 0.05) / (width * 0.2)) ** 2),
      ),
      crown = bedHeight(t, variant),
      relief = Math.sin(Math.PI * t) * (rib - 0.5) * peak * 0.12;
    return [
      wx,
      centerGround +
        (profile.surfaceHeight(wx, wz) - centerGround) * t ** 3 -
        0.35 +
        peak *
          crown *
          (1 -
            cleft * (variant === 1 ? 0.5 : variant === 0 ? 0.16 : 0.32) -
            cross * (variant === 3 ? 0.35 : 0.12)) +
        px * 0.045 * (1 - t) +
        relief,
      wz,
    ];
  };
  top.push(height(0, 0, 0));
  for (let ring = 1; ring <= rings; ring++) {
    const t = ring / rings;
    for (let side = 0; side < sides; side++) {
      const a = (side / sides) * TAU,
        exponent = variant === 0 ? 0.58 : variant === 2 ? 0.85 : 0.72,
        u = Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** exponent,
        v = Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** exponent,
        // Cartesian fields keep the seam identical and avoid regular lobes.
        edge = 0.9 + 0.14 * desertNoise(u * 2.1, v * 2.1, seed),
        px = u * length * t * edge,
        pz = v * width * t * edge,
        point = height(px, pz, t);
      top.push(point);
    }
  }
  const at = (ring, side) => 1 + (ring - 1) * sides + (side % sides);
  for (let i = 0; i < sides; i++) indices.push(0, at(1, i + 1), at(1, i));
  for (let ring = 1; ring < rings; ring++)
    for (let i = 0; i < sides; i++) {
      const a = at(ring, i),
        b = at(ring, i + 1),
        c = at(ring + 1, i + 1),
        d = at(ring + 1, i);
      indices.push(a, b, d, b, c, d);
    }
  const count = top.length,
    topCount = indices.length;
  for (const p of top) positions.push(...p);
  for (const [px, , pz] of top) positions.push(px, bottom, pz);
  for (let i = 0; i < topCount; i += 3)
    indices.push(
      indices[i] + count,
      indices[i + 2] + count,
      indices[i + 1] + count,
    );
  for (let i = 0; i < sides; i++) {
    const a = at(rings, i),
      b = at(rings, i + 1);
    indices.push(a, b, b + count, a, b + count, a + count);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = { bottom, sides, rings };
  return geometry;
}

export function buildDesertOutcrops(game) {
  game.desertOutcrops = null;
  if (game.level.biome !== "desert") return;
  const root = new THREE.Group(),
    sites = [],
    material = desertOutcropMaterial(
      game.terrainMeshes[0].material.userData.terrainUniforms,
    );
  root.name = "Wind-eroded sandstone outcrops";
  game.world.add(root);
  for (const plan of desertOutcropCandidates(game.map, game.level)) {
    if (sites.length >= 28) break;
    if (
      sites.some(
        (p) =>
          Math.hypot(p.plan.x - plan.x, p.plan.z - plan.z) <
          p.plan.radius + plan.radius + 5,
      ) ||
      !desertOutcropAllowed(game, plan)
    )
      continue;
    const geometry = sandstoneOutcropGeometry(plan, game.terrainProfile),
      mesh = new THREE.Mesh(geometry, material),
      camera = new RoofCamera(geometry);
    mesh.name = `Sandstone outcrop ${sites.length + 1}`;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    game.cameraSurfaces?.capture(mesh, { kernel: camera });
    const solid = stationMeshSolid(
      game,
      { id: `sandstone-outcrop-${sites.length}` },
      mesh,
      { bodyPadding: 0.55, supportRadius: 0.4 },
    );
    solid.preciseNatureClearance = true;
    solid.desertOutcrop = true;
    geometry.addEventListener("dispose", () => camera.grid.clear());
    sites.push({ plan, mesh, solid, camera });
  }
  game.desertOutcrops = { root, sites, material };
}
