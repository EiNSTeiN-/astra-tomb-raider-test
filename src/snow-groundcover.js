import * as THREE from "three";
import { random } from "./campaign.js";
import { desertNoise } from "./desert-geology.js";
import { natureRockAllowed } from "./nature-rocks.js";
import { discoveryFoliageClear } from "./discovery-setting-plan.js";
import { yardRouteClear, yardTraversalClear } from "./station-yard-plan.js";
import { skyMeadowSpecimens, seatMeadowPlant } from "./sky-meadow.js";
import { createLodPatch, updateLodPatch } from "./instance-lod.js";
import { woodlandLayout } from "./habitat.js";

export const SNOW_COVER_RANGES = {
  high: [10, 20, 36],
  medium: [7, 16, 28],
  low: [4, 10, 20],
};

// Short dormant bunchgrass, taller seed-bearing stems and low frost-covered
// cushions. All tiers keep the same roots and tips, using the original folded
// leaves with smaller winter silhouettes and ice at their exposed ends.
export function snowCoverSpecimens() {
  return skyMeadowSpecimens({
    grassLeaves: 24,
    cushionLeaves: 24,
    curveSegments: [3, 2, 1],
  }).map((shape, variant) => {
    const scale = [
        [0.6, 0.48, 0.6],
        [0.66, 0.7, 0.6],
        [1.1, 1.15, 1.1],
      ][variant],
      bottom = new THREE.Color([0x42382a, 0x3c3025, 0x3b4546][variant]),
      top = new THREE.Color([0x9c8a66, 0xa48b63, 0x899a9b][variant]),
      roots = new Map();
    let radius = 0,
      height = 0;
    for (const geometry of shape.tiers) {
      geometry.scale(...scale);
      const p = geometry.attributes.position,
        color = geometry.attributes.color;
      for (let i = 0; i < p.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(p, i),
          tint = bottom
            .clone()
            .lerp(
              top,
              Math.min(1, 0.16 + (point.y / (shape.height * scale[1])) * 0.84),
            );
        // Narrow icy tips remain part of the leaf mesh, with no floating cap.
        const exposure = Math.max(
          0,
          (point.y / (shape.height * scale[1]) - 0.76) / 0.24,
        );
        tint.lerp(new THREE.Color(0xc5d1d3), exposure * exposure * 0.72);
        color.setXYZ(i, tint.r, tint.g, tint.b);
        radius = Math.max(radius, Math.hypot(point.x, point.z) + 0.025);
        height = Math.max(height, point.y);
        if (geometry.attributes.meadowBend.getX(i) === 0)
          roots.set(`${point.x},${point.z}`, point);
      }
      geometry.computeBoundingBox();
      geometry.boundingBox.expandByVector(new THREE.Vector3(0.018, 0, 0.012));
      geometry.computeBoundingSphere();
      geometry.boundingSphere.radius += 0.05;
    }
    return {
      variant,
      tiers: shape.tiers,
      radius,
      height,
      roots: [...roots.values()],
    };
  });
}

