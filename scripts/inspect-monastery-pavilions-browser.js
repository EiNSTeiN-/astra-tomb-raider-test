import * as T from "three";

// Read the delivered material batches. Neither the roof height formula nor
// movement/camera kernels participate in these construction measurements.
function field(meshes, select) {
  const grid = new Map();
  for (const mesh of meshes) {
    const p = mesh.geometry.attributes.position,
      ids = mesh.geometry.index;
    for (let i = 0; i < (ids?.count ?? p.count); i += 3) {
      if (!select(mesh, ids ? ids.getX(i) : i)) continue;
      const v = [0, 1, 2].map((j) =>
        new T.Vector3()
          .fromBufferAttribute(p, ids ? ids.getX(i + j) : i + j)
          .applyMatrix4(mesh.matrixWorld),
      );
      const y = new T.Triangle(...v).getNormal(new T.Vector3()).y;
      if (Math.abs(y) < 1e-6) continue;
      const box = new T.Box3().setFromPoints(v);
      for (let z = Math.floor(box.min.z); z <= Math.floor(box.max.z); z++)
        for (let x = Math.floor(box.min.x); x <= Math.floor(box.max.x); x++) {
          const key = `${x},${z}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push({ v, up: y > 0 });
        }
    }
  }
  return (x, z, up) => {
    let result = up ? -Infinity : Infinity;
    for (const {
      v: [a, b, c],
      up: faceUp,
    } of grid.get(`${Math.floor(x)},${Math.floor(z)}`) || []) {
      if (faceUp !== up) continue;
      const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z),
        u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d,
        v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
      if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
      const y = u * a.y + v * b.y + (1 - u - v) * c.y;
      result = up ? Math.max(result, y) : Math.min(result, y);
    }
    return result;
  };
}

export function inspectMonasteryPavilions(game) {
  game.world.updateMatrixWorld(true);
  const report = {
    courts: 0,
    roofs: 0,
    joints: 0,
    minimumLowerSeat: Infinity,
    maximumLowerSeat: -Infinity,
    minimumUpperSeat: Infinity,
    maximumUpperSeat: -Infinity,
    failures: [],
  };
  for (const patch of game.monasteryPatches || []) {
    report.courts++;
    const meshes = patch.root.children.filter((m) => m.isMesh),
      caps = new Set();
    for (const m of meshes)
      if (m.material.name === "Monastery slate roof")
        for (const id of m.geometry.attributes.monasteryPavilion?.array || [])
          if (id > 0) caps.add(id);
    report.roofs += caps.size;
    if (!caps.has(1) || Boolean(patch.house.plan) !== caps.has(2))
      report.failures.push({
        court: patch.root.name,
        kind: "missing roof volume",
      });
    if (!patch.house.plan) continue;
    const main = field(
        meshes,
        (m, i) =>
          m.material.name === "Monastery slate roof" &&
          m.geometry.attributes.monasteryPavilion?.getX(i) === 1,
      ),
      cap = field(
        meshes,
        (m, i) =>
          m.material.name === "Monastery slate roof" &&
          m.geometry.attributes.monasteryPavilion?.getX(i) === 2,
      ),
      wall = field(
        patch.joinery.children,
        (m, i) =>
          m.material.name === "Upper pavilion plaster" &&
          m.geometry.attributes.monasteryBuilding?.getX(i) === 0,
      ),
      outline = patch.house.plan.footprint;
    for (let side = 0; side < outline.length; side++) {
      const a = outline[side],
        b = outline[(side + 1) % outline.length],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dx, dz),
        steps = Math.ceil(length / 0.4);
      for (let j = 0; j < steps; j++) {
        const t = (j + 0.5) / steps,
          point = new T.Vector3(
            a[0] + dx * t + (dz / length) * 0.004,
            0,
            a[1] + dz * t - 18 - (dx / length) * 0.004,
          ).applyMatrix4(patch.root.matrixWorld),
          lower = main(point.x, point.z, true) - wall(point.x, point.z, false),
          upper = wall(point.x, point.z, true) - cap(point.x, point.z, false);
        report.joints++;
        report.minimumLowerSeat = Math.min(report.minimumLowerSeat, lower);
        report.maximumLowerSeat = Math.max(report.maximumLowerSeat, lower);
        report.minimumUpperSeat = Math.min(report.minimumUpperSeat, upper);
        report.maximumUpperSeat = Math.max(report.maximumUpperSeat, upper);
        if (
          !Number.isFinite(lower) ||
          !Number.isFinite(upper) ||
          lower < 0.05 ||
          lower > 0.11 ||
          upper < 0.025 ||
          upper > 0.075
        )
          report.failures.push({
            court: patch.root.name,
            side,
            point: point.toArray(),
            lower,
            upper,
          });
      }
    }
  }
  if (report.courts !== 9 || report.roofs !== 17 || report.joints < 300)
    report.failures.push({ kind: "incomplete pavilion coverage" });
  return report;
}

export function verifyMonasteryPavilions(game) {
  const accepted = inspectMonasteryPavilions(game),
    saved = [];
  if (accepted.failures.length)
    throw Error(JSON.stringify(accepted.failures.slice(0, 5)));
  try {
    for (const patch of game.monasteryPatches)
      for (const mesh of patch.joinery.children) {
        if (mesh.material.name !== "Upper pavilion plaster") continue;
        const p = mesh.geometry.attributes.position,
          tag = mesh.geometry.attributes.monasteryBuilding;
        saved.push([p, p.array.slice()]);
        for (let i = 0; i < p.count; i++)
          if (tag.getX(i) === 0) p.setY(i, p.getY(i) - 0.25);
        p.needsUpdate = true;
      }
    const lowered = inspectMonasteryPavilions(game);
    if (lowered.failures.length !== accepted.joints)
      throw Error("Lowered house control was not fully detected");
    return { accepted, loweredFailures: lowered.failures.length };
  } finally {
    for (const [p, bytes] of saved) {
      p.array.set(bytes);
      p.needsUpdate = true;
    }
  }
}
