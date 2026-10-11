// Development observers for a loaded desert. Read delivered world buffers;
// placement heights and smoothing masks are not the surface measurement.
import * as THREE from "three";
import { desertRouteDistance } from "../src/desert-geology.js";
import { terrainTriangleReader } from "./inspect-desert-groundcover-browser.js";

export function inspectDesertBankSurface(game) {
  const { width, step, waters } = game.terrainProfile,
    vertices = new Map(),
    point = new THREE.Vector3(),
    normal = new THREE.Vector3(),
    turns = [],
    report = {
      chunks: game.terrainMeshes.length,
      triangles: 0,
      vertices: 0,
      duplicateVertices: 0,
      seamErrors: 0,
      invalidVertices: 0,
      invalidNormals: 0,
      offGridVertices: 0,
    };
  for (const mesh of game.terrainMeshes) {
    mesh.updateWorldMatrix(true, false);
    const p = mesh.geometry.attributes.position,
      n = mesh.geometry.attributes.normal,
      normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    report.triangles += (mesh.geometry.index?.count ?? p.count) / 3;
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      normal.fromBufferAttribute(n, i).applyMatrix3(normalMatrix);
      const x = Math.round(point.x / step),
        z = Math.round(point.z / step),
        key = z * width + x;
      if (!point.toArray().every(Number.isFinite)) report.invalidVertices++;
      if (
        !normal.toArray().every(Number.isFinite) ||
        Math.abs(normal.length() - 1) > 1e-5
      )
        report.invalidNormals++;
      if (
        Math.abs(point.x - x * step) > 1e-5 ||
        Math.abs(point.z - z * step) > 1e-5
      )
        report.offGridVertices++;
      const previous = vertices.get(key);
      if (previous) {
        report.duplicateVertices++;
        if (
          point.distanceTo(previous.point) > 1e-6 ||
          normal.distanceTo(previous.normal) > 1e-6
        )
          report.seamErrors++;
      } else
        vertices.set(key, { point: point.clone(), normal: normal.clone() });
    }
  }
  report.vertices = vertices.size;
  for (const [key, { point: p }] of vertices) {
    const x = Math.round(p.x / step),
      z = Math.round(p.z / step),
      d = desertRouteDistance(game.map, p.x, p.z);
    if (
      x <= 0 ||
      z <= 0 ||
      x >= width - 1 ||
      z >= width - 1 ||
      d <= 0 ||
      d >= 7
    )
      continue;
    if (
      waters.some(
        (w) =>
          Math.hypot(p.x - w.x, p.z - w.z) <=
          Math.hypot(w.bedWidth ?? w.width, w.bedLength ?? w.length) / 2 + 12,
      )
    )
      continue;
    const left = vertices.get(key - 1)?.point,
      right = vertices.get(key + 1)?.point,
      near = vertices.get(key - width)?.point,
      far = vertices.get(key + width)?.point;
    if (!left || !right || !near || !far) continue;
    const dx = Math.abs(
        Math.atan((right.y - p.y) / step) - Math.atan((p.y - left.y) / step),
      ),
      dz = Math.abs(
        Math.atan((far.y - p.y) / step) - Math.atan((p.y - near.y) / step),
      );
    turns.push((Math.max(dx, dz) * 180) / Math.PI);
  }
  turns.sort((a, b) => a - b);
  report.crestTurns = {
    samples: turns.length,
    p90: turns[Math.floor(turns.length * 0.9)],
    p99: turns[Math.floor(turns.length * 0.99)],
    maximum: turns.at(-1),
  };
  return report;
}

