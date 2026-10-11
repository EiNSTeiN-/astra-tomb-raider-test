import * as THREE from "three";
import { random } from "./campaign.js";
import { desertNoise, desertRouteDistance } from "./desert-geology.js";
import { natureRockAllowed } from "./nature-rocks.js";
import { discoveryFoliageClear } from "./discovery-setting-plan.js";
import { yardRouteClear, yardTraversalClear } from "./station-yard-plan.js";
import { skyMeadowSpecimens, seatMeadowPlant } from "./sky-meadow.js";
import { createLodPatch, updateLodPatch } from "./instance-lod.js";
import { desertScatterAllowed } from "./desert-scatter.js";

export const DESERT_COVER_RANGES = {
  high: [12, 28, 66],
  medium: [8, 20, 50],
  low: [4, 13, 34],
};

// Dry bunchgrasses, taller seed stalks and low grey-green rosettes use the
// original folded-leaf construction. Three tiers keep the same roots, stable
// leaf subsets and specimen silhouette, with sheltered clusters beside paths.
export function desertCoverSpecimens() {
  return skyMeadowSpecimens({
    grassLeaves: 36,
    cushionLeaves: 32,
    curveSegments: [3, 2, 1],
  }).map((shape, variant) => {
    const scale = [
        [0.75, 0.62, 0.75],
        [0.65, 0.85, 0.65],
        [1.5, 1.15, 1.5],
      ][variant],
      bottom = new THREE.Color([0x665037, 0x554737, 0x536058][variant]),
      top = new THREE.Color([0xb0a174, 0xa6926c, 0x879589][variant]),
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
        radius = Math.max(radius, Math.hypot(point.x, point.z) + 0.045);
        height = Math.max(height, point.y);
        if (geometry.attributes.meadowBend.getX(i) === 0)
          roots.set(`${point.x},${point.z}`, point);
      }
      geometry.computeBoundingBox();
      geometry.boundingBox.expandByVector(new THREE.Vector3(0.035, 0, 0.018));
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
    shader.uniforms.desertCoverTime = time;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float meadowBend; uniform float desertCoverTime;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec3 coverCenter=(instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
        float coverWeight=meadowBend*meadowBend;
        transformed.x+=sin(desertCoverTime*.8+coverCenter.x*.13+coverCenter.z*.17)*coverWeight*.035;
        transformed.z+=sin(desertCoverTime*.43+coverCenter.z*.19)*coverWeight*.018;`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      THREE.ShaderChunk.normal_fragment_begin.replace(
        "normal *= faceDirection;",
        "// Thin leaves share softened canopy normals on both sides.",
      ),
    );
  };
  material.customProgramCacheKey = () => "vesper-desert-groundcover-1";
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

export function desertCoverAllowed(
  game,
  x,
  z,
  radius,
  rocks = [],
  palms = game.palmLayout || [],
) {
  const profile = game.terrainProfile,
    box = { x, z, w: radius * 2, d: radius * 2 };
  if (profile.court(x, z) > 0.55) return false;
  if (desertRouteDistance(game.map, x, z) > 18) return false;
  if (!desertScatterAllowed(game, x, z, radius)) return false;
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
  for (const palm of palms)
    if (Math.hypot(x - palm.x, z - palm.z) < 0.6 * (palm.scale || 1) + radius)
      return false;
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

export function buildDesertGroundcover(game) {
  game.desertGroundcover = null;
  if (game.level.biome !== "desert") return;
  const specimens = desertCoverSpecimens(),
    rng = random(game.level.seed + 87391),
    rocks = rockBounds(game),
    palms = game.palmLayout || [],
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
      name: "Desert groundcover leaves",
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 1,
    });
  coverWind(material, time);
  for (let gz = 2; gz < game.terrainProfile.extent - 2; gz += 2.2)
    for (let gx = 2; gx < game.terrainProfile.extent - 2; gx += 2.2) {
      // Consume candidate randomness before consulting any reservation.
      const x = gx + (rng() - 0.5) * 1.6,
        z = gz + (rng() - 0.5) * 1.6,
        pick = rng(),
        kind = rng(),
        size = 0.75 + rng() * 0.45,
        yaw = rng() * Math.PI * 2,
        tint = new THREE.Color().setScalar(0.82 + rng() * 0.32),
        density = desertNoise(x * 0.068, z * 0.043, game.level.seed + 59),
        shelter = desertNoise(x * 0.021, z * 0.028, game.level.seed + 97),
        variant = kind < 0.16 ? 2 : shelter > 0.48 ? 0 : 1,
        shape = specimens[variant];
      if (pick > Math.max(0, density - 0.3) * 1.7 * (0.62 + shelter * 0.48))
        continue;
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
      if (!desertCoverAllowed(game, x, z, shape.radius * size, rocks, palms)) {
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
      const key = `${variant}:${Math.floor(x / 48)},${Math.floor(z / 48)}`;
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
        castShadow: true,
        planar: true,
      },
    );
    for (const [tier, meshes] of patch.tiers.entries())
      for (const mesh of meshes) {
        mesh.castShadow = tier === 0;
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
  game.desertGroundcover = { specimens, plants, patches, time, stats };
  updateDesertGroundcover(game);
}

// Patch wrappers own the rendered buffers and are released by world teardown.
// The unrendered specimen geometries still need their own lifecycle ended.
export function disposeDesertGroundcover(game) {
  for (const specimen of game.desertGroundcover?.specimens || [])
    for (const geometry of specimen.tiers) geometry.dispose();
  game.desertGroundcover = null;
}

export function updateDesertGroundcover(game, dt = 0) {
  const cover = game.desertGroundcover;
  if (!cover) return;
  cover.time.value = game.elapsed;
  const ranges =
    DESERT_COVER_RANGES[game.store.data.settings.quality] ||
    DESERT_COVER_RANGES.medium;
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
