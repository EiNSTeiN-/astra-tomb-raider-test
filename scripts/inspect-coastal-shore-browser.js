import * as T from "three";
import { inspectCoastalGroundcover } from "./inspect-coastal-groundcover-browser.js";
import { terrainTriangleReader } from "./inspect-desert-groundcover-browser.js";
import {
  coastalShoreDistance,
  coastalShoreShrubAllowed,
} from "../src/coastal-shore-plan.js";
// Development observer. Run against a paused coastal world. Position/bend tuples
// shared by several source triangles or tiers are queried once, retaining all
// represented shrub vertices above the 10cm intentionally buried root zone.
export function inspectCoastalShore(g) {
  const cover = g.coastalGroundcover,
    newPlants = cover.plants.filter((p) => p.shore),
    roots = inspectCoastalGroundcover(g, Infinity, newPlants);
  const floor = terrainTriangleReader(g.terrainMeshes),
    matrix = new T.Matrix4(),
    p = new T.Vector3(),
    q = new T.Vector3(),
    report = {
      roots,
      shrubs: 0,
      vertices: 0,
      missing: 0,
      buried: 0,
      walkingIntrusions: 0,
      invalidBeds: 0,
      minimumAboveGround: Infinity,
      minimumWalkingGap: Infinity,
      failures: [],
    };

  const sea = g.waterMeshes.find((m) => m.userData.sea),
    maximumSeaY = sea
      ? sea.position.y +
        0.051 * Math.abs(sea.material.userData.waterUniforms.waveScale.value)
      : null;
  report.minimumRootY = Math.min(
    ...newPlants.map((p) => new Float32Array(p.matrix.elements)[13]),
  );
  report.maximumSeaY = maximumSeaY;
  report.minimumSeaClearance =
    maximumSeaY === null ? null : report.minimumRootY - maximumSeaY;
  const specimens = new Map();
  for (const geo of cover.specimens[3].tiers) {
    const positions = geo.attributes.position,
      bend = geo.attributes.coastalBend;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) <= 0.1) continue;
      const values = [
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i),
        bend.getX(i),
      ];
      specimens.set(values.join(","), values);
    }
  }
  report.uniqueTemplateVertices = specimens.size;
  for (const plant of newPlants) {
    if (plant.variant !== 3) continue;
    report.shrubs++;
    const shape = cover.specimens[3];
    if (
      !coastalShoreShrubAllowed(
        g.map,
        g.terrainProfile,
        plant.x,
        plant.z,
        shape.radius * plant.size,
      )
    )
      report.invalidBeds++;
    matrix.fromArray(new Float32Array(plant.matrix.elements));
    for (const [x, y, z, bend] of specimens.values()) {
      p.set(x, y, z);
      const weight = bend ** 2;
      for (const [wx, wz] of [
        [0, 0],
        [-0.025, -0.018],
        [-0.025, 0.018],
        [0.025, -0.018],
        [0.025, 0.018],
      ]) {
        q.copy(p);
        q.x += wx * weight;
        q.z += wz * weight;
        q.applyMatrix4(matrix);
        const terrain = floor(q.x, q.z),
          gap = terrain === null ? null : q.y - terrain,
          clearance = coastalShoreDistance(g.map, q.x, q.z);
        report.vertices++;
        if (terrain === null) report.missing++;
        else {
          report.minimumAboveGround = Math.min(report.minimumAboveGround, gap);
          if (gap < -0.005) report.buried++;
        }
        report.minimumWalkingGap = Math.min(
          report.minimumWalkingGap,
          clearance,
        );
        if (clearance < 0.19) report.walkingIntrusions++;
        if (
          (terrain === null || gap < -0.005 || clearance < 0.19) &&
          report.failures.length < 10
        )
          report.failures.push({
            plant: [plant.x, plant.z],
            local: [x, y, z],
            x: q.x,
            y: q.y,
            z: q.z,
            terrain,
            gap,
            clearance,
          });
      }
    }
  }
  return report;
}
