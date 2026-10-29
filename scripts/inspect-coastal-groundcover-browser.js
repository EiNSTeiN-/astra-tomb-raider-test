// Development observer: inspect every planted root against delivered triangle
// buffers using float32 instance transforms, independent of the seating sampler.
import * as THREE from "three";
import { terrainTriangleReader } from "./inspect-desert-groundcover-browser.js";
import { coastalCoverAllowed } from "../src/coastal-groundcover.js";
export function inspectCoastalGroundcover(game, limitPlants = Infinity) {
  const cover = game.coastalGroundcover;
  if (!cover) throw Error("Load the coastal groundcover first");
  const terrain = terrainTriangleReader(game.terrainMeshes),
    rootTemplates = cover.specimens.map((specimen) => {
      const roots = new Map();
      for (const geometry of specimen.tiers) {
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++)
          if (position.getY(i) === 0)
            roots.set(
              `${position.getX(i)},${position.getZ(i)}`,
              new THREE.Vector3().fromBufferAttribute(position, i),
            );
      }
      return [...roots.values()];
    }),
    point = new THREE.Vector3(),
    matrix = new THREE.Matrix4(),
    report = {
      plants: 0,
      roots: 0,
      highestRootGap: -Infinity,
      missingRoots: 0,
      exposedRoots: 0,
      reservedPlants: 0,
      failures: [],
    },
    rocks = game.naturePatches
      .filter((p) => p.kind === "rock")
      .flatMap((p) => {
        const bounds = new THREE.Box3().setFromBufferAttribute(
          p.tiers[0][0].geometry.attributes.position,
        );
        return p.matrices.map((m) => bounds.clone().applyMatrix4(m));
      });
  for (const plant of cover.plants.slice(0, limitPlants)) {
    const specimen = cover.specimens[plant.variant];
    report.plants++;
    if (
      !coastalCoverAllowed(
        game,
        plant.x,
        plant.z,
        specimen.radius * plant.size,
        rocks,
      )
    ) {
      report.reservedPlants++;
      report.failures.push({ query: "reservation", x: plant.x, z: plant.z });
    }
    matrix.fromArray(new Float32Array(plant.matrix.elements));
    for (const root of rootTemplates[plant.variant]) {
      point.copy(root).applyMatrix4(matrix);
      const floor = terrain(point.x, point.z),
        gap = point.y - floor;
      report.roots++;
      if (floor === null) report.missingRoots++;
      else {
        report.highestRootGap = Math.max(report.highestRootGap, gap);
        if (gap > -0.005) report.exposedRoots++;
      }
      if ((floor === null || gap > -0.005) && report.failures.length < 25)
        report.failures.push({
          query: "root",
          x: point.x,
          z: point.z,
          y: point.y,
          floor,
          gap,
        });
    }
  }
  return report;
}
