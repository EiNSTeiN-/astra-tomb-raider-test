import * as THREE from "three";
import { stationAssemblySolid } from "./field-station-solids.js";
import { mergeArchitecture } from "./visuals.js";
import { yardRouteClear, yardTraversalClear } from "./station-yard-plan.js";
import {
  jungleCragCandidates,
  jungleCragGeometry,
} from "./jungle-crag-geometry.js";
import { JungleCragCamera } from "./jungle-crag-camera.js";
import { jungleCragSupport } from "./jungle-crag-support.js";

function reservedCrag(game, box) {
  const x = (box.min.x + box.max.x) / 2,
    z = (box.min.z + box.max.z) / 2,
    footprint = { x, z, w: box.max.x - box.min.x, d: box.max.z - box.min.z },
    radius = Math.hypot(footprint.w, footprint.d) / 2;
  return (
    !yardRouteClear(game.map, footprint, 1.2) ||
    !yardTraversalClear(game.traversalCourses || [], footprint) ||
    game.map.features.some(
      (f) => Math.hypot(f.x * 7 - x, f.z * 7 - z) < radius + 5,
    ) ||
    game.items.some(
      (f) =>
        f.discovery &&
        Math.hypot(f.discovery.x - x, f.discovery.z - z) < radius + 6,
    ) ||
    game.terrainProfile.waters.some(
      (w) =>
        Math.abs(w.x - x) < w.width / 2 + footprint.w / 2 + 0.5 &&
        Math.abs(w.z - z) < w.length / 2 + footprint.d / 2 + 0.5,
    ) ||
    game.obstacles.some(
      (o) =>
        !o.jungleCrag &&
        Math.abs(o.x - x) < o.w + footprint.w / 2 + 0.25 &&
        Math.abs(o.z - z) < o.d + footprint.d / 2 + 0.25 &&
        (o.bounds?.max.y ?? game.groundHeight(o.x, o.z) + o.h) > box.min.y &&
        (o.bounds?.min.y ?? -Infinity) < box.max.y,
    )
  );
}

export function buildJungleCrags(game) {
  game.jungleCrags = null;
  if (game.level.biome !== "jungle") return;
  const root = new THREE.Group(),
    material = game.terrainMeshes[0].material,
    sites = [],
    counts = [0, 0, 0, 0],
    stats = { candidates: 0, unseated: 0, reserved: 0, narrowed: 0, budget: 0 };
  root.name = "Fractured jungle cliff beds";
  let serial = 1,
    triangles = 0;
  for (const candidate of jungleCragCandidates(
    game.map,
    game.level,
    game.terrainProfile,
  )) {
    stats.candidates++;
    let fit = null,
      reserved = false,
      overBudget = false;
    // Channels leave narrower rock shoulders. Retry smaller lobes with all
    // four closed layers and the same burial/reservation checks, rather than
    // keeping a broad piece across a cleft or discarding every narrow shoulder.
    for (const scale of [0.68, 0.45]) {
      const site = { ...candidate, width: candidate.width * scale },
        meshes = [],
        box = new THREE.Box3();
      for (let layer = 0; layer < 4; layer++) {
        const geometry = jungleCragGeometry(
          game.terrainProfile,
          game.level,
          site,
          layer,
          serial + layer,
        );
        if (!geometry) break;
        box.union(geometry.boundingBox);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = mesh.receiveShadow = true;
        meshes.push(mesh);
      }
      if (meshes.length === 4) {
        const count = meshes.reduce(
          (sum, mesh) => sum + mesh.geometry.attributes.position.count / 3,
          0,
        );
        if (reservedCrag(game, box)) reserved = true;
        // More shoulders can fit after erosion. Keep the existing draw budget
        // by trying smaller complete pieces before rejecting a candidate.
        else if (triangles + count >= 120000) overBudget = true;
        else {
          fit = { site, meshes, box, count };
          break;
        }
      }
      meshes.forEach((m) => m.geometry.dispose());
    }
    if (!fit) {
      stats[reserved ? "reserved" : overBudget ? "budget" : "unseated"]++;
      continue;
    }
    const { site, meshes, box, count } = fit;
    triangles += count;
    if (site.width < candidate.width) stats.narrowed++;
    for (const mesh of meshes) root.add(mesh);
    for (const mesh of meshes)
      game.cameraSurfaces?.capture(mesh, {
        small: true,
        thin: true,
        kernel: new JungleCragCamera(mesh.geometry),
      });
    root.updateMatrixWorld(true);
    const feature = { id: site.id },
      solid = stationAssemblySolid(game, feature, meshes, {
        bodyPadding: 0.4,
        supportRadius: 0.4,
      });
    solid.preciseNatureClearance = true;
    solid.jungleCrag = true;
    solid.terrainFootholds = true;
    solid.supportTriangles = jungleCragSupport(game.terrainProfile, meshes);
    sites.push({
      ...site,
      parts: [serial, serial + 1, serial + 2, serial + 3],
      bounds: box.clone(),
      solid,
    });
    serial += 4;
    counts[site.side]++;
  }
  game.world.add(root);
  mergeArchitecture(root);
  game.jungleCrags = { root, sites, stats, counts, parts: serial - 1 };
}
