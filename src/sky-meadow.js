import * as THREE from "three";
import { random } from "./campaign.js";
import { createLodPatch, updateLodPatch } from "./instance-lod.js";
import { rockGroundHeight, natureRockAllowed } from "./nature-rocks.js";
import { skyGroundSupported, skyRockNoise } from "./sky-geology.js";
import { discoveryFoliageClear } from "./discovery-setting-plan.js";

export const MEADOW_RANGES = {
  high: [18, 42, 85],
  medium: [13, 32, 65],
  low: [7, 21, 46],
};

// Two bunchgrasses and a low, fleshy rosette. All tiers use a subset of the same
// leaves, retaining the specimen's silhouette, root positions and wind phase.
export function skyMeadowSpecimens({
  grassLeaves = 56,
  cushionLeaves = 48,
  curveSegments = [4, 3, 2],
} = {}) {
  return [0, 1, 2].map((variant) => {
    const cushion = variant === 2,
      rng = random(12083 + variant * 47),
      leaves = Array.from(
        { length: cushion ? cushionLeaves : grassLeaves },
        (_, i) => {
          const angle = rng() * Math.PI * 2,
            root = rng() * (cushion ? 0.07 : 0.2);
          return {
            angle,
            x: Math.sin(angle) * root,
            z: Math.cos(angle) * root,
            height: cushion ? 0.06 + rng() * 0.11 : 0.4 + rng() * 0.57,
            lean: cushion ? 0.08 + rng() * 0.14 : 0.15 + rng() * 0.35,
            width: cushion ? 0.015 + rng() * 0.014 : 0.008 + rng() * 0.012,
            dry: rng() < (variant === 1 ? 0.6 : 0.16),
            head: !cushion && i % 7 === 0,
          };
        },
      );
    const green = new THREE.Color(cushion ? 0x657960 : 0x7d8a55),
      dry = new THREE.Color(0xaaa379),
      rootColor = new THREE.Color(cushion ? 0x384c39 : 0x454c30),
      seedColor = new THREE.Color(0xb7a47a);
    const tiers = [0, 1, 2].map((tier) => {
      const position = [],
        color = [],
        bends = [],
        step = [1, 2, 4][tier],
        segments = curveSegments[tier];
      const vertex = (p, c, bend) => {
        position.push(...p);
        color.push(c.r, c.g, c.b);
        bends.push(bend);
      };
      for (let i = 0; i < leaves.length; i += step) {
        const leaf = leaves[i],
          sin = Math.sin(leaf.angle),
          cos = Math.cos(leaf.angle),
          tipColor = leaf.dry ? dry : green;
        const section = (t) => {
          const lean = leaf.lean * (cushion ? t : t * t),
            y = leaf.height * (cushion ? Math.sin(t * Math.PI * 0.65) : t),
            width =
              leaf.width *
              (cushion ? Math.sin(Math.PI * (t * 0.98 + 0.01)) : 1 - t * 0.99) *
              [1, 1.15, 1.3][tier];
          return [-1, 0, 1].map((side) => [
            leaf.x + sin * lean + cos * side * width,
            y + (side === 0 ? width * (cushion ? 0.8 : 0.32) * t : 0),
            leaf.z + cos * lean - sin * side * width,
          ]);
        };
        for (let s = 0; s < segments; s++) {
          const a = s / segments,
            b = (s + 1) / segments,
            points = [...section(a), ...section(b)];
          for (const index of [0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5]) {
            const t = index < 3 ? a : b;
            vertex(
              points[index],
              rootColor.clone().lerp(tipColor, 0.25 + t * 0.75),
              Math.min(1, points[index][1]),
            );
          }
        }
        if (leaf.head) {
          const head = new THREE.IcosahedronGeometry(1, 0),
            p = head.attributes.position,
            center = section(1)[1];
          for (let k = 0; k < p.count; k++)
            vertex(
              [
                center[0] + p.getX(k) * 0.015,
                center[1] + p.getY(k) * 0.045,
                center[2] + p.getZ(k) * 0.015,
              ],
              seedColor,
              center[1],
            );
          head.dispose();
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(position, 3),
      );
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(color, 3),
      );
      geometry.setAttribute(
        "meadowBend",
        new THREE.Float32BufferAttribute(bends, 1),
      );
      geometry.computeVertexNormals();
      // Thin leaves scatter skylight across their folds; soften the geometric
      // normals toward the canopy without replacing their directional shading.
      const normals = geometry.attributes.normal,
        n = new THREE.Vector3();
      for (let i = 0; i < normals.count; i++) {
        n.fromBufferAttribute(normals, i);
        if (n.y < 0) n.negate();
        n.y += 0.65;
        n.normalize();
        normals.setXYZ(i, n.x, n.y, n.z);
      }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometry.boundingSphere.radius += 0.13;
      geometry.boundingBox.expandByVector(new THREE.Vector3(0.11, 0, 0.065));
      return geometry;
    });
    const roots = new Map();
    let radius = 0,
      height = 0;
    for (const geometry of tiers) {
      const p = geometry.attributes.position,
        bend = geometry.attributes.meadowBend;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i);
        radius = Math.max(radius, Math.hypot(x, z) + 0.13);
        height = Math.max(height, y);
        if (bend.getX(i) === 0)
          roots.set(`${x},${z}`, new THREE.Vector3(x, y, z));
      }
    }
    return { variant, tiers, roots: [...roots.values()], radius, height };
  });
}

