import * as T from "three";
import { random } from "./campaign.js";
import { desertNoise } from "./desert-geology.js";
import { natureRockAllowed, rockGroundHeight } from "./nature-rocks.js";
import { stoneFootprint, seatStone } from "./stone-grounding.js";
import { yardRouteClear, yardTraversalClear } from "./station-yard-plan.js";
import { discoveryFoliageClear } from "./discovery-setting-plan.js";
import { createLodPatch } from "./instance-lod.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { snowBoulderMaterial } from "./snow-terrain-material.js";

export const SNOW_SCREE_RANGES = {
  high: [18, 64],
  medium: [14, 50],
  low: [10, 38],
};

// Both tiers retain one irregular footprint and the same broken crown.
// A flat fracture base keeps the entire underside seated against the bank.
export function snowScreeGeometries(variant) {
  const shapes = [
      [0.68, 0.36, 0.58],
      [0.82, 0.22, 0.49],
      [0.54, 0.43, 0.65],
      [0.71, 0.26, 0.73],
      [0.6, 0.33, 0.47],
      [0.83, 0.23, 0.62],
    ],
    scale = shapes[variant % shapes.length],
    tiers = [1, 2].map((step) => {
      const points = [];
      for (let i = 0; i < 16; i++) {
        const angle = (i * Math.PI) / 8,
          radius = 0.91 + 0.065 * Math.sin(i * 2.71 + variant * 3.17),
          x = Math.cos(angle) * radius * scale[0],
          z = Math.sin(angle) * radius * scale[2];
        points.push(new T.Vector3(x, 0, z));
        if (i % step === 0) {
          const fracture = Math.sin(i * 2.17 + variant * 1.43),
            shoulder = 0.78 + 0.025 * Math.sin(i * 3.31 + variant);
          points.push(
            new T.Vector3(
              Math.cos(angle) * scale[0] * shoulder,
              scale[1] * (0.27 + 0.12 * fracture),
              Math.sin(angle) * scale[2] * shoulder,
            ),
            new T.Vector3(
              Math.cos(angle + 0.13) * scale[0] * (0.48 + 0.07 * fracture),
              scale[1] * (0.72 + 0.2 * Math.sin(i * 1.71 + variant * 2.4)),
              Math.sin(angle + 0.13) * scale[2] * (0.48 + 0.07 * fracture),
            ),
          );
        }
      }
      for (const [x, y, z] of [
        [-0.24, 1.02, -0.13],
        [0.17, 1.09, -0.07],
        [-0.02, 0.98, 0.21],
      ])
        points.push(new T.Vector3(scale[0] * x, scale[1] * y, scale[2] * z));
      const g = new ConvexGeometry(points),
        p = g.attributes.position,
        n = g.attributes.normal,
        uv = [];
      for (let i = 0; i < p.count; i++) {
        if (
          Math.abs(n.getY(i)) >=
          Math.max(Math.abs(n.getX(i)), Math.abs(n.getZ(i)))
        )
          uv.push(p.getX(i), p.getZ(i));
        else if (Math.abs(n.getX(i)) >= Math.abs(n.getZ(i)))
          uv.push(p.getZ(i), p.getY(i));
        else uv.push(p.getX(i), p.getY(i));
      }
      g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
      // Preserve fracture edges while softening shallow changes between faces.
      const shared = new Map();
      for (let i = 0; i < p.count; i++) {
        const key = [p.getX(i), p.getY(i), p.getZ(i)]
          .map((v) => Math.round(v * 1e6))
          .join(",");
        if (!shared.has(key)) shared.set(key, []);
        shared.get(key).push(i);
      }
      const original = n.array.slice();
      for (const ids of shared.values())
        for (const i of ids) {
          const face = new T.Vector3().fromArray(original, i * 3),
            sum = new T.Vector3();
          for (const j of ids) {
            const other = new T.Vector3().fromArray(original, j * 3);
            if (face.dot(other) > 0.72) sum.add(other);
          }
          sum.normalize();
          n.setXYZ(i, sum.x, sum.y, sum.z);
        }
      return g;
    });
  for (const g of tiers) {
    g.computeBoundingBox();
    g.computeBoundingSphere();
  }
  return tiers;
}

