import * as T from "three";
import { closedMeshReader } from "./inspect-explorer-solids-browser.js";

function delivered(patch) {
  const brackets = new Map(),
    down = new Map(),
    core = [];
  patch.root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const p = mesh.geometry.attributes.position,
      ids = mesh.geometry.index,
      tag = mesh.geometry.attributes.monasteryBracket;
    for (let i = 0; i < (ids?.count ?? p.count); i += 3) {
      const id = tag?.getX(ids ? ids.getX(i) : i) ?? 0,
        v = [0, 1, 2].map((j) =>
          new T.Vector3()
            .fromBufferAttribute(p, ids ? ids.getX(i + j) : i + j)
            .applyMatrix4(mesh.matrixWorld),
        ),
        tri = new T.Triangle(...v),
        normal = tri.getNormal(new T.Vector3()),
        box = new T.Box3().setFromPoints(v),
        face = { v, normal, box };
      if (id > 0) {
        if (!brackets.has(id)) brackets.set(id, []);
        brackets.get(id).push(face);
      } else {
        if (
          mesh.parent === patch.root &&
          [
            "Weathered monastery timber",
            "Oxide painted timber",
            "Monastery stone footings",
          ].includes(mesh.material.name)
        )
          for (const p of v) core.push(...p.toArray());
        if (normal.y >= -1e-6) continue;
        for (let x = Math.floor(box.min.x); x <= Math.floor(box.max.x); x++)
          for (let z = Math.floor(box.min.z); z <= Math.floor(box.max.z); z++) {
            const key = `${x},${z}`;
            if (!down.has(key)) down.set(key, []);
            down.get(key).push(face);
          }
      }
    }
  });
  return { brackets, down, core };
}
function height(face, x, z) {
  const [a, b, c] = face.v,
    d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z),
    u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d,
    v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
  return u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6
    ? u * a.y + v * b.y + (1 - u - v) * c.y
    : null;
}

// Inspect actual batched render faces. Neither the construction's beam-height
// samples nor its collision triangles supply the accepted contact positions.
export function inspectMonasteryBrackets(game) {
  game.world.updateMatrixWorld(true);
  const report = {
    brackets: 0,
    beamProbes: 0,
    backProbes: 0,
    minimumSeat: Infinity,
    maximumSeat: -Infinity,
    minimumBackDepth: Infinity,
    failures: [],
  };
  for (const patch of game.monasteryPatches || []) {
    const { brackets, down, core } = delivered(patch),
      geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.BufferAttribute(new Float64Array(core), 3),
    );
    const mesh = new T.Mesh(geometry),
      read = closedMeshReader([mesh]);
    try {
      for (const record of patch.brackets.records) {
        const faces = brackets.get(record.id);
        if (!faces?.length) {
          report.failures.push({
            court: patch.root.name,
            id: record.id,
            kind: "missing bracket",
          });
          continue;
        }
        report.brackets++;
        for (const f of faces.filter((f) => f.normal.y > 1e-6))
          for (const p of [
            ...f.v,
            new T.Triangle(...f.v).getMidpoint(new T.Vector3()),
          ]) {
            const heights = (
                down.get(`${Math.floor(p.x)},${Math.floor(p.z)}`) || []
              )
                .map((f) => height(f, p.x, p.z))
                .filter((y) => y !== null && Math.abs(y - p.y) < 0.03),
              // Intersecting bearers meet above a post. Either real underside
              // can carry the bracket; a second beam must not hide its seat.
              seat = heights.length
                ? heights
                    .map((y) => p.y - y)
                    .sort(
                      (a, b) => Math.abs(a - 0.006) - Math.abs(b - 0.006),
                    )[0]
                : Infinity;
            report.beamProbes++;
            report.minimumSeat = Math.min(report.minimumSeat, seat);
            report.maximumSeat = Math.max(report.maximumSeat, seat);
            if (!Number.isFinite(seat) || seat < 0.003 || seat > 0.009)
              report.failures.push({
                court: patch.root.name,
                id: record.id,
                kind: "beam bearing",
                point: p.toArray(),
                seat,
              });
          }
        const { axis, direction } = record.options,
          start = Math.min(
            ...faces.flatMap((f) => f.v.map((p) => p[axis] * direction)),
          );
        for (const f of faces.filter((f) =>
          f.v.every((p) => Math.abs(p[axis] * direction - start) < 1e-5),
        )) {
          const p = new T.Triangle(...f.v).getMidpoint(new T.Vector3()),
            depth = read(p);
          report.backProbes++;
          report.minimumBackDepth = Math.min(
            report.minimumBackDepth,
            depth ?? -Infinity,
          );
          // The core contains overlapping timber and masonry courses. The
          // winding must place the back inside real solid; its nearest face
          // can be an internal course joint rather than the outer post skin.
          if (!(depth > 0.002))
            report.failures.push({
              court: patch.root.name,
              id: record.id,
              kind: "post bearing",
              point: p.toArray(),
              depth,
            });
        }
      }
    } finally {
      geometry.dispose();
      mesh.material.dispose();
    }
  }
  if (
    report.brackets !== 209 ||
    report.beamProbes < 2000 ||
    report.backProbes < 200
  )
    report.failures.push({ kind: "incomplete bracket coverage" });
  return report;
}

export function verifyMonasteryBrackets(game) {
  const accepted = inspectMonasteryBrackets(game),
    saved = [];
  if (accepted.failures.length)
    throw Error(JSON.stringify(accepted.failures.slice(0, 8)));
  try {
    for (const patch of game.monasteryPatches)
      for (const mesh of patch.root.children) {
        const p = mesh.geometry?.attributes.position,
          tag = mesh.geometry?.attributes.monasteryBracket;
        if (!tag?.array.some((n) => n > 0)) continue;
        saved.push([p, tag, p.array.slice(), patch]);
        for (let i = 0; i < p.count; i++)
          if (tag.getX(i) > 0) p.setY(i, p.getY(i) - 0.25);
        p.needsUpdate = true;
      }
    const lowered = inspectMonasteryBrackets(game),
      beamFailures = lowered.failures.filter(
        (f) => f.kind === "beam bearing",
      ).length;
    if (beamFailures !== accepted.beamProbes)
      throw Error(
        "Detached beam bearing control missed contacts: " + beamFailures,
      );
    for (const [p, tag, bytes, patch] of saved) {
      p.array.set(bytes);
      for (let i = 0; i < p.count; i++)
        if (tag.getX(i) > 0) {
          const { axis, direction } =
            patch.brackets.records[tag.getX(i) - 1].options;
          p["set" + axis.toUpperCase()](
            i,
            p["get" + axis.toUpperCase()](i) + direction * 2.8,
          );
        }
      p.needsUpdate = true;
    }
    const detached = inspectMonasteryBrackets(game),
      backFailures = detached.failures.filter(
        (f) => f.kind === "post bearing",
      ).length;
    if (backFailures < accepted.backProbes * 0.95)
      throw Error(
        "Detached post bearing control missed contacts: " + backFailures,
      );
    return {
      accepted,
      loweredFailures: beamFailures,
      detachedBackFailures: backFailures,
    };
  } finally {
    for (const [p, , bytes] of saved) {
      p.array.set(bytes);
      p.needsUpdate = true;
    }
  }
}
