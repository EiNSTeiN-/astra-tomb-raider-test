import * as THREE from "three";
import { closedMeshReader } from "./inspect-explorer-solids-browser.js";
import {
  stationSupport,
  stationEntry,
  stationBlocked,
} from "../src/field-station-solids.js";

// Partition the delivered batched buffers by their retained part attribute.
// Positions, topology, bearing and contact come from triangles, not the plan.
export function crownRenderedParts(crown) {
  const parts = crown.parts.map((meta) => ({
    ...meta,
    positions: [],
    edges: new Map(),
  }));
  for (const root of [crown.root, crown.detail]) {
    root.updateWorldMatrix(true, true);
    root.traverse((mesh) => {
      if (!mesh.isMesh) return;
      for (const a of Object.values(mesh.geometry.attributes))
        if (!a.array.every(Number.isFinite))
          throw Error("Nonfinite crown buffer");
      const { position: p, crownPart: tag } = mesh.geometry.attributes,
        index = mesh.geometry.index;
      for (let i = 0; i < (index?.count ?? p.count); i += 3) {
        const ids = [0, 1, 2].map((k) => (index ? index.getX(i + k) : i + k));
        if (!tag || ids.some((j) => tag.getX(j) !== tag.getX(ids[0])))
          throw Error("Missing or mixed crown part");
        const part = parts[tag.getX(ids[0])];
        for (const j of ids)
          part.positions.push(
            ...new THREE.Vector3()
              .fromBufferAttribute(p, j)
              .applyMatrix4(mesh.matrixWorld)
              .toArray(),
          );
      }
    });
  }
  return parts.map((part) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(part.positions, 3),
    );
    // Keep world coordinates in double precision for topology. The temporary
    // reader buffer uses the precision of a standalone GPU position buffer.
    const points = [];
    for (let i = 0; i < part.positions.length; i += 3)
      points.push(new THREE.Vector3(...part.positions.slice(i, i + 3)));
    const bounds = new THREE.Box3().setFromPoints(points),
      origin = bounds.getCenter(new THREE.Vector3());
    let volume = 0,
      triangles = 0;
    const key = (p) =>
      p
        .toArray()
        .map((v) => v.toFixed(5))
        .join(",");
    for (let i = 0; i < points.length; i += 3) {
      const a = points[i],
        b = points[i + 1],
        c = points[i + 2],
        t = new THREE.Triangle(a, b, c);
      if (t.getArea() < 1e-10) continue;
      triangles++;
      volume +=
        a
          .clone()
          .sub(origin)
          .dot(b.clone().sub(origin).cross(c.clone().sub(origin))) / 6;
      for (const [p, q] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const ka = key(p),
          kb = key(q),
          k = [ka, kb].sort().join("|"),
          record = part.edges.get(k) || { count: 0, winding: 0 };
        record.count++;
        record.winding += ka < kb ? 1 : -1;
        part.edges.set(k, record);
      }
    }
    const mesh = new THREE.Mesh(
      geometry,
      crown.root.children.find((m) => m.isMesh).material,
    );
    mesh.updateMatrixWorld(true);
    return {
      ...part,
      points,
      bounds,
      volume,
      triangles,
      geometry,
      mesh,
      inside: part.closed ? closedMeshReader([mesh], 0.3) : null,
    };
  });
}

function connected(a, b) {
  const box = a.bounds.clone().intersect(b.bounds);
  if (box.isEmpty()) return false;
  // Exact interior witnesses inside the intersection volume, rather than an
  // overlapping bounding-box assertion. Embedded face vertices catch thin joins.
  for (const [source, target] of [
    [a, b],
    [b, a],
  ])
    if (target.inside)
      for (const p of source.points)
        if (box.containsPoint(p) && target.inside(p) > 0.0001) return true;
  if (a.inside && b.inside) {
    const p = new THREE.Vector3();
    for (let x = 0; x < 7; x++)
      for (let y = 0; y < 7; y++)
        for (let z = 0; z < 7; z++) {
          p.set(
            THREE.MathUtils.lerp(box.min.x, box.max.x, (x + 0.5) / 7),
            THREE.MathUtils.lerp(box.min.y, box.max.y, (y + 0.5) / 7),
            THREE.MathUtils.lerp(box.min.z, box.max.z, (z + 0.5) / 7),
          );
          if (a.inside(p) > 0.0001 && b.inside(p) > 0.0001) return true;
        }
  }
  return false;
}

