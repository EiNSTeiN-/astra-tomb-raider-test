import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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

function vertexColor(geometry, color) {
  const a = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) {
    a[i] = color.r;
    a[i + 1] = color.g;
    a[i + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return geometry;
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
    rows = [36, 22, 12][tier];
  const trunk = new THREE.TubeGeometry(trunkCurve, rows, 0.38, radial, false);
  const p = trunk.attributes.position,
    uv = trunk.attributes.uv;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows,
      center = trunkCurve.getPointAt(t),
      taper = 1 - t * 0.43 + 0.22 * Math.exp(-t * 18);
    for (let j = 0; j <= radial; j++) {
      const i = row * (radial + 1) + j;
      p.setXYZ(
        i,
        center.x + (p.getX(i) - center.x) * taper,
        p.getY(i),
        center.z + (p.getZ(i) - center.z) * taper,
      );
      uv.setXY(i, j / radial, (t * height) / 1.3);
    }
  }
  trunk.computeVertexNormals();
  const leaves = [],
    leaflets = [56, 32, 16][tier];
  for (let f = 0; f < 17; f++) {
    const a = f * 2.39996 + rng() * 0.2,
      length = 4.1 + rng() * 1.6;
    const lift = f < 5 ? 3.8 : 2.8,
      droop = f < 5 ? 2.7 : 4.7;
    const radialDirection = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)),
      sideDirection = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const rib = (t) =>
      new THREE.Vector3(bend, height - f * 0.045, 0)
        .addScaledVector(radialDirection, t * length)
        .add(
          new THREE.Vector3(
            0,
            Math.sin(t * Math.PI * 0.75) * lift - t * t * droop,
            0,
          ),
        );
    const curve = new THREE.CatmullRomCurve3(
      Array.from({ length: 9 }, (_, i) => rib(i / 8)),
    );
    const stalk = new THREE.TubeGeometry(
      curve,
      [14, 9, 6][tier],
      0.026,
      4,
      false,
    );
    leaves.push(vertexColor(stalk, new THREE.Color(0.35, 0.39, 0.15)));
    const positions = [],
      colors = [],
      uvs = [];
    for (let i = 0; i < leaflets; i++) {
      const t = 0.09 + (i / leaflets) * 0.88;
      for (const side of [-1, 1]) {
        const point = rib(t + (side < 0 ? 0.008 : 0));
        const reach = 0.2 + Math.sin(Math.PI * t) ** 0.65 * 1.28;
        const end = point
          .clone()
          .addScaledVector(sideDirection, side * reach)
          .addScaledVector(radialDirection, -0.22 - t * 0.28);
        end.y -= 0.14 + t * 0.65;
        const mid = point.clone().lerp(end, 0.48),
          width = 0.08 * (56 / leaflets) ** 0.45;
        const left = mid.clone().addScaledVector(radialDirection, width),
          right = mid.clone().addScaledVector(radialDirection, -width);
        const ridge = mid.clone();
        ridge.y += 0.035;
        const shade = 0.83 + (Math.sin(i * 4.7 + f) + 1) * 0.09;
        const color = new THREE.Color().setRGB(
          0.13 * shade,
          0.2 * shade,
          0.055 * shade,
        );
        if (f > 14) color.lerp(new THREE.Color(0.3, 0.23, 0.1), 0.44);
        for (const tri of [
          [point, left, ridge],
          [left, end, ridge],
          [end, right, ridge],
          [right, point, ridge],
        ]) {
          for (const v of tri) {
            positions.push(v.x, v.y, v.z);
            colors.push(color.r, color.g, color.b);
            uvs.push(t, side);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    leaves.push(g);
  }
  const parts = leaves.map((g) => {
    if (!g.index) return g;
    const expanded = g.toNonIndexed();
    g.dispose();
    return expanded;
  });
  const foliage = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  trunk.computeBoundingSphere();
  foliage.computeBoundingSphere();
  return { trunk, foliage };
}

function palmWind(material, time) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.palmTime = time;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float palmTime;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      float palmFlex = pow(max(0.0, position.y - 9.0)*.2, 2.0);
      transformed.x += sin(palmTime*.55 + position.z*.5 + instanceMatrix[3].x*.17)*palmFlex*.24;
      transformed.z += sin(palmTime*.43 + position.x*.6 + instanceMatrix[3].z*.12)*palmFlex*.18;
    `,
      );
  };
  material.customProgramCacheKey = () => "vesper-palm-wind-1";
}

export function buildDesertPalms(game) {
  game.palmPatches = [];
  game.palmLayout = [];
  if (game.level.biome !== "desert") return;
  const bark = pbrMaterial("bark", 0xb5a087);
  bark.name = "Date palm bark";
  const leaves = new THREE.MeshStandardMaterial({
    name: "Date palm leaves",
    vertexColors: true,
    roughness: 0.85,
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
