import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { random } from "./campaign.js";
import { inResonanceCourt } from "./resonance-rules.js";
import { inEchoGallery } from "./echo-gallery-rules.js";
import { causewayFoundationDistance } from "./echo-causeway-rules.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { cavernRock } from "./cavern-material.js";
import { stationMeshSolid } from "./field-station-solids.js";
import { mergeArchitecture } from "./visuals.js";

const TAU = Math.PI * 2;
const SEGMENTS = 48;
const LEVELS = [
  0, 0.015, 0.035, 0.065, 0.1, 0.15, 0.22, 0.32, 0.44, 0.56, 0.68, 0.78, 0.85,
  0.9, 0.935, 0.965, 0.985, 1,
];

function pathDistance(x, z, a, b) {
  const dx = (b.x - a.x) * 7,
    dz = (b.z - a.z) * 7;
  const px = x - a.x * 7,
    pz = z - a.z * 7;
  const t = THREE.MathUtils.clamp(
    (px * dx + pz * dz) / (dx * dx + dz * dz || 1),
    0,
    1,
  );
  return Math.hypot(px - dx * t, pz - dz * t);
}

// The radius encloses every ring, including the leaning waist and flared ends.
// A column spans the whole air space, so overhead structures also reserve it.
export function columnAllowed(game, site) {
  const { x, z, radius: r } = site,
    { map, terrainProfile: terrain } = game;
  if (
    x < r + 4 ||
    z < r + 4 ||
    x > terrain.extent - r - 4 ||
    z > terrain.extent - r - 4 ||
    !map.grid[Math.round(z / 7)]?.[Math.round(x / 7)] ||
    inResonanceCourt(map, x, z, r + 3) ||
    inEchoGallery(map, x, z, r + 4) ||
    (map.echoCauseway && causewayFoundationDistance(x, z) < r + 5)
  )
    return false;
  if (
    Math.hypot(x - map.spawn.x * 7, z - map.spawn.z * 7) < r + 10 ||
    map.features.some(
      (f) =>
        Math.hypot(x - f.x * 7, z - f.z * 7) <
        r + (f.kind === "climb" ? 19 : 7),
    ) ||
    map.enemies.some((e) => Math.hypot(x - e.x * 7, z - e.z * 7) < r + 6)
  )
    return false;
  if (
    terrain.waters.some(
      (w) =>
        Math.abs(x - w.x) < w.width / 2 + r + 3 &&
        Math.abs(z - w.z) < w.length / 2 + r + 3,
    )
  )
    return false;
  for (const patch of game.cavernPatches || [])
    for (const c of patch.centers)
      if (Math.hypot(x - c.x, z - c.z) < r + 4.5) return false;
  for (const s of game.soundSources || [])
    if (Math.hypot(x - s.x, z - s.z) < r + 4) return false;
  const floor = terrain.surfaceHeight(x, z);
  for (const o of game.obstacles)
    if (
      !o.cavernColumn &&
      (o.bounds?.max.y ?? terrain.surfaceHeight(o.x, o.z) + (o.h ?? 0)) >
        floor + 0.4 &&
      Math.abs(x - o.x) < o.w + r + 0.8 &&
      Math.abs(z - o.z) < o.d + r + 0.8
    )
      return false;
  for (const path of map.paths)
    for (let i = 0; i < path.length; i++)
      if (
        pathDistance(x, z, path[i], path[Math.min(i + 1, path.length - 1)]) <
        r + 2.8
      )
        return false;
  return true;
}

