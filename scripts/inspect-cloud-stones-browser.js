// Independent world-space underside rays against the delivered terrain buffers.
// Run on a fully loaded cloud chapter; no fitting samples are reused here.
import * as THREE from "three";
import { updateLodPatch } from "../src/instance-lod.js";
import { updateNature } from "../src/vegetation.js";

export function inspectCloudStones(game, divisions = 32) {
  if (game.level.biome !== "sky" || !game.rockGrounding)
    throw Error("Load the cloud chapter and its visual assets first");
  if (!Number.isInteger(divisions) || divisions < 8)
    throw Error("Use at least eight underside grid divisions");
  game.world.updateMatrixWorld(true);
  const chunks = new Map();
  for (const mesh of game.terrainMeshes) {
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox
        .clone()
        .applyMatrix4(mesh.matrixWorld),
      { widthSegments: nx, heightSegments: nz } = mesh.geometry.parameters;
    chunks.set(
      `${Math.floor((bounds.min.x + 0.001) / 49)},${Math.floor((bounds.min.z + 0.001) / 49)}`,
      {
        mesh,
        bounds,
        nx,
        nz,
        dx: (bounds.max.x - bounds.min.x) / nx,
        dz: (bounds.max.z - bounds.min.z) / nz,
      },
    );
  }
  const down = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0)),
    ray = new THREE.Raycaster(),
    vertices = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    intersection = new THREE.Vector3(),
    local = new THREE.Matrix4(),
    material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    rocks = [],
    failures = [];
  const groundAt = (x, z, y) => {
    const chunk = chunks.get(`${Math.floor(x / 49)},${Math.floor(z / 49)}`);
    if (!chunk) return null;
    const { mesh, bounds, nx, nz, dx, dz } = chunk,
      ix = Math.min(nx - 1, Math.max(0, Math.floor((x - bounds.min.x) / dx))),
      iz = Math.min(nz - 1, Math.max(0, Math.floor((z - bounds.min.z) / dz))),
      offset = (iz * nx + ix) * 6;
    down.origin.set(x, Math.max(y, game.groundHeight(x, z)) + 10, z);
    for (let triangle = 0; triangle < 2; triangle++) {
      for (let k = 0; k < 3; k++)
        vertices[k]
          .fromBufferAttribute(
            mesh.geometry.attributes.position,
            mesh.geometry.index.getX(offset + triangle * 3 + k),
          )
          .applyMatrix4(mesh.matrixWorld);
      if (down.intersectTriangle(...vertices, false, intersection))
        return intersection.y;
    }
    return null;
  };
  try {
    for (const patch of game.naturePatches.filter((p) => p.kind === "rock")) {
      // Resolve all instances into the actual Float32 GPU transform buffer.
      updateLodPatch(patch, game.player.position, [Infinity], 0);
      const mesh = patch.tiers[0][0];
      mesh.geometry.computeBoundingBox();
      const probe = new THREE.Mesh(mesh.geometry, material);
      probe.matrixAutoUpdate = false;
      for (let instance = 0; instance < mesh.count; instance++) {
        mesh.getMatrixAt(instance, local);
        probe.matrix.copy(mesh.matrixWorld).multiply(local);
        probe.updateMatrixWorld(true);
        const box = mesh.geometry.boundingBox
            .clone()
            .applyMatrix4(probe.matrixWorld),
          result = {
            position: new THREE.Vector3()
              .setFromMatrixPosition(probe.matrixWorld)
              .toArray(),
            matrix: probe.matrixWorld.toArray(),
            samples: 0,
            highestGap: -Infinity,
            lowestGap: Infinity,
            worst: null,
          };
        for (let iz = 1; iz < divisions; iz++)
          for (let ix = 1; ix < divisions; ix++) {
            const x = THREE.MathUtils.lerp(
                box.min.x,
                box.max.x,
                ix / divisions,
              ),
              z = THREE.MathUtils.lerp(box.min.z, box.max.z, iz / divisions);
            ray.set(
              new THREE.Vector3(x, box.min.y - 1, z),
              new THREE.Vector3(0, 1, 0),
            );
            const hit = ray.intersectObject(probe, false)[0];
            if (!hit) continue;
            const ground = groundAt(x, z, hit.point.y),
              gap = ground === null ? Infinity : hit.point.y - ground;
            result.samples++;
            result.lowestGap = Math.min(result.lowestGap, gap);
            if (gap > result.highestGap) {
              result.highestGap = gap;
              result.worst = { point: hit.point.toArray(), ground, gap };
            }
          }
        rocks.push(result);
        if (!result.samples || result.highestGap > -0.007)
          failures.push(result);
      }
    }
  } finally {
    material.dispose();
    updateNature(game);
  }
  return {
    stats: { ...game.rockGrounding },
    divisions,
    instances: rocks.length,
    rootProbes: rocks.reduce((n, r) => n + r.samples, 0),
    highestRootGap: Math.max(...rocks.map((r) => r.highestGap)),
    failures,
    rocks,
  };
}
