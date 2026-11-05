import * as THREE from "three";

// Read individual castings after material batching. Separate closed castings
// may meet along an edge; their tags preserve the original piece boundaries.
export function shutterGeometryTopology(geometry) {
  const { position: p, normal, uv, solarShutterPart: id } = geometry.attributes,
    parts = new Map(),
    result = {
      triangles: 0,
      parts: 0,
      invalid: 0,
      degenerate: 0,
      failures: [],
    };
  for (const a of [p, normal, uv])
    if (!a || !a.array.every(Number.isFinite)) result.invalid++;
  const index = geometry.index;
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j)),
      part = id ? id.getX(ids[0]) : 0;
    if (id && ids.some((i) => id.getX(i) !== part)) result.invalid++;
    if (!parts.has(part)) parts.set(part, { volume: 0, edges: new Map() });
    const r = parts.get(part),
      q = ids.map((j) => new THREE.Vector3().fromBufferAttribute(p, j));
    result.triangles++;
    if (new THREE.Triangle(...q).getArea() < 1e-10) {
      result.degenerate++;
      continue;
    }
    r.volume += q[0].dot(q[1].clone().cross(q[2])) / 6;
    const keys = q.map((v) =>
      v
        .toArray()
        .map((n) => Math.round(n * 1e5))
        .join(","),
    );
    for (let j = 0; j < 3; j++) {
      const key = [keys[j], keys[(j + 1) % 3]].sort().join("/");
      r.edges.set(key, (r.edges.get(key) || 0) + 1);
    }
  }
  result.parts = parts.size;
  for (const [id, part] of parts) {
    const bad = [...part.edges.values()].filter((n) => n !== 2).length;
    if (bad || part.volume <= 1e-9)
      result.failures.push({ id, edges: bad, volume: part.volume });
  }
  return result;
}

export function inspectSolarShutters(game) {
  game.world.updateMatrixWorld(true);
  const report = {
      leaves: 0,
      faces: 0,
      triangles: 0,
      parts: 0,
      recesses: 0,
      sockets: 0,
      bonded: 0,
      failures: [],
    },
    ray = new THREE.Raycaster();
  for (const gate of game.fieldGates || [])
    for (const leaf of gate.leaves) {
      const r = leaf.group.userData.solarShutter;
      if (!r) continue;
      const inverse = r.root.matrixWorld.clone().invert(),
        fail = (kind, data = {}) =>
          report.failures.push({
            stage: gate.stage,
            side: leaf.side,
            kind,
            ...data,
          }),
        localRay = (x, y, face) => {
          const a = r.root.localToWorld(new THREE.Vector3(x, y, face * 0.8)),
            b = r.root.localToWorld(new THREE.Vector3(x, y, -face * 0.8));
          ray.set(a, b.clone().sub(a).normalize());
          ray.near = 0;
          ray.far = a.distanceTo(b);
          const hit = ray.intersectObject(r.root, true)[0];
          return (
            hit && {
              hit,
              p: hit.point.clone().applyMatrix4(inverse),
              part: r.parts[
                hit.object.geometry.attributes.solarShutterPart.getX(
                  hit.faceIndex * 3,
                )
              ],
            }
          );
        },
        minDepth = new Map();
      report.leaves++;
      report.faces += 2;
      r.root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const topology = shutterGeometryTopology(mesh.geometry);
        report.parts += topology.parts;
        report.triangles += topology.triangles;
        if (topology.invalid || topology.degenerate || topology.failures.length)
          fail("casting topology", { topology });
        const { position: p, solarShutterPart: id } = mesh.geometry.attributes;
        for (let i = 0; i < p.count; i++) {
          const part = r.parts[id.getX(i)];
          if (
            !part.face ||
            ![
              "cast scene",
              "cast fillet",
              "foundry register",
              "pull socket",
            ].includes(part.kind)
          )
            continue;
          minDepth.set(
            part.id,
            Math.min(minDepth.get(part.id) ?? Infinity, part.face * p.getZ(i)),
          );
          if (Math.abs(p.getZ(i)) > 0.36)
            fail("outside leaf depth", { id: part.id });
        }
      });
      for (const [id, depth] of minDepth) {
        report.bonded++;
        if (depth > 0.1201) fail("unseated casting", { id, depth });
      }
      for (const face of [1, -1])
        for (const side of [-1, 1])
          for (const y of [
            r.field.bottom + 0.34,
            r.field.bottom + r.field.height / 2,
            r.field.bottom + r.field.height - 0.34,
          ]) {
            const probe = localRay(
              r.field.x + side * (r.field.width / 2 - 0.3),
              y,
              face,
            );
            // The front pull boss is intentionally seated in this border.
            if (probe?.part.kind === "pull socket") continue;
            report.recesses++;
            if (
              !probe ||
              probe.part.kind !== "recess backing" ||
              Math.abs(probe.p.z - face * 0.12) > 0.0001
            )
              fail("recess face", {
                face,
                y,
                z: probe?.p.z,
                part: probe?.part.kind,
              });
          }
      const pullX = -leaf.side * (gate.leafWidth - 0.9);
      for (const dx of [-0.08, 0, 0.08])
        for (const dy of [-0.12, 0, 0.12]) {
          const probe = localRay(pullX + dx, 3.7 + dy, 1);
          report.sockets++;
          if (!probe || probe.part.kind !== "pull socket" || probe.p.z < 0.26)
            fail("unsupported pull mount", {
              dx,
              dy,
              z: probe?.p.z,
              part: probe?.part.kind,
            });
        }
    }
  return report;
}
