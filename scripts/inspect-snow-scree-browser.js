import * as T from "three";
import { terrainTriangleReader } from "./inspect-desert-groundcover-browser.js";
import { NatureRockSolids } from "../src/nature-rock-solids.js";

function underside(geometry) {
  const p = geometry.attributes.position,
    ids = geometry.index,
    points = new Map();
  for (let i = 0; i < (ids?.count ?? p.count); i += 3) {
    const v = [0, 1, 2].map((j) =>
        new T.Vector3().fromBufferAttribute(p, ids ? ids.getX(i + j) : i + j),
      ),
      tri = new T.Triangle(...v);
    if (tri.getNormal(new T.Vector3()).y > -0.999) continue;
    for (const p of [...v, tri.getMidpoint(new T.Vector3())])
      points.set(p.toArray().join(","), p);
  }
  return [...points.values()];
}

// Probe the actual near/coarse render vertices with Float32 instance transforms.
// The terrain reader intersects delivered triangles rather than repeating the
// placement sampler, bounds minimizer or cached grounding probes.
export function inspectSnowScree(game) {
  if (!game.snowScree) throw Error("Load the snow chapter and nature assets");
  const terrain = terrainTriangleReader(game.terrainMeshes),
    packed = new T.Matrix4(),
    point = new T.Vector3(),
    report = {
      stones: 0,
      models: 0,
      rootProbes: 0,
      maximumRootGap: -Infinity,
      minimumRootGap: Infinity,
      visibleTransforms: 0,
      failures: [],
    };
  for (const patch of game.snowScree.patches) {
    report.stones += patch.matrices.length;
    const expected = new Set(
      patch.matrices.map((m) =>
        Array.from(new Float32Array(m.elements)).join(","),
      ),
    );
    for (const tier of patch.tiers) {
      const mesh = tier[0],
        roots = underside(mesh.geometry);
      report.models++;
      if (roots.length < 6) throw Error("Incomplete underside footprint");
      for (const matrix of patch.matrices) {
        packed.fromArray(new Float32Array(matrix.elements));
        packed.premultiply(game.world.matrixWorld);
        for (const root of roots) {
          point.copy(root).applyMatrix4(packed);
          const ground = terrain(point.x, point.z),
            gap = ground === null ? Infinity : point.y - ground;
          report.rootProbes++;
          report.maximumRootGap = Math.max(report.maximumRootGap, gap);
          report.minimumRootGap = Math.min(report.minimumRootGap, gap);
          if (!Number.isFinite(gap) || gap > -0.008)
            report.failures.push({
              kind: "root",
              variant: patch.snowScree,
              tier: patch.tiers.indexOf(tier),
              point: point.toArray(),
              gap,
            });
        }
      }
      if (mesh.visible)
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, packed);
          report.visibleTransforms++;
          if (!expected.has(packed.elements.join(",")))
            report.failures.push({
              kind: "packed transform",
              variant: patch.snowScree,
              index: i,
            });
        }
    }
  }
  return report;
}

export function verifySnowScreeGrounding(game) {
  const accepted = inspectSnowScree(game),
    saved = [];
  if (accepted.failures.length)
    throw Error(JSON.stringify(accepted.failures.slice(0, 8)));
  try {
    const attributes = new Set();
    for (const patch of game.snowScree.patches)
      for (const tier of patch.tiers) {
        const p = tier[0].geometry.attributes.position;
        if (attributes.has(p)) continue;
        attributes.add(p);
        saved.push([p, p.array.slice()]);
        for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 3);
        p.needsUpdate = true;
      }
    const lifted = inspectSnowScree(game),
      failures = lifted.failures.filter((f) => f.kind === "root").length;
    if (failures !== accepted.rootProbes)
      throw Error(
        "Lifted scree control missed roots: " +
          failures +
          "/" +
          accepted.rootProbes,
      );
    return { accepted, liftedFailures: failures };
  } finally {
    for (const [p, bytes] of saved) {
      p.array.set(bytes);
      p.needsUpdate = true;
    }
  }
}

// Test only the newly delivered solids. Existing mechanisms can occupy their
// authored paths; this isolates whether new scree obstructs the reserved lane.
export function inspectSnowScreeLanes(game) {
  const solids = new NatureRockSolids(
      game.snowScree.patches,
      game.world.matrixWorld,
    ),
    seen = new Set(),
    report = { samples: 0, blocked: [] };
  for (const path of game.map.paths)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        dx = (b.x - a.x) * 7,
        dz = (b.z - a.z) * 7,
        length = Math.hypot(dx, dz),
        steps = Math.ceil(length / 0.7);
      if (!length) continue;
      for (let j = 0; j <= steps; j++)
        for (const offset of [-2, 0, 2]) {
          const x = a.x * 7 + (dx * j) / steps + (dz / length) * offset,
            z = a.z * 7 + (dz * j) / steps - (dx / length) * offset,
            key = x.toFixed(4) + "," + z.toFixed(4);
          if (seen.has(key)) continue;
          seen.add(key);
          report.samples++;
          if (solids.blocked(x, game.groundHeight(x, z), z, 2.2, 0.55))
            report.blocked.push({ x, z, offset });
        }
    }
  return report;
}
