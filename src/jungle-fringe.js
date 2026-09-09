import * as THREE from "three";
import { random } from "./campaign.js";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// The playable height field ends at a square boundary. Extend its exact edge
// into low wooded banks, rather than letting the last hills meet empty sky.
// This is scenery only: routes, terrain collision and sound anchors stay inside.
export function jungleFringeProfile(map, profile) {
  const extent = map.size * 7;
  const distance = (x, z) => Math.max(0, -x, -z, x - extent, z - extent);
  const height = (x, z) => {
    const d = distance(x, z);
    const edge = profile.height(clamp(x, 0, extent), clamp(z, 0, extent));
    const bank =
      7 +
      Math.sin(x * 0.027 + z * 0.019) * 4 +
      Math.sin(x * 0.065 - z * 0.047) * 2;
    return edge + smooth(0, 38, d) * bank - smooth(100, 140, d) * 32;
  };
  return { extent, distance, height };
}

export function jungleFringeLayout(map, level, profile) {
  if (level.biome !== "jungle") return [];
  const fringe = jungleFringeProfile(map, profile);
  const rng = random(level.seed + 9271),
    trees = [];
  for (let z = -102; z < fringe.extent + 102; z += 12)
    for (let x = -102; x < fringe.extent + 102; x += 12) {
      const px = x + (rng() - 0.5) * 7,
        pz = z + (rng() - 0.5) * 7,
        distance = fringe.distance(px, pz);
      if (distance < 9 || distance > 99) continue;
      // A dense first bank, uneven glades behind it, and taller emergent trees.
      if (rng() > (distance < 48 ? 0.94 : 0.7)) continue;
      trees.push({
        x: px,
        z: pz,
        y: fringe.height(px, pz) - 0.2,
        rotation: rng() * Math.PI * 2,
        scale: 1.05 + rng() * 0.65 + smooth(20, 90, distance) * 0.45,
        variant: rng() < 0.42 ? 1 : 0,
      });
    }
  return trees;
}

export function jungleFringeGeometry(map, profile, side) {
  const fringe = jungleFringeProfile(map, profile),
    extent = fringe.extent,
    segments = Math.round(extent / profile.step),
    rings = [0, 1.75, 3.5, 7, 14, 23, 34, 48, 65, 86, 110, 140],
    vertices = [],
    uv = [],
    indices = [],
    normals = [];
  const n = new THREE.Vector3();
  for (let row = 0; row < rings.length; row++)
    for (let i = 0; i <= segments; i++) {
      const d = rings[row],
        t = i / segments;
      const a = -d + t * (extent + 2 * d);
      const [x, z] = [
        [a, -d],
        [extent + d, a],
        [extent - a, extent + d],
        [-d, extent - a],
      ][side];
      vertices.push(x, fringe.height(x, z), z);
      uv.push(x / 4, z / 4);
      const h = 0.35;
      n.set(
        fringe.height(x - h, z) - fringe.height(x + h, z),
        2 * h,
        fringe.height(x, z - h) - fringe.height(x, z + h),
      ).normalize();
      normals.push(...n.toArray());
      if (row < rings.length - 1 && i < segments) {
        const k = row * (segments + 1) + i,
          next = k + segments + 1;
        indices.push(k, k + 1, next, k + 1, next + 1, next);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute(
    "court",
    new THREE.Float32BufferAttribute(new Float32Array(vertices.length / 3), 1),
  );
  geometry.setAttribute(
    "trail",
    new THREE.Float32BufferAttribute(new Float32Array(vertices.length / 3), 1),
  );
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildJungleFringe(game) {
  game.jungleFringe = null;
  if (game.level.biome !== "jungle") return;
  const root = new THREE.Group();
  root.name = "Outer jungle forest floor";
  for (let side = 0; side < 4; side++) {
    const mesh = new THREE.Mesh(
      jungleFringeGeometry(game.map, game.terrainProfile, side),
      game.terrainMeshes[0].material,
    );
    mesh.name = "Jungle boundary bank";
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  game.world.add(root);
  game.jungleFringe = {
    root,
    trees: jungleFringeLayout(game.map, game.level, game.terrainProfile),
    patches: [],
  };
  // Match the rendered triangles, including the widening outer rows. Sampling
  // only the analytic bank would leave roots floating above its coarser mesh.
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(),
    new THREE.Vector3(0, -1, 0),
  );
  for (const tree of game.jungleFringe.trees) {
    ray.ray.origin.set(tree.x, tree.y + 100, tree.z);
    const hit = ray.intersectObjects(root.children, false)[0];
    if (!hit) throw new Error("Jungle tree has no supporting bank");
    tree.y = hit.point.y - 0.2;
  }
}

// The near band uses the existing middle tree meshes. Far trees retain the
// same silhouettes on all settings, with the existing dithered transitions.
export const FRINGE_RANGES = {
  high: [55, 275],
  medium: [38, 255],
  low: [0, 235],
};
