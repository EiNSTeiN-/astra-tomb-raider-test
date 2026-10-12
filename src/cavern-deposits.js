import * as THREE from "three";
import { random } from "./campaign.js";
import { formationReserved } from "./cavern-formations.js";
import { desertNoise } from "./desert-geology.js";
import { mergeArchitecture } from "./visuals.js";

// Shallow angular fragments collect in irregular pockets at the foot of the
// enclosing banks. Their entire footprint stays outside the walking cells.
export function planCavernDeposits(game) {
  const surface = game.terrainProfile.surfaceHeight,
    rng = random(game.level.seed + 2849),
    sites = [];
  for (let z = 8; z < game.terrainProfile.extent - 8; z += 12)
    for (let x = 8; x < game.terrainProfile.extent - 8; x += 12) {
      const cx = x + (rng() - 0.5) * 5,
        cz = z + (rng() - 0.5) * 5;
      if (desertNoise(cx * 0.045, cz * 0.045, 2849) < 0.42) continue;
      const count = 4 + Math.floor(rng() * 6);
      for (let j = 0; j < count; j++) {
        const angle = rng() * Math.PI * 2,
          distance = Math.sqrt(rng()) * 3.2,
          px = cx + Math.cos(angle) * distance,
          pz = cz + Math.sin(angle) * distance,
          rx = 0.12 + rng() ** 2 * 0.7,
          rz = rx * (0.55 + rng() * 0.5),
          radius = Math.max(rx, rz) * 1.12;
        if (formationReserved(game, px, pz, radius, true)) continue;
        if (
          game.cavernFormations.some(
            (s) =>
              !s.ceiling &&
              Math.hypot(px - s.x, pz - s.z) < radius + s.radius + 0.3,
          )
        )
          continue;
        const y = surface(px, pz),
          clearance = game.cavernProfile.height(px, pz) - y;
        if (clearance < 2 || clearance > 48) continue;
        const heights = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
          const a = (k * Math.PI) / 4;
          return surface(px + Math.cos(a) * radius, pz + Math.sin(a) * radius);
        });
        if (Math.max(...heights) - Math.min(...heights) > 0.32) continue;
        if (
          sites.some(
            (s) => Math.hypot(px - s.x, pz - s.z) < radius + s.radius + 0.08,
          )
        )
          continue;
        sites.push({
          x: px,
          z: pz,
          rx,
          rz,
          radius,
          height: 0.06 + rx * (0.18 + rng() * 0.28),
          seed: rng() * 20,
        });
      }
    }
  return sites;
}

export function depositGeometry(site, surface) {
  const { x, z, rx, rz, height, seed } = site,
    positions = [],
    uv = [],
    indices = [],
    base = surface(x, z),
    segments = 8;
  for (let ring = 0; ring < 3; ring++)
    for (let j = 0; j < segments; j++) {
      const a = (j * Math.PI) / 4 + seed,
        irregular = 1 + 0.08 * Math.sin(j * 7.13 + seed),
        scale = [1, 0.83, 0.4][ring],
        dx = Math.cos(a) * rx * irregular * scale,
        dz = Math.sin(a) * rz * irregular * scale,
        top = height * (0.82 + 0.18 * Math.sin(j * 2.7 + seed));
      positions.push(
        dx,
        surface(x + dx, z + dz) -
          base +
          (ring === 0 ? -0.18 : top * (ring === 1 ? 0.6 : 1)),
        dz,
      );
      uv.push(dx / 5, dz / 5);
    }
  positions.push(
    0,
    Math.min(...positions.filter((_, i) => i < 24 && i % 3 === 1)) - 0.1,
    0,
    0,
    height,
    0,
  );
  uv.push(0, 0, 0, 0);
  for (let j = 0; j < segments; j++) {
    const next = (j + 1) % segments;
    indices.push(24, j, next, 25, 16 + next, 16 + j);
    for (let ring = 0; ring < 2; ring++) {
      const a = ring * 8 + j,
        b = ring * 8 + next,
        c = a + 8,
        d = b + 8;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildCavernDeposits(game, material) {
  const sites = (game.cavernDeposits = planCavernDeposits(game)),
    chunks = new Map(),
    surface = game.terrainProfile.surfaceHeight;
  for (const site of sites) {
    const key = `${Math.floor(site.x / 49)}:${Math.floor(site.z / 49)}`;
    if (!chunks.has(key)) {
      const root = new THREE.Group();
      root.name = "Bank-foot limestone debris";
      game.world.add(root);
      chunks.set(key, root);
    }
    const mesh = new THREE.Mesh(depositGeometry(site, surface), material);
    mesh.position.set(site.x, surface(site.x, site.z), site.z);
    mesh.castShadow = mesh.receiveShadow = true;
    chunks.get(key).add(mesh);
  }
  for (const root of chunks.values()) {
    mergeArchitecture(root);
    for (const mesh of root.children) game.cameraSurfaces?.capture(mesh);
  }
}
