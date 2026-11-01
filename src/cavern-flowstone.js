import * as THREE from "three";
import { random } from "./campaign.js";
import { inResonanceCourt } from "./resonance-rules.js";
import { inEchoGallery } from "./echo-gallery-rules.js";
import { causewayFoundationDistance } from "./echo-causeway-rules.js";
import { cavernRock } from "./cavern-material.js";
import { stationMeshSolid } from "./field-station-solids.js";
import { mergeArchitecture } from "./visuals.js";

const TAU = Math.PI * 2;

// Water-built limestone aprons occupy the margins of the large chambers.
// Reserve whole footprints, including the camera's working space at controls.
function marginClear(game, x, z, radius) {
  const { map, terrainProfile } = game;
  if (
    x < radius + 4 ||
    z < radius + 4 ||
    x > terrainProfile.extent - radius - 4 ||
    z > terrainProfile.extent - radius - 4 ||
    inResonanceCourt(map, x, z, radius + 2) ||
    inEchoGallery(map, x, z, radius + 4) ||
    (map.echoCauseway && causewayFoundationDistance(x, z) < radius + 5)
  )
    return false;
  if (Math.hypot(x - map.spawn.x * 7, z - map.spawn.z * 7) < radius + 8)
    return false;
  if (
    map.features.some(
      (f) =>
        Math.hypot(x - f.x * 7, z - f.z * 7) <
        radius + (f.kind === "climb" ? 19 : 7),
    )
  )
    return false;
  if (
    map.enemies.some((e) => Math.hypot(x - e.x * 7, z - e.z * 7) < radius + 6)
  )
    return false;
  if (
    terrainProfile.waters.some(
      (w) =>
        Math.abs(x - w.x) < w.width / 2 + radius + 3 &&
        Math.abs(z - w.z) < w.length / 2 + radius + 3,
    )
  )
    return false;
  for (const patch of game.cavernPatches || [])
    for (const center of patch.centers)
      if (Math.hypot(x - center.x, z - center.z) < radius + 4.5) return false;
  for (const source of game.soundSources || [])
    if (Math.hypot(x - source.x, z - source.z) < radius + 5) return false;
  for (const o of game.obstacles)
    if (
      !o.cavernFlowstone &&
      (o.bottom ?? o.bounds?.min.y ?? -Infinity) <
        terrainProfile.surfaceHeight(x, z) + 3 &&
      Math.abs(x - o.x) < o.w + radius + 0.8 &&
      Math.abs(z - o.z) < o.d + radius + 0.8
    )
      return false;
  // Keep a continuous centre lane through every carved map path. The terrace
  // may frame a wide room but cannot narrow a single-cell connector.
  for (const path of map.paths)
    for (const p of path)
      if (Math.hypot(x - p.x * 7, z - p.z * 7) < radius + 2.6) return false;
  return true;
}

export function flowstoneAllowed(game, site) {
  // A covered chain of disks encloses the entire irregular elongated footprint.
  // The transverse radius includes the lobe amplitude and sample spacing.
  const { x, z, rx, rz, yaw } = site,
    reach = (rx - rz) * 1.12;
  const steps = Math.max(1, Math.ceil((reach * 2) / 0.7));
  for (let i = 0; i <= steps; i++) {
    const u = -reach + (2 * reach * i) / steps;
    if (
      !marginClear(
        game,
        x + u * Math.cos(yaw),
        z + u * Math.sin(yaw),
        rz * 1.12 + 0.1,
      )
    )
      return false;
  }
  return true;
}

export function planCavernFlowstone(game) {
  if (game.level.biome !== "crystal") return [];
  const rng = random(game.level.seed + 63109),
    sites = [];
  for (const room of game.map.rooms) {
    const count = room.index === 8 ? 5 : 3;
    for (let slot = 0; slot < count; slot++) {
      const rx = 3.5 + rng() * 2.1,
        rz = 1.6 + rng() * 0.9;
      const height = 0.55 + rng() * 0.7,
        seed = rng() * 20;
      const preferred = (room.index * 0.73 + (slot * TAU) / count) % TAU;
      let selected;
      for (const distance of [room.r * 7 + 1, room.r * 7 - 3, room.r * 7 + 6]) {
        for (const offset of [
          0,
          0.2,
          -0.2,
          0.4,
          -0.4,
          0.7,
          -0.7,
          1,
          -1,
          1.4,
          -1.4,
          2,
          -2,
          Math.PI,
        ]) {
          const angle = preferred + offset,
            x = room.x * 7 + Math.sin(angle) * distance,
            z = room.z * 7 + Math.cos(angle) * distance,
            radius = rx * 1.12;
          const candidate = {
            room: room.index,
            x,
            z,
            rx,
            rz,
            height,
            seed,
            radius,
            yaw: -angle,
          };
          if (!flowstoneAllowed(game, candidate)) continue;
          if (
            sites.some(
              (s) => Math.hypot(x - s.x, z - s.z) < radius + s.radius + 2,
            )
          )
            continue;
          const surface = game.terrainProfile.surfaceHeight;
          const samples = Array.from({ length: 16 }, (_, i) => {
            const a = (i * TAU) / 16;
            return surface(x + Math.cos(a) * radius, z + Math.sin(a) * radius);
          });
          if (Math.max(...samples) - Math.min(...samples) > 1.2) continue;
          if (game.cavernProfile.height(x, z) - surface(x, z) < height + 5)
            continue;
          // Some of the formation must enter the visible room floor.
          if (!game.map.grid[Math.round(z / 7)]?.[Math.round(x / 7)]) continue;
          selected = candidate;
          break;
        }
        if (selected) break;
      }
      if (selected) sites.push(selected);
    }
  }
  return sites;
}