export function snowScreeAllowed(game, x, z, radius, rocks = []) {
  const profile = game.terrainProfile,
    box = { x, z, w: radius * 2, d: radius * 2 };
  if (
    profile.court(x, z) > 0.25 ||
    !yardRouteClear(game.map, box, 2.6) ||
    !yardTraversalClear(game.traversalCourses || [], box) ||
    !natureRockAllowed(game, x, z, radius) ||
    !discoveryFoliageClear(game, x, z, radius)
  )
    return false;
  for (const [site, w, d] of [
    [game.map.frozenStair, 18, 18],
    [game.map.bellHoist, 27, 34],
  ])
    if (
      site &&
      Math.abs(x - site.x * 7) < w + radius &&
      Math.abs(z - site.z * 7) < d + radius
    )
      return false;
  for (const gate of game.fieldGates || [])
    if (
      Math.abs(x - gate.root.position.x) < 12.5 + radius &&
      Math.abs(z - gate.root.position.z) < 12.5 + radius
    )
      return false;
  for (const tree of game.woodland || [])
    if (Math.hypot(x - tree.x, z - tree.z) < 0.85 + radius) return false;
  for (const b of rocks)
    if (
      x > b.min.x - radius - 0.08 &&
      x < b.max.x + radius + 0.08 &&
      z > b.min.z - radius - 0.08 &&
      z < b.max.z + radius + 0.08
    )
      return false;
  return (
    Math.hypot(
      profile.height(x + 0.5, z) - profile.height(x - 0.5, z),
      profile.height(x, z + 0.5) - profile.height(x, z - 0.5),
    ) < 1.1
  );
}

export function snowScreeCandidates(game) {
  if (game.level.biome !== "snow") return [];
  const rng = random(game.level.seed + 88139),
    map = game.map,
    out = [];
  for (let z = 1; z < map.size - 1; z++)
    for (let x = 1; x < map.size - 1; x++) {
      if (!map.grid[z][x]) continue;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (map.grid[z + dz]?.[x + dx]) continue;
        const fan = desertNoise(
          x * 0.31 + 13,
          z * 0.31 + 37,
          game.level.seed + 97,
        );
        for (let i = 0; i < 18; i++) {
          const offset = 3.1 + Math.pow(rng(), 1.6) * 5.4,
            lateral = (rng() - 0.5) * 7,
            px = x * 7 + dx * offset + dz * lateral,
            pz = z * 7 + dz * offset + dx * lateral,
            size = 0.28 + Math.pow(rng(), 1.8) * 1.1,
            yaw = rng() * Math.PI * 2,
            variant = Math.floor(rng() * 6),
            tint = 0.86 + rng() * 0.26,
            pick = rng();
          if (pick > Math.max(0, fan - 0.28) * 1.15) continue;
          out.push({ x: px, z: pz, size, yaw, variant, tint });
        }
      }
    }
  // Admission limits must not fill only the southern half of the mountain.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function buildSnowScree(game) {
  game.snowScree = null;
  if (game.level.biome !== "snow") return;
  const existing = game.naturePatches.filter((p) => p.kind === "rock"),
    maps = game.terrainMeshes?.[0].material.userData.terrainUniforms;
  if (!existing.length || !maps) return;
  // Repeatable terrain maps suit authored fragments; a scan's baked atlas
  // belongs to its original UV islands and must not be projected onto them.
  const base = new T.MeshStandardMaterial({
      map: maps.cliffMap.value,
      normalMap: maps.cliffNormal.value,
      roughnessMap: maps.cliffRoughness.value,
      roughness: 1,
      normalScale: new T.Vector2(0.5, 0.5),
    }),
    material = snowBoulderMaterial(base);
  base.dispose();
  material.name = "Snow-dusted alpine scree";
  const snowHook = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    snowHook.call(this, shader, renderer);
    shader.uniforms.screeSnowMap = {
      value: game.terrainMeshes[0].material.map,
    };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D screeSnowMap;",
      )
      .replace(
        "float deposited=smoothstep(.48,.87,upward);",
        `float snowGrain=1.;
        #ifdef USE_MAP
          snowGrain=dot(texture2D(screeSnowMap,vMapUv*1.4).rgb,vec3(.2126,.7152,.0722));
        #endif
        float deposited=smoothstep(.82,.99,upward+(snowGrain-.5)*.12);`,
      )
      .replace(
        "vec3(.73,.82,.91),deposited",
        "vec3(.73,.82,.91)*mix(.82,1.12,snowGrain),deposited",
      );
  };
  material.customProgramCacheKey = () => "vesper-alpine-scree-1";
  const rocks = existing.flatMap((p) => {
      const box = new T.Box3().setFromBufferAttribute(
        p.tiers[0][0].geometry.attributes.position,
      );
      return p.matrices.map((m) => box.clone().applyMatrix4(m));
    }),
    specimens = Array.from({ length: 6 }, (_, variant) => {
      const tiers = snowScreeGeometries(variant),
        footprints = tiers.map((g) => stoneFootprint(g, { edgeProbes: true })),
        bounds = tiers.reduce((b, g) => b.union(g.boundingBox), new T.Box3());
      return {
        tiers,
        bounds,
        underside: footprints.flatMap((f) => f.underside),
      };
    }),
    chunks = new Map(),
    occupied = new Map(),
    stones = [],
    stats = {
      candidates: 0,
      reserved: 0,
      overlapping: 0,
      unsupported: 0,
      placed: 0,
      variants: Array(6).fill(0),
    };
  try {
    for (const p of snowScreeCandidates(game)) {
      if (stones.length >= 2800) break;
      stats.candidates++;
      const shape = specimens[p.variant],
        radius =
          Math.hypot(
            Math.max(
              Math.abs(shape.bounds.min.x),
              Math.abs(shape.bounds.max.x),
            ),
            Math.max(
              Math.abs(shape.bounds.min.z),
              Math.abs(shape.bounds.max.z),
            ),
          ) * p.size;
      if (!snowScreeAllowed(game, p.x, p.z, radius, rocks)) {
        stats.reserved++;
        continue;
      }
      const gx = Math.floor(p.x / 3),
        gz = Math.floor(p.z / 3);
      let overlap = false;
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++)
          for (const q of occupied.get(`${gx + dx},${gz + dz}`) || [])
            if (Math.hypot(p.x - q.x, p.z - q.z) < radius + q.radius + 0.06)
              overlap = true;
      if (overlap) {
        stats.overlapping++;
        continue;
      }
      const placed = seatSnowScree(game.terrainProfile, shape, p);
      if (!placed) {
        stats.unsupported++;
        continue;
      }
      const key = `${gx},${gz}`;
      if (!occupied.has(key)) occupied.set(key, []);
      occupied.get(key).push({ x: p.x, z: p.z, radius });
      if (!chunks.has(p.variant))
        chunks.set(p.variant, { matrices: [], positions: [], colors: [] });
      const chunk = chunks.get(p.variant);
      chunk.matrices.push(placed.matrix);
      chunk.positions.push(placed.position);
      chunk.colors.push(new T.Color().setScalar(p.tint));
      stones.push({ ...p, radius, matrix: placed.matrix });
      stats.placed++;
      stats.variants[p.variant]++;
    }
    const patches = [];
    for (const [variant, chunk] of chunks) {
      const patch = createLodPatch(
        game.world,
        specimens[variant].tiers.map((geometry) => [{ geometry, material }]),
        chunk.matrices,
        chunk.positions,
        { colors: chunk.colors, castShadow: true },
      );
      patch.kind = "rock";
      patch.snowScree = variant;
      patch.lodRanges = SNOW_SCREE_RANGES;
      patch.snowScreePatch = true;
      game.naturePatches.push(patch);
      patches.push(patch);
    }
    game.snowScree = { stats, stones, patches };
    if (!patches.length) material.dispose();
  } finally {
    for (const shape of specimens)
      for (const geometry of shape.tiers) geometry.dispose();
  }
}