export function inspectDesertCrowns(game) {
  const report = {
    crowns: 0,
    parts: 0,
    triangles: 0,
    contacts: 0,
    bearingQueries: 0,
    bearingContacts: 0,
    panelQueries: 0,
    supportQueries: 0,
    largestSupportError: 0,
    styles: [],
    failures: [],
  };
  game.world.updateMatrixWorld(true);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    ray = new THREE.Raycaster();
  try {
    for (const patch of game.desertPatches) {
      const crown = patch.crown;
      if (!crown) throw Error("Missing court crown");
      report.crowns++;
      report.styles.push(crown.style);
      const parts = crownRenderedParts(crown);
      try {
        report.parts += parts.length;
        report.triangles += parts.reduce((n, p) => n + p.triangles, 0);
        for (const p of parts)
          if (
            p.closed &&
            (p.volume <= 0 ||
              [...p.edges.values()].some(
                (e) => e.count !== 2 || e.winding !== 0,
              ))
          )
            report.failures.push({
              court: crown.roomIndex,
              part: p.id,
              name: p.name,
              kind: "unsealed or reversed solid",
              volume: p.volume,
              badEdges: [...p.edges.values()].filter(
                (e) => e.count !== 2 || e.winding !== 0,
              ).length,
            });
        const graph = parts.map(() => []);
        for (let a = 0; a < parts.length; a++)
          for (let b = a + 1; b < parts.length; b++)
            if (connected(parts[a], parts[b])) {
              graph[a].push(b);
              graph[b].push(a);
              report.contacts++;
            }
        const reached = new Set([0]),
          queue = [0];
        for (let i = 0; i < queue.length; i++)
          for (const b of graph[queue[i]])
            if (!reached.has(b)) {
              reached.add(b);
              queue.push(b);
            }
        for (const p of parts)
          if (!reached.has(p.id))
            report.failures.push({
              court: crown.roomIndex,
              part: p.id,
              name: p.name,
              kind: "unsupported part",
            });
        const structural = closedMeshReader(
          parts.filter((p) => !p.fine).map((p) => p.mesh),
          0.4,
        );
        for (const p of parts.filter((p) => !p.closed)) {
          let missing = 0;
          for (const point of p.points)
            if (point.z < p.bounds.min.z + 0.001) {
              report.panelQueries++;
              if (structural(point) === null) missing++;
            }
          if (missing)
            report.failures.push({
              court: crown.roomIndex,
              part: p.id,
              kind: "detached relief backing",
              missing,
            });
        }
        const bearing = parts[0],
          probeMeshes = patch.root.children
            .filter((m) => m.isMesh)
            .map((m) => {
              const p = new THREE.Mesh(m.geometry, material);
              p.matrixAutoUpdate = false;
              p.matrix.copy(m.matrixWorld);
              p.updateMatrixWorld(true);
              return p;
            });
        let seated = 0,
          total = 0;
        const bs = bearing.bounds.getSize(new THREE.Vector3()),
          bc = bearing.bounds.getCenter(new THREE.Vector3());
        bearing.mesh.material = material;
        for (let x = 0; x < 13; x++)
          for (let z = 0; z < 3; z++) {
            const px = bc.x + ((x + 0.31) / 13 - 0.5) * bs.x * 0.94,
              pz = bc.z + (z - 1) * bs.z * 0.35;
            ray.set(
              new THREE.Vector3(px, bearing.bounds.min.y - 1, pz),
              new THREE.Vector3(0, 1, 0),
            );
            const bottom = ray.intersectObject(bearing.mesh, false)[0]?.point.y;
            ray.set(
              new THREE.Vector3(px, bearing.bounds.min.y + 0.3, pz),
              new THREE.Vector3(0, -1, 0),
            );
            const support = ray.intersectObjects(probeMeshes, false)[0]?.point
              .y;
            total++;
            report.bearingQueries++;
            if (
              bottom !== undefined &&
              support !== undefined &&
              bottom - support < 0.001 &&
              bottom - support > -0.12
            ) {
              seated++;
              report.bearingContacts++;
            }
          }
        // A cornice can bridge its narrow mortar joints; most sampled bearing
        // face must intersect the delivered cap, never merely touch its bound.
        if (seated / total < 0.9)
          report.failures.push({
            court: crown.roomIndex,
            kind: "unsupported crown bearing",
            seated,
            total,
          });
        const physicalMeshes = crown.root.children
            .filter((m) => m.isMesh)
            .map((m) => {
              const p = new THREE.Mesh(m.geometry, material);
              p.matrixAutoUpdate = false;
              p.matrix.copy(m.matrixWorld);
              p.updateMatrixWorld(true);
              return p;
            }),
          bounds = new THREE.Box3().setFromObject(crown.root),
          size = bounds.getSize(new THREE.Vector3());
        for (let x = 0; x < 13; x++)
          for (let z = 0; z < 3; z++) {
            const px = bounds.min.x + (size.x * (x + 0.5)) / 13,
              pz = bounds.min.z + (size.z * (z + 0.5)) / 3;
            ray.set(
              new THREE.Vector3(px, bounds.max.y + 1, pz),
              new THREE.Vector3(0, -1, 0),
            );
            const visible = ray.intersectObjects(physicalMeshes, false)[0]
              ?.point.y;
            const support = stationSupport(crown.solid, px, pz, Infinity);
            report.supportQueries++;
            const error =
              visible === undefined
                ? support === null
                  ? 0
                  : Infinity
                : support === null
                  ? Infinity
                  : Math.abs(visible - support);
            report.largestSupportError = Math.max(
              report.largestSupportError,
              error,
            );
            if (error > 0.0001)
              report.failures.push({
                court: crown.roomIndex,
                kind: "render/support mismatch",
                px,
                pz,
                visible,
                support,
                error,
              });
          }
      } finally {
        parts.forEach((p) => p.geometry.dispose());
      }
    }
  } finally {
    material.dispose();
  }
  return report;
}

