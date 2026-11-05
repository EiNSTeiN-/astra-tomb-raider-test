// Independent delivered-buffer probes. The planner's height sampler and its
// planting predicate are deliberately not imported here.
export function inspectSkyPaving(game) {
  if (!game.skyMeadow || !game.terrainMeshes?.length)
    throw Error("Load the sky chapter before inspecting its paving");
  const uniforms = game.terrainMeshes[0].material.userData.terrainUniforms,
    envelope = uniforms.skyPavingEnvelope.value,
    courts = uniforms.skyPavingCourts.value.filter((p) => p.z >= 0);
  const inFloor = (x, z, pad = 0) =>
    courts.some(
      (p) =>
        Math.max(
          Math.abs(x - p.x) - envelope.x,
          Math.abs(z - p.y - envelope.z) - envelope.y,
        ) <
        envelope.w + pad,
    );
  const chunks = new Map();
  for (const mesh of game.terrainMeshes) {
    const g = mesh.geometry;
    g.computeBoundingBox();
    const b = g.boundingBox;
    chunks.set(
      `${Math.floor((b.min.x + 0.001) / 49)},${Math.floor((b.min.z + 0.001) / 49)}`,
      { g, b, nx: g.parameters.widthSegments, nz: g.parameters.heightSegments },
    );
  }
  const floor = (x, z) => {
    const chunk = chunks.get(`${Math.floor(x / 49)},${Math.floor(z / 49)}`);
    if (!chunk) return null;
    const { g, b, nx, nz } = chunk,
      p = g.attributes.position,
      n = g.attributes.normal,
      d = g.attributes.skyDepth;
    const ix = Math.max(
        0,
        Math.min(
          nx - 1,
          Math.floor(((x - b.min.x) / (b.max.x - b.min.x)) * nx),
        ),
      ),
      iz = Math.max(
        0,
        Math.min(
          nz - 1,
          Math.floor(((z - b.min.z) / (b.max.z - b.min.z)) * nz),
        ),
      );
    for (let t = 0; t < 2; t++) {
      const ids = [0, 1, 2].map((k) =>
          g.index.getX((iz * nx + ix) * 6 + t * 3 + k),
        ),
        [a, bb, c] = ids;
      const ax = p.getX(a),
        az = p.getZ(a),
        bx = p.getX(bb),
        bz = p.getZ(bb),
        cx = p.getX(c),
        cz = p.getZ(c);
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz),
        wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det,
        wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det,
        wc = 1 - wa - wb;
      if (Math.min(wa, wb, wc) < -1e-5) continue;
      const normal = [0, 1, 2].map((k) =>
        [wa, wb, wc].reduce((v, w, j) => v + w * n.getComponent(ids[j], k), 0),
      );
      return {
        ny: normal[1] / Math.hypot(...normal),
        depth: wa * d.getX(a) + wb * d.getX(bb) + wc * d.getX(c),
      };
    }
    throw Error("No delivered triangle at " + [x, z]);
  };
  let bankPlants = 0,
    probes = 0;
  const failures = [];
  const radii = game.skyMeadow.specimens.map((s) => {
    let r = 0;
    for (const g of s.tiers) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++)
        r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i)) + 0.13);
    }
    return r;
  });
  for (const plant of game.skyMeadow.plants) {
    const radius = radii[plant.variant] * plant.size;
    if (!inFloor(plant.x, plant.z, radius)) continue;
    bankPlants++;
    for (const fraction of [0, 0.5, 1])
      for (let j = 0; j < (fraction ? 32 : 1); j++) {
        const x = plant.x + Math.cos((j * Math.PI) / 16) * radius * fraction,
          z = plant.z + Math.sin((j * Math.PI) / 16) * radius * fraction;
        if (!inFloor(x, z)) continue;
        const f = floor(x, z);
        probes++;
        if (f && f.ny > 0.94 && f.depth < 3 && failures.length < 20)
          failures.push({ plant: [plant.x, plant.z], point: [x, z], ...f });
      }
  }
  return { bankPlants, probes, failures };
}