export function planCavernColumns(game) {
  if (game.level.biome !== "crystal") return [];
  const rng = random(game.level.seed + 74381),
    sites = [];
  for (const room of game.map.rooms) {
    const candidates = [];
    for (let dx = -room.r * 7 - 6; dx <= room.r * 7 + 6; dx += 1.5)
      for (let dz = -room.r * 7 - 6; dz <= room.r * 7 + 6; dz += 1.5) {
        const d = Math.hypot(dx, dz);
        if (d > room.r * 7 + 7 || d < 10) continue;
        candidates.push({
          x: room.x * 7 + dx,
          z: room.z * 7 + dz,
          d,
          a: Math.atan2(dz, dx),
        });
      }
    for (let slot = 0; slot < (room.index === 8 ? 3 : 2); slot++) {
      const rx = 2.15 + rng() * 0.3,
        rz = 1.45 + rng() * 0.35,
        radius = rx * 1.36,
        seed = rng() * 20,
        yaw = rng() * TAU,
        preferred = room.index * 0.91 + slot * Math.PI;
      const score = (c) =>
        Math.abs(c.d - (room.r * 7 - 3)) * 0.12 + 1 - Math.cos(c.a - preferred);
      for (const c of [...candidates].sort((a, b) => score(a) - score(b))) {
        const site = {
          room: room.index,
          x: c.x,
          z: c.z,
          rx,
          rz,
          radius,
          seed,
          yaw,
        };
        if (
          !columnAllowed(game, site) ||
          sites.some(
            (s) => Math.hypot(s.x - c.x, s.z - c.z) < s.radius + radius + 5,
          )
        )
          continue;
        const heights = Array.from({ length: 16 }, (_, i) =>
          game.terrainProfile.surfaceHeight(
            c.x + Math.cos((i * TAU) / 16) * radius,
            c.z + Math.sin((i * TAU) / 16) * radius,
          ),
        );
        if (
          Math.max(...heights) - Math.min(...heights) > 1.5 ||
          game.cavernProfile.height(c.x, c.z) -
            game.terrainProfile.surfaceHeight(c.x, c.z) <
            16
        )
          continue;
        sites.push(site);
        break;
      }
    }
  }
  return sites;
}

