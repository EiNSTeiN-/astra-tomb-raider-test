import * as THREE from "three";
import { terrainTriangleReader } from "./inspect-desert-groundcover-browser.js";
import {
  closedComponentMeshes,
  closedMeshReader,
} from "./inspect-explorer-solids-browser.js";
import {
  stationEntry,
  stationSupport,
  stationBlocked,
} from "../src/field-station-solids.js";

// Inspect delivered draw triangles after batching, independently of the
// profile sampler and geometry constructor that fitted the cliff pieces.
export function inspectJungleCrags(
  game,
  terrain = terrainTriangleReader(game.terrainMeshes),
) {
  const report = {
      parts: 0,
      triangles: 0,
      backProbes: 0,
      edgeProbes: 0,
      missing: 0,
      exposed: 0,
      minimumBurial: Infinity,
      witnesses: [],
    },
    parts = new Set(),
    vertices = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    q = new THREE.Vector3();
  const sample = (point, kind, part) => {
    const floor = terrain(point.x, point.z),
      burial = floor === null ? null : floor - point.y;
    report[kind]++;
    if (floor === null) report.missing++;
    else report.minimumBurial = Math.min(report.minimumBurial, burial);
    if (burial !== null && burial >= 0.005) return;
    report.exposed++;
    if (report.witnesses.length < 16)
      report.witnesses.push({ part, kind, point: point.toArray(), burial });
  };
  for (const mesh of game.jungleCrags.root.children) {
    mesh.updateWorldMatrix(true, false);
    const {
        position: p,
        cragBack: back,
        cragGrid: grid,
        cragPart: part,
      } = mesh.geometry.attributes,
      index = mesh.geometry.index,
      count = index?.count ?? p.count;
    for (let i = 0; i < count; i += 3) {
      const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j)),
        id = part.getX(ids[0]);
      parts.add(id);
      report.triangles++;
      ids.forEach((id, j) =>
        vertices[j].fromBufferAttribute(p, id).applyMatrix4(mesh.matrixWorld),
      );
      if (ids.every((id) => back.getX(id))) {
        for (const weights of [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
          [1 / 3, 1 / 3, 1 / 3],
          [0.5, 0.5, 0],
          [0, 0.5, 0.5],
          [0.5, 0, 0.5],
        ]) {
          q.set(0, 0, 0);
          vertices.forEach((v, j) => q.addScaledVector(v, weights[j]));
          sample(q, "backProbes", id);
        }
      }
      if (ids.some((id) => back.getX(id))) continue;
      for (let j = 0; j < 3; j++) {
        const a = ids[j],
          b = ids[(j + 1) % 3];
        if (
          !["getX", "getY"].some(
            (axis) =>
              grid[axis](a) === grid[axis](b) && [0, 1].includes(grid[axis](a)),
          )
        )
          continue;
        for (const t of [0, 0.25, 0.5, 0.75, 1])
          sample(
            q.lerpVectors(vertices[j], vertices[(j + 1) % 3], t),
            "edgeProbes",
            id,
          );
      }
    }
  }
  report.parts = parts.size;
  return report;
}

export function verifyJungleCrags(game) {
  const terrain = terrainTriangleReader(game.terrainMeshes),
    accepted = inspectJungleCrags(game, terrain),
    closed = closedComponentMeshes(game.jungleCrags.root.children),
    saved = [];
  try {
    if (
      !accepted.backProbes ||
      !accepted.edgeProbes ||
      accepted.exposed ||
      accepted.missing ||
      closed.stats.openComponents ||
      closed.stats.closedComponents !== accepted.parts
    )
      throw Error(
        "Invalid delivered cliff joins: " +
          JSON.stringify({ accepted, closed: closed.stats }),
      );
    for (const mesh of game.jungleCrags.root.children) {
      const p = mesh.geometry.attributes.position;
      saved.push([p, p.array.slice()]);
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 200);
    }
    const displaced = inspectJungleCrags(game, terrain);
    if (displaced.exposed !== displaced.backProbes + displaced.edgeProbes)
      throw Error("Displaced cliff control missed a join");
    return { accepted, closed: closed.stats, displaced: displaced.exposed };
  } finally {
    closed.dispose();
    for (const [p, bytes] of saved) {
      p.array.set(bytes);
      p.needsUpdate = true;
    }
  }
}

