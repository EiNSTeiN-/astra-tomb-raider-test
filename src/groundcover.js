import * as THREE from "three";
import { random } from "./campaign.js";
import { createLodPatch, updateLodPatch } from "./instance-lod.js";
import { inWindCourt } from "./wind-rules.js";

export const GRASS_RANGES = {
  high: [24, 48, 85],
  medium: [18, 36, 65],
  low: [12, 24, 38],
};

// Each distant cluster uses a stable subset of the same blades. Building all
// tiers consumes the original random sequence, preserving plant placements.
export function createGrassGeometries(rng, jungle) {
  const tiers = [
    { blades: jungle ? 60 : 36, width: 1 },
    { blades: jungle ? 20 : 12, width: 1.4 },
    { blades: jungle ? 8 : 6, width: 1.9 },
  ].map((tier) => ({ ...tier, vertices: [], normals: [], uvs: [] }));
  for (let blade = 0; blade < (jungle ? 60 : 36); blade++) {
    const angle = rng() * Math.PI * 2,
      x = (rng() - 0.5) * 1.4,
      z = (rng() - 0.5) * 1.4;
    const height = (jungle ? 0.17 : 0.18) + rng() * (jungle ? 0.24 : 0.32),
      width = (jungle ? 0.007 : 0.012) + rng() * (jungle ? 0.01 : 0.016),
      bend = 0.1 + rng() * 0.14;
    const points = [
      [-width, 0, 0],
      [width, 0, 0],
      [-width * 0.55, height * 0.58, bend * 0.4],
      [width * 0.55, height * 0.58, bend * 0.4],
      [0, height, bend],
    ];
    for (const tier of tiers) {
      if (blade >= tier.blades) continue;
      for (const index of [0, 1, 2, 1, 3, 2, 2, 3, 4]) {
        const p = points[index];
        tier.vertices.push(
          x + p[0] * tier.width * Math.cos(angle) + p[2] * Math.sin(angle),
          p[1],
          z - p[0] * tier.width * Math.sin(angle) + p[2] * Math.cos(angle),
        );
        tier.normals.push(Math.sin(angle) * 0.4, 0.92, Math.cos(angle) * 0.4);
        tier.uvs.push(index % 2, p[1] / height);
      }
    }
  }
  return tiers.map(({ vertices, normals, uvs }) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius += 0.25; // Wind displacement.
    return geometry;
  });
}