// Homothetic fluted rings give the column a narrow, curved trunk and
// spreading calcite roots. Flat caps are buried beyond every touched roof and
// floor triangle, rather than leaving seams at a few sampled perimeter points.
export function columnGeometry(site, terrain, roof) {
  const { x, z, rx, rz, radius, seed, yaw } = site;
  const base = terrain.surfaceHeight(x, z),
    diameter = radius * 2;
  const bottom =
    footprintMinimum(
      (a, b) => Math.min(terrain.height(a, b), terrain.surfaceHeight(a, b)),
      x,
      z,
      diameter,
      diameter,
      terrain.step,
    ) - 0.45;
  const top =
    -footprintMinimum(
      (a, b) => -roof.height(a, b),
      x,
      z,
      diameter,
      diameter,
      terrain.step,
    ) + 0.45;
  const height = top - bottom,
    positions = [],
    uvs = [],
    indices = [];
  const cs = Math.cos(yaw),
    sn = Math.sin(yaw);
  for (const t of LEVELS) {
    const y = bottom + height * t,
      scale =
        0.7 +
        0.42 * Math.exp((-height * t) / 4.2) +
        0.42 * Math.exp((-height * (1 - t)) / 5) +
        0.09 * Math.sin(t * Math.PI) * Math.sin(t * Math.PI * 5 + seed),
      lean = Math.sin(t * Math.PI) * 0.3,
      bend = Math.sin(t * Math.PI * 2) * 0.09;
    for (let j = 0; j < SEGMENTS; j++) {
      const a = (j * TAU) / SEGMENTS,
        rib =
          1 + 0.115 * Math.sin(a * 3 + seed) + 0.002 * Math.sin(a * 4 - seed),
        u =
          rx *
          (Math.cos(a) * scale * rib +
            lean * Math.sin(seed) +
            bend * Math.cos(seed)),
        v =
          rz *
          (Math.sin(a) * scale * rib +
            lean * Math.cos(seed) -
            bend * Math.sin(seed));
      positions.push(u * cs - v * sn, y - base, u * sn + v * cs);
      uvs.push(j / SEGMENTS, (y - bottom) / 5);
    }
  }
  const cap = positions.length / 3;
  positions.push(0, bottom - base, 0, 0, top - base, 0);
  uvs.push(0.5, 0, 0.5, height / 5);
  for (let j = 0; j < SEGMENTS; j++) {
    const next = (j + 1) % SEGMENTS;
    indices.push(
      cap,
      j,
      next,
      cap + 1,
      (LEVELS.length - 1) * SEGMENTS + next,
      (LEVELS.length - 1) * SEGMENTS + j,
    );
    for (let i = 0; i < LEVELS.length - 1; i++) {
      const a = i * SEGMENTS + j,
        b = i * SEGMENTS + next;
      indices.push(a, a + SEGMENTS, b, b, a + SEGMENTS, b + SEGMENTS);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function captureCamera(game, mesh) {
  if (!game.cameraSurfaces) return;
  const p = mesh.geometry.attributes.position;
  for (let ring = 0; ring < LEVELS.length - 1; ring++) {
    const points = Array.from({ length: SEGMENTS * 2 }, (_, i) =>
        new THREE.Vector3().fromBufferAttribute(p, ring * SEGMENTS + i),
      ),
      hull = new ConvexGeometry(points),
      planes = [],
      seen = new Set();
    for (let i = 0; i < hull.attributes.position.count; i += 3) {
      const n = new THREE.Vector3()
          .fromBufferAttribute(hull.attributes.normal, i)
          .normalize(),
        v = new THREE.Vector3().fromBufferAttribute(
          hull.attributes.position,
          i,
        ),
        plane = [...n.toArray(), n.dot(v)],
        key = plane.map((v) => Math.round(v * 1e6)).join(",");
      if (!seen.has(key)) {
        seen.add(key);
        planes.push(plane);
      }
    }
    const proxy = new THREE.Mesh(hull, mesh.material);
    proxy.position.copy(mesh.position);
    mesh.parent.add(proxy);
    game.cameraSurfaces.capture(proxy, { small: true, thin: true, planes });
    mesh.parent.remove(proxy);
    hull.dispose();
  }
}

function columnMaterial() {
  const material = cavernRock(),
    compile = material.onBeforeCompile;
  material.name = "Water-grown cavern calcite columns";
  material.color.setHex(0xd9d2bd);
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "diffuseColor.rgb*=karstColor(caveAlbedo,karst);",
        `float grain=dot(caveAlbedo,vec3(.2126,.7152,.0722));
       vec3 calcite=mix(vec3(.29,.28,.24),vec3(.66,.62,.52),clamp(grain*1.6,0.,1.));
       float streak=.8+.25*karstNoise(cavePosition.xz*.85+vec2(cavePosition.y*.025,19.));
       karst.bed=.5+(karst.bed-.5)*.25;
       karst.joint*=.18; karst.relief*=.3;
       diffuseColor.rgb*=karstColor(calcite*streak,karst);`,
      )
      .replace(
        "float roughnessFactor=mix(clamp(caveRough,.78,1.),.55,karst.damp);",
        "float roughnessFactor=mix(clamp(caveRough,.69,.88),.5,karst.damp);",
      );
  };
  material.customProgramCacheKey = () => "cavern-columns-v1";
  return material;
}

export function buildCavernColumns(game) {
  game.cavernColumns = [];
  const sites = planCavernColumns(game);
  if (!sites.length) return;
  const material = columnMaterial(),
    chunks = new Map();
  for (const site of sites) {
    const key = `${Math.floor(site.x / 49)}:${Math.floor(site.z / 49)}`;
    if (!chunks.has(key)) {
      const root = new THREE.Group();
      root.name = "Chamber limestone columns";
      game.world.add(root);
      chunks.set(key, root);
    }
    const mesh = new THREE.Mesh(
      columnGeometry(site, game.terrainProfile, game.cavernProfile),
      material,
    );
    mesh.position.set(
      site.x,
      game.terrainProfile.surfaceHeight(site.x, site.z),
      site.z,
    );
    mesh.castShadow = mesh.receiveShadow = true;
    chunks.get(key).add(mesh);
    const solid = stationMeshSolid(
      game,
      { id: `cavern-column-${site.room}-${game.cavernColumns.length}` },
      mesh,
      { support: false, bodyPadding: 0.55 },
    );
    solid.crouchPadding = 0.65;
    solid.cavernColumn = true;
    captureCamera(game, mesh);
    game.cavernColumns.push({ ...site, solid, root: chunks.get(key) });
  }
  for (const root of chunks.values()) mergeArchitecture(root, 2);
}
