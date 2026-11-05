import * as THREE from "three";
import {
  stationBlocked,
  stationEntry,
  stationSupport,
} from "../src/field-station-solids.js";

// Isolate captured exterior cells while retaining their actual matrices/planes.
// Other furniture may legitimately stand in front of an architectural probe.
function exteriorCamera(game, root) {
  const source = game.cameraSurfaces;
  return Object.assign(Object.create(Object.getPrototypeOf(source)), source, {
    cells: new Map(
      [...source.cells].map(([key, surfaces]) => [
        key,
        surfaces.filter((s) => s.parent === root),
      ]),
    ),
    dynamic: [],
    dynamicGroups: new Map(),
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
  });
}

export function inspectSolarExteriors(game) {
  game.world.updateMatrixWorld(true);
  const result = {
      buildings: 0,
      masses: 0,
      triangles: 0,
      faces: 0,
      roofs: 0,
      emptyShoulders: 0,
      rims: 0,
      inside: 0,
      sources: 0,
      failures: [],
    },
    ray = new THREE.Raycaster();
  for (const gate of game.fieldGates || []) {
    const record = gate.solarExterior;
    if (!record) continue;
    const camera = exteriorCamera(game, record.root),
      offset = gate.root.position,
      point = (x, y, z) =>
        new THREE.Vector3(x + offset.x, y + offset.y, z + offset.z),
      hit = (a, b) => {
        ray.set(a, b.clone().sub(a).normalize());
        ray.near = 0;
        ray.far = a.distanceTo(b);
        return ray.intersectObject(record.root, true)[0];
      },
      failure = (kind, data = {}) =>
        result.failures.push({ stage: gate.stage, kind, ...data });
    result.buildings++;
    result.triangles += record.triangles;
    for (const mass of record.masses) {
      result.masses++;
      const n = mass.footprint.length,
        center = mass.upper.reduce(
          (s, p) => [s[0] + p[0] / n, s[1] + p[1] / n],
          [0, 0],
        );
      // Query the delivered roof rather than assuming a nominal plan height.
      for (const vertex of [
        center,
        ...mass.upper
          .filter((_, i) => i % 2 === 0)
          .map((p) => p.map((v, j) => v * 0.65 + center[j] * 0.35)),
      ]) {
        const a = point(vertex[0], 20, vertex[1]),
          b = point(vertex[0], mass.bottom - 1, vertex[1]),
          rendered = hit(a, b),
          support = stationSupport(record.solid, a.x, a.z, Infinity);
        result.roofs++;
        if (
          !rendered ||
          support === null ||
          Math.abs(support - rendered.point.y) > 0.002
        )
          failure("roof query", {
            mass: mass.id,
            support,
            rendered: rendered?.point.toArray(),
          });
      }
      for (let face = 0; face < n; face++) {
        const next = (face + 1) % n,
          a = mass.footprint[face],
          b = mass.footprint[next];
        for (let i = 0; i <= 12; i++) {
          const t = i / 12,
            x = a[0] + (b[0] - a[0]) * t,
            z = a[1] + (b[1] - a[1]) * t,
            p = point(x, mass.bottom, z);
          result.rims++;
          if (p.y > game.groundHeight(p.x, p.z) - 0.15)
            failure("exposed footing", { mass: mass.id, p: p.toArray() });
        }
        if (
          (Math.abs(Math.abs(a[0]) - 6.9) < 1e-6 &&
            Math.abs(a[0] - b[0]) < 1e-6) ||
          (Math.abs(a[1] + 6.65) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6)
        )
          continue;
        const t = 0.72,
          y = mass.bottom + (mass.height - 0.24 - mass.bottom) * t,
          at = (j) =>
            mass.footprint[j].map((v, k) => v + (mass.upper[j][k] - v) * t),
          aa = at(face),
          bb = at(next),
          dx = bb[0] - aa[0],
          dz = bb[1] - aa[1],
          length = Math.hypot(dx, dz),
          normal = new THREE.Vector3(dz / length, 0, -dx / length),
          middle = point((aa[0] + bb[0]) / 2, y, (aa[1] + bb[1]) / 2),
          from = middle.clone().addScaledVector(normal, 1.1),
          to = middle.clone().addScaledVector(normal, -0.3);
        if (!stationBlocked(record.solid, from.x, from.y, from.z, 0, 0)) {
          const rendered = hit(from, to),
            physical = stationEntry(record.solid, from, to),
            entry = camera.entry(from, to);
          result.faces++;
          if (
            !rendered ||
            physical === null ||
            Math.abs(physical - rendered.distance / from.distanceTo(to)) >
              0.0002 ||
            entry > rendered.distance / from.distanceTo(to)
          )
            failure("face query", {
              mass: mass.id,
              physical,
              camera: entry,
              rendered: rendered?.distance / from.distanceTo(to),
            });
        }
        const empty = middle.clone().addScaledVector(normal, 0.55),
          far = empty.clone().addScaledVector(normal, 15),
          rendered = hit(far, empty),
          physical = stationEntry(record.solid, far, empty);
        if (!rendered && physical === null) {
          result.emptyShoulders++;
          if (camera.entry(far, empty) !== 1)
            failure("boxed empty shoulder", { mass: mass.id, face });
        }
      }
    }
    for (const x of [-5.3, 0, 5.3])
      for (const z of [-5.3, 0, 5.3]) {
        const p = point(x, 1, z);
        result.inside++;
        if (stationBlocked(record.solid, p.x, p.y, p.z, 1.8, 0))
          failure("intrudes on room", { p: p.toArray() });
      }
    for (const s of game.soundSources || []) {
      result.sources++;
      if (stationBlocked(record.solid, s.x, s.y, s.z, 0.01, 0))
        failure("buried sound origin", { id: s.id });
    }
  }
  return result;
}
