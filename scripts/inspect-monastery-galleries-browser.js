// Development-only inspection of delivered, material-batched gallery faces.
// This reader never consults the construction height function or collision mesh.
import * as T from "three";

function deliveredFaces(root, roofsOnly = false) {
  const grid = new Map();
  for (const mesh of root.children) {
    if (!mesh.isMesh) continue;
    const { position: p, monasteryGallery: tag } = mesh.geometry.attributes,
      index = mesh.geometry.index;
    if (!tag || (roofsOnly && mesh.material.name !== "Monastery slate roof"))
      continue;
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const id = tag.getX(index ? index.getX(i) : i);
      if (id < 0 && !roofsOnly) continue;
      const v = [0, 1, 2].map((j) =>
          new T.Vector3()
            .fromBufferAttribute(p, index ? index.getX(i + j) : i + j)
            .applyMatrix4(mesh.matrixWorld),
        ),
        n = new T.Triangle(...v).getNormal(new T.Vector3()),
        box = new T.Box3().setFromPoints(v),
        face = { v, n, id, material: mesh.material.name };
      if (!v.every((p) => p.toArray().every(Number.isFinite)))
        throw Error("Nonfinite cloister face");
      if (Math.abs(n.y) < 1e-7) continue;
      for (let x = Math.floor(box.min.x); x <= Math.floor(box.max.x); x++)
        for (let z = Math.floor(box.min.z); z <= Math.floor(box.max.z); z++) {
          const key = `${x},${z}`,
            list = grid.get(key) || [];
          list.push(face);
          grid.set(key, list);
        }
    }
  }
  return (x, z, id) => {
    const hits = [];
    for (const face of grid.get(`${Math.floor(x)},${Math.floor(z)}`) || []) {
      if (id !== undefined && Math.floor(face.id) !== id) continue;
      const [a, b, c] = face.v,
        d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z),
        u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d,
        v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
      if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
      hits.push({
        y: u * a.y + v * b.y + (1 - u - v) * c.y,
        up: face.n.y > 0,
        frame: face.id % 1 === 0.25,
        material: face.material,
      });
    }
    return hits;
  };
}

export function inspectMonasteryGalleries(game) {
  game.world.updateMatrixWorld(true);
  const report = {
    courts: 0,
    bays: 0,
    open: 0,
    bearings: 0,
    beamQueries: 0,
    largestGap: -Infinity,
    failures: [],
  };
  for (const patch of game.monasteryPatches || []) {
    const gallery = patch.galleries;
    if (!gallery) throw Error("Missing cloister construction");
    report.courts++;
    const read = deliveredFaces(gallery.root),
      base = patch.root.position;
    for (const bay of gallery.records) {
      report.bays++;
      if (bay.open) report.open++;
      if (bay.bay < 2)
        for (const dz of [-0.31, -0.17, 0.17, 0.31]) {
          const x = base.x + bay.side * 19 + 0.11,
            z = base.z + bay.zb + dz,
            faces = read(x, z).filter(
              (h) =>
                h.frame &&
                h.up &&
                h.material === "Weathered monastery timber" &&
                Math.abs(h.y - base.y - 5.805) < 0.001,
            );
          report.beamQueries++;
          if (faces.length !== 1)
            report.failures.push({
              court: patch.root.name,
              bay: bay.id,
              kind: "overlapping beam faces",
              x,
              z,
              faces: faces.length,
            });
        }
      for (const p of bay.bearings) {
        const x = base.x + p.x,
          z = base.z + p.z,
          y = base.y + p.y,
          hits = read(x, z, bay.id),
          below = hits
            .filter(
              (h) =>
                h.up &&
                h.frame &&
                h.material === "Weathered monastery timber" &&
                h.y <= y + 0.025 &&
                h.y >= y - 0.025,
            )
            .sort((a, b) => b.y - a.y)[0],
          above = hits
            .filter(
              (h) =>
                !h.up &&
                (p.kind === "rafter"
                  ? !h.frame
                  : h.frame && h.material === "Oxide painted timber") &&
                h.y >= y - 0.025 &&
                h.y <= y + 0.025,
            )
            .sort((a, b) => a.y - b.y)[0],
          gap = above && below ? above.y - below.y : Infinity;
        report.bearings++;
        report.largestGap = Math.max(report.largestGap, gap);
        if (
          !Number.isFinite(gap) ||
          gap > 0.002 ||
          gap < -0.02 ||
          !below?.frame
        )
          report.failures.push({
            court: patch.root.name,
            bay: bay.id,
            kind: p.kind,
            x,
            z,
            y,
            gap,
            below,
            above,
          });
      }
    }
  }
  if (report.courts !== 9 || report.bearings < 500)
    report.failures.push({ kind: "incomplete coverage" });
  return report;
}