export function meadowWind(material, time) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.meadowTime = time;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float meadowBend; uniform float meadowTime;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec3 meadowCenter=(instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
        float meadowWeight=meadowBend*meadowBend;
        transformed.x+=sin(meadowTime*.8+meadowCenter.x*.17+meadowCenter.z*.11)*meadowWeight*.11;
        transformed.z+=sin(meadowTime*.53+meadowCenter.z*.15)*meadowWeight*.065;`,
      );
  };
  material.customProgramCacheKey = () => "vesper-alpine-leaves-1";
}

// Include every tier's base vertices, not only the origin. Reject roots that
// straddle sharp shelves; a single transform cannot seat them convincingly.
export function seatMeadowPlant(profile, shape, { x, z, size, yaw }) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(x, 0, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3(size, size, size),
  );
  const p = new THREE.Vector3();
  let low = Infinity,
    high = -Infinity;
  for (const root of shape.roots) {
    p.copy(root).applyMatrix4(matrix);
    const y = rockGroundHeight(profile, p.x, p.z) - p.y;
    low = Math.min(low, y);
    high = Math.max(high, y);
  }
  if (high - low > shape.height * size * 0.32) return null;
  const y = low - Math.min(0.025, shape.height * size * 0.08);
  if (
    y + shape.height * size - profile.height(x, z) <
    shape.height * size * 0.6
  )
    return null;
  matrix.elements[13] = y;
  return { matrix, position: new THREE.Vector3(x, y, z) };
}

function rockBounds(game) {
  return game.naturePatches
    .filter((p) => p.kind === "rock")
    .flatMap((patch) => {
      const box = new THREE.Box3().setFromBufferAttribute(
        patch.tiers[0][0].geometry.attributes.position,
      );
      return patch.matrices.map((m) => box.clone().applyMatrix4(m));
    });
}

export function meadowPlantAllowed(game, x, z, radius, rocks = []) {
  if (!skyGroundSupported(game.terrainProfile, x, z)) return false;
  if (!natureRockAllowed(game, x, z, radius)) return false;
  if (!discoveryFoliageClear(game, x, z, radius)) return false;
  if (
    game.map.features.some(
      (f) =>
        f.type === "mechanism" &&
        Math.abs(x - f.x * 7) < 12 + radius &&
        z - f.z * 7 > 5 - radius &&
        z - f.z * 7 < 23 + radius,
    )
  )
    return false;
  // Reserve the entire chamber and both leaves' motion, independent of saves.
  if (
    (game.fieldGates || []).some(
      (g) =>
        Math.abs(x - g.root.position.x) < 8.6 + radius &&
        Math.abs(z - g.root.position.z) < 8.6 + radius,
    )
  )
    return false;
  if (
    game.items.some(
      (f) =>
        f.discovery &&
        Math.hypot(x - f.discovery.stance.x, z - f.discovery.stance.z) <
          1.1 + radius,
    )
  )
    return false;
  for (const box of rocks)
    if (
      x > box.min.x - radius &&
      x < box.max.x + radius &&
      z > box.min.z - radius &&
      z < box.max.z + radius
    )
      return false;
  // A leaning leaf can extend beyond the roots. Keep that reach off trails,
  // unsupported cliff edges and the bridge's pedestrian landings as well.
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [0.7, 0.7],
    [-0.7, 0.7],
    [0.7, -0.7],
    [-0.7, -0.7],
  ])
    if (
      !skyGroundSupported(game.terrainProfile, x + dx * radius, z + dz * radius)
    )
      return false;
  return true;
}

export function buildSkyMeadow(game) {
  game.skyMeadow = null;
  if (game.level.biome !== "sky") return;
  const specimens = skyMeadowSpecimens(),
    rng = random(game.level.seed + 41933),
    rocks = rockBounds(game),
    chunks = new Map(),
    time = { value: game.elapsed },
    stats = {
      candidates: 0,
      placed: 0,
      reserved: 0,
      unsupported: 0,
      variants: [0, 0, 0],
    },
    plants = [];
  const material = new THREE.MeshStandardMaterial({
    name: "Alpine meadow leaves",
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  meadowWind(material, time);
  for (let gz = 1.6; gz < game.terrainProfile.extent - 1.6; gz += 1.05)
    for (let gx = 1.6; gx < game.terrainProfile.extent - 1.6; gx += 1.05) {
      // Draw every candidate's parameters before reservations, so adding an
      // object never shuffles the plants elsewhere in the world.
      const x = gx + (rng() - 0.5) * 0.8,
        z = gz + (rng() - 0.5) * 0.8,
        sample = rng(),
        variant =
          rng() < 0.2
            ? 2
            : skyRockNoise(x * 0.043, z * 0.043, 17) > 0.5
              ? 1
              : 0,
        size = 0.7 + rng() * 0.5,
        yaw = rng() * Math.PI * 2,
        tint = new THREE.Color().setHSL(
          0.14 + rng() * 0.035,
          0.08,
          0.79 + rng() * 0.13,
        ),
        density = skyRockNoise(x * 0.085, z * 0.085, game.level.seed + 83),
        shape = specimens[variant];
      if (
        sample >
        0.06 + Math.max(0, Math.min(1, (density - 0.35) * 2.9)) * 0.94
      )
        continue;
      stats.candidates++;
      if (!meadowPlantAllowed(game, x, z, shape.radius * size, rocks)) {
        stats.reserved++;
        continue;
      }
      const seated = seatMeadowPlant(game.terrainProfile, shape, {
        x,
        z,
        size,
        yaw,
      });
      if (!seated) {
        stats.unsupported++;
        continue;
      }
      const key = `${variant}:${Math.floor(x / 32)},${Math.floor(z / 32)}`;
      if (!chunks.has(key))
        chunks.set(key, { variant, matrices: [], positions: [], colors: [] });
      const chunk = chunks.get(key);
      chunk.matrices.push(seated.matrix);
      chunk.positions.push(seated.position);
      chunk.colors.push(tint);
      plants.push({ x, z, size, yaw, variant, matrix: seated.matrix });
      stats.placed++;
      stats.variants[variant]++;
    }
  const patches = [...chunks.values()].map((chunk) => {
    const patch = createLodPatch(
      game.world,
      specimens[chunk.variant].tiers.map((geometry) => [
        { geometry, material },
      ]),
      chunk.matrices,
      chunk.positions,
      {
        colors: chunk.colors,
        wind: (depth) => meadowWind(depth, time),
        castShadow: false,
        planar: true,
      },
    );
    for (const mesh of patch.tiers.flat()) {
      mesh.userData.animated = true;
      mesh.userData.excludeContact = true;
    }
    const bounds = new THREE.Box3().setFromPoints(patch.positions);
    patch.center = bounds.getCenter(new THREE.Vector3());
    patch.radius = Math.max(
      ...patch.positions.map((p) =>
        Math.hypot(p.x - patch.center.x, p.z - patch.center.z),
      ),
    );
    return patch;
  });
  game.skyMeadow = { patches, specimens, plants, time, stats };
  updateSkyMeadow(game);
}

export function updateSkyMeadow(game, dt = 0) {
  const meadow = game.skyMeadow;
  if (!meadow) return;
  meadow.time.value = game.elapsed;
  const ranges =
    MEADOW_RANGES[game.store.data.settings.quality] || MEADOW_RANGES.medium;
  for (const patch of meadow.patches) {
    if (
      Math.hypot(
        game.camera.position.x - patch.center.x,
        game.camera.position.z - patch.center.z,
      ) >
        ranges[2] + patch.radius + 1 &&
      !patch.counts.some((n) => n > 0)
    )
      continue;
    updateLodPatch(patch, game.camera.position, ranges, dt, 1);
  }
}
