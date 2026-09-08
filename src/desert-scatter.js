import * as THREE from "three";
import { random } from "./campaign.js";
import { desertRouteDistance } from "./desert-geology.js";
import { desertPlan } from "./desert-architecture.js";
import { inSolarCourt } from "./solar-rules.js";
import { createLodPatch } from "./instance-lod.js";
import { desertScatterMaterial } from "./desert-scatter-material.js";

// A scan's underside, rather than its origin, determines how it meets soil.
// Cache these samples per shape; placement only performs terrain height queries.
export function desertStoneShape(source, matrix = new THREE.Matrix4()) {
  const geometry = source.clone().applyMatrix4(matrix);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox,
    size = box.getSize(new THREE.Vector3()),
    center = box.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -box.min.y, -center.z);
  geometry.scale(...new Array(3).fill(1 / Math.max(size.x, size.y, size.z)));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const bounds = geometry.boundingBox,
    probe = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    ),
    ray = new THREE.Raycaster(),
    underside = [];
  for (let iz = 1; iz <= 7; iz++)
    for (let ix = 1; ix <= 7; ix++) {
      const x = THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, ix / 8),
        z = THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, iz / 8);
      ray.set(new THREE.Vector3(x, -1, z), new THREE.Vector3(0, 1, 0));
      const hit = ray.intersectObject(probe)[0];
      if (hit) underside.push(hit.point.clone());
    }
  probe.material.dispose();
  if (!underside.length) throw new Error("Stone has no supported footprint");
  return { geometry, underside, bounds: bounds.clone() };
}

export function seatDesertStone(
  profile,
  shape,
  { x, z, size, yaw, squash = 1 },
) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(x, 0, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3(size, size * squash, size),
  );
  let base = Infinity,
    low = Infinity,
    high = -Infinity;
  const p = new THREE.Vector3();
  for (const point of shape.underside) {
    p.copy(point).applyMatrix4(matrix);
    const ground = profile.height(p.x, p.z);
    base = Math.min(base, ground - p.y);
    low = Math.min(low, ground);
    high = Math.max(high, ground);
  }
  const height = shape.bounds.max.y * size * squash;
  // Avoid bridging sharp banks or hiding almost the whole stone in a ridge.
  if (high - low > height * 0.7 + 0.08) return null;
  base -= Math.min(0.06, size * 0.04);
  const exposed = base + height - profile.height(x, z);
  if (exposed < Math.min(0.12, height * 0.22)) return null;
  matrix.elements[13] = base;
  return { matrix, position: new THREE.Vector3(x, base, z), exposed };
}

export function desertScatterAllowed(game, x, z, radius, large = false) {
  const { map, terrainProfile: profile } = game;
  if (
    x < 4 + radius ||
    z < 4 + radius ||
    x > map.size * 7 - 4 - radius ||
    z > map.size * 7 - 4 - radius
  )
    return false;
  if (large && desertRouteDistance(map, x, z) < radius + 0.65) return false;
  if (inSolarCourt(map, x, z)) return false;
  if (
    map.features.some(
      (f) => Math.hypot(f.x * 7 - x, f.z * 7 - z) < 3.5 + radius,
    )
  )
    return false;
  if (
    map.cleft &&
    Math.abs(x - map.cleft.x * 7) < 22 + radius &&
    Math.abs(z - map.cleft.z * 7) < 19 + radius
  )
    return false;
  if (
    profile.waters.some(
      (w) =>
        Math.abs(x - w.x) < w.width / 2 + radius + 1.5 &&
        Math.abs(z - w.z) < w.length / 2 + radius + 1.5,
    )
  )
    return false;
  if (
    game.obstacles?.some(
      (o) =>
        Math.abs(x - o.x) < o.w + radius + 0.2 &&
        Math.abs(z - o.z) < o.d + radius + 0.2,
    )
  )
    return false;
  // The principal court crossings stay visually legible even where tiny rubble
  // could otherwise fit between their game collision surfaces.
  if (
    map.rooms.some(
      (r) =>
        Math.abs(x - r.x * 7) < 21 &&
        Math.abs(z - r.z * 7) < 24 &&
        (Math.abs(x - r.x * 7) < 3 || Math.abs(z - r.z * 7) < 3),
    )
  )
    return false;
  return true;
}