// Match copied camera records to delivered bounds, then compare the actual
// registered queries with independent rays through each rendered assembly.
export function inspectJungleCragQueries(game) {
  const records = new Map(),
    root = game.jungleCrags.root,
    key = (b) =>
      [...b.min.toArray(), ...b.max.toArray()]
        .map((n) => n.toFixed(5))
        .join(","),
    report = {
      assemblies: 0,
      captures: 0,
      rays: 0,
      inside: 0,
      ledges: 0,
      skippedInside: 0,
      maximumError: 0,
      failures: [],
    },
    ground = terrainTriangleReader(game.terrainMeshes);
  for (const mesh of root.children) {
    const p = mesh.geometry.attributes.position,
      back = mesh.geometry.attributes.cragBack,
      part = mesh.geometry.attributes.cragPart,
      index = mesh.geometry.index;
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j)),
        id = part.getX(ids[0]),
        points = ids.map((id) =>
          new THREE.Vector3()
            .fromBufferAttribute(p, id)
            .applyMatrix4(mesh.matrixWorld),
        );
      if (!records.has(id))
        records.set(id, { positions: [], fronts: [], box: new THREE.Box3() });
      const r = records.get(id);
      for (const point of points) {
        r.positions.push(...point.toArray());
        r.box.expandByPoint(point);
      }
      if (ids.every((id) => !back.getX(id)))
        r.fronts.push(new THREE.Triangle(...points));
    }
  }
  const surfaces = new Set(
      [...game.cameraSurfaces.cells.values()]
        .flat()
        .filter((s) => s.parent === root),
    ),
    captures = new Map([...surfaces].map((s) => [key(s.bounds), s])),
    material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    ray = new THREE.Raycaster();
  report.captures = surfaces.size;
  try {
    for (const site of game.jungleCrags.sites) {
      const parts = site.parts.map((id) => records.get(id)),
        own = new Set(),
        positions = parts.flatMap((p) => p.positions);
      for (const part of parts) {
        const capture = captures.get(key(part.box));
        if (!capture?.kernel)
          throw Error("A delivered crag lacks its registered camera kernel");
        own.add(capture);
      }
      const camera = Object.assign(
          Object.create(Object.getPrototypeOf(game.cameraSurfaces)),
          game.cameraSurfaces,
          {
            cells: new Map(
              [...game.cameraSurfaces.cells].map(([k, cells]) => [
                k,
                cells.filter((s) => own.has(s)),
              ]),
            ),
            dynamic: [],
            dynamicGroups: new Map(),
          },
        ),
        geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      const mesh = new THREE.Mesh(geometry, material),
        reader = closedMeshReader([mesh]);
      mesh.updateMatrixWorld();
      report.assemblies++;
      try {
        for (const part of parts)
          // Narrow shoulders have fewer cells. Sample their walls more densely
          // and inspect every upward face that could provide a standing tread.
          for (let i = 0; i < part.fronts.length; i++) {
            const triangle = part.fronts[i],
              normal = triangle.getNormal(new THREE.Vector3());
            if (i % (site.width < 12 ? 7 : 17) && normal.y <= 0.65) continue;
            const center = triangle.getMidpoint(new THREE.Vector3());
            if (center.y < ground(center.x, center.z) + 0.05) continue;
            const start = center.clone().addScaledVector(normal, 5),
              end = center.clone().addScaledVector(normal, -5);
            if (reader(start) !== null) {
              report.skippedInside++;
              continue;
            }
            ray.set(start, end.clone().sub(start).normalize());
            ray.far = 10;
            const hit = ray.intersectObject(mesh)[0];
            if (!hit)
              throw Error("An exposed draw face missed its independent ray");
            const physical = stationEntry(site.solid, start, end),
              optical = camera.entry(start, end, 0),
              padded = camera.entry(start, end, 0.28),
              expected = hit.distance / 10,
              error =
                Math.max(
                  Math.abs((physical ?? 1) - expected),
                  Math.abs(optical - expected),
                ) * 10;
            report.rays++;
            report.maximumError = Math.max(report.maximumError, error);
            if (error > 0.0003 || padded > optical)
              report.failures.push({
                site: site.id,
                kind: "ray",
                physical,
                optical,
                expected,
                error,
              });
            const inside = center.clone().addScaledVector(normal, -0.06);
            if (reader(inside) > 0.025) {
              report.inside++;
              if (
                !stationBlocked(
                  site.solid,
                  inside.x,
                  inside.y,
                  inside.z,
                  0.01,
                  0,
                )
              )
                report.failures.push({
                  site: site.id,
                  kind: "inside",
                  point: inside.toArray(),
                });
            }
            if (normal.y > 0.65) {
              const support = stationSupport(
                site.solid,
                center.x,
                center.z,
                center.y - 0.199,
              );
              report.ledges++;
              if (support === null || Math.abs(support - center.y) > 0.0003)
                report.failures.push({
                  site: site.id,
                  kind: "support",
                  support,
                  expected: center.y,
                });
            }
          }
      } finally {
        geometry.dispose();
      }
    }
  } finally {
    material.dispose();
  }
  return report;
}
