import * as THREE from "three";
import { terrainTriangleReader } from "./inspect-desert-groundcover-browser.js";
import { stationSupport, stationBlocked } from "../src/field-station-solids.js";

// Queries the final batched render buffers; the placement stencil is not reused.
export function inspectDesertForecourts(game) {
  if (!game.desertForecourts?.length)
    throw Error("Load the desert forecourts first");
  game.world.updateMatrixWorld(true);
  const floor = terrainTriangleReader(game.terrainMeshes),
    ray = new THREE.Raycaster(),
    report = {
      courts: game.desertForecourts.length,
      walls: 0,
      galleries: 0,
      cisterns: 0,
      parts: 0,
      triangles: 0,
      footingQueries: 0,
      supportQueries: 0,
      headroomQueries: 0,
      voidQueries: 0,
      highestFootingGap: -Infinity,
      largestSupportError: 0,
      failures: [],
    };
  const probeMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  try {
    for (const court of game.desertForecourts) {
      report.parts += court.parts;
      report.triangles += court.triangles;
      const meshes = court.root.children
          .filter((m) => m.isMesh)
          .map((m) => {
            for (const a of Object.values(m.geometry.attributes))
              if (!a.array.every(Number.isFinite))
                report.failures.push({
                  room: court.room,
                  kind: "invalid geometry",
                });
            const probe = new THREE.Mesh(m.geometry, probeMaterial);
            probe.matrixAutoUpdate = false;
            probe.matrix.copy(m.matrixWorld);
            probe.updateMatrixWorld(true);
            return probe;
          }),
        solids = court.feature.stationSolids || [],
        hit = (x, y, z, up) => {
          ray.set(
            new THREE.Vector3(x, y, z),
            new THREE.Vector3(0, up ? 1 : -1, 0),
          );
          return ray.intersectObjects(meshes, false)[0]?.point.y;
        },
        footing = (id, x, z) => {
          const ground = floor(x, z),
            bottom = hit(x, (ground ?? 0) - 20, z, true),
            gap =
              bottom === undefined || ground === null
                ? Infinity
                : bottom - ground;
          report.footingQueries++;
          report.highestFootingGap = Math.max(report.highestFootingGap, gap);
          if (!Number.isFinite(gap) || gap > -0.15)
            report.failures.push({
              room: court.room,
              id,
              kind: "exposed footing",
              x,
              z,
              gap,
            });
        },
        support = (id, x, z, top) => {
          const visible = hit(x, top + 0.2, z, false),
            physical = Math.max(
              ...solids.map(
                (s) => stationSupport(s, x, z, top + 0.1) ?? -Infinity,
              ),
            ),
            error = Math.max(
              Math.abs((visible ?? Infinity) - physical),
              Math.abs(physical - top),
            );
          report.supportQueries++;
          report.largestSupportError = Math.max(
            report.largestSupportError,
            error,
          );
          if (!Number.isFinite(error) || error > 0.0001)
            report.failures.push({
              room: court.room,
              id,
              kind: "support",
              x,
              z,
              visible,
              physical,
              top,
              error,
            });
        };
      for (const [i, wall] of court.walls.entries()) {
        report.walls++;
        for (const fx of [-0.42, 0, 0.42])
          for (const fz of [-0.42, 0, 0.42])
            footing(
              `wall-${i}`,
              wall.worldX + fx * wall.w,
              wall.worldZ + fz * wall.d,
            );
        for (const f of [-0.4, 0, 0.4])
          support(
            `wall-${i}`,
            wall.worldX + (wall.w > wall.d ? f * wall.w : 0),
            wall.worldZ + (wall.d >= wall.w ? f * wall.d : 0),
            wall.crown && Math.abs(f * wall.w) < wall.crown.width / 2
              ? wall.crown.top
              : wall.top,
          );
      }
      for (const [i, gallery] of court.galleries.entries()) {
        report.galleries++;
        for (const post of gallery.posts)
          for (const dx of [-0.35, 0, 0.35])
            for (const dz of [-0.35, 0, 0.35])
              footing(`gallery-${i}`, post.worldX + dx, post.worldZ + dz);
        for (let column = 0; column <= 24; column++) {
          const x =
              court.root.position.x +
              gallery.x -
              (gallery.width / 2 - 1.6) +
              ((gallery.width - 3.2) * column) / 24,
            z = court.root.position.z + gallery.z;
          const ground = floor(x, z),
            ceiling = hit(x, (ground ?? 0) + 0.05, z, true);
          report.headroomQueries++;
          if (
            ground === null ||
            ceiling === undefined ||
            ceiling - ground < 3.3 ||
            solids.some((s) => stationBlocked(s, x, ground, z, 2.1, 0.3))
          )
            report.failures.push({
              room: court.room,
              kind: "gallery headroom",
              x,
              z,
              ground,
              ceiling,
            });
          support(`roof-${i}`, x, z, gallery.top);
        }
      }
      for (const [i, cistern] of court.cisterns.entries()) {
        report.cisterns++;
        for (let face = 0; face < 8; face++)
          for (const f of [0.2, 0.5, 0.8]) {
            const angle = (face * Math.PI) / 4,
              a = new THREE.Vector2(Math.cos(angle), Math.sin(angle)),
              b = new THREE.Vector2(
                Math.cos(angle + Math.PI / 4),
                Math.sin(angle + Math.PI / 4),
              ),
              r = (cistern.outer + cistern.inner) / 2,
              p = a.lerp(b, f).multiplyScalar(r),
              x = court.root.position.x + cistern.x + p.x,
              z = court.root.position.z + cistern.z + p.y;
            footing(`cistern-${i}`, x, z);
            support(`cistern-${i}`, x, z, cistern.top);
          }
        const x = court.root.position.x + cistern.x,
          z = court.root.position.z + cistern.z,
          ground = floor(x, z);
        report.voidQueries++;
        if (
          ground === null ||
          hit(x, ground + 2, z, false) !== undefined ||
          solids.some((s) => stationBlocked(s, x, ground + 0.1, z, 1.6, 0.25))
        )
          report.failures.push({
            room: court.room,
            kind: "filled cistern",
            x,
            z,
          });
      }
    }
  } finally {
    probeMaterial.dispose();
  }
  return report;
}
