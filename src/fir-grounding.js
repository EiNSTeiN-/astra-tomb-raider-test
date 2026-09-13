import * as THREE from "three";
import { natureRockAllowed, rockGroundHeight } from "./nature-rocks.js";

function meshes(root) {
  const result = [];
  root.traverse((object) => {
    if (object.isMesh) result.push(object);
  });
  return result;
}

// The delivered fir scene is a collection of three specimens at 6 m intervals.
// Keep their original scale, but normalize and plant each rooted trunk separately.
export function firSpecimens(scenes) {
  scenes.forEach((scene) => scene.updateMatrixWorld(true));
  const reference = scenes[0].userData.vesperTreeBounds,
    bounds = reference
      ? new THREE.Box3(
          new THREE.Vector3().fromArray(reference.min),
          new THREE.Vector3().fromArray(reference.max),
        )
      : new THREE.Box3().setFromObject(scenes[0]),
    center = bounds.getCenter(new THREE.Vector3()),
    scale = 15 / (bounds.max.y - bounds.min.y);
  const names = scenes[0].children
    .filter((root) => meshes(root).some((m) => /trunk/.test(m.material.name)))
    .map((root) => root.name);
  return names.map((name) => {
    const sources = scenes.map((scene) => {
      const root = scene.getObjectByName(name);
      if (!root) throw new Error(`Missing fir specimen: ${name}`);
      return meshes(root);
    });
    const trunk = sources[0].find((m) => /trunk/.test(m.material.name)),
      geometry = trunk.geometry.clone().applyMatrix4(trunk.matrixWorld);
    geometry.computeBoundingBox();
    const base = geometry.boundingBox.min.y,
      rootBounds = new THREE.Box3(),
      roots = [],
      position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      if ((position.getY(i) - base) * scale > 0.25) continue;
      const p = new THREE.Vector3().fromBufferAttribute(position, i);
      roots.push(p);
      rootBounds.expandByPoint(p);
    }
    const origin = rootBounds.getCenter(new THREE.Vector3()).setY(base);
    geometry.dispose();
    return {
      name,
      sources,
      origin,
      scale,
      roots: roots.map((p) => p.sub(origin).multiplyScalar(scale)),
      offset: origin
        .clone()
        .sub(center.clone().setY(bounds.min.y))
        .multiplyScalar(scale),
    };
  });
}

export function plantFirTrees(game, anchors, specimens) {
  const trees = [],
    point = new THREE.Vector3(),
    matrix = new THREE.Matrix4();
  for (const anchor of anchors) {
    const c = Math.cos(anchor.rotation),
      s = Math.sin(anchor.rotation);
    for (const [variant, specimen] of specimens.entries()) {
      const x =
          anchor.x +
          (c * specimen.offset.x + s * specimen.offset.z) * anchor.scale,
        z =
          anchor.z +
          (-s * specimen.offset.x + c * specimen.offset.z) * anchor.scale,
        radius =
          Math.max(...specimen.roots.map((p) => Math.hypot(p.x, p.z))) *
          anchor.scale;
      // Root flares must remain outside walking cells and authored working areas.
      let clear = natureRockAllowed(game, x, z, radius + 0.2);
      for (let i = 0; clear && i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        if (
          game.map.grid[
            Math.round((z + Math.sin(angle) * (radius + 0.3)) / 7)
          ]?.[Math.round((x + Math.cos(angle) * (radius + 0.3)) / 7)]
        )
          clear = false;
      }
      if (!clear) continue;
      if (
        trees.some(
          (t) => Math.hypot(x - t.x, z - t.z) < radius + t.radius + 0.5,
        )
      )
        continue;
      matrix.compose(
        new THREE.Vector3(x, 0, z),
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          anchor.rotation,
        ),
        new THREE.Vector3().setScalar(anchor.scale),
      );
      let y = Infinity,
        low = Infinity,
        high = -Infinity;
      for (const root of specimen.roots) {
        point.copy(root).applyMatrix4(matrix);
        const ground = rockGroundHeight(game.terrainProfile, point.x, point.z);
        y = Math.min(y, ground - point.y);
        low = Math.min(low, ground);
        high = Math.max(high, ground);
      }
      // A steep ledge is not a planting pocket. Do not bridge it with a root flare.
      if (high - low > 1.2 * anchor.scale) continue;
      trees.push({
        x,
        z,
        y: y - 0.08,
        rotation: anchor.rotation,
        scale: anchor.scale,
        radius,
        variant,
      });
    }
  }
  return trees;
}
