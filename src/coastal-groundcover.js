import * as THREE from "three";
import { random } from "./campaign.js";
import { inHydraulicCourt } from "./hydraulic-rules.js";
import { desertNoise } from "./desert-geology.js";
import { coastalPlantAllowed } from "./habitat.js";
import { natureRockAllowed } from "./nature-rocks.js";
import { discoveryFoliageClear } from "./discovery-setting-plan.js";
import { yardRouteClear, yardTraversalClear } from "./station-yard-plan.js";
import { seatMeadowPlant } from "./sky-meadow.js";
import { createLodPatch, updateLodPatch } from "./instance-lod.js";

export const COASTAL_COVER_RANGES = {
  high: [12, 29, 57],
  medium: [8, 22, 44],
  low: [5, 15, 32],
};

// Original folded salt grass, upright seed-bearing stems, and fleshy cushions.
// Every reduced tier retains a subset of the same leaves and their rooted ends.
export function coastalCoverSpecimens() {
  return [0, 1, 2].map((variant) => {
    const cushion = variant === 2,
      rng = random(83573 + variant * 131),
      leaves = Array.from({ length: cushion ? 32 : 40 }, (_, index) => {
        const angle = rng() * Math.PI * 2,
          radius = Math.sqrt(rng()) * (cushion ? 0.17 : 0.13);
        return {
          index,
          angle,
          x: Math.sin(angle) * radius,
          z: Math.cos(angle) * radius,
          height: cushion
            ? 0.1 + rng() * 0.11
            : (variant === 1 ? 0.4 : 0.22) + rng() * 0.25,
          reach: cushion ? 0.12 + rng() * 0.17 : 0.1 + rng() * 0.2,
          width: cushion ? 0.025 + rng() * 0.024 : 0.007 + rng() * 0.009,
          dry: rng() < (variant === 1 ? 0.75 : 0.24),
        };
      }),
      bottom = new THREE.Color(cushion ? 0x3c5143 : 0x42492c),
      green = new THREE.Color(cushion ? 0x879887 : 0x8b9968),
      straw = new THREE.Color(0xb7a778),
      flower = new THREE.Color(0xab8f9d),
      seed = new THREE.Color(0xaaa080),
      roots = new Map();
    let radius = 0,
      height = 0;
    const tiers = [0, 1, 2].map((tier) => {
      const positions = [],
        colors = [],
        bends = [],
        segments = [4, 3, 2][tier],
        stride = [1, 2, 4][tier];
      const vertex = (point, color, bend) => {
        positions.push(...point);
        colors.push(color.r, color.g, color.b);
        bends.push(bend);
        radius = Math.max(radius, Math.hypot(point[0], point[2]) + 0.032);
        height = Math.max(height, point[1]);
        if (bend === 0)
          roots.set(`${point[0]},${point[2]}`, new THREE.Vector3(...point));
      };
      for (let index = 0; index < leaves.length; index += stride) {
        const leaf = leaves[index],
          s = Math.sin(leaf.angle),
          c = Math.cos(leaf.angle),
          tip = leaf.dry ? straw : green;
        const section = (t) => {
          const reach = leaf.reach * t * t,
            width =
              leaf.width *
              (cushion
                ? Math.sin(Math.PI * (0.025 + t * 0.96))
                : 1 - t * 0.995) *
              [1, 1.2, 1.5][tier],
            y = leaf.height * (cushion ? Math.sin(t * Math.PI * 0.72) : t);
          return [-1, 0, 1].map((side) => [
            leaf.x + s * reach + c * side * width,
            y + (side === 0 ? width * 0.4 * Math.sin(Math.PI * t) : 0),
            leaf.z + c * reach - s * side * width,
          ]);
        };
        for (let segment = 0; segment < segments; segment++) {
          const a = segment / segments,
            b = (segment + 1) / segments,
            points = [...section(a), ...section(b)];
          for (const i of [0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5]) {
            const t = i < 3 ? a : b;
            vertex(points[i], bottom.clone().lerp(tip, 0.12 + t * 0.88), t);
          }
        }
        if (index % 8 === 0) {
          // A stem shares the leaf root; the seed/flower head is attached to
          // its actual tip. Its thickness survives the two reduced tiers.
          const top = section(1)[1],
            root = [leaf.x, 0, leaf.z],
            stemTop = [top[0], top[1] + (cushion ? 0.17 : 0.025), top[2]],
            w = 0.006;
          for (const p of [
            [root[0] - w, 0, root[2]],
            [root[0] + w, 0, root[2]],
            [stemTop[0], stemTop[1], stemTop[2]],
            [root[0], 0, root[2] - w],
            [root[0], 0, root[2] + w],
            [stemTop[0], stemTop[1], stemTop[2]],
          ])
            vertex(p, green, p[1] === 0 ? 0 : 1);
          const head = new THREE.IcosahedronGeometry(
              1,
              tier === 0 && cushion ? 1 : 0,
            ),
            p = head.attributes.position;
          for (let i = 0; i < p.count; i++)
            vertex(
              [
                stemTop[0] + p.getX(i) * (cushion ? 0.045 : 0.017),
                stemTop[1] + p.getY(i) * (cushion ? 0.035 : 0.055),
                stemTop[2] + p.getZ(i) * (cushion ? 0.045 : 0.017),
              ],
              cushion ? flower : seed,
              1,
            );
          head.dispose();
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3),
      );
      geometry.setAttribute(
        "coastalBend",
        new THREE.Float32BufferAttribute(bends, 1),
      );
      geometry.computeVertexNormals();
      const normals = geometry.attributes.normal,
        n = new THREE.Vector3();
      for (let i = 0; i < normals.count; i++) {
        n.fromBufferAttribute(normals, i);
        if (n.y < 0) n.negate();
        n.y += 0.45;
        n.normalize();
        normals.setXYZ(i, n.x, n.y, n.z);
      }
      geometry.computeBoundingBox();
      geometry.boundingBox.expandByVector(new THREE.Vector3(0.025, 0, 0.018));
      geometry.computeBoundingSphere();
      geometry.boundingSphere.radius += 0.032;
      return geometry;
    });
    return { variant, tiers, roots: [...roots.values()], radius, height };
  });
}