function coverWind(material, time) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.snowCoverTime = time;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float meadowBend; uniform float snowCoverTime;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec3 coverCenter=(instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
        float coverWeight=meadowBend*meadowBend;
        transformed.x+=sin(snowCoverTime*.7+coverCenter.x*.13+coverCenter.z*.17)*coverWeight*.018;
        transformed.z+=sin(snowCoverTime*.43+coverCenter.z*.19)*coverWeight*.012;`,
      );
  };
  material.customProgramCacheKey = () => "vesper-winter-groundcover-1";
}

function rockBounds(game) {
  return game.naturePatches
    .filter((p) => p.kind === "rock")
    .flatMap((patch) => {
      const box = new THREE.Box3().setFromBufferAttribute(
        patch.tiers[0][0].geometry.attributes.position,
      );
      return patch.matrices.map((matrix) => box.clone().applyMatrix4(matrix));
    });
}

export function snowCoverAllowed(
  game,
  x,
  z,
  radius,
  rocks = [],
  trees = game.woodland || [],
) {
  const profile = game.terrainProfile,
    box = { x, z, w: radius * 2, d: radius * 2 };
  if (profile.court(x, z) > 0.55) return false;
  if (
    !yardRouteClear(game.map, box, 1.5) ||
    !yardTraversalClear(game.traversalCourses || [], box)
  )
    return false;
  if (
    !natureRockAllowed(game, x, z, radius) ||
    !discoveryFoliageClear(game, x, z, radius)
  )
    return false;
  // Reserve frozen stair operations and the full cargo lift/galleries,
  // independent of progress. Low foliage must not cross either moving route.
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
  for (const tree of trees)
    if (Math.hypot(x - tree.x, z - tree.z) < 0.8 + radius) return false;
  for (const gate of game.fieldGates || [])
    if (
      Math.abs(x - gate.root.position.x) < 12.5 + radius &&
      Math.abs(z - gate.root.position.z) < 12.5 + radius
    )
      return false;
  for (const item of game.items)
    if (
      item.discovery &&
      Math.hypot(x - item.discovery.stance.x, z - item.discovery.stance.z) <
        1.8 + radius
    )
      return false;
  for (const rock of rocks)
    if (
      x > rock.min.x - radius &&
      x < rock.max.x + radius &&
      z > rock.min.z - radius &&
      z < rock.max.z + radius
    )
      return false;
  const slope = Math.hypot(
    profile.height(x + 0.5, z) - profile.height(x - 0.5, z),
    profile.height(x, z + 0.5) - profile.height(x, z - 0.5),
  );
  return slope < 0.85;
}

export function buildSnowGroundcover(game) {
  game.snowGroundcover = null;
  if (game.level.biome !== "snow") return;
  const specimens = snowCoverSpecimens(),
    rng = random(game.level.seed + 72871),
    rocks = rockBounds(game),
    // Use the authored plan, including any tree later rejected by scan
    // grounding. Asset completion order must never shuffle the ground cover.
    trees = woodlandLayout(game.map, game.level, (x, z) =>
      game.terrainProfile.height(x, z),
    ),
    chunks = new Map(),
    plants = [],
    time = { value: game.elapsed },
    stats = {
      candidates: 0,
      reserved: 0,
      unsupported: 0,
      placed: 0,
      variants: [0, 0, 0],
    },
    material = new THREE.MeshStandardMaterial({
      name: "Winter groundcover leaves",
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 1,
    });
  coverWind(material, time);
  for (let gz = 2; gz < game.terrainProfile.extent - 2; gz += 2.05)
    for (let gx = 2; gx < game.terrainProfile.extent - 2; gx += 2.05) {
      // Consume candidate randomness before consulting any reservation.
      const x = gx + (rng() - 0.5) * 1.4,
        z = gz + (rng() - 0.5) * 1.4,
        pick = rng(),
        kind = rng(),
        size = 0.8 + rng() * 0.4,
        yaw = rng() * Math.PI * 2,
        tint = new THREE.Color().setScalar(0.8 + rng() * 0.36),
        density = desertNoise(x * 0.068, z * 0.043, game.level.seed + 59),
        shelter = desertNoise(x * 0.021, z * 0.028, game.level.seed + 97),
        variant = kind < 0.16 ? 2 : shelter > 0.48 ? 0 : 1,
        shape = specimens[variant];
      if (pick > Math.max(0, density - 0.34) * 1.7 * 0.68) continue;
      // Plant beside accessible routes, not throughout distant mountains.
      const ix = Math.round(x / 7),
        iz = Math.round(z / 7);
      if (
        ![-2, -1, 0, 1, 2].some((dz) =>
          [-2, -1, 0, 1, 2].some((dx) => game.map.grid[iz + dz]?.[ix + dx]),
        )
      )
        continue;
      stats.candidates++;
      if (!snowCoverAllowed(game, x, z, shape.radius * size, rocks, trees)) {
        stats.reserved++;
        continue;
      }
      const placed = seatMeadowPlant(game.terrainProfile, shape, {
        x,
        z,
        size,
        yaw,
      });
      if (!placed) {
        stats.unsupported++;
        continue;
      }
      const key = `${variant}:${Math.floor(x / 49)},${Math.floor(z / 49)}`;
      if (!chunks.has(key))
        chunks.set(key, { variant, matrices: [], positions: [], colors: [] });
      const chunk = chunks.get(key);
      chunk.matrices.push(placed.matrix);
      chunk.positions.push(placed.position);
      chunk.colors.push(tint);
      plants.push({ x, z, size, yaw, variant, matrix: placed.matrix });
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
        wind: (depth) => coverWind(depth, time),
        castShadow: false,
        planar: true,
      },
    );
    for (const mesh of patch.tiers.flat()) {
      mesh.userData.animated = true;
      mesh.userData.excludeContact = true;
    }
    patch.center = new THREE.Box3()
      .setFromPoints(patch.positions)
      .getCenter(new THREE.Vector3());
    patch.radius = Math.max(
      ...patch.positions.map((p) =>
        Math.hypot(p.x - patch.center.x, p.z - patch.center.z),
      ),
    );
    return patch;
  });
  game.snowGroundcover = { specimens, plants, patches, time, stats };
  updateSnowGroundcover(game);
}

// Patch wrappers own the rendered buffers and are released by world teardown.
// The unrendered specimen geometries still need their own lifecycle ended.
export function disposeSnowGroundcover(game) {
  for (const specimen of game.snowGroundcover?.specimens || [])
    for (const geometry of specimen.tiers) geometry.dispose();
  game.snowGroundcover = null;
}

export function updateSnowGroundcover(game, dt = 0) {
  const cover = game.snowGroundcover;
  if (!cover) return;
  cover.time.value = game.elapsed;
  const ranges =
    SNOW_COVER_RANGES[game.store.data.settings.quality] ||
    SNOW_COVER_RANGES.medium;
  for (const patch of cover.patches) {
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