export function desertScatterLayout(game, shapes, chip) {
  const rng = random(game.level.seed + 3809),
    stones = [],
    rubble = [],
    extent = game.map.size * 7;
  const accept = (out, shape, x, z, size, variant, large) => {
    const radius = size * 0.72;
    if (!desertScatterAllowed(game, x, z, radius, large)) return;
    if (
      large &&
      stones.some(
        (s) =>
          Math.hypot(x - s.position.x, z - s.position.z) <
          radius + s.radius + 1.5,
      )
    )
      return;
    const yaw = rng() * Math.PI * 2,
      squash = large ? 0.78 + rng() * 0.28 : 0.4 + rng() * 0.28;
    const seated = seatDesertStone(game.terrainProfile, shape, {
      x,
      z,
      size,
      yaw,
      squash,
    });
    if (!seated) return;
    out.push({ ...seated, radius, variant, size, yaw, squash });
  };
  // Banks carry separated outcrops, with a few smaller fragments at their feet.
  for (let attempt = 0; attempt < 14000 && stones.length < 230; attempt++) {
    const x = 4 + rng() * (extent - 8),
      z = 4 + rng() * (extent - 8);
    const distance = desertRouteDistance(game.map, x, z);
    if (distance < 1.5 || distance > 19) continue;
    const variant = Math.floor(rng() * shapes.length),
      size = 0.85 + rng() ** 1.5 * 2.15;
    accept(stones, shapes[variant], x, z, size, variant, true);
  }
  const sprinkle = (x, z, count, radius) => {
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2,
        r = Math.sqrt(rng()) * radius;
      accept(
        rubble,
        chip,
        x + Math.cos(angle) * r,
        z + Math.sin(angle) * r,
        0.12 + rng() ** 2 * 0.42,
        0,
        false,
      );
    }
  };
  for (const stone of stones)
    sprinkle(stone.position.x, stone.position.z, 9, stone.radius + 1.9);
  // Small masonry fragments accumulate by the piers, not in the crossing axes.
  for (const room of game.map.rooms)
    for (const pier of desertPlan(room).piers)
      sprinkle(room.x * 7 + pier.x, room.z * 7 + pier.z, 44, 4.4);
  return { stones, rubble };
}

function rubbleShape() {
  const geometry = new THREE.IcosahedronGeometry(1, 1),
    p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      scale = 0.86 + 0.14 * Math.sin(x * 9 + Math.sin(y * 7 + z * 6));
    p.setXYZ(i, x * scale, y * scale * 0.65, z * scale * 0.84);
  }
  geometry.computeVertexNormals();
  const shape = desertStoneShape(geometry);
  geometry.dispose();
  return shape;
}

export function buildDesertScatter(game, sources) {
  const shapes = sources.map((s) =>
      desertStoneShape(s.geometry, s.matrixWorld),
    ),
    chip = rubbleShape(),
    layout = desertScatterLayout(game, shapes, chip),
    material = desertScatterMaterial(
      game.terrainMeshes[0].material.userData.terrainUniforms,
    );
  game.desertScatter = layout;
  const makePatches = (placements, variants, kind) => {
    for (let variant = 0; variant < variants.length; variant++) {
      const chunks = new Map();
      for (const stone of placements.filter((s) => s.variant === variant)) {
        const key = `${Math.floor(stone.position.x / 40)},${Math.floor(stone.position.z / 40)}`;
        if (!chunks.has(key)) chunks.set(key, []);
        chunks.get(key).push(stone);
      }
      for (const chunk of chunks.values()) {
        const patch = createLodPatch(
          game.world,
          [[{ geometry: variants[variant].geometry, material }]],
          chunk.map((s) => s.matrix),
          chunk.map((s) => s.position),
          { castShadow: kind === "rock", planar: true },
        );
        patch.kind = kind;
        game.naturePatches.push(patch);
      }
    }
  };
  makePatches(layout.stones, shapes, "rock");
  makePatches(layout.rubble, [chip], "gravel");
  // The moss scan supplies shape only in this chapter. Its unused original
  // material and textures do not enter the desert's render resource lifetime.
  const materials = new Set(sources.map((s) => s.material)),
    textures = new Set();
  for (const m of materials)
    for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
  sources.forEach((s) => s.geometry.dispose());
}
