import * as THREE from "three";
import { terrainTriangleReader } from "./inspect-desert-groundcover-browser.js";
import { stationSupport, stationEntry } from "../src/field-station-solids.js";

// Observe delivered geometry and independent rays; do not reconstruct the
// procedural crown or reuse the planner's ground/minimum calculations.
export function inspectDesertOutcrops(game) {
  const sites = game.desertOutcrops?.sites;
  if (!sites?.length) throw Error("Load the sandstone outcrops first");
  game.world.updateMatrixWorld(true);
  const ground = terrainTriangleReader(game.terrainMeshes),
    ray = new THREE.Raycaster(),
    report = {
      sites: sites.length,
      triangles: 0,
      rimQueries: 0,
      surfaceQueries: 0,
      emptyQueries: 0,
      soundOrigins: 0,
      highestRimGap: -Infinity,
      largestSupportError: 0,
      largestCameraError: 0,
      failures: [],
    };
  for (const { mesh, solid, camera } of sites) {
    const geometry = mesh.geometry,
      p = geometry.attributes.position,
      b = geometry.boundingBox;
    report.triangles += geometry.index.count / 3;
    const { sides, rings } = geometry.userData;
    for (const a of Object.values(geometry.attributes))
      if (!a.array.every(Number.isFinite))
        report.failures.push({ kind: "nonfinite geometry" });
    for (let i = 0; i < sides; i++) {
      const a = 1 + (rings - 1) * sides + i,
        c = 1 + (rings - 1) * sides + ((i + 1) % sides),
        from = new THREE.Vector3().fromBufferAttribute(p, a),
        to = new THREE.Vector3().fromBufferAttribute(p, c),
        n = Math.ceil(from.distanceTo(to) / 0.1);
      for (let j = 0; j <= n; j++) {
        const q = from
            .clone()
            .lerp(to, j / n)
            .applyMatrix4(mesh.matrixWorld),
          floor = ground(q.x, q.z),
          gap = floor === null ? Infinity : q.y - floor;
        report.rimQueries++;
        report.highestRimGap = Math.max(report.highestRimGap, gap);
        if (!Number.isFinite(gap) || gap > -0.1)
          report.failures.push({
            kind: "unburied rim",
            point: q.toArray(),
            gap,
          });
      }
    }
    for (let iz = 0; iz <= 10; iz++)
      for (let ix = 0; ix <= 10; ix++) {
        const x = b.min.x + ((b.max.x - b.min.x) * ix) / 10,
          z = b.min.z + ((b.max.z - b.min.z) * iz) / 10,
          from = new THREE.Vector3(x, b.max.y + 2, z),
          to = new THREE.Vector3(x, b.min.y - 1, z);
        ray.set(from, new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(mesh, false)[0],
          support = stationSupport(solid, x, z),
          sight = stationEntry(solid, from, to),
          entry = camera.entry(from, to);
        if (hit) {
          const supportError = Math.abs((support ?? Infinity) - hit.point.y),
            t = hit.distance / from.distanceTo(to),
            cameraError = Math.abs((entry ?? Infinity) - t);
          report.surfaceQueries++;
          report.largestSupportError = Math.max(
            report.largestSupportError,
            supportError,
          );
          report.largestCameraError = Math.max(
            report.largestCameraError,
            cameraError,
          );
          if (
            supportError > 0.0001 ||
            cameraError > 0.0001 ||
            Math.abs((sight ?? Infinity) - t) > 0.0001
          )
            report.failures.push({
              kind: "render/query disagreement",
              x,
              z,
              supportError,
              cameraError,
            });
        } else {
          report.emptyQueries++;
          if (support !== null || sight !== null || entry !== null)
            report.failures.push({ kind: "filled empty corner", x, z });
        }
      }
  }
  for (const source of game.soundSources || []) {
    report.soundOrigins++;
    if (
      sites.some(({ solid }) =>
        solid.triangles.blocked(source.x, source.y, source.z, 0, 0),
      )
    )
      report.failures.push({ kind: "embedded sound origin", id: source.id });
  }
  return report;
}
