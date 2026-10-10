import * as THREE from "three";
import { random } from "./campaign.js";
import { rockGroundHeight } from "./nature-rocks.js";
import { inEchoGallery } from "./echo-gallery-rules.js";
import { inResonanceCourt } from "./resonance-rules.js";
import { causewayFoundationDistance } from "./echo-causeway-rules.js";
import { mergeArchitecture } from "./visuals.js";

// Keep the entire floor footprint outside the carved walking cells. Roof
// formations have their own sampled headroom and machinery reservations.
export function formationReserved(game, x, z, radius, floor = false) {
  const { map, terrainProfile } = game;
  if (
    inEchoGallery(map, x, z, radius + 3) ||
    inResonanceCourt(map, x, z, radius + 3) ||
    (map.echoCauseway && causewayFoundationDistance(x, z) < radius + 4)
  )
    return true;
  if (Math.hypot(x - map.spawn.x * 7, z - map.spawn.z * 7) < radius + 10)
    return true;
  for (const f of map.features)
    if (
      Math.hypot(x - f.x * 7, z - f.z * 7) <
      radius + (f.kind === "climb" ? 19 : 8)
    )
      return true;
  for (const e of map.enemies || [])
    if (Math.hypot(x - e.x * 7, z - e.z * 7) < radius + 6) return true;
  for (const w of terrainProfile.waters)
    if (
      Math.abs(x - w.x) < w.width / 2 + radius + 3 &&
      Math.abs(z - w.z) < w.length / 2 + radius + 3
    )
      return true;
  for (const patch of game.cavernPatches || [])
    for (const c of patch.centers)
      if (Math.hypot(x - c.x, z - c.z) < radius + 7) return true;
  if (floor) {
    const reach = radius + 0.8;
    for (
      let gz = Math.floor((z - reach) / 7 - 0.5);
      gz <= Math.ceil((z + reach) / 7 + 0.5);
      gz++
    )
      for (
        let gx = Math.floor((x - reach) / 7 - 0.5);
        gx <= Math.ceil((x + reach) / 7 + 0.5);
        gx++
      )
        if (
          map.grid[gz]?.[gx] &&
          Math.abs(x - gx * 7) < reach + 3.5 &&
          Math.abs(z - gz * 7) < reach + 3.5
        )
          return true;
  }
  return false;
}