// Closed nested shelves, with broad shallow treads and rounded lips. The
// bottom and entire perimeter extend below the delivered terrain triangles.
export function flowstoneGeometry(site, surface) {
  const { x, z, rx, rz, height, seed, yaw } = site,
    segments = 48;
  const rings = [
    [1, -1],
    [1, -0.16],
    [0.97, 0.02],
    [0.9, 0.12],
    [0.72, 0.15],
    [0.68, 0.39],
    [0.49, 0.43],
    [0.45, 0.68],
    [0.25, 0.72],
    [0.21, 0.94],
  ];
  const positions = [],
    uv = [],
    indices = [],
    base = surface(x, z),
    cos = Math.cos(yaw),
    sin = Math.sin(yaw);
  let bottom = Infinity;
  for (let a = x - site.radius; a <= x + site.radius; a += 0.4)
    for (let b = z - site.radius; b <= z + site.radius; b += 0.4)
      bottom = Math.min(bottom, surface(a, b) - 0.6);
  for (const [r, t] of rings)
    for (let j = 0; j < segments; j++) {
      const a = (j * TAU) / segments,
        lobe =
          1 + 0.065 * Math.sin(a * 3 + seed) + 0.035 * Math.sin(a * 7 - seed);
      const u =
          Math.cos(a) * rx * r * lobe + (1 - r) * rx * 0.18 * Math.sin(seed),
        v = Math.sin(a) * rz * r * lobe + (1 - r) * rz * 0.13 * Math.cos(seed);
      const dx = u * cos - v * sin,
        dz = u * sin + v * cos;
      const floor = surface(x + dx, z + dz);
      const y =
        t === -1
          ? bottom
          : floor +
            (t < 0
              ? t
              : height * t +
                0.018 * Math.sin(a * 11 + seed) * Math.sin(r * Math.PI));
      positions.push(dx, y - base, dz);
      uv.push((x + dx) / 5, (z + dz) / 5);
    }
  const cap = positions.length / 3;
  const tx = rx * 0.18 * Math.sin(seed),
    tz = rz * 0.13 * Math.cos(seed);
  positions.push(
    0,
    bottom - base,
    0,
    tx * cos - tz * sin,
    height,
    tx * sin + tz * cos,
  );
  uv.push(x / 5, z / 5, x / 5, z / 5);
  for (let j = 0; j < segments; j++) {
    const next = (j + 1) % segments;
    indices.push(
      cap,
      j,
      next,
      cap + 1,
      (rings.length - 1) * segments + next,
      (rings.length - 1) * segments + j,
    );
    for (let ring = 0; ring < rings.length - 1; ring++) {
      const a = ring * segments + j,
        b = ring * segments + next,
        c = a + segments,
        d = b + segments;
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
  geometry.computeBoundingBox();
  return geometry;
}

export function buildCavernFlowstone(game) {
  game.cavernFlowstone = [];
  const sites = planCavernFlowstone(game);
  if (!sites.length) return;
  const material = cavernRock();
  material.name = "Chamber flowstone limestone";
  material.color.setHex(0xd6cfba);
  const baseCompile = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    baseCompile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "diffuseColor.rgb*=karstColor(caveAlbedo,karst);",
        `float calciteGrain=dot(caveAlbedo,vec3(.2126,.7152,.0722));
       vec3 calcite=mix(vec3(.27,.25,.20),vec3(.65,.60,.49),clamp(calciteGrain*1.6,0.,1.));
       diffuseColor.rgb*=karstColor(calcite,karst);`,
      )
      .replace(
        "float roughnessFactor=mix(clamp(caveRough,.78,1.),.55,karst.damp);",
        "float roughnessFactor=mix(clamp(caveRough,.67,.86),.49,karst.damp);",
      );
  };
  material.customProgramCacheKey = () => "cavern-flowstone-v1";
  const chunks = new Map();
  for (const site of sites) {
    const key = `${Math.floor(site.x / 49)}:${Math.floor(site.z / 49)}`;
    if (!chunks.has(key)) {
      const root = new THREE.Group();
      root.name = "Chamber flowstone terraces";
      game.world.add(root);
      chunks.set(key, root);
    }
    const mesh = new THREE.Mesh(
      flowstoneGeometry(site, game.terrainProfile.surfaceHeight),
      material,
    );
    mesh.position.set(
      site.x,
      game.terrainProfile.surfaceHeight(site.x, site.z),
      site.z,
    );
    mesh.castShadow = mesh.receiveShadow = true;
    chunks.get(key).add(mesh);
    const feature = {
      id: `flowstone-${site.room}-${game.cavernFlowstone.length}`,
    };
    const solid = stationMeshSolid(game, feature, mesh, { bodyPadding: 0.4 });
    solid.cavernFlowstone = true;
    // Capture narrow sectors before batching. A single box around the apron
    // would also occupy the low outer treads beneath its central crown.
    for (let sector = 0; sector < 12; sector++) {
      const selected = mesh.geometry.clone();
      const stride = mesh.geometry.index.count / 12;
      selected.setIndex(
        Array.from(
          mesh.geometry.index.array.slice(
            sector * stride,
            (sector + 1) * stride,
          ),
        ),
      );
      const geometry = selected.toNonIndexed();
      selected.dispose();
      const part = new THREE.Mesh(geometry, material);
      part.position.copy(mesh.position);
      part.castShadow = part.receiveShadow = true;
      chunks.get(key).add(part);
      game.cameraSurfaces?.capture(part, { small: true, thin: true });
    }
    chunks.get(key).remove(mesh);
    mesh.geometry.dispose();
    game.cavernFlowstone.push({ ...site, solid, root: chunks.get(key) });
  }
  for (const root of chunks.values()) mergeArchitecture(root);
}