export function inspectDesertBankContacts(game) {
  game.world.updateMatrixWorld(true);
  const terrain = terrainTriangleReader(game.terrainMeshes),
    matrix = new THREE.Matrix4(),
    point = new THREE.Vector3(),
    ray = new THREE.Raycaster(),
    report = {
      palms: 0,
      palmRoots: 0,
      highestPalmRoot: -Infinity,
      exposedPalmRoots: 0,
      palmEdgeProbes: 0,
      highestPalmEdge: -Infinity,
      exposedPalmEdges: 0,
      foundations: 0,
      foundationProbes: 0,
      highestFoundation: -Infinity,
      exposedFoundations: 0,
      missing: 0,
      failures: [],
    };
  const fail = (r) => {
    if (report.failures.length < 25) report.failures.push(r);
  };
  for (const [patchIndex, patch] of game.palmPatches.entries()) {
    for (const [instance, pose] of patch.matrices.entries()) {
      report.palms++;
      matrix.fromArray(new Float32Array(pose.elements));
      for (const [tier, meshes] of patch.tiers.entries()) {
        const trunk = meshes.find((m) => m.material.name === "Date palm bark"),
          p = trunk.geometry.attributes.position,
          uv = trunk.geometry.attributes.uv,
          ring = [];
        for (let i = 0; i < p.count; i++) {
          if (uv.getY(i) !== 0) continue;
          point
            .fromBufferAttribute(p, i)
            .applyMatrix4(matrix)
            .applyMatrix4(trunk.matrixWorld);
          ring.push(point.clone());
          const floor = terrain(point.x, point.z),
            gap = floor === null ? null : point.y - floor;
          report.palmRoots++;
          if (floor === null) report.missing++;
          else {
            report.highestPalmRoot = Math.max(report.highestPalmRoot, gap);
            if (gap > -0.005) report.exposedPalmRoots++;
          }
          if (floor === null || gap > -0.005)
            fail({
              kind: "palm",
              patchIndex,
              instance,
              tier,
              point: point.toArray(),
              floor,
              gap,
            });
        }
        for (let i = 0; i < ring.length; i++)
          for (let j = 1; j < 16; j++) {
            point.copy(ring[i]).lerp(ring[(i + 1) % ring.length], j / 16);
            const floor = terrain(point.x, point.z),
              gap = floor === null ? null : point.y - floor;
            report.palmEdgeProbes++;
            if (floor === null) report.missing++;
            else {
              report.highestPalmEdge = Math.max(report.highestPalmEdge, gap);
              if (gap > -0.005) report.exposedPalmEdges++;
            }
            if (floor === null || gap > -0.005)
              fail({
                kind: "palmEdge",
                patchIndex,
                instance,
                tier,
                point: point.toArray(),
                floor,
                gap,
              });
          }
      }
    }
  }
  for (const [court, patch] of game.desertPatches.entries()) {
    for (const [index, f] of patch.foundations.entries()) {
      report.foundations++;
      // The closed flat core covers 82% of the authored footing dimensions.
      // Query inside that core against actual merged opaque masonry bottoms.
      for (let iz = 0; iz <= 10; iz++)
        for (let ix = 0; ix <= 10; ix++) {
          const x =
              patch.root.position.x + f.x + (ix / 10 - 0.5) * f.width * 0.78,
            z = patch.root.position.z + f.z + (iz / 10 - 0.5) * f.depth * 0.78,
            floor = terrain(x, z);
          ray.set(
            new THREE.Vector3(x, f.bottom - 1, z),
            new THREE.Vector3(0, 1, 0),
          );
          ray.far = f.top - f.bottom + 2;
          const underside = ray.intersectObject(patch.root, true)[0],
            gap =
              floor === null || !underside ? null : underside.point.y - floor;
          report.foundationProbes++;
          if (gap === null) report.missing++;
          else {
            report.highestFoundation = Math.max(report.highestFoundation, gap);
            if (gap > 0.015) report.exposedFoundations++;
          }
          if (gap === null || gap > 0.015)
            fail({ kind: "foundation", court, index, x, z, floor, gap });
        }
    }
  }
  return report;
}

export function inspectDesertStandingSurface(game) {
  const terrain = terrainTriangleReader(game.terrainMeshes),
    report = {
      samples: 0,
      missing: 0,
      highestGap: -Infinity,
      lowestGap: Infinity,
      failures: [],
    };
  for (let z = 0; z < game.map.size; z++)
    for (let x = 0; x < game.map.size; x++) {
      if (!game.map.grid[z][x]) continue;
      for (const dx of [-3.5, -2, 0, 2, 3.5])
        for (const dz of [-3.5, -2, 0, 2, 3.5]) {
          const px = x * 7 + dx,
            pz = z * 7 + dz,
            floor = terrain(px, pz),
            gap = floor === null ? null : game.groundHeight(px, pz) - floor;
          report.samples++;
          if (floor === null) report.missing++;
          else {
            report.highestGap = Math.max(report.highestGap, gap);
            report.lowestGap = Math.min(report.lowestGap, gap);
          }
          if (
            (gap === null || Math.abs(gap) > 0.005) &&
            report.failures.length < 25
          )
            report.failures.push({ x: px, z: pz, floor, gap });
        }
    }
  return report;
}