// Perturb the delivered render buffers, then restore their exact bytes. This
// proves the bearing reader notices a detached frame without altering saves.
export function verifyMonasteryGalleryBearings(game) {
  const accepted = inspectMonasteryGalleries(game),
    saved = [];
  if (accepted.failures.length)
    throw Error(JSON.stringify(accepted.failures.slice(0, 6)));
  try {
    for (const patch of game.monasteryPatches)
      for (const mesh of patch.root.children) {
        const g = mesh.geometry,
          p = g?.attributes.position,
          tag = g?.attributes.monasteryGallery;
        if (!tag) continue;
        saved.push([p, p.array.slice()]);
        for (let i = 0; i < p.count; i++)
          if (tag.getX(i) >= 0 && tag.getX(i) % 1 === 0.25)
            p.setY(i, p.getY(i) + 0.25);
        p.needsUpdate = true;
      }
    const lifted = inspectMonasteryGalleries(game);
    if (lifted.failures.length < 500)
      throw Error("Detached frame control was not detected");
    return { accepted, liftedFailures: lifted.failures.length };
  } finally {
    for (const [p, bytes] of saved) {
      p.array.set(bytes);
      p.needsUpdate = true;
    }
  }
}

export function inspectMonasteryFascias(game) {
  game.world.updateMatrixWorld(true);
  const report = {
    roofs: 0,
    faces: 0,
    probes: 0,
    largestGap: -Infinity,
    largestOverlap: 0,
    failures: [],
  };
  for (const patch of game.monasteryPatches || []) {
    const read = deliveredFaces(patch.root, true),
      roofs = new Set();
    for (const mesh of patch.root.children) {
      const p = mesh.geometry?.attributes.position,
        tag = mesh.geometry?.attributes.monasteryFascia,
        ids = mesh.geometry?.index;
      if (!tag) continue;
      for (let i = 0; i < (ids?.count ?? p.count); i += 3) {
        const id = tag.getX(ids ? ids.getX(i) : i);
        if (id <= 0) continue;
        const v = [0, 1, 2].map((j) =>
            new T.Vector3()
              .fromBufferAttribute(p, ids ? ids.getX(i + j) : i + j)
              .applyMatrix4(mesh.matrixWorld),
          ),
          triangle = new T.Triangle(...v);
        if (triangle.getNormal(new T.Vector3()).y <= 1e-6) continue;
        roofs.add(id);
        report.faces++;
        for (const point of [...v, triangle.getMidpoint(new T.Vector3())]) {
          const underside = read(point.x, point.z)
              .filter(
                (h) =>
                  !h.up &&
                  h.material === "Monastery slate roof" &&
                  h.y > point.y - 0.1 &&
                  h.y < point.y + 0.5,
              )
              .sort(
                (a, b) => Math.abs(a.y - point.y) - Math.abs(b.y - point.y),
              )[0],
            gap = underside ? underside.y - point.y : Infinity;
          report.probes++;
          report.largestGap = Math.max(report.largestGap, gap);
          report.largestOverlap = Math.max(report.largestOverlap, -gap);
          if (!Number.isFinite(gap) || gap > 0.002 || gap < -0.008)
            report.failures.push({
              court: patch.root.name,
              id,
              point: point.toArray(),
              gap,
            });
        }
      }
    }
    report.roofs += roofs.size;
  }
  if (report.roofs !== 72 || report.probes < 500)
    report.failures.push({ kind: "incomplete fascia coverage" });
  return report;
}

export function verifyMonasteryFascias(game) {
  const accepted = inspectMonasteryFascias(game),
    saved = [];
  if (accepted.failures.length)
    throw Error(JSON.stringify(accepted.failures.slice(0, 5)));
  try {
    for (const patch of game.monasteryPatches)
      for (const mesh of patch.root.children) {
        const p = mesh.geometry?.attributes.position,
          tag = mesh.geometry?.attributes.monasteryFascia;
        if (!tag) continue;
        saved.push([p, p.array.slice()]);
        for (let i = 0; i < p.count; i++)
          if (tag.getX(i) > 0) p.setY(i, p.getY(i) - 0.25);
        p.needsUpdate = true;
      }
    const dropped = inspectMonasteryFascias(game);
    if (dropped.failures.length < 500)
      throw Error("Dropped fascia control was not detected");
    return { accepted, droppedFailures: dropped.failures.length };
  } finally {
    for (const [p, bytes] of saved) {
      p.array.set(bytes);
      p.needsUpdate = true;
    }
  }
}
