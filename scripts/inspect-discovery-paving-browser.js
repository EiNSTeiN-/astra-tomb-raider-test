import * as T from "three";
import { terrainTriangleReader } from "./inspect-desert-groundcover-browser.js";

const cross = (a, b, c) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function hull(points) {
  const p = [...new Map(points.map((v) => [v.join(","), v])).values()].sort(
      (a, b) => a[0] - b[0] || a[1] - b[1],
    ),
    low = [],
    high = [];
  for (const v of p) {
    while (low.length > 1 && cross(low.at(-2), low.at(-1), v) <= 1e-8)
      low.pop();
    low.push(v);
  }
  for (const v of [...p].reverse()) {
    while (high.length > 1 && cross(high.at(-2), high.at(-1), v) <= 1e-8)
      high.pop();
    high.push(v);
  }
  low.pop();
  high.pop();
  return low.concat(high);
}
function overlapArea(a, b) {
  let polygon = a;
  for (let i = 0; i < b.length; i++) {
    const e = b[i],
      f = b[(i + 1) % b.length],
      out = [];
    for (let j = 0; j < polygon.length; j++) {
      const p = polygon[j],
        q = polygon[(j + 1) % polygon.length],
        dp = cross(e, f, p),
        dq = cross(e, f, q);
      if (dp >= 0) out.push(p);
      if (dp >= 0 !== dq >= 0) {
        const t = dp / (dp - dq);
        out.push(p.map((v, k) => v + (q[k] - v) * t));
      }
    }
    polygon = out;
  }
  return Math.abs(
    polygon.reduce((s, p, i) => {
      const q = polygon[(i + 1) % polygon.length];
      return s + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2,
  );
}
function inspect(game, terrain) {
  const tiles = new Map(),
    point = new T.Vector3(),
    report = {
      tiles: 0,
      faces: 0,
      probes: 0,
      minimumGap: Infinity,
      maximumGap: -Infinity,
      overlaps: 0,
      failures: [],
    };
  game.discoverySettingBatches.floors.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.updateWorldMatrix(true, false);
    const p = mesh.geometry.attributes.position,
      tags = mesh.geometry.attributes.discoveryPavingTile,
      index = mesh.geometry.index;
    if (!tags) throw Error("Missing delivered paving identity");
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j)),
        id = tags.getX(ids[0]);
      if (!id || ids.some((v) => tags.getX(v) !== id))
        throw Error("Invalid paving triangle identity");
      const v = ids.map((i) =>
          new T.Vector3()
            .fromBufferAttribute(p, i)
            .applyMatrix4(mesh.matrixWorld),
        ),
        tri = new T.Triangle(...v);
      if (!tiles.has(id)) tiles.set(id, []);
      tiles.get(id).push(...v.map((p) => [p.x, p.z]));
      report.faces++;
      if (tri.getNormal(point).y <= 0)
        report.failures.push({ id, query: "normal" });
      for (const q of [
        ...v,
        tri.getMidpoint(new T.Vector3()),
        ...v.map((p, i) => p.clone().lerp(v[(i + 1) % 3], 0.5)),
      ]) {
        const floor = terrain(q.x, q.z),
          gap = floor === null ? NaN : q.y - floor;
        report.probes++;
        report.minimumGap = Math.min(report.minimumGap, gap);
        report.maximumGap = Math.max(report.maximumGap, gap);
        if (!Number.isFinite(gap) || gap < 0.0025 || gap > 0.0035)
          report.failures.push({
            id,
            query: "ground",
            point: q.toArray(),
            gap,
          });
      }
    }
  });
  const cells = new Map(),
    pairs = new Set();
  for (const [id, points] of tiles) {
    const shape = hull(points);
    if (shape.length < 3) throw Error("Missing paving footprint");
    const xs = shape.map((p) => p[0]),
      zs = shape.map((p) => p[1]),
      near = new Set(),
      keys = [];
    for (
      let z = Math.floor(Math.min(...zs) / 7);
      z <= Math.floor(Math.max(...zs) / 7);
      z++
    )
      for (
        let x = Math.floor(Math.min(...xs) / 7);
        x <= Math.floor(Math.max(...xs) / 7);
        x++
      ) {
        const key = x + "," + z;
        keys.push(key);
        for (const item of cells.get(key) || []) near.add(item);
      }
    for (const other of near) {
      const key = [id, other.id].sort((a, b) => a - b).join(",");
      if (pairs.has(key)) continue;
      pairs.add(key);
      const area = overlapArea(shape, other.shape);
      if (area > 1e-6) {
        report.overlaps++;
        report.failures.push({ query: "overlap", tiles: [id, other.id], area });
      }
    }
    const item = { id, shape };
    for (const key of keys) {
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(item);
    }
  }
  report.tiles = tiles.size;
  return report;
}
export function inspectDiscoveryPaving(game) {
  return inspect(game, terrainTriangleReader(game.terrainMeshes));
}
export function verifyDiscoveryPaving(game) {
  const terrain = terrainTriangleReader(game.terrainMeshes),
    accepted = inspect(game, terrain),
    saved = [];
  if (!accepted.tiles || accepted.failures.length)
    throw Error(
      "Invalid paving: " + JSON.stringify(accepted.failures.slice(0, 12)),
    );
  game.discoverySettingBatches.floors.traverse((m) => {
    if (m.isMesh) saved.push([m, m.geometry.attributes.position.array.slice()]);
  });
  const restore = () => {
    for (const [m, bytes] of saved) {
      m.geometry.attributes.position.array.set(bytes);
      m.geometry.attributes.position.needsUpdate = true;
    }
  };
  try {
    for (const [m] of saved) {
      const p = m.geometry.attributes.position,
        shift = new T.Vector3(0, 0.05, 0).applyMatrix3(
          new T.Matrix3().setFromMatrix4(m.matrixWorld).invert(),
        );
      for (let i = 0; i < p.count; i++)
        p.setXYZ(
          i,
          p.getX(i) + shift.x,
          p.getY(i) + shift.y,
          p.getZ(i) + shift.z,
        );
    }
    const lifted = inspect(game, terrain),
      liftedFailures = lifted.failures.filter(
        (f) => f.query === "ground",
      ).length;
    if (liftedFailures !== accepted.probes)
      throw Error("Paving lift control missed probes");
    restore();
    const owners = new Map();
    for (const [m] of saved) {
      const p = m.geometry.attributes.position,
        tags = m.geometry.attributes.discoveryPavingTile;
      for (let i = 0; i < p.count; i++) {
        const id = tags.getX(i);
        if (!owners.has(id)) owners.set(id, []);
        owners
          .get(id)
          .push(
            new T.Vector3()
              .fromBufferAttribute(p, i)
              .applyMatrix4(m.matrixWorld),
          );
      }
    }
    const [idA, idB] = [...owners.keys()],
      centre = (id) => {
        const values = owners.get(id);
        return values
          .reduce((s, p) => s.add(p), new T.Vector3())
          .multiplyScalar(1 / values.length);
      },
      shift = centre(idA).sub(centre(idB));
    for (const [m] of saved) {
      const p = m.geometry.attributes.position,
        tags = m.geometry.attributes.discoveryPavingTile,
        local = shift
          .clone()
          .applyMatrix3(new T.Matrix3().setFromMatrix4(m.matrixWorld).invert());
      for (let i = 0; i < p.count; i++)
        if (tags.getX(i) === idB)
          p.setXYZ(i, p.getX(i) + local.x, p.getY(i), p.getZ(i) + local.z);
    }
    const overlap = inspect(game, terrain);
    if (!overlap.overlaps)
      throw Error("Paving overlap control missed moved tile");
    return { accepted, liftedFailures, overlapControl: overlap.overlaps };
  } finally {
    restore();
  }
}