// Apertures at open sectors, and a stone control alongside each. Compare
// actual render hits with the body/sight/projectile and camera query services.
export function inspectCrownApertures(game) {
  game.world.updateMatrixWorld(true);
  const report = { voids: 0, stone: 0, failures: [] },
    ray = new THREE.Raycaster();
  for (const patch of game.desertPatches) {
    const c = patch.crown,
      i = c.roomIndex;
    const samples =
      i === 1
        ? [
            [0, 1.5, true],
            [-2.45, 2.3, false],
          ]
        : i === 2
          ? [
              [
                1.2 * Math.cos(Math.PI / 12),
                3.38 + 1.2 * Math.sin(Math.PI / 12),
                true,
              ],
              [2.15, 3.38, false],
            ]
          : i === 6
            ? [
                [0, 2, true],
                [-3, 2, false],
              ]
            : i === 8
              ? [
                  [0, 3, true],
                  [-2.7, 2, false],
                ]
              : i === 9
                ? [
                    [
                      2.05 * Math.cos(Math.PI / 20),
                      3 + 2.05 * Math.sin(Math.PI / 20),
                      true,
                    ],
                    [3.0, 3.0, false],
                  ]
                : [];
    for (const [x, y, empty] of samples) {
      const a = c.root.position.clone().add(new THREE.Vector3(x, y, 4)),
        b = c.root.position.clone().add(new THREE.Vector3(x, y, -4));
      ray.set(a, b.clone().sub(a).normalize());
      ray.far = 8;
      const visible =
          ray.intersectObjects(
            [...c.root.children, ...c.detail.children],
            false,
          ).length > 0,
        physical = stationEntry(c.solid, a, b, 0) !== null,
        camera = game.cameraSurfaces.entry(a, b, 0) < 1,
        body = stationBlocked(
          c.solid,
          a.x,
          a.y - 0.05,
          c.root.position.z,
          0.1,
          0,
        );
      report[empty ? "voids" : "stone"]++;
      if (
        visible === empty ||
        physical === empty ||
        camera === empty ||
        body === empty
      )
        report.failures.push({
          court: i,
          x,
          y,
          empty,
          visible,
          physical,
          camera,
          body,
        });
    }
  }
  return report;
}
