// Run on a loaded development Snow chapter. Render rays use the batched meshes
// and actual terrain buffers, independently of the CPU collision kernels.
import * as THREE from "three";
import {
  stationSupport,
  stationBlocked,
  stationEntry,
} from "../src/field-station-solids.js";

export function inspectMonasteryGardens(game) {
  if (!game.monasteryGardens?.length)
    throw Error("Load the snow chapter and its visual assets first");
  game.world.updateMatrixWorld(true);
  const report = {
      gardens: game.monasteryGardens.length,
      walls: 0,
      shrines: 0,
      galleries: 0,
      headroomProbes: 0,
      roofProbes: 0,
      footingProbes: 0,
      supportProbes: 0,
      entryProbes: 0,
      largestSupportError: 0,
      highestFootingGap: -Infinity,
      parts: 0,
      triangles: 0,
      failures: [],
    },
    ray = new THREE.Raycaster(),
    terrain = game.terrainMeshes.map((mesh) => {
      mesh.geometry.computeBoundingBox();
      return {
        mesh,
        bounds: mesh.geometry.boundingBox
          .clone()
          .applyMatrix4(mesh.matrixWorld),
      };
    }),
    ground = (x, z) => {
      ray.set(new THREE.Vector3(x, 300, z), new THREE.Vector3(0, -1, 0));
      const meshes = terrain
        .filter(
          ({ bounds: b }) =>
            x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z,
        )
        .map(({ mesh }) => mesh);
      return ray.intersectObjects(meshes, false)[0]?.point.y;
    },
    footing = (id, x, z, bottom) => {
      const y = ground(x, z),
        gap = bottom - y;
      report.footingProbes++;
      report.highestFootingGap = Math.max(report.highestFootingGap, gap);
      if (!Number.isFinite(gap) || gap > -0.15)
        report.failures.push({ id, kind: "footing", x, z, gap });
    };
  for (const garden of game.monasteryGardens) {
    const solids = garden.feature.stationSolids || [],
      meshes = garden.root.children;
    report.parts += garden.parts;
    report.triangles += garden.triangles;
    for (const mesh of meshes)
      for (const attribute of Object.values(mesh.geometry.attributes))
        if (!attribute.array.every(Number.isFinite))
          report.failures.push({ id: garden.room, kind: "nonfinite geometry" });
    for (const wall of garden.walls) {
      report.walls++;
      for (const fx of [-0.49, -0.25, 0, 0.25, 0.49])
        for (const fz of [-0.49, 0, 0.49]) {
          const x = wall.worldX + fx * wall.w,
            z = wall.worldZ + fz * wall.d;
          footing(garden.room, x, z, wall.bottom);
          ray.set(
            new THREE.Vector3(x, wall.top + 0.25, z),
            new THREE.Vector3(0, -1, 0),
          );
          const y = ray.intersectObjects(meshes, false)[0]?.point.y,
            support = Math.max(
              ...solids.map(
                (s) => stationSupport(s, x, z, wall.top + 0.1) ?? -Infinity,
              ),
            ),
            error = Math.max(
              Math.abs(y - support),
              Math.abs(support - wall.top),
            );
          report.supportProbes++;
          report.largestSupportError = Math.max(
            report.largestSupportError,
            error,
          );
          if (!Number.isFinite(error) || error > 0.0001)
            report.failures.push({
              id: garden.room,
              kind: "support",
              x,
              z,
              y,
              support,
            });
        }
      for (const side of [-1, 1]) {
        // Probe the broad exposed face, away from joined end caps. Starting
        // inside a neighboring return would compare its exit with entry zero.
        const acrossZ = wall.w >= wall.d;
        const from = new THREE.Vector3(
            wall.worldX + (acrossZ ? 0 : side * (wall.w / 2 + 0.05)),
            wall.top - 0.04,
            wall.worldZ + (acrossZ ? side * (wall.d / 2 + 0.05) : 0),
          ),
          to = new THREE.Vector3(wall.worldX, from.y, wall.worldZ),
          distance = from.distanceTo(to);
        ray.set(from, to.clone().sub(from).normalize());
        ray.far = distance;
        const hit = ray.intersectObjects(meshes, false)[0],
          entry = Math.min(
            ...solids.map((s) => stationEntry(s, from, to) ?? Infinity),
          ),
          error = Math.abs((hit?.distance ?? Infinity) / distance - entry);
        report.entryProbes++;
        if (!Number.isFinite(error) || error > 0.0001)
          report.failures.push({ id: garden.room, kind: "entry", error });
        ray.far = Infinity;
      }
    }
    for (const shrine of garden.shrines) {
      report.shrines++;
      for (const fx of [-0.49, -0.25, 0, 0.25, 0.49])
        for (const fz of [-0.49, -0.25, 0, 0.25, 0.49])
          footing(
            garden.room,
            shrine.x + fx * 3.4,
            shrine.z + fz * 3.4,
            shrine.bottom,
          );
      const body = shrine.base + 0.92,
        blocked = (x, y, z) =>
          solids.some((s) => stationBlocked(s, x, y, z, 0, 0));
      for (const [label, x, y, z, expected] of [
        ["niche void", shrine.x, body + 0.7, shrine.z + 0.3, false],
        ["niche back", shrine.x, body + 0.7, shrine.z - 0.82, true],
        ["niche cheek", shrine.x + 0.76, body + 0.7, shrine.z, true],
        ["above finial", shrine.x, shrine.top + 1, shrine.z, false],
      ])
        if (blocked(x, y, z) !== expected)
          report.failures.push({ id: garden.room, kind: label });
    }
    for (const gallery of garden.galleries || []) {
      report.galleries++;
      for (const post of gallery.posts)
        for (const dx of [-0.44, 0, 0.44])
          for (const dz of [-0.44, 0, 0.44])
            footing(garden.room, post.x + dx, post.z + dz, post.bottom);
      for (const dx of [-0.65, 0, 0.65])
        for (const dz of [-0.7, 0, 0.7]) {
          const x = gallery.x + dx,
            z = gallery.z + dz,
            floor = ground(x, z);
          report.headroomProbes++;
          if (solids.some((s) => stationBlocked(s, x, floor, z, 1.8)))
            report.failures.push({
              id: garden.room,
              kind: "gallery headroom",
              x,
              z,
            });
          ray.set(
            new THREE.Vector3(x, gallery.y + 5, z),
            new THREE.Vector3(0, -1, 0),
          );
          const hit = ray.intersectObjects(meshes, false)[0],
            support = Math.max(
              ...solids.map((s) => stationSupport(s, x, z) ?? -Infinity),
            ),
            error = Math.abs((hit?.point.y ?? Infinity) - support);
          report.roofProbes++;
          report.largestSupportError = Math.max(
            report.largestSupportError,
            error,
          );
          if (
            !hit ||
            hit.point.y < gallery.y ||
            !Number.isFinite(error) ||
            error > 0.0001
          )
            report.failures.push({
              id: garden.room,
              kind: "gallery roof support",
              x,
              z,
              error,
            });
        }
    }
  }
  return report;
}
