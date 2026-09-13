import * as THREE from "three";
import { natureRockAllowed } from "./nature-rocks.js";
import { inCipherCourt } from "./cipher-rules.js";

// Keep the delivered scale, but use the trunk base as the planting origin.
// The second island scan's canopy centre is several metres from its trunk.
export function jungleSpecimen(scenes) {
  const sources = scenes.map((scene) => {
    scene.updateMatrixWorld(true);
    const meshes = [];
    scene.traverse((o) => {
      if (o.isMesh) meshes.push(o);
    });
    return meshes;
  });
  const reference = scenes[0].userData.vesperTreeBounds,
    bounds = reference
      ? new THREE.Box3(
          new THREE.Vector3().fromArray(reference.min),
          new THREE.Vector3().fromArray(reference.max),
        )
      : new THREE.Box3().setFromObject(scenes[0]),
    scale = 15 / (bounds.max.y - bounds.min.y),
    samples = new Map(),
    rootBounds = new THREE.Box3();
  const add = (point) => {
    const key = point
      .toArray()
      .map((v) => Math.round(v * scale * 1e5))
      .join();
    if (!samples.has(key)) {
      samples.set(key, point.clone());
      rootBounds.expandByPoint(point);
    }
  };
  for (const tier of sources)
    for (const source of tier) {
      // Branches have their own elevated lower margins; they are not roots.
      if (!/^island_tree_\d+$/.test(source.material.name)) continue;
      const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
      geometry.computeBoundingBox();
      const p = geometry.attributes.position,
        index = geometry.index,
        bottom = geometry.boundingBox.min.y,
        rim = [],
        a = new THREE.Vector3(),
        b = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        rim[i] = (p.getY(i) - bottom) * scale <= 0.25;
        if (rim[i]) add(a.fromBufferAttribute(p, i));
      }
      // Sample the actual lower edges too: a coarse LOD edge can span a dip
      // between its endpoints. A common union seats all three distance tiers.
      const count = index ? index.count : p.count;
      for (let i = 0; i < count; i += 3)
        for (let edge = 0; edge < 3; edge++) {
          const ia = index ? index.getX(i + edge) : i + edge,
            ib = index
              ? index.getX(i + ((edge + 1) % 3))
              : i + ((edge + 1) % 3);
          if (!rim[ia] || !rim[ib]) continue;
          a.fromBufferAttribute(p, ia);
          b.fromBufferAttribute(p, ib);
          const steps = Math.ceil((a.distanceTo(b) * scale) / 0.2);
          for (let step = 1; step < steps; step++)
            add(a.clone().lerp(b, step / steps));
        }
      geometry.dispose();
    }
  if (!samples.size) throw new Error("Jungle specimen has no trunk footprint");
  const origin = rootBounds
      .getCenter(new THREE.Vector3())
      .setY(rootBounds.min.y),
    roots = [...samples.values()].map((p) =>
      p.sub(origin).multiplyScalar(scale),
    ),
    radius = Math.max(...roots.map((p) => Math.hypot(p.x, p.z)));
  return { sources, origin, scale, roots, radius };
}

export function jungleTreeAllowed(game, x, z, radius) {
  if (
    !natureRockAllowed(game, x, z, radius + 0.2) ||
    inCipherCourt(game.map, x, z, radius + 0.2)
  )
    return false;
  const margin = radius + 0.25;
  // Test the whole root circle against walking-cell squares, including corners.
  for (
    let iz = Math.floor((z - margin + 3.5) / 7);
    iz <= Math.floor((z + margin + 3.5) / 7);
    iz++
  )
    for (
      let ix = Math.floor((x - margin + 3.5) / 7);
      ix <= Math.floor((x + margin + 3.5) / 7);
      ix++
    ) {
      if (!game.map.grid[iz]?.[ix]) continue;
      const dx = Math.max(0, Math.abs(x - ix * 7) - 3.5),
        dz = Math.max(0, Math.abs(z - iz * 7) - 3.5);
      if (Math.hypot(dx, dz) < margin) return false;
    }
  return true;
}

export function plantJungleTrees(anchors, models, { height, allowed }) {
  const trees = [];
  for (const anchor of anchors) {
    const model = models[anchor.variant],
      c = Math.cos(anchor.rotation),
      s = Math.sin(anchor.rotation),
      radius = model.radius * anchor.scale,
      roots = model.roots.map((p) => ({
        x: (c * p.x + s * p.z) * anchor.scale,
        y: p.y * anchor.scale,
        z: (-s * p.x + c * p.z) * anchor.scale,
      }));
    // Search nearby soil pockets before discarding a tree on a path or ledge.
    // Fixed candidates preserve placement across quality settings and reloads.
    for (let candidate = 0; candidate < 17; candidate++) {
      const distance = candidate === 0 ? 0 : candidate <= 8 ? 2 : 4,
        angle = anchor.rotation + (((candidate - 1) % 8) * Math.PI) / 4,
        x = anchor.x + Math.cos(angle) * distance,
        z = anchor.z + Math.sin(angle) * distance;
      if (!allowed(x, z, radius)) continue;
      if (
        trees.some(
          (tree) =>
            Math.hypot(x - tree.x, z - tree.z) < radius + tree.radius + 0.3,
        )
      )
        continue;
      let y = Infinity,
        low = Infinity,
        high = -Infinity;
      for (const root of roots) {
        const ground = height(x + root.x, z + root.z);
        y = Math.min(y, ground - root.y);
        low = Math.min(low, ground);
        high = Math.max(high, ground);
      }
      // Do not hide a trunk in a cliff to make its downhill edge meet the soil.
      if (!Number.isFinite(y) || high - low > 1.8 * anchor.scale) continue;
      trees.push({ ...anchor, x, z, y: y - 0.08, radius });
      break;
    }
  }
  return trees;
}
