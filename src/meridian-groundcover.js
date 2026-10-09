import * as THREE from "three";
import { random } from "./campaign.js";
import { desertNoise } from "./desert-geology.js";
import { natureRockAllowed } from "./nature-rocks.js";
import { discoveryFoliageClear } from "./discovery-setting-plan.js";
import { yardRouteClear, yardTraversalClear } from "./station-yard-plan.js";
import { skyMeadowSpecimens, seatMeadowPlant } from "./sky-meadow.js";
import { createLodPatch, updateLodPatch } from "./instance-lod.js";

export const MERIDIAN_COVER_RANGES = {
  high: [20, 44, 90],
  medium: [14, 32, 68],
  low: [9, 22, 46],
};

// Adapt the project's folded leaves into silver bunchgrass, dry flowering
// stems and broad low cushions. All tiers retain the same rooted leaves.
export function meridianCoverSpecimens() {
  return skyMeadowSpecimens().map((shape, variant) => {
    const scale = [
        [0.7, 0.65, 0.7],
        [0.8, 0.9, 0.65],
        [1.25, 1.4, 1.25],
      ][variant],
      bottom = new THREE.Color([0x303c37, 0x494038, 0x354842][variant]),
      top = new THREE.Color([0x909980, 0xa28b61, 0x899a82][variant]),
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
        color.setXYZ(i, tint.r, tint.g, tint.b);
        radius = Math.max(radius, Math.hypot(point.x, point.z) + 0.05);
        height = Math.max(height, point.y);
        if (geometry.attributes.meadowBend.getX(i) === 0)
          roots.set(`${point.x},${point.z}`, point);
      }
      geometry.computeBoundingBox();
      geometry.boundingBox.expandByVector(new THREE.Vector3(0.04, 0, 0.025));
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
    shader.uniforms.meridianCoverTime = time;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float meadowBend; uniform float meridianCoverTime;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec3 coverCenter=(instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
        float coverWeight=meadowBend*meadowBend;
        transformed.x+=sin(meridianCoverTime*.7+coverCenter.x*.13+coverCenter.z*.17)*coverWeight*.04;
        transformed.z+=sin(meridianCoverTime*.43+coverCenter.z*.19)*coverWeight*.025;`,
      );
  };
  material.customProgramCacheKey = () => "vesper-meridian-groundcover-1";
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

export function meridianCoverAllowed(game, x, z, radius, rocks = []) {
  const profile = game.terrainProfile,
    box = { x, z, w: radius * 2, d: radius * 2 };
  if (profile.court(x, z) > 0.36) return false;
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
  // Dome interiors and both gate leaves' motion remain reserved even when open.
  for (const room of game.map.rooms) {
    const r = 9.6 + (room.index % 3) * 0.3;
    if (Math.hypot(x - room.x * 7, z - (room.z * 7 - 17)) < r + 2 + radius)
      return false;
  }
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

export function buildMeridianGroundcover(game) {
  game.meridianGroundcover = null;
  if (game.level.biome !== "eclipse") return;
  const specimens = meridianCoverSpecimens(),
    rng = random(game.level.seed + 93731),
    rocks = rockBounds(game),
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
      name: "Meridian groundcover leaves",
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 1,
    });
  coverWind(material, time);
  for (let gz = 2; gz < game.terrainProfile.extent - 2; gz += 1.55)
    for (let gx = 2; gx < game.terrainProfile.extent - 2; gx += 1.55) {
      // Consume candidate randomness before consulting any reservation.
      const x = gx + (rng() - 0.5) * 1.1,
        z = gz + (rng() - 0.5) * 1.1,
        pick = rng(),
        kind = rng(),
        size = 0.72 + rng() * 0.55,
        yaw = rng() * Math.PI * 2,
        tint = new THREE.Color().setScalar(0.8 + rng() * 0.36),
        density = desertNoise(x * 0.068, z * 0.043, game.level.seed + 59),
        shelter = desertNoise(x * 0.021, z * 0.028, game.level.seed + 97),
        variant = kind < 0.24 ? 2 : shelter > 0.52 ? 0 : 1,
        shape = specimens[variant];
      if (pick > Math.max(0, density - 0.31) * 1.65) continue;
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
      if (!meridianCoverAllowed(game, x, z, shape.radius * size, rocks)) {
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
      const key = `${variant}:${Math.floor(x / 32)},${Math.floor(z / 32)}`;
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
  game.meridianGroundcover = { specimens, plants, patches, time, stats };
  updateMeridianGroundcover(game);
}

export function updateMeridianGroundcover(game, dt = 0) {
  const cover = game.meridianGroundcover;
  if (!cover) return;
  cover.time.value = game.elapsed;
  const ranges =
    MERIDIAN_COVER_RANGES[game.store.data.settings.quality] ||
    MERIDIAN_COVER_RANGES.medium;
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