// Minimize over the actual grid triangles clipped to the rotated footprint's
// bounds. This covers cell-edge dips between the cached underside probes.
export function seatSnowScree(profile, shape, options) {
  const placed = seatStone(
    { height: (x, z) => rockGroundHeight(profile, x, z) },
    shape,
    options,
  );
  if (!placed) return null;
  const box = shape.bounds.clone().applyMatrix4(placed.matrix),
    step = profile.step || 1.75;
  let lowest = Infinity;
  const clip = (polygon, axis, value, positive) => {
    const out = [],
      distance = (p) => (p[axis] - value) * (positive ? 1 : -1);
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i],
        q = polygon[(i + 1) % polygon.length],
        d = distance(p),
        e = distance(q);
      if (d >= 0) out.push(p);
      if (d * e < 0) out.push(p.clone().lerp(q, d / (d - e)));
    }
    return out;
  };
  for (
    let iz = Math.floor(box.min.z / step);
    iz <= Math.floor(box.max.z / step);
    iz++
  )
    for (
      let ix = Math.floor(box.min.x / step);
      ix <= Math.floor(box.max.x / step);
      ix++
    ) {
      const vertex = (x, z) => new T.Vector3(x, profile.height(x, z), z),
        a = vertex(ix * step, iz * step),
        b = vertex(ix * step, (iz + 1) * step),
        c = vertex((ix + 1) * step, (iz + 1) * step),
        d = vertex((ix + 1) * step, iz * step);
      for (const face of [
        [a, b, d],
        [b, c, d],
      ]) {
        let cell = face;
        for (const [axis, value, positive] of [
          ["x", box.min.x, true],
          ["x", box.max.x, false],
          ["z", box.min.z, true],
          ["z", box.max.z, false],
        ])
          cell = clip(cell, axis, value, positive);
        for (const p of cell)
          lowest = Math.min(lowest, p.y, profile.height(p.x, p.z));
      }
    }
  if (!Number.isFinite(lowest)) return null;
  const base = Math.min(placed.matrix.elements[13], lowest - 0.015),
    height = shape.bounds.max.y * options.size;
  if (
    base + height - profile.height(options.x, options.z) <
    Math.min(0.12, height * 0.22)
  )
    return null;
  placed.matrix.elements[13] = base;
  placed.position.y = base;
  return placed;
}
