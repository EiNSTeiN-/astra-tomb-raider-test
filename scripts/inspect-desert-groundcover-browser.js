// Development observer: query the actual delivered terrain triangles, without
// using the height-field sampler that seats the plants. Instance transforms are
// rounded to the same float32 representation uploaded to the GPU.
import * as THREE from "three";
import { desertCoverAllowed } from "../src/desert-groundcover.js";

export function terrainTriangleReader(meshes) {
  const cells = new Map(),
    cell = 7,
    point = new THREE.Vector3();
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const p = mesh.geometry.attributes.position,
      index = mesh.geometry.index,
      vertices = new Float64Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      vertices.set(point.toArray(), i * 3);
    }
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const a = (index ? index.getX(i) : i) * 3,
        b = (index ? index.getX(i + 1) : i + 1) * 3,
        c = (index ? index.getX(i + 2) : i + 2) * 3,
        minX = Math.min(vertices[a], vertices[b], vertices[c]),
        maxX = Math.max(vertices[a], vertices[b], vertices[c]),
        minZ = Math.min(vertices[a + 2], vertices[b + 2], vertices[c + 2]),
        maxZ = Math.max(vertices[a + 2], vertices[b + 2], vertices[c + 2]),
        triangle = { vertices, a, b, c, minX, maxX, minZ, maxZ };
      for (let z = Math.floor(minZ / cell); z <= Math.floor(maxZ / cell); z++)
        for (
          let x = Math.floor(minX / cell);
          x <= Math.floor(maxX / cell);
          x++
        ) {
          const key = `${x},${z}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(triangle);
        }
    }
  }
  return (x, z) => {
    let height = -Infinity;
    for (const { vertices: p, a, b, c, minX, maxX, minZ, maxZ } of cells.get(
      `${Math.floor(x / cell)},${Math.floor(z / cell)}`,
    ) || []) {
      if (
        x < minX - 1e-8 ||
        x > maxX + 1e-8 ||
        z < minZ - 1e-8 ||
        z > maxZ + 1e-8
      )
        continue;
      const denominator =
        (p[b + 2] - p[c + 2]) * (p[a] - p[c]) +
        (p[c] - p[b]) * (p[a + 2] - p[c + 2]);
      if (Math.abs(denominator) < 1e-12) continue;
      const u =
          ((p[b + 2] - p[c + 2]) * (x - p[c]) +
            (p[c] - p[b]) * (z - p[c + 2])) /
          denominator,
        v =
          ((p[c + 2] - p[a + 2]) * (x - p[c]) +
            (p[a] - p[c]) * (z - p[c + 2])) /
          denominator,
        w = 1 - u - v;
      if (Math.min(u, v, w) >= -1e-8)
        height = Math.max(height, u * p[a + 1] + v * p[b + 1] + w * p[c + 1]);
    }
    return Number.isFinite(height) ? height : null;
  };
}

export function inspectDesertGroundcover(game, limitPlants = Infinity) {
  const cover = game.desertGroundcover;
  if (!cover) throw Error("Load the desert groundcover first");
  const terrain = terrainTriangleReader(game.terrainMeshes),
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
      !desertCoverAllowed(
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
    for (const root of specimen.roots) {
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