export function coastalCoverWind(material, time) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.coastalCoverTime = time;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float coastalBend; uniform float coastalCoverTime;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      vec3 plantCenter=(instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
      float weight=coastalBend*coastalBend;
      transformed.x+=sin(coastalCoverTime*.8+plantCenter.x*.17+plantCenter.z*.13)*weight*.025;
      transformed.z+=cos(coastalCoverTime*.6+plantCenter.z*.16)*weight*.018;`,
      );
  };
  material.customProgramCacheKey = () => "vesper-coastal-groundcover-1";
}

export function coastalCoverAllowed(game, x, z, radius, rocks = []) {
  const profile = game.terrainProfile,
    box = { x, z, w: radius * 2, d: radius * 2 };
  const gx = Math.round(x / 7),
    gz = Math.round(z / 7);
  if (
    !game.map.grid[gz]?.[gx] ||
    profile.height(x, z) < -0.55 ||
    profile.court(x, z) > 0.52
  )
    return false;
  if (
    inHydraulicCourt(game.map, x, z) ||
    !coastalPlantAllowed(game.map, profile, x, z) ||
    !natureRockAllowed(game, x, z, radius, 0.8) ||
    !discoveryFoliageClear(game, x, z, radius) ||
    !yardRouteClear(game.map, box, 1.5) ||
    !yardTraversalClear(game.traversalCourses || [], box)
  )
    return false;
  for (const gate of game.fieldGates || [])
    if (
      Math.abs(x - gate.root.position.x) < 12.5 + radius &&
      Math.abs(z - gate.root.position.z) < 12.5 + radius
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
  // Whole leaf reach must stay on dry ground, outside paving and foundations.
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [0.707, 0.707],
    [-0.707, 0.707],
    [0.707, -0.707],
    [-0.707, -0.707],
  ])
    if (
      inHydraulicCourt(game.map, x + dx * radius, z + dz * radius) ||
      !coastalPlantAllowed(
        game.map,
        profile,
        x + dx * radius,
        z + dz * radius,
      ) ||
      profile.court(x + dx * radius, z + dz * radius) > 0.6 ||
      profile.height(x + dx * radius, z + dz * radius) < -0.55
    )
      return false;
  return (
    Math.hypot(
      profile.height(x + 0.5, z) - profile.height(x - 0.5, z),
      profile.height(x, z + 0.5) - profile.height(x, z - 0.5),
    ) < 0.75
  );
}

export function buildCoastalGroundcover(game) {
  game.coastalGroundcover = null;
  if (game.level.biome !== "water") return;
  const specimens = coastalCoverSpecimens(),
    rng = random(game.level.seed + 95573),
    plants = [],
    chunks = new Map(),
    time = { value: game.elapsed },
    stats = {
      candidates: 0,
      reserved: 0,
      unsupported: 0,
      placed: 0,
      variants: [0, 0, 0],
    },
    rocks = (game.naturePatches || [])
      .filter((p) => p.kind === "rock")
      .flatMap((p) => {
        const b = new THREE.Box3().setFromBufferAttribute(
          p.tiers[0][0].geometry.attributes.position,
        );
        return p.matrices.map((m) => b.clone().applyMatrix4(m));
      }),
    material = new THREE.MeshStandardMaterial({
      name: "Coastal groundcover leaves",
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 1,
    });
  coastalCoverWind(material, time);
  for (let gz = 2; gz < game.terrainProfile.extent - 2; gz += 0.9)
    for (let gx = 2; gx < game.terrainProfile.extent - 2; gx += 0.9) {
      const x = gx + (rng() - 0.5) * 0.9,
        z = gz + (rng() - 0.5) * 0.9,
        pick = rng(),
        kind = rng(),
        size = 0.8 + rng() * 0.5,
        yaw = rng() * Math.PI * 2,
        tint = new THREE.Color().setScalar(0.82 + rng() * 0.3),
        density = desertNoise(x * 0.085, z * 0.07, game.level.seed + 97),
        shelter = desertNoise(x * 0.026, z * 0.034, game.level.seed + 113),
        variant = kind < 0.22 ? 2 : shelter > 0.48 ? 0 : 1,
        shape = specimens[variant];
      // A low continuous fringe survives between denser wind-sheltered beds.
      // Pure noise previously left whole foreground shoulders empty.
      if (pick > 0.15 + Math.max(0, Math.min(1, (density - 0.35) * 2.8)) * 0.8)
        continue;
      const ix = Math.round(x / 7),
        iz = Math.round(z / 7);
      if (!game.map.grid[iz]?.[ix]) continue;
      stats.candidates++;
      if (!coastalCoverAllowed(game, x, z, shape.radius * size, rocks)) {
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
      const key = `${variant}:${Math.floor(x / 40)},${Math.floor(z / 40)}`;
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
        wind: (depth) => coastalCoverWind(depth, time),
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
  if (!patches.length) material.dispose();
  game.coastalGroundcover = { specimens, plants, patches, time, stats };
  updateCoastalGroundcover(game);
}

export function updateCoastalGroundcover(game, dt = 0) {
  const cover = game.coastalGroundcover;
  if (!cover) return;
  cover.time.value = game.elapsed;
  const ranges =
    COASTAL_COVER_RANGES[game.store.data.settings.quality] ||
    COASTAL_COVER_RANGES.medium;
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

export function disposeCoastalGroundcover(game) {
  for (const shape of game.coastalGroundcover?.specimens || [])
    for (const geometry of shape.tiers) geometry.dispose();
  game.coastalGroundcover = null;
}
