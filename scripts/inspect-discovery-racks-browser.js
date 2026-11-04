import * as T from "three";

function deliveredParts(game) {
  const parts = new Map();
  game.discoverySettingBatches.batch.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.updateWorldMatrix(true, false);
    const g = mesh.geometry,
      p = g.attributes.position,
      tags = g.attributes.discoveryRackPart,
      index = g.index;
    if (!tags) throw Error("Missing rack part identities");
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j)),
        id = tags.getX(ids[0]);
      if (!ids.every((n) => tags.getX(n) === id))
        throw Error("Mixed rack triangle");
      if (!id) continue;
      if (!parts.has(id)) parts.set(id, []);
      parts
        .get(id)
        .push(
          ids.map((n) =>
            new T.Vector3()
              .fromBufferAttribute(p, n)
              .applyMatrix4(mesh.matrixWorld),
          ),
        );
    }
  });
  return parts;
}

// Read actual batched triangles. No saved seating heights, stock transforms or
// fitted helper probes supply either side of an accepted contact measurement.
export function inspectDiscoveryRacks(game) {
  const parts = deliveredParts(game),
    normal = new T.Vector3(),
    ray = new T.Ray(),
    hit = new T.Vector3(),
    report = {
      assemblies: 0,
      parts: parts.size,
      probes: 0,
      ceilingProbes: 0,
      minimumCeilingGap: Infinity,
      minimumGap: Infinity,
      maximumGap: -Infinity,
      failures: [],
    };
  for (const joint of game.discoveryRackSeats) {
    const shelf = parts.get(joint.shelf);
    if (!shelf || joint.rests.some((id) => !parts.has(id)))
      throw Error("Missing delivered rack part");
    const rest = joint.rests.flatMap((id) => parts.get(id)),
      points = new Map();
    const keep = (p) => points.set(p.toArray().join(","), p);
    if (joint.kind === "box") {
      for (const v of rest) {
        const t = new T.Triangle(...v);
        if (t.getNormal(normal).y < -0.98) {
          v.forEach(keep);
          keep(t.getMidpoint(new T.Vector3()));
          for (let i = 0; i < 3; i++)
            keep(v[i].clone().lerp(v[(i + 1) % 3], 0.5));
        }
      }
    } else {
      const bottom = Math.min(...rest.flatMap((v) => v.map((p) => p.y)));
      for (const v of rest)
        for (const p of v) if (p.y < bottom + 0.001) keep(p);
    }
    if (!points.size) throw Error("Missing rack bearing footprint");
    report.assemblies++;
    for (const point of points.values()) {
      ray.origin.set(point.x, point.y + 0.5, point.z);
      ray.direction.set(0, -1, 0);
      let top = -Infinity;
      for (const v of shelf) {
        const tri = new T.Triangle(...v);
        if (tri.getNormal(normal).y < 0.8) continue;
        if (ray.intersectTriangle(...v, false, hit)) top = Math.max(top, hit.y);
      }
      const gap = point.y - top;
      report.probes++;
      report.minimumGap = Math.min(report.minimumGap, gap);
      report.maximumGap = Math.max(report.maximumGap, gap);
      if (!Number.isFinite(gap) || gap < -0.006 || gap > 0.01)
        report.failures.push({
          contact: "bearing",
          setting: joint.setting,
          kind: joint.kind,
          point: point.toArray(),
          gap,
        });
    }
    if (joint.ceiling) {
      const ceiling = parts.get(joint.ceiling),
        vertices = new Map();
      if (!ceiling) throw Error("Missing upper rack shelf");
      for (const id of joint.parts)
        for (const v of parts.get(id))
          for (const p of v) vertices.set(p.toArray().join(","), p);
      for (const point of vertices.values()) {
        ray.origin.set(point.x, point.y - 0.5, point.z);
        ray.direction.set(0, 1, 0);
        let underside = Infinity;
        for (const v of ceiling) {
          if (new T.Triangle(...v).getNormal(normal).y > -0.8) continue;
          if (ray.intersectTriangle(...v, false, hit))
            underside = Math.min(underside, hit.y);
        }
        const gap = underside - point.y;
        report.ceilingProbes++;
        report.minimumCeilingGap = Math.min(report.minimumCeilingGap, gap);
        if (!Number.isFinite(gap) || gap < 0.015)
          report.failures.push({
            contact: "ceiling",
            setting: joint.setting,
            kind: joint.kind,
            point: point.toArray(),
            gap,
          });
      }
    }
  }
  return report;
}

export function verifyDiscoveryRacks(game) {
  const accepted = inspectDiscoveryRacks(game),
    saved = [];
  if (accepted.failures.length)
    throw Error(JSON.stringify(accepted.failures.slice(0, 12)));
  const cargo = new Set(game.discoveryRackSeats.flatMap((j) => j.parts));
  try {
    game.discoverySettingBatches.batch.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const p = mesh.geometry.attributes.position,
        tags = mesh.geometry.attributes.discoveryRackPart,
        shift = new T.Vector3(0, 0.05, 0).applyMatrix3(
          new T.Matrix3().setFromMatrix4(mesh.matrixWorld).invert(),
        );
      saved.push([p, p.array.slice()]);
      for (let i = 0; i < p.count; i++)
        if (cargo.has(tags.getX(i)))
          p.setXYZ(
            i,
            p.getX(i) + shift.x,
            p.getY(i) + shift.y,
            p.getZ(i) + shift.z,
          );
      p.needsUpdate = true;
    });
    const lifted = inspectDiscoveryRacks(game);
    const bearingFailures = lifted.failures.filter(
      (f) => f.contact === "bearing",
    ).length;
    if (bearingFailures !== accepted.probes)
      throw Error("Lifted rack control missed bearing probes");
    return { accepted, liftedFailures: bearingFailures };
  } finally {
    for (const [p, bytes] of saved) {
      p.array.set(bytes);
      p.needsUpdate = true;
    }
  }
}