// Closed, asymmetric calcite lobes. The root ring follows the actual sampled
// surface, buried into soil or embedded into the roof. World-space rock shading
// continues through the joins rather than stretching along each tapered lobe.
export function formationGeometry(site, surface) {
  const { x, z, rx, rz, height, seed, ceiling } = site;
  const segments = 24,
    rings = 9,
    positions = [],
    uv = [],
    indices = [];
  const sign = ceiling ? -1 : 1,
    base = surface(x, z);
  for (let ring = 0; ring < rings; ring++) {
    const t = ring / rings;
    for (let j = 0; j < segments; j++) {
      const angle = (j / segments) * Math.PI * 2;
      const lobe =
        1 +
        0.09 * Math.sin(angle * 3 + seed) +
        0.045 * Math.sin(angle * 7 - seed);
      const rib = 1 + 0.07 * Math.sin(t * 19 + seed) * Math.sin(Math.PI * t);
      const radius = (1 - t) ** 0.7 * lobe * rib;
      const dx = Math.cos(angle) * rx * radius + Math.sin(seed) * rx * 0.19 * t;
      const dz = Math.sin(angle) * rz * radius + Math.cos(seed) * rz * 0.16 * t;
      const root = surface(x + dx, z + dz);
      const y =
        (root - base) * (1 - t) + sign * (height * t - 0.4 * (1 - t) ** 2);
      positions.push(dx, y, dz);
      uv.push(dx / 5, dz / 5);
    }
  }
  const tip = positions.length / 3;
  positions.push(
    Math.sin(seed) * rx * 0.19,
    sign * height,
    Math.cos(seed) * rz * 0.16,
  );
  uv.push(0, 0);
  const cap = positions.length / 3;
  const rootHeights = positions.filter(
    (_, i) => i < segments * 3 && i % 3 === 1,
  );
  positions.push(
    0,
    ceiling ? Math.max(...rootHeights) + 0.8 : Math.min(...rootHeights) - 0.8,
    0,
  );
  uv.push(0, 0);
  const face = (a, b, c) =>
    ceiling ? indices.push(a, b, c) : indices.push(a, c, b);
  for (let j = 0; j < segments; j++) {
    const next = (j + 1) % segments;
    face(cap, next, j);
    for (let ring = 0; ring < rings - 1; ring++) {
      const a = ring * segments + j,
        b = ring * segments + next;
      const c = a + segments,
        d = b + segments;
      face(a, b, c);
      face(b, d, c);
    }
    face((rings - 1) * segments + j, (rings - 1) * segments + next, tip);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function planCavernFormations(game) {
  const rng = random(game.level.seed + 1783),
    sites = [];
  const ground = (x, z) => rockGroundHeight(game.terrainProfile, x, z);
  const roof = game.cavernProfile.height;
  const extent = game.terrainProfile.extent;
  // Jittered groups follow the vault's occupied area, with gaps between groups.
  for (let z = 14; z < extent - 14; z += 10)
    for (let x = 14; x < extent - 14; x += 10) {
      const px = x + (rng() - 0.5) * 7,
        pz = z + (rng() - 0.5) * 7;
      const ceiling = rng() > 0.46;
      const rx = ceiling ? 1 + rng() * 1.9 : 1.1 + rng() * 1.1;
      const rz = rx * (0.65 + rng() * 0.4);
      const radius = Math.max(rx, rz) * 1.22;
      const height = ceiling ? 3.5 + rng() * 7 : 2.5 + rng() * 4.5;
      const seed = rng() * 20;
      if (formationReserved(game, px, pz, radius, !ceiling)) continue;
      const samples = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const sx = px + Math.cos(a) * radius,
          sz = pz + Math.sin(a) * radius;
        samples.push({ ground: ground(sx, sz), roof: roof(sx, sz) });
      }
      const low = Math.min(...samples.map((s) => s.ground));
      const high = Math.max(...samples.map((s) => s.ground));
      const roofLow = Math.min(roof(px, pz), ...samples.map((s) => s.roof));
      if (ceiling) {
        if (roofLow - high < height + 10) continue;
      } else {
        if (high - low > 1.3 || roofLow - high < height + 3) continue;
      }
      if (
        sites.some(
          (s) =>
            s.ceiling === ceiling &&
            Math.hypot(s.x - px, s.z - pz) < s.radius + radius + 3,
        )
      )
        continue;
      sites.push({ x: px, z: pz, rx, rz, radius, height, seed, ceiling });
    }
  return sites;
}

export function buildCavernFormations(game, material) {
  const sites = planCavernFormations(game),
    chunks = new Map();
  for (const site of sites) {
    const surface = site.ceiling
      ? game.cavernProfile.height
      : (x, z) => rockGroundHeight(game.terrainProfile, x, z);
    const geometry = formationGeometry(site, surface);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = site.ceiling
      ? "Rooted calcite pendant"
      : "Grounded limestone lobe";
    mesh.position.set(site.x, surface(site.x, site.z), site.z);
    mesh.castShadow = mesh.receiveShadow = true;
    const key = `${Math.floor(site.x / 32)},${Math.floor(site.z / 32)}`;
    if (!chunks.has(key)) {
      const root = new THREE.Group();
      root.name = "Regional calcite formations";
      game.world.add(root);
      chunks.set(key, root);
    }
    chunks.get(key).add(mesh);
    game.cameraSurfaces?.capture(mesh);
    // New floor lobes are entirely off the walking grid. Their bounds still
    // occlude sight/sound, and high pendants have an explicit vertical bottom.
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    game.obstacles.push({
      x: site.x,
      z: site.z,
      w: Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
      d: Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)),
      h: mesh.position.y + bounds.max.y - game.groundHeight(site.x, site.z),
      bottom: mesh.position.y + bounds.min.y,
      cavernFormation: true,
    });
  }
  for (const root of chunks.values()) mergeArchitecture(root);
  game.cavernFormations = sites;
}
