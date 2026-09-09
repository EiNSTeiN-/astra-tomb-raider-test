import * as THREE from "three";
import { palmCrownGeometry } from "./palm-fronds.js";
import { random } from "./campaign.js";
import { pbrMaterial } from "./visuals.js";
import { createLodPatch, updateLodPatch } from "./instance-lod.js";

export function desertPalmLayout(map, groundHeight, seed) {
  const rng = random(seed + 192),
    palms = [];
  for (let attempt = 0; attempt < 850 && palms.length < 70; attempt++) {
    const gx = 2 + Math.floor(rng() * (map.size - 4)),
      gz = 2 + Math.floor(rng() * (map.size - 4));
    if (map.grid[gz][gx]) continue;
    const x = gx * 7,
      z = gz * 7;
    if (palms.some((p) => Math.hypot(p.x - x, p.z - z) < 9)) continue;
    palms.push({
      x,
      y: groundHeight(x, z) - 0.35,
      z,
      variant: palms.length % 3,
      angle: rng() * Math.PI * 2,
      scale: 0.85 + rng() * 0.5,
    });
  }
  return palms;
}

// Separate leaflets create feathered silhouettes in the geometry and its shadow.
// Three deterministic versions share a crown shape across their detail tiers.
export function palmGeometry(variant = 0, tier = 0) {
  const rng = random(770 + variant),
    bend = 0.65 + rng() * 0.6,
    height = 10 + rng();
  const trunkCurve = new THREE.CatmullRomCurve3(
    Array.from({ length: 6 }, (_, i) => {
      const t = i / 5;
      return new THREE.Vector3(
        bend * t * t,
        height * t,
        Math.sin(t * Math.PI) * 0.28,
      );
    }),
  );
  const radial = [12, 8, 6][tier],
    rows = [72, 40, 16][tier];
  const trunk = new THREE.TubeGeometry(trunkCurve, rows, 0.38, radial, false);
  const p = trunk.attributes.position,
    uv = trunk.attributes.uv,
    colors = [];
  for (let row = 0; row <= rows; row++) {
    const t = row / rows,
      center = trunkCurve.getPointAt(t),
      taper = 1 - t * 0.43 + 0.22 * Math.exp(-t * 18);
    for (let j = 0; j <= radial; j++) {
      const i = row * (radial + 1) + j,
        band = t * height * 3,
        ring = Math.sin((band - Math.floor(band)) * Math.PI) ** 2,
        scar =
          Math.max(
            0,
            Math.cos((j / radial) * Math.PI * 12 + Math.floor(band) * 1.9),
          ) **
            2 *
          ring,
        radius = taper + scar * (tier === 2 ? 0.04 : 0.18),
        shade = 0.77 + scar * 0.2;
      p.setXYZ(
        i,
        center.x + (p.getX(i) - center.x) * radius,
        p.getY(i),
        center.z + (p.getZ(i) - center.z) * radius,
      );
      uv.setXY(i, j / radial, (t * height) / 1.3);
      colors.push(shade, shade * 0.95, shade * 0.85);
    }
  }
  trunk.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  trunk.computeVertexNormals();
  const foliage = palmCrownGeometry(variant, bend, height, tier);
  trunk.computeBoundingSphere();
  return { trunk, foliage };
}

export function palmWind(material, time) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.palmTime = time;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float palmTime; attribute vec2 palmMotion;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      float palmPhase = instanceMatrix[3].x*.17 + instanceMatrix[3].z*.12;
      float palmFlex = palmMotion.x;
      transformed.x += sin(palmTime*.55 + palmPhase)*palmFlex*.24;
      transformed.z += sin(palmTime*.43 + palmPhase*.8)*palmFlex*.18;
      transformed.y += sin(palmTime*1.4 + position.x*2.0 + palmPhase)*palmMotion.y*.028;
    `,
      );
  };
  material.customProgramCacheKey = () => "vesper-palm-wind-2";
}

export function buildDesertPalms(game) {
  game.palmPatches = [];
  game.palmLayout = [];
  if (game.level.biome !== "desert") return;
  const bark = pbrMaterial("bark", 0xb5a087);
  bark.name = "Date palm bark";
  bark.vertexColors = true;
  const leaves = new THREE.MeshStandardMaterial({
    name: "Date palm leaves",
    vertexColors: true,
    roughness: 0.76,
    side: THREE.DoubleSide,
  });
  game.palmWind = { value: 0 };
  palmWind(leaves, game.palmWind);
  const layout = desertPalmLayout(
    game.map,
    (x, z) => game.groundHeight(x, z),
    game.level.seed,
  );
  game.palmLayout = layout;
  const dummy = new THREE.Object3D();
  for (let variant = 0; variant < 3; variant++) {
    const tiers = [0, 1, 2].map((tier) => {
      const geometry = palmGeometry(variant, tier);
      return [
        { geometry: geometry.trunk, material: bark },
        { geometry: geometry.foliage, material: leaves },
      ];
    });
    const trees = layout.filter((p) => p.variant === variant),
      matrices = [],
      positions = [];
    for (const palm of trees) {
      dummy.position.set(palm.x, palm.y, palm.z);
      dummy.rotation.set(0, palm.angle, 0);
      dummy.scale.setScalar(palm.scale);
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
      positions.push(dummy.position.clone());
    }
    game.palmPatches.push(
      createLodPatch(game.world, tiers, matrices, positions, {
        wind: (m) => palmWind(m, game.palmWind),
        planar: true,
      }),
    );
  }
}

export const PALM_RANGES = {
  high: [35, 85, 170],
  medium: [22, 65, 150],
  low: [0, 45, 125],
};
export function updateDesertPalms(game, dt = 0) {
  if (game.palmWind) game.palmWind.value = game.elapsed;
  for (const patch of game.palmPatches || [])
    updateLodPatch(
      patch,
      game.player.position,
      PALM_RANGES[game.store.data.settings.quality],
      dt,
      3,
    );
}