export function buildGroundCover(game) {
  game.grassPatches = [];
  game.grassWind = null;
  game.grassRange = null;
  if (!["jungle", "water", "sky"].includes(game.level.biome)) return;
  const jungle = game.level.biome === "jungle";
  const rng = random(game.level.seed + 8347);
  const geometries = createGrassGeometries(rng, jungle);
  const material = new THREE.MeshStandardMaterial({
    name: "Ground cover",
    color: 0xffffff,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  game.grassWind = { value: 0 };
  game.grassRange = { value: 80 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.grassTime = game.grassWind;
    shader.uniforms.grassRange = game.grassRange;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nuniform float grassTime; uniform float grassRange; varying float vBladeHeight;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vBladeHeight=uv.y;
      vec3 center=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
      float fade=1.0-smoothstep(grassRange-16.0,grassRange,distance(cameraPosition.xz,center.xz));
      transformed.y*=fade;
      transformed.x+=sin(grassTime*1.25+center.x*.38+center.z*.26)*uv.y*uv.y*.13*fade;
      transformed.z+=cos(grassTime*.75+center.z*.38)*uv.y*uv.y*.07*fade;
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying float vBladeHeight;",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      THREE.ShaderChunk.normal_fragment_begin.replace(
        "normal *= faceDirection;",
        "// Blades share an upward canopy normal on both sides.",
      ),
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      "#include <color_fragment>\ndiffuseColor.rgb*=mix(vec3(.38,.47,.29),vec3(1.08,1.06,.83),vBladeHeight);",
    );
  };
  material.customProgramCacheKey = () => "vesper-grass-1";
  const chunks = new Map(),
    dummy = new THREE.Object3D(),
    color = new THREE.Color();
  const fieldSites = game.map.fieldSites || [];
  const spacing = jungle ? 1.65 : 2.3;
  for (let z = 8; z < game.terrainProfile.extent - 8; z += spacing)
    for (let x = 8; x < game.terrainProfile.extent - 8; x += spacing) {
      const px = x + (rng() - 0.5) * 1.8,
        pz = z + (rng() - 0.5) * 1.8,
        gx = Math.round(px / 7),
        gz = Math.round(pz / 7);
      const walkable = !!game.map.grid[gz]?.[gx];
      const court = game.terrainProfile.court(px, pz);
      if (court > 0.65 || (court > 0.05 && rng() < court * 0.92)) continue;
      if (jungle && game.terrainProfile.trail(px, pz) > 0.55 && rng() < 0.92)
        continue;
      if (
        !walkable &&
        ![-2, -1, 0, 1, 2].some((dz) =>
          [-2, -1, 0, 1, 2].some((dx) => game.map.grid[gz + dz]?.[gx + dx]),
        )
      )
        continue;
      if (game.level.biome === "water" && !walkable) continue;
      // Keep a clear central line through narrow trails and clear working space at stations.
      if (
        walkable &&
        (!game.map.grid[gz - 1]?.[gx] || !game.map.grid[gz + 1]?.[gx]) &&
        Math.abs(pz - gz * 7) < 1.5
      )
        continue;
      if (
        walkable &&
        (!game.map.grid[gz]?.[gx - 1] || !game.map.grid[gz]?.[gx + 1]) &&
        Math.abs(px - gx * 7) < 1.5
      )
        continue;
      if (
        fieldSites.some(
          (site) => Math.hypot(px - site.x * 7, pz - site.z * 7) < 3.3,
        )
      )
        continue;
      const distribution =
        Math.sin(px * 0.09 + Math.sin(pz * 0.12)) * Math.cos(pz * 0.08);
      if (rng() > (walkable ? 0.57 : 0.88) + distribution * 0.25) continue;
      const y = game.groundHeight(px, pz),
        dx = game.groundHeight(px + 0.5, pz) - game.groundHeight(px - 0.5, pz),
        dz = game.groundHeight(px, pz + 0.5) - game.groundHeight(px, pz - 0.5);
      if (Math.hypot(dx, dz) > 2.2) continue;
      dummy.position.set(px, y - 0.025, pz);
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      dummy.scale.setScalar(0.7 + rng() * (jungle ? 0.6 : 0.85));
      dummy.updateMatrix();
      color.setHSL(
        0.22 + rng() * 0.055,
        0.32 + rng() * 0.16,
        0.075 + rng() * 0.065,
      );
      // Consume the same random samples first, preserving grass everywhere
      // else. The wind courts' working lanes and foundations stay clear.
      if (game.level.biome === "sky" && inWindCourt(game.map, px, pz)) continue;
      const key = `${Math.floor(px / 32)},${Math.floor(pz / 32)}`;
      if (!chunks.has(key)) chunks.set(key, []);
      chunks
        .get(key)
        .push({ matrix: dummy.matrix.clone(), color: color.clone() });
    }
  for (const instances of chunks.values()) {
    const matrices = instances.map((instance) => instance.matrix);
    const patch = createLodPatch(
      game.world,
      geometries.map((geometry) => [{ geometry, material }]),
      matrices,
      matrices.map((matrix) =>
        new THREE.Vector3().setFromMatrixPosition(matrix),
      ),
      {
        colors: instances.map((instance) => instance.color),
        castShadow: false,
        planar: true,
      },
    );
    patch.tiers.flat().forEach((mesh) => {
      mesh.userData.animated = true;
      // The contact pass's material override cannot reproduce blade wind,
      // height fade, or per-instance coverage.
      mesh.userData.excludeContact = true;
    });
    const bounds = new THREE.Box3().setFromPoints(patch.positions);
    patch.center = bounds.getCenter(new THREE.Vector3());
    patch.radius = Math.max(
      ...patch.positions.map((p) =>
        Math.hypot(p.x - patch.center.x, p.z - patch.center.z),
      ),
    );
    game.grassPatches.push(patch);
  }
}

export function updateGroundCover(game, dt = 0) {
  if (!game.grassWind) return;
  game.grassWind.value = game.elapsed;
  const ranges =
    GRASS_RANGES[game.store.data.settings.quality] || GRASS_RANGES.medium;
  game.grassRange.value = ranges[2];
  for (const patch of game.grassPatches) {
    // Distant empty patches need no per-plant work. Previously visible patches
    // still run until their culling fade completes, including camera teleports.
    if (
      Math.hypot(
        game.camera.position.x - patch.center.x,
        game.camera.position.z - patch.center.z,
      ) >
        ranges[2] + patch.radius + 0.75 &&
      !patch.counts.some((count) => count > 0)
    )
      continue;
    updateLodPatch(patch, game.camera.position, ranges, dt, 0.75);
  }
}
