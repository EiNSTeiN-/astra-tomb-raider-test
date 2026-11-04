import * as T from "three";

function faces(meshes, select) {
  const result = [];
  for (const mesh of meshes) {
    const p = mesh.geometry.attributes.position,
      ids = mesh.geometry.index;
    for (let i = 0; i < (ids?.count ?? p.count); i += 3) {
      const first = ids ? ids.getX(i) : i;
      if (!select(mesh, first)) continue;
      const v = [0, 1, 2].map((j) =>
          new T.Vector3()
            .fromBufferAttribute(p, ids ? ids.getX(i + j) : i + j)
            .applyMatrix4(mesh.matrixWorld),
        ),
        tri = new T.Triangle(...v);
      result.push({
        v,
        normal: tri.getNormal(new T.Vector3()),
        box: new T.Box3().setFromPoints(v),
      });
    }
  }
  return result;
}
function height(faces, x, z) {
  let highest = -Infinity;
  for (const {
    v: [a, b, c],
    box,
  } of faces) {
    if (
      x < box.min.x - 1e-6 ||
      x > box.max.x + 1e-6 ||
      z < box.min.z - 1e-6 ||
      z > box.max.z + 1e-6
    )
      continue;
    const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z),
      u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d,
      v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
    if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6)
      highest = Math.max(highest, u * a.y + v * b.y + (1 - u - v) * c.y);
  }
  return highest;
}

// These contacts come from delivered, batched render buffers. The factory's
// roof-height functions, anchor metadata and collision shapes are not read.
export function inspectMonasteryFinials(game) {
  game.world.updateMatrixWorld(true);
  const report = {
    finials: 0,
    seatingProbes: 0,
    jointProbes: 0,
    minimumRoofSeat: Infinity,
    maximumRoofSeat: -Infinity,
    minimumBodySeat: Infinity,
    maximumBodySeat: -Infinity,
    minimumSnowClearance: Infinity,
    failures: [],
  };
  for (const patch of game.monasteryPatches || []) {
    const meshes = patch.root.children.filter((m) => m.isMesh),
      cast = faces(
        meshes,
        (m, i) => (m.geometry.attributes.monasteryFinial?.getX(i) ?? 0) > 0,
      );
    if (!cast.length) {
      if (patch.house.plan)
        report.failures.push({
          court: patch.root.name,
          kind: "missing finial",
        });
      continue;
    }
    report.finials++;
    const slate = faces(
        meshes,
        (m, i) =>
          m.material.name === "Monastery slate roof" &&
          m.geometry.attributes.monasteryPavilion?.getX(i) === 2,
      ).filter((f) => f.normal.y > 1e-6),
      snow = faces(
        meshes,
        (m, i) =>
          m.material.name === "Drifted roof snow" &&
          m.geometry.attributes.monasteryPavilion?.getX(i) === 2,
      ).filter((f) => f.normal.y > 1e-6),
      base = faces(
        meshes,
        (m, i) => m.geometry.attributes.monasteryFinial?.getX(i) === 1,
      ),
      bearing = base.filter((f) => f.normal.y > 1e-6),
      body = faces(
        meshes,
        (m, i) => m.geometry.attributes.monasteryFinial?.getX(i) === 2,
      );
    for (const f of base.filter((f) => f.normal.y < -1e-6))
      for (const p of [
        ...f.v,
        new T.Triangle(...f.v).getMidpoint(new T.Vector3()),
      ]) {
        const seat = height(slate, p.x, p.z) - p.y;
        report.seatingProbes++;
        report.minimumRoofSeat = Math.min(report.minimumRoofSeat, seat);
        report.maximumRoofSeat = Math.max(report.maximumRoofSeat, seat);
        if (!Number.isFinite(seat) || seat < 0.004 || seat > 0.008)
          report.failures.push({
            court: patch.root.name,
            kind: "roof seating",
            point: p.toArray(),
            seat,
          });
      }
    for (const f of body.filter((f) => f.normal.y < -0.9999))
      for (const p of [
        ...f.v,
        new T.Triangle(...f.v).getMidpoint(new T.Vector3()),
      ]) {
        const seat = height(bearing, p.x, p.z) - p.y,
          snowClearance = p.y - height(snow, p.x, p.z);
        report.jointProbes++;
        report.minimumBodySeat = Math.min(report.minimumBodySeat, seat);
        report.maximumBodySeat = Math.max(report.maximumBodySeat, seat);
        report.minimumSnowClearance = Math.min(
          report.minimumSnowClearance,
          snowClearance,
        );
        if (
          !Number.isFinite(seat) ||
          !Number.isFinite(snowClearance) ||
          seat < 0.002 ||
          seat > 0.006 ||
          snowClearance < 0.015
        )
          report.failures.push({
            court: patch.root.name,
            kind: "casting bearing",
            point: p.toArray(),
            seat,
            snowClearance,
          });
      }
  }
  if (
    report.finials !== 8 ||
    report.seatingProbes < 200 ||
    report.jointProbes !== 2048
  )
    report.failures.push({ kind: "incomplete finial coverage" });
  return report;
}

export function verifyMonasteryFinials(game) {
  const accepted = inspectMonasteryFinials(game),
    saved = [];
  if (accepted.failures.length)
    throw Error(JSON.stringify(accepted.failures.slice(0, 5)));
  try {
    for (const patch of game.monasteryPatches)
      for (const mesh of patch.root.children) {
        const p = mesh.geometry?.attributes.position,
          tag = mesh.geometry?.attributes.monasteryFinial;
        if (!tag || !tag.array.some((n) => n > 0)) continue;
        saved.push([p, tag, p.array.slice()]);
        for (let i = 0; i < p.count; i++)
          if (tag.getX(i) > 0) p.setY(i, p.getY(i) + 0.25);
        p.needsUpdate = true;
      }
    const lifted = inspectMonasteryFinials(game);
    if (lifted.failures.length !== accepted.seatingProbes)
      throw Error("Lifted mounting control was not fully detected");
    for (const [p, tag, bytes] of saved) {
      p.array.set(bytes);
      for (let i = 0; i < p.count; i++)
        if (tag.getX(i) === 2) p.setY(i, p.getY(i) + 0.25);
      p.needsUpdate = true;
    }
    const detached = inspectMonasteryFinials(game);
    if (detached.failures.length !== accepted.jointProbes)
      throw Error("Detached casting control was not fully detected");
    return {
      accepted,
      liftedFailures: lifted.failures.length,
      detachedFailures: detached.failures.length,
    };
  } finally {
    for (const [p, , bytes] of saved) {
      p.array.set(bytes);
      p.needsUpdate = true;
    }
  }
}
