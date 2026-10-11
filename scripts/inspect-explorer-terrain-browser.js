import * as THREE from "three";
import { terrainTriangleReader } from "./inspect-desert-groundcover-browser.js";

// Read the delivered, posed body rather than its capsule or support probes.
// A supplied reader can be reused across many poses without rebuilding terrain.
export function inspectExplorerTerrain(
  game,
  terrain = terrainTriangleReader(game.terrainMeshes),
  tolerance = 0.015,
) {
  game.avatar.updateWorldMatrix(true, false);
  game.rig.model.updateMatrixWorld(true);
  const point = new THREE.Vector3(),
    report = {
      samples: 0,
      embedded: 0,
      missing: 0,
      invalid: 0,
      minimumGap: Infinity,
      meshes: [],
      witnesses: [],
    };
  game.avatar.traverse((mesh) => {
    if (!mesh.isMesh) return;
    for (let parent = mesh; parent; parent = parent.parent)
      if (!parent.visible) return;
    const part = {
      name: mesh.name,
      samples: 0,
      embedded: 0,
      missing: 0,
      invalid: 0,
      minimumGap: Infinity,
      witness: null,
    };
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      part.samples++;
      if (![point.x, point.y, point.z].every(Number.isFinite)) {
        part.invalid++;
        continue;
      }
      const floor = terrain(point.x, point.z),
        gap = floor === null ? null : point.y - floor;
      if (floor === null) part.missing++;
      else if (!Number.isFinite(floor)) part.invalid++;
      else {
        if (gap < part.minimumGap) {
          part.minimumGap = gap;
          part.witness = { vertex: i, point: point.toArray(), floor, gap };
        }
        if (gap < -tolerance) part.embedded++;
      }
    }
    report.samples += part.samples;
    report.embedded += part.embedded;
    report.missing += part.missing;
    report.invalid += part.invalid;
    report.minimumGap = Math.min(report.minimumGap, part.minimumGap);
    if (part.embedded)
      report.witnesses.push({ mesh: mesh.name, ...part.witness });
    report.meshes.push(part);
  });
  return report;
}
